'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CircleCheck, Download, Eye, Lightbulb, Mic, MicOff, Pause, ShieldCheck, SkipForward, Square, Volume2, X,
} from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { PageHeader, Progress, ScoreRing, TRACK_ICON } from '@/components/ui';
import { api, apiProfile, apiResume } from '@/lib/api';
import { startMonitor } from '@/lib/integrity';
import { speak, SpeechRecognitionCtor, startListening, Listener } from '@/lib/speech';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { levelOf, PlanItem, planInterview, scoreCls } from '@/lib/topics';
import { ROUNDS, RoundId, roundLabel, trackOf } from '@/lib/tracks';

type Evaluation = {
  score: number; rubric: Record<string, number>; verdict: string; strengths: string[]; missed: string[];
  ideal_answer: string; follow_up: string;
};
type Item = { round: RoundId; topic: string; question: string; answer: string; followUp: boolean } & Evaluation;
type Current = { round: RoundId; topic: string; question: string; followUp: boolean };
type Result = { sessionId: string | null; items: Item[]; avg: number; focus: number; flags: string[]; videoUrl: string | null; saveError: string };

/** Mutable state of a running interview (in a ref so async callbacks always see the latest). */
type Live = {
  stream: MediaStream;
  sessionId: string | null;
  startedAt: number;
  plan: PlanItem[];
  idx: number;
  items: Item[];
  asked: string[];
  flags: string[];
  focus: number;
  followUps: number;
  pendingFollowUp: string | null;
  current: Current | null;
  answer: string;
  stopped: boolean;
  listener: Listener | null;
  recorder?: MediaRecorder;
  chunks: Blob[];
  stopMonitor?: () => void;
  saveError: string;
};

const COUNTS = [3, 5, 8];

export default function InterviewPage() {
  const { profile, stats, session, resume, refreshAnswers } = useProfile();
  const track = trackOf(profile.track);
  const hasResume = !!resume && (resume.parsed.experience.length + resume.parsed.projects.length) > 0;
  const [phase, setPhase] = useState<'setup' | 'live' | 'done'>('setup');

  // setup
  const [round, setRound] = useState<RoundId | 'mixed'>('mixed');
  const [n, setN] = useState(5);
  const [consent, setConsent] = useState(false);
  const [record, setRecord] = useState(false);
  const [focusTopic, setFocusTopic] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanItem[]>([]);

  // live
  const [qNum, setQNum] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState<Current | null>(null);
  const [qError, setQError] = useState('');
  const [answer, setAnswer] = useState('');
  const [mic, setMic] = useState<'off' | 'on' | 'paused' | 'unsupported' | 'blocked'>('off');
  const [evaluating, setEvaluating] = useState(false);
  const [evalRes, setEvalRes] = useState<Evaluation | null>(null);
  const [evalErr, setEvalErr] = useState('');
  const [focus, setFocus] = useState(100);
  const [flags, setFlags] = useState<string[]>([]);
  const [faceLabel, setFaceLabel] = useState('Starting face monitor…');
  const [result, setResult] = useState<Result | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const live = useRef<Live | null>(null);

  // read ?round= and ?topic= once
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('round');
    if (r === 'mixed' || (r && (track.rounds as string[]).includes(r))) setRound(r as RoundId | 'mixed');
    setFocusTopic(q.get('topic'));
  }, [track.rounds]);

  // preview plan whenever settings change
  useEffect(() => {
    if (phase !== 'setup') return;
    setPlan(planInterview({ track: profile.track, round, n, topics: profile.topics, stats, hasResume, focus: focusTopic }));
  }, [phase, round, n, focusTopic, profile.track, profile.topics, stats, hasResume]);

  // stop camera, mic, speech and recorder if the user navigates away mid-interview
  useEffect(() => () => {
    const s = live.current;
    if (!s || s.stopped) return;
    s.stopped = true;
    s.listener?.stop();
    window.speechSynthesis?.cancel();
    s.stopMonitor?.();
    if (s.recorder && s.recorder.state !== 'inactive') try { s.recorder.stop(); } catch {}
    s.stream.getTracks().forEach((t) => t.stop());
    if (s.sessionId) closeSession(s, 'abandoned');
    live.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // attach camera + start local focus monitoring once the live view is on screen
  useEffect(() => {
    const s = live.current;
    const v = videoRef.current;
    if (phase !== 'live' || !s || !v) return;
    v.srcObject = s.stream;
    v.play().catch(() => {});
    s.stopMonitor = startMonitor(v, setFaceLabel, flag);
    return () => s.stopMonitor?.();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function flag(msg: string, penalty: number) {
    const s = live.current;
    if (!s || s.stopped) return;
    s.focus = Math.max(0, s.focus - penalty);
    s.flags.push(`${new Date().toLocaleTimeString()} ${msg}`);
    setFocus(s.focus);
    setFlags([...s.flags]);
  }

  /* ---------- database ---------- */
  async function closeSession(s: Live, status: 'completed' | 'abandoned') {
    if (!s.sessionId) return;
    const sb = getSupabase();
    if (!s.items.length) { await sb.from('interview_sessions').delete().eq('id', s.sessionId); return; }
    const avg = s.items.reduce((a, b) => a + b.score, 0) / s.items.length;
    const { error } = await sb.from('interview_sessions').update({
      status, avg_score: Number(avg.toFixed(2)), focus_score: s.focus, flags: s.flags, question_count: s.items.length,
      ended_at: new Date().toISOString(), duration_seconds: Math.round((Date.now() - s.startedAt) / 1000),
    }).eq('id', s.sessionId);
    if (error) s.saveError = error.message;
  }

  /* ---------- mic ---------- */
  function listen() {
    const s = live.current;
    if (!s || s.stopped) return;
    s.listener?.stop();
    if (!SpeechRecognitionCtor) return setMic('unsupported');
    s.listener = startListening(s.answer, (full) => { s.answer = full; setAnswer(full); }, () => setMic('blocked'));
    setMic('on');
  }
  function stopListening(state: 'off' | 'paused' = 'off') {
    const s = live.current;
    s?.listener?.stop();
    if (s) s.listener = null;
    setMic(SpeechRecognitionCtor ? state : 'unsupported');
  }

  /* ---------- flow ---------- */
  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      return toast('Camera and microphone permission is needed to start.', 6000);
    }
    const { data, error } = await getSupabase().from('interview_sessions').insert({
      user_id: session.user.id, track: profile.track, round_type: focusTopic ? plan[0]?.round || 'mixed' : round,
      status: 'in_progress', recorded_video: record,
    }).select('id').single();
    if (error) toast(`Results won't be saved: ${error.message}`, 7000);

    const s: Live = {
      stream, sessionId: data?.id ?? null, startedAt: Date.now(), plan: [...plan], idx: 0, items: [], asked: [], flags: [],
      focus: 100, followUps: 0, pendingFollowUp: null, current: null, answer: '', stopped: false, listener: null, chunks: [],
      saveError: error?.message || '',
    };
    if (record && typeof MediaRecorder !== 'undefined') {
      // recording stays in browser memory and is only offered as a download; never uploaded
      s.recorder = new MediaRecorder(stream);
      s.recorder.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
      s.recorder.start(1000);
    }
    live.current = s;
    setFocus(100); setFlags([]); setResult(null);
    setPhase('live');
    nextQuestion();
  }

  async function nextQuestion() {
    const s = live.current;
    if (!s || s.stopped) return;
    if (s.idx >= s.plan.length) return finish();
    const { round: rt, topic } = s.plan[s.idx];
    setQNum(s.idx + 1); setTotal(s.plan.length);
    setCurrent(null); setQError(''); setEvalRes(null); setEvalErr('');
    s.answer = ''; setAnswer('');
    stopListening();
    try {
      let question: string;
      let followUp = false;
      if (s.pendingFollowUp) {
        question = s.pendingFollowUp; followUp = true; s.pendingFollowUp = null;
      } else {
        const l = levelOf(stats, topic);
        const r = await api<{ question: string }>('/interview/question', {
          profile: apiProfile(profile), round_type: rt, topic, topic_label: l.label, topic_avg: l.avg,
          avoid: (stats[topic]?.asked || []).slice(-15).concat(s.asked).slice(-30),
          resume: apiResume(resume?.parsed),
        });
        question = r.question;
      }
      if (live.current !== s || s.stopped) return;
      s.current = { round: rt, topic, question, followUp };
      s.asked.push(question);
      setCurrent(s.current);
      await speak(question.replace(/^\[Scenario:[^\]]*\]\s*/i, ''));
      if (live.current !== s || s.stopped) return;
      listen();
    } catch (e: any) {
      if (live.current === s) setQError(e.message);
    }
  }

  async function submit(skipped = false) {
    const s = live.current;
    if (!s || !s.current) return;
    stopListening();
    window.speechSynthesis.cancel();
    const ans = skipped ? '' : s.answer.trim();
    const cur = s.current;
    setEvaluating(true); setEvalErr('');
    try {
      const r: Evaluation = ans.length < 3
        ? { score: 0, rubric: {}, verdict: 'Skipped / no answer.', strengths: [], missed: [], ideal_answer: '', follow_up: '' }
        : await api<Evaluation>('/interview/evaluate', { profile: apiProfile(profile), round_type: cur.round, topic: cur.topic, question: cur.question, answer: ans.slice(0, 8000) });
      if (live.current !== s) return;
      const item: Item = { ...r, round: cur.round, topic: cur.topic, question: cur.question, answer: ans, followUp: cur.followUp };
      s.items.push(item);
      if (s.sessionId) {
        const { error } = await getSupabase().from('answers').insert({
          user_id: session.user.id, session_id: s.sessionId, round_type: cur.round, topic: cur.topic, question: cur.question,
          answer: ans, score: r.score, rubric: r.rubric, verdict: r.verdict, strengths: r.strengths, missed: r.missed,
          ideal_answer: r.ideal_answer, is_follow_up: cur.followUp,
        });
        if (error) s.saveError = error.message;
      }
      // real interviewers dig deeper on partial answers: up to 2 follow-ups per interview
      if (r.follow_up && r.score >= 3 && r.score <= 7 && s.followUps < 2 && !cur.followUp) {
        s.followUps++;
        s.pendingFollowUp = r.follow_up;
        s.plan.splice(s.idx + 1, 0, { round: cur.round, topic: cur.topic });
        setTotal(s.plan.length);
      }
      s.current = null; // blocks double-submit
      setEvalRes(r);
    } catch (e: any) {
      setEvalErr(e.message);
    }
    setEvaluating(false);
  }

  function next() {
    const s = live.current;
    if (!s) return;
    s.idx++;
    nextQuestion();
  }

  async function finish() {
    const s = live.current;
    if (!s || s.stopped) return;
    s.stopped = true;
    s.listener?.stop();
    window.speechSynthesis.cancel();
    s.stopMonitor?.();
    if (s.recorder && s.recorder.state !== 'inactive') {
      await new Promise<void>((res) => { s.recorder!.onstop = () => res(); s.recorder!.stop(); });
    }
    const videoUrl = s.chunks.length ? URL.createObjectURL(new Blob(s.chunks, { type: s.chunks[0].type || 'video/webm' })) : null;
    s.stream.getTracks().forEach((t) => t.stop());
    await closeSession(s, 'completed');
    if (s.items.length) await refreshAnswers();
    const avg = s.items.length ? s.items.reduce((a, b) => a + b.score, 0) / s.items.length : 0;
    live.current = null;
    setResult({ sessionId: s.items.length ? s.sessionId : null, items: s.items, avg, focus: s.focus, flags: s.flags, videoUrl, saveError: s.saveError });
    setPhase('done');
  }

  /* ================================================================ setup view */
  if (phase === 'setup') {
    const choices: (RoundId | 'mixed')[] = ['mixed', ...track.rounds];
    const TrackIcon = TRACK_ICON[profile.track] || TRACK_ICON.general;
    return (
      <>
        <PageHeader title="Mock interview" subtitle={<span className="row" style={{ gap: 6, display: 'inline-flex' }}><TrackIcon size={15} /> {track.label} · {profile.role}</span>} />
        <div className="grid g-main">
          <div className="stack">
            {focusTopic ? (
              <div className="notice">
                <Lightbulb />
                <span>Focused practice on <b>{focusTopic}</b>. Every question will be on this topic.{' '}
                  <button className="btn btn-sm btn-ghost" onClick={() => { setFocusTopic(null); window.history.replaceState(null, '', '/interview'); }}><X /> Clear</button></span>
              </div>
            ) : (
              <div className="card">
                <div className="card-head"><h2>Choose a round</h2></div>
                <div className="card-body choice-grid">
                  {choices.map((c) => (
                    <button key={c} type="button" className={`choice ${round === c ? 'selected' : ''}`} onClick={() => setRound(c)}>
                      <span className="title">{c === 'mixed' ? <><Mic /> Full interview</> : ROUNDS[c].label}</span>
                      <span className="desc">{c === 'mixed' ? 'A realistic mix: resume, core rounds for your track, then HR.' : ROUNDS[c].desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <h2>Your interview plan</h2>
                <div className="spacer" />
                <div className="segmented">
                  {COUNTS.map((c) => <button key={c} className={n === c ? 'on' : ''} onClick={() => setN(c)}>{c} Qs</button>)}
                </div>
              </div>
              <div>
                {plan.map((it, i) => {
                  const l = levelOf(stats, it.topic);
                  return (
                    <div key={i} className="list-row">
                      <span className="badge" style={{ minWidth: 28, justifyContent: 'center' }}>{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div className="strong small">{ROUNDS[it.round].label}</div>
                        <div className="muted xs">{it.topic}</div>
                      </div>
                      {ROUNDS[it.round].topicBased && <span className={`badge ${l.cls === 'gray' ? '' : l.cls}`}>{l.label}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="card-foot muted xs">Weak topics are picked first. A partial answer may trigger a follow-up question. About {Math.round(n * 2.5)} minutes.</div>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head"><ShieldCheck size={18} color="var(--brand)" /><h2>Before you start</h2></div>
              <div className="card-body stack">
                <ul className="bullets small muted" style={{ marginTop: 0 }}>
                  <li>Questions are read aloud. Answer out loud; your words appear as text live.</li>
                  <li>Find a quiet place, face the camera and stay on this tab.</li>
                  <li>Use Chrome or Edge for live speech-to-text.</li>
                </ul>
                <label className="check">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>I allow camera and microphone access. Video is analyzed <b>in my browser</b> for focus and is <b>not uploaded</b>. My answer text is sent to the AI for scoring.</span>
                </label>
                <label className="check">
                  <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
                  <span><b>Optional:</b> record this session as a video saved <b>only to my device</b>.</span>
                </label>
                {!SpeechRecognitionCtor && <div className="notice warn"><MicOff /><span>Live speech-to-text needs Chrome or Edge. You can type your answers instead.</span></div>}
                {!hasResume && (round === 'mixed' || round === 'resume' || round === 'portfolio') && (
                  <div className="notice"><Lightbulb /><span>Your resume has no projects or experience listed, so resume questions will focus on your education and skills.</span></div>
                )}
                <button className="btn btn-primary btn-lg btn-block" disabled={!consent || !plan.length} onClick={start}>Start interview <ArrowRight /></button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ================================================================ results view */
  if (phase === 'done' && result) {
    const weakNow = profile.topics.filter((t) => levelOf(stats, t).cls === 'red');
    return (
      <>
        <PageHeader
          title="Interview complete"
          subtitle={`${result.items.length} answer${result.items.length === 1 ? '' : 's'} · ${roundLabel(focusTopic ? plan[0]?.round : round)}`}
          actions={<>
            {result.sessionId && <Link className="btn" href={`/interviews/${result.sessionId}`}>Open full report</Link>}
            <button className="btn btn-primary" onClick={() => { setPhase('setup'); setResult(null); setConsent(false); }}>New interview</button>
          </>}
        />
        {result.saveError && <div className="notice danger" style={{ marginBottom: 16 }}><X /><span>Some results couldn&apos;t be saved: {result.saveError}</span></div>}
        <div className="grid g3">
          <div className="card card-pad row" style={{ gap: 16 }}><ScoreRing value={result.items.length ? result.avg : null} /><div><div className="muted small">Average score</div><div className="strong">out of 10</div></div></div>
          <div className="card card-pad row" style={{ gap: 16 }}><ScoreRing value={result.focus} max={100} /><div><div className="muted small">Focus score</div><div className="strong">{result.flags.length} flag{result.flags.length === 1 ? '' : 's'}</div></div></div>
          <div className="card card-pad">
            <div className="muted small">Weak topics now</div>
            <div className="chips mt-8">{weakNow.length ? weakNow.map((t) => <span key={t} className="badge red">{t}</span>) : <span className="badge green">None, nice work</span>}</div>
          </div>
        </div>
        <div className="stack mt-16">
          {result.items.map((it, i) => <AnswerCard key={i} n={i + 1} item={it} />)}
          {result.items.length === 0 && <div className="card card-pad muted">No answers were recorded.</div>}
        </div>
        {result.videoUrl && (
          <div className="card card-pad row mt-16">
            <div style={{ flex: 1 }}><h3>Your recording</h3><p className="muted small">Stored only in this browser tab. Download it to keep it.</p></div>
            <a className="btn btn-primary" href={result.videoUrl} download={`interview-${new Date().toISOString().slice(0, 10)}.webm`}><Download /> Download video</a>
          </div>
        )}
      </>
    );
  }

  /* ================================================================ live view */
  const isRoleplay = current?.round === 'roleplay';
  return (
    <div className="grid g-main">
      <div className="stack">
        <div className="card">
          <div className="card-head">
            <span className="badge brand">Question {qNum} of {total}</span>
            {current && <span className="badge">{ROUNDS[current.round].label}</span>}
            {current && ROUNDS[current.round].topicBased && <span className={`badge ${levelOf(stats, current.topic).cls === 'gray' ? '' : levelOf(stats, current.topic).cls}`}>{current.topic}</span>}
            <div className="spacer" />
            {record && <span className="row xs muted" style={{ gap: 6 }}><span className="rec-dot" /> Recording to device</span>}
          </div>
          <div className="card-body stack">
            <Progress value={qNum - (evalRes ? 0 : 1)} max={Math.max(total, 1)} />
            <div className={`question-text ${isRoleplay ? 'roleplay' : ''}`}>
              {qError ? <span className="row">⚠️ {qError} <button className="btn btn-sm" onClick={nextQuestion}>Retry</button></span>
                : current ? <>{current.followUp && <span className="badge yellow" style={{ marginRight: 8 }}>Follow-up</span>}{current.question}</>
                : <span className="row muted" style={{ fontSize: 15, fontWeight: 500 }}><span className="spinner" /> Preparing your question…</span>}
            </div>
            <div className="row">
              <span className="small muted row" style={{ gap: 6 }}>
                {mic === 'on' && <><span className="rec-dot" /> Listening… speak naturally</>}
                {mic === 'paused' && 'Mic paused while you type'}
                {mic === 'unsupported' && 'Type your answer (live speech needs Chrome or Edge)'}
                {mic === 'blocked' && '⚠️ Microphone blocked: type your answer'}
              </span>
              <div className="spacer" />
              {current && !evalRes && SpeechRecognitionCtor && mic !== 'blocked' && (
                mic === 'on'
                  ? <button className="btn btn-sm" onClick={() => stopListening('paused')}><Pause /> Pause mic</button>
                  : <button className="btn btn-sm" onClick={listen}><Mic /> Speak</button>
              )}
              {current && <button className="btn btn-sm" onClick={() => speak(current.question)}><Volume2 /> Repeat</button>}
            </div>
            <div className="field">
              <label>{isRoleplay ? 'Your reply (in character)' : 'Your answer'} <span className="muted" style={{ fontWeight: 400 }}>· live transcript, editable</span></label>
              <textarea className="textarea" value={answer} placeholder="Start speaking…" disabled={!!evalRes}
                onChange={(e) => {
                  if (mic === 'on') stopListening('paused');
                  setAnswer(e.target.value);
                  if (live.current) live.current.answer = e.target.value;
                }} />
            </div>
            <div className="row">
              <button className="btn btn-primary" disabled={!current || evaluating || !!evalRes} onClick={() => submit()}>
                {evaluating ? <><span className="spinner" /> Evaluating…</> : <><CircleCheck /> Submit answer</>}
              </button>
              <button className="btn" disabled={!current || evaluating || !!evalRes} onClick={() => submit(true)}><SkipForward /> Skip</button>
              <div className="spacer" />
              <button className="btn btn-danger" onClick={finish}><Square /> End interview</button>
            </div>
          </div>
        </div>

        {evalErr && <div className="notice danger"><X /><span>{evalErr} <button className="btn btn-sm" onClick={() => submit()}>Retry</button></span></div>}
        {evalRes && live.current && live.current.items.length > 0 && (
          <AnswerCard
            item={{ ...evalRes, ...live.current.items[live.current.items.length - 1] }}
            action={<button className="btn btn-primary" onClick={next}>{qNum >= total ? 'Finish interview' : 'Next question'} <ArrowRight /></button>}
          />
        )}
      </div>

      <div className="stack">
        <div className="card card-pad stack-sm">
          <video ref={videoRef} className="cam" autoPlay muted playsInline />
          <div className="row between mt-4">
            <span className="row strong small" style={{ gap: 6 }}><Eye size={16} /> Focus score</span>
            <span className={`badge ${focus < 60 ? 'red' : focus < 85 ? 'yellow' : 'green'}`}>{focus}%</span>
          </div>
          <div className="muted small">{faceLabel}</div>
          {flags.length > 0 && <ul className="flag-log">{[...flags].reverse().map((f, i) => <li key={i}>{f}</li>)}</ul>}
        </div>
        <div className="card card-pad small muted">
          <b style={{ color: 'var(--text)' }}>Tip:</b>{' '}
          {current ? tipFor(current.round) : 'Take a breath. Structure beats speed.'}
        </div>
      </div>
    </div>
  );
}

function tipFor(r: RoundId) {
  return {
    hr: 'Use STAR: Situation, Task, Action, Result. End with what you learned.',
    resume: 'Be specific about what YOU did, the decisions you made and the measurable result.',
    technical: 'Define the concept, explain how it works, then give a real example.',
    coding: 'Clarify inputs, start with brute force, then optimize and state time/space complexity.',
    system_design: 'Requirements → high-level components → data flow → bottlenecks and trade-offs.',
    case: 'Clarify the goal, lay out a structure, analyze, then give a clear recommendation.',
    domain: 'Explain the concept, the metric that matters, and an example from your experience.',
    situational: 'Say what you would do first, who you would involve, and why.',
    roleplay: 'Acknowledge the person, ask a question, address the concern, agree on a next step.',
    portfolio: 'Problem → users → research → key decisions → outcome and what you would change.',
    design_challenge: 'Start with the user and their problem before jumping into solutions.',
  }[r];
}

/** Score, rubric bars, strengths, gaps and model answer for one answer. */
function AnswerCard({ item, n, action }: { item: Partial<Item> & Evaluation; n?: number; action?: React.ReactNode }) {
  const cls = scoreCls(item.score);
  return (
    <div className="card">
      <div className="card-head">
        <ScoreRing value={item.score} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            {n && <span className="muted small">Q{n}</span>}
            {item.round && <span className="badge">{ROUNDS[item.round].label}</span>}
            <span className={`badge ${cls}`}>{cls === 'red' ? 'Needs work' : cls === 'yellow' ? 'Partial' : 'Strong'}</span>
          </div>
          {n && item.question && <div className="small strong mt-4">{item.question}</div>}
        </div>
      </div>
      <div className="card-body stack">
        <p>{item.verdict}</p>
        {Object.keys(item.rubric).length > 0 && (
          <div className="rubric">
            {Object.entries(item.rubric).map(([k, v]) => (
              <div key={k} className="r"><span>{k}</span><Progress value={v} tone={scoreCls(v)} /><span className="mono muted">{v}/10</span></div>
            ))}
          </div>
        )}
        <div className="grid g2">
          {item.strengths.length > 0 && <div><h3 className="small" style={{ color: 'var(--green)' }}>What went well</h3><ul className="bullets small">{item.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {item.missed.length > 0 && <div><h3 className="small" style={{ color: 'var(--red)' }}>What was missing</h3><ul className="bullets small">{item.missed.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </div>
        {item.ideal_answer && (
          <details className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
            <summary className="card-pad strong small" style={{ cursor: 'pointer', padding: '12px 16px' }}>Show a strong answer</summary>
            <p className="small" style={{ padding: '0 16px 14px' }}>{item.ideal_answer}</p>
          </details>
        )}
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

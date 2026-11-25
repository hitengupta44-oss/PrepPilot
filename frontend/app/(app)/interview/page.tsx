'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useProfile } from '@/components/AppShell';
import { api, apiProfile } from '@/lib/api';
import { startMonitor } from '@/lib/integrity';
import { speak, SpeechRecognitionCtor, startListening, Listener } from '@/lib/speech';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { levelOf, planTopics, scoreCls } from '@/lib/topics';

type Item = { topic: string; question: string; answer: string; score: number; verdict: string };
type Current = { topic: string; question: string; followUp: boolean };
type Evaluation = { score: number; verdict: string; strengths: string[]; missed: string[]; ideal_answer: string; follow_up: string };
type Result = { items: Item[]; avg: number; focus: number; flags: string[]; videoUrl: string | null; saveError: string };

/** Mutable state of a running interview (kept in a ref so async callbacks always see the latest). */
type Live = {
  stream: MediaStream;
  plan: string[];
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
};

export default function InterviewPage() {
  const { profile, stats, session, refreshAnswers } = useProfile();
  const [phase, setPhase] = useState<'setup' | 'live' | 'done'>('setup');

  // setup
  const [n, setN] = useState(5);
  const [consent, setConsent] = useState(false);
  const [record, setRecord] = useState(false);
  const [focusTopic, setFocusTopic] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);

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

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('topic');
    setFocusTopic(t);
    setPreview([...new Set(planTopics(profile.topics, stats, 5, t))]);
  }, [profile.topics, stats]);

  // Stop camera, mic, speech and recorder if the user navigates away mid-interview.
  useEffect(
    () => () => {
      const s = live.current;
      if (!s) return;
      s.stopped = true;
      s.listener?.stop();
      window.speechSynthesis?.cancel();
      s.stopMonitor?.();
      if (s.recorder && s.recorder.state !== 'inactive') try { s.recorder.stop(); } catch {}
      s.stream.getTracks().forEach((t) => t.stop());
      live.current = null;
    },
    [],
  );

  // Attach the camera and start local focus monitoring once the live view is on screen.
  useEffect(() => {
    const s = live.current;
    const v = videoRef.current;
    if (phase !== 'live' || !s || !v) return;
    v.srcObject = s.stream;
    v.play().catch(() => {});
    s.stopMonitor = startMonitor(v, setFaceLabel, flag);
    return () => s.stopMonitor?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function flag(msg: string, penalty: number) {
    const s = live.current;
    if (!s || s.stopped) return;
    s.focus = Math.max(0, s.focus - penalty);
    s.flags.push(`${new Date().toLocaleTimeString()} ${msg}`);
    setFocus(s.focus);
    setFlags([...s.flags]);
  }

  /* ---------- mic ---------- */
  function listen() {
    const s = live.current;
    if (!s || s.stopped) return;
    s.listener?.stop();
    if (!SpeechRecognitionCtor) return setMic('unsupported');
    s.listener = startListening(
      s.answer,
      (full) => { s.answer = full; setAnswer(full); },
      () => setMic('blocked'),
    );
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
    const s: Live = {
      stream, plan: planTopics(profile.topics, stats, n, focusTopic), idx: 0, items: [], asked: [], flags: [],
      focus: 100, followUps: 0, pendingFollowUp: null, current: null, answer: '', stopped: false, listener: null, chunks: [],
    };
    if (record && typeof MediaRecorder !== 'undefined') {
      // Recording stays in browser memory and is only offered as a download. Never uploaded.
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
    const topic = s.plan[s.idx];
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
          profile: apiProfile(profile), topic, topic_label: l.label, topic_avg: l.avg,
          avoid: (stats[topic]?.asked || []).slice(-15).concat(s.asked).slice(-30),
        });
        question = r.question;
      }
      if (live.current !== s || s.stopped) return;
      s.current = { topic, question, followUp };
      s.asked.push(question);
      setCurrent(s.current);
      await speak(question);
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
    const { topic, question, followUp } = s.current;
    setEvaluating(true); setEvalErr('');
    try {
      const r: Evaluation = ans.length < 3
        ? { score: 0, verdict: 'Skipped / no answer.', strengths: [], missed: [], ideal_answer: '', follow_up: '' }
        : await api<Evaluation>('/interview/evaluate', { profile: apiProfile(profile), topic, question, answer: ans.slice(0, 8000) });
      if (live.current !== s) return;
      s.items.push({ topic, question, answer: ans, score: r.score, verdict: r.verdict });
      // Real interviewers dig deeper on partial answers: up to 2 follow-ups per interview.
      if (r.follow_up && r.score >= 3 && r.score <= 7 && s.followUps < 2 && !followUp) {
        s.followUps++;
        s.pendingFollowUp = r.follow_up;
        s.plan.splice(s.idx + 1, 0, topic);
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

    const items = s.items;
    const avg = items.length ? items.reduce((a, b) => a + b.score, 0) / items.length : 0;
    let saveError = '';
    if (items.length) {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('interview_sessions')
        .insert({ user_id: session.user.id, avg_score: Number(avg.toFixed(2)), focus_score: s.focus, flags: s.flags, question_count: items.length })
        .select('id')
        .single();
      if (error) saveError = error.message;
      else {
        const { error: e2 } = await sb.from('answers').insert(items.map((it) => ({ user_id: session.user.id, session_id: data.id, ...it })));
        if (e2) saveError = e2.message;
      }
      await refreshAnswers();
    }
    live.current = null;
    setResult({ items, avg, focus: s.focus, flags: s.flags, videoUrl, saveError });
    setPhase('done');
  }

  /* ---------- views ---------- */
  if (phase === 'setup') {
    return (
      <>
        <h1>Mock interview</h1>
        <p className="sub">{profile.role} · questions are picked from your weakest topics first.</p>
        <div className="card">
          <h2>Before you start</h2>
          <label>Number of questions</label>
          <select value={n} onChange={(e) => setN(+e.target.value)}>
            <option value={3}>3</option><option value={5}>5</option><option value={8}>8</option>
          </select>
          <p className="muted" style={{ marginTop: 12 }}>
            {focusTopic ? 'Focus topic: ' : 'Likely topics: '}
            {preview.map((t) => <span key={t} className={`pill ${levelOf(stats, t).cls}`} style={{ margin: 2 }}>{t}</span>)}
          </p>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I allow camera and microphone access for this interview. Video is analyzed <b>live in my browser</b> to check focus (face visible, one person, looking at the screen, no tab switching) and is <b>not uploaded</b>. My spoken answers are transcribed by the browser&apos;s speech service and the text is sent to the AI for evaluation.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
            <span><b>Optional:</b> record a video of this session. It is saved <b>only to my device</b> as a download at the end and is never uploaded.</span>
          </label>
          {!SpeechRecognitionCtor && <p className="notice">⚠️ Live speech-to-text needs Chrome or Edge. You can still type your answers.</p>}
          <div style={{ marginTop: 16 }}>
            <button className="primary" disabled={!consent} onClick={start}>Start interview</button>
          </div>
        </div>
      </>
    );
  }

  if (phase === 'done' && result) {
    const weakNow = profile.topics.filter((t) => levelOf(stats, t).cls === 'red');
    return (
      <>
        <h1>Interview complete</h1>
        <div className="grid g3">
          <div className="card"><div className="muted">Average score</div><div className="stat">{result.items.length ? result.avg.toFixed(1) : '–'}/10</div></div>
          <div className="card"><div className="muted">Focus score</div><div className="stat">{result.focus}%</div></div>
          <div className="card"><div className="muted">Questions answered</div><div className="stat">{result.items.length}</div></div>
        </div>
        {result.saveError && <p className="notice">⚠️ Could not save results: {result.saveError}</p>}
        <div className="card">
          <h2>Results by question</h2>
          {result.items.length === 0 && <p className="muted">No answers recorded.</p>}
          {result.items.map((it, i) => (
            <div key={i} style={{ margin: '10px 0' }}>
              <span className={`pill ${scoreCls(it.score)}`}>{it.score}/10</span> <b>{it.topic}</b>: {it.question}
              <div className="muted">{it.verdict}</div>
            </div>
          ))}
          {weakNow.length > 0 && <p className="notice">🔴 Marked weak: <b>{weakNow.join(', ')}</b>. Your next interview will target these.</p>}
          {result.flags.length > 0 && (<><h3>Integrity flags</h3><ul className="tight">{result.flags.map((f, i) => <li key={i}>{f}</li>)}</ul></>)}
        </div>
        {result.videoUrl && (
          <div className="card">
            <h2>Your recording</h2>
            <p className="muted">Stored only in this browser tab. Download it if you want to keep it.</p>
            <a className="btn primary" href={result.videoUrl} download={`interview-${new Date().toISOString().slice(0, 10)}.webm`}>⬇ Download video</a>
          </div>
        )}
        <div className="row">
          <button className="primary" onClick={() => { setPhase('setup'); setResult(null); }}>Another interview</button>
          <Link className="btn" href="/dashboard">Dashboard</Link>
        </div>
      </>
    );
  }

  const micText = {
    on: <><span className="rec-dot" /> Listening…</>,
    paused: 'Mic paused while you type',
    off: '',
    unsupported: '⌨️ Type your answer (live speech needs Chrome or Edge)',
    blocked: '⚠️ Mic blocked: type your answer',
  }[mic];

  return (
    <div className="grid g-int">
      <div>
        <div className="card">
          <div className="row">
            <span className="pill">Question {qNum} / {total}</span>
            {current && <span className={`pill ${levelOf(stats, current.topic).cls}`}>{current.topic}</span>}
            <div className="spacer" />
            {record && <span className="muted"><span className="rec-dot" /> Recording to device</span>}
          </div>
          <div className="question">
            {qError ? <>⚠️ {qError} <button onClick={nextQuestion}>Retry</button></>
              : current ? <>{current.followUp && '↪ Follow-up: '}{current.question}</>
              : <><span className="spinner" /> Preparing question…</>}
          </div>
          <div className="row">
            <span className="muted">{micText}</span>
            <div className="spacer" />
            {current && !evalRes && SpeechRecognitionCtor && mic !== 'blocked' && (
              mic === 'on'
                ? <button onClick={() => stopListening('paused')}>⏸ Pause mic</button>
                : <button onClick={listen}>🎤 Speak</button>
            )}
            {current && <button onClick={() => speak(current.question)}>🔊 Repeat</button>}
          </div>
          <label>Your answer (live transcript, you can edit it)</label>
          <textarea
            value={answer}
            placeholder="Start speaking…"
            disabled={!!evalRes}
            onChange={(e) => {
              if (mic === 'on') stopListening('paused');
              setAnswer(e.target.value);
              if (live.current) live.current.answer = e.target.value;
            }}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" disabled={!current || evaluating || !!evalRes} onClick={() => submit()}>
              {evaluating ? <><span className="spinner" /> Evaluating…</> : 'Submit answer'}
            </button>
            <button disabled={!current || evaluating || !!evalRes} onClick={() => submit(true)}>Skip</button>
            <div className="spacer" />
            <button className="danger" onClick={finish}>End interview</button>
          </div>
        </div>

        {evalErr && <div className="card">⚠️ {evalErr} <button onClick={() => submit()}>Retry</button></div>}
        {evalRes && (
          <div className="card">
            <div className="row">
              <span className="score">{evalRes.score}/10</span>
              <span className={`pill ${scoreCls(evalRes.score)}`}>
                {evalRes.score < 5 ? 'Weak: marked red' : evalRes.score < 7 ? 'Partial' : 'Good'}
              </span>
            </div>
            <p>{evalRes.verdict}</p>
            {evalRes.strengths.length > 0 && (<><h3>✅ Strengths</h3><ul className="tight">{evalRes.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
            {evalRes.missed.length > 0 && (<><h3>❌ Missed</h3><ul className="tight">{evalRes.missed.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
            {evalRes.ideal_answer && <details><summary>Model answer</summary><p>{evalRes.ideal_answer}</p></details>}
            <button className="primary" onClick={next}>{qNum >= total ? 'Finish' : 'Next question →'}</button>
          </div>
        )}
      </div>

      <div>
        <div className="card">
          <video ref={videoRef} autoPlay muted playsInline />
          <div className="row" style={{ marginTop: 10 }}>
            <b>Focus score</b><div className="spacer" />
            <span className={`pill ${focus < 60 ? 'red' : focus < 85 ? 'yellow' : 'green'}`}>{focus}%</span>
          </div>
          <div className="muted">{faceLabel}</div>
          <ul className="log">{[...flags].reverse().map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

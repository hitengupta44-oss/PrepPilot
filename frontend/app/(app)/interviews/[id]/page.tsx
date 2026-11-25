'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Eye, Flag, Mic, Trash2 } from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { Empty, PageHeader, Progress, ScoreRing } from '@/components/ui';
import { AnswerRow, getSupabase, SessionRow } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { scoreCls } from '@/lib/topics';
import { roundLabel, roundOf } from '@/lib/tracks';

export default function InterviewReport() {
  const { id } = useParams<{ id: string }>();
  const { refreshAnswers } = useProfile();
  const [s, setS] = useState<SessionRow | null | undefined>(undefined);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);

  useEffect(() => {
    const sb = getSupabase();
    Promise.all([
      sb.from('interview_sessions').select('*').eq('id', id).maybeSingle(),
      sb.from('answers').select('*').eq('session_id', id).order('created_at'),
    ]).then(([a, b]) => { setS((a.data as SessionRow) ?? null); setAnswers((b.data as AnswerRow[]) ?? []); });
  }, [id]);

  async function remove() {
    if (!confirm('Delete this interview and its answers? Your skill map will be recalculated without it.')) return;
    const { error } = await getSupabase().from('interview_sessions').delete().eq('id', id);
    if (error) return toast(error.message, 6000);
    await refreshAnswers();
    window.location.href = '/interviews';
  }

  if (s === undefined) return <div className="skeleton" style={{ height: 200 }} />;
  if (s === null) return <div className="card"><Empty icon={Mic} title="Interview not found"><Link href="/interviews">Back to history</Link></Empty></div>;

  const rubricTotals: Record<string, number[]> = {};
  for (const a of answers) for (const [k, v] of Object.entries(a.rubric || {})) (rubricTotals[k] ||= []).push(v);

  return (
    <>
      <Link href="/interviews" className="row small" style={{ gap: 6, marginBottom: 12, display: 'inline-flex' }}><ArrowLeft size={15} /> All interviews</Link>
      <PageHeader
        title={roundLabel(s.round_type)}
        subtitle={<>{new Date(s.created_at).toLocaleString()}{s.duration_seconds ? ` · ${Math.max(1, Math.round(s.duration_seconds / 60))} min` : ''}</>}
        actions={<><button className="btn btn-danger" onClick={remove}><Trash2 /> Delete</button><Link className="btn btn-primary" href={`/interview?round=${s.round_type}`}><Mic /> Practice again</Link></>}
      />
      <div className="grid g3">
        <div className="card card-pad row" style={{ gap: 16 }}><ScoreRing value={answers.length ? Number(s.avg_score) : null} /><div><div className="muted small">Average score</div><div className="strong">{answers.length} answers</div></div></div>
        <div className="card card-pad row" style={{ gap: 16 }}><ScoreRing value={s.focus_score} max={100} /><div><div className="muted small row" style={{ gap: 6 }}><Eye size={14} /> Focus score</div><div className="strong">{s.flags.length} flag{s.flags.length === 1 ? '' : 's'}</div></div></div>
        <div className="card card-pad stack-sm">
          <div className="muted small">Rubric averages</div>
          {Object.entries(rubricTotals).slice(0, 4).map(([k, v]) => {
            const a = v.reduce((x, y) => x + y, 0) / v.length;
            return <div key={k}><div className="row between xs"><span>{k}</span><span className="mono">{a.toFixed(1)}</span></div><Progress value={a} tone={scoreCls(a)} /></div>;
          })}
          {Object.keys(rubricTotals).length === 0 && <span className="muted small">No rubric data.</span>}
        </div>
      </div>

      {s.flags.length > 0 && (
        <div className="card mt-16">
          <div className="card-head"><Flag size={16} color="var(--amber)" /><h2>Integrity flags</h2></div>
          <div className="card-body"><ul className="bullets small" style={{ marginTop: 0 }}>{s.flags.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
        </div>
      )}

      <div className="card mt-16">
        <div className="card-head"><h2>Questions and feedback</h2></div>
        {answers.length === 0 && <Empty icon={Clock} title="No answers saved">This session ended before any answers were scored.</Empty>}
        {answers.map((a, i) => (
          <details key={a.id} className="disclosure" open={i === 0}>
            <summary>
              <ScoreRing value={a.score} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="muted xs">Q{i + 1}</span>
                  <span className="badge">{roundOf(a.round_type).label}</span>
                  {roundOf(a.round_type).topicBased && <span className="badge">{a.topic}</span>}
                  {a.is_follow_up && <span className="badge yellow">Follow-up</span>}
                </div>
                <div className="small strong mt-4">{a.question}</div>
              </div>
            </summary>
            <div className="inner stack">
              <div>
                <div className="label">Your answer</div>
                <p className="small mt-4" style={{ whiteSpace: 'pre-wrap' }}>{a.answer || <span className="muted">Skipped</span>}</p>
              </div>
              <p><b>Verdict:</b> {a.verdict}</p>
              {Object.keys(a.rubric || {}).length > 0 && (
                <div className="rubric">{Object.entries(a.rubric).map(([k, v]) => <div key={k} className="r"><span>{k}</span><Progress value={v} tone={scoreCls(v)} /><span className="mono muted">{v}/10</span></div>)}</div>
              )}
              <div className="grid g2">
                {a.strengths.length > 0 && <div><h3 className="small" style={{ color: 'var(--green)' }}>What went well</h3><ul className="bullets small">{a.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                {a.missed.length > 0 && <div><h3 className="small" style={{ color: 'var(--red)' }}>What was missing</h3><ul className="bullets small">{a.missed.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              </div>
              {a.ideal_answer && <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}><div className="label">A strong answer</div><p className="small mt-4">{a.ideal_answer}</p></div>}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

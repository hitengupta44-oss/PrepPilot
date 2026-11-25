'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useProfile } from '@/components/AppShell';
import { getSupabase, SessionRow } from '@/lib/supabase';
import { levelOf, scoreCls } from '@/lib/topics';

export default function DashboardPage() {
  const { profile: p, stats, answers } = useProfile();
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useEffect(() => {
    getSupabase()
      .from('interview_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setSessions((data as SessionRow[]) ?? []));
  }, [answers]);

  const avg = (arr: number[]) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '–');
  const weak = p.topics.filter((t) => levelOf(stats, t).cls === 'red');

  return (
    <>
      <div className="row">
        <div>
          <h1>{p.name || 'Your dashboard'}</h1>
          <p className="sub">{p.role} · {p.level}</p>
        </div>
        <div className="spacer" />
        <Link className="btn primary" href="/interview">▶ Start mock interview</Link>
      </div>

      <div className="grid g3">
        <div className="card"><div className="muted">Interviews done</div><div className="stat">{sessions.length}</div></div>
        <div className="card"><div className="muted">Average score (/10)</div><div className="stat">{avg(sessions.map((s) => Number(s.avg_score)))}</div></div>
        <div className="card"><div className="muted">Average focus score</div><div className="stat">{avg(sessions.map((s) => s.focus_score))}</div></div>
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Skill map</h2>
          <div className="spacer" />
          <span className="pill red">Weak</span><span className="pill yellow">Improving</span>
          <span className="pill green">Strong</span><span className="pill gray">Not tested</span>
        </div>
        {weak.length > 0 && (
          <p className="notice" style={{ marginTop: 12 }}>🔴 Your next interview will focus on: <b>{weak.join(', ')}</b></p>
        )}
        <div className="topics" style={{ marginTop: 14 }}>
          {p.topics.map((t) => {
            const l = levelOf(stats, t);
            return (
              <div key={t} className={`topic ${l.cls}`}>
                <b>{t}</b>
                {l.label}
                {l.avg != null && ` · ${l.avg.toFixed(1)}/10 · ${l.count} answered`}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Recent interviews</h2>
        {sessions.length === 0 && <p className="muted">No interviews yet. Start one to fill your skill map.</p>}
        {sessions.slice(0, 10).map((s) => {
          const items = answers.filter((a) => a.session_id === s.id);
          return (
            <details key={s.id}>
              <summary>{new Date(s.created_at).toLocaleString()} · score {Number(s.avg_score).toFixed(1)}/10 · focus {s.focus_score}%</summary>
              {items.map((it) => (
                <div key={it.id} style={{ margin: '10px 0' }}>
                  <span className={`pill ${scoreCls(it.score)}`}>{it.score}/10</span> <b>{it.topic}</b>: {it.question}
                  <div className="muted">{it.verdict}</div>
                </div>
              ))}
              {s.flags?.length > 0 && <div className="muted">Integrity flags: {s.flags.join('; ')}</div>}
            </details>
          );
        })}
      </div>

      <div className="card">
        <h3>Skills from resume</h3>
        {p.skills.map((s) => <span key={s} className="pill" style={{ margin: 3 }}>{s}</span>)}
        <div style={{ marginTop: 12 }}><Link href="/onboarding" className="muted">Re-upload resume</Link></div>
      </div>
    </>
  );
}

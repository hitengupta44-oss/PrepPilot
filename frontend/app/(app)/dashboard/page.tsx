'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, Eye, FileText, Gauge, Mic, Target, TriangleAlert } from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { Empty, PageHeader, Progress, ScoreRing, Stat } from '@/components/ui';
import { getSupabase, SessionRow } from '@/lib/supabase';
import { levelOf, scoreCls } from '@/lib/topics';
import { ROUNDS, roundLabel, trackOf } from '@/lib/tracks';

export default function DashboardPage() {
  const { profile: p, stats, answers, resume } = useProfile();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const track = trackOf(p.track);

  useEffect(() => {
    getSupabase().from('interview_sessions').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setSessions((data as SessionRow[]) ?? []));
  }, [answers]);

  const done = (sessions ?? []).filter((s) => s.status === 'completed' && s.question_count > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgScore = avg(done.map((s) => Number(s.avg_score)));
  const avgFocus = avg(done.map((s) => s.focus_score));
  const weak = p.topics.filter((t) => levelOf(stats, t).cls === 'red');
  const untested = p.topics.filter((t) => levelOf(stats, t).cls === 'gray');

  const byRound = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const a of answers) (m[a.round_type] ||= []).push(a.score);
    return track.rounds.map((r) => ({ r, scores: m[r] || [] }));
  }, [answers, track.rounds]);

  const first = p.name?.split(' ')[0];

  return (
    <>
      <PageHeader
        title={first ? `Welcome back, ${first}` : 'Dashboard'}
        subtitle={<>{p.role} · {track.label} · {p.level}</>}
        actions={<Link className="btn btn-primary" href="/interview"><Mic /> Start mock interview</Link>}
      />

      <div className="grid g4">
        <Stat icon={Mic} label="Interviews completed" value={sessions ? done.length : '–'} />
        <Stat icon={Target} label="Average score" value={avgScore != null ? `${avgScore.toFixed(1)}/10` : '–'} hint="Across all answers" />
        <Stat icon={Eye} label="Average focus" value={avgFocus != null ? `${Math.round(avgFocus)}%` : '–'} hint="From integrity checks" />
        <Stat icon={FileText} label="Resume score" value={resume?.resume_score != null ? `${resume.resume_score}/100` : '–'} />
      </div>

      <div className="grid g-main mt-16">
        <div className="stack">
          {(weak.length > 0 || done.length === 0) && (
            <div className="card card-pad">
              {weak.length > 0 ? (
                <div className="row top" style={{ gap: 14, flexWrap: 'nowrap' }}>
                  <TriangleAlert color="var(--red)" style={{ flex: 'none', marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <h3>Focus areas for your next interview</h3>
                    <p className="muted small mt-4">These topics scored below 5/10 recently. Your next session will ask about them first.</p>
                    <div className="chips mt-8">{weak.map((t) => <span key={t} className="badge red">{t}</span>)}</div>
                  </div>
                  <Link href="/interview" className="btn btn-sm">Practice <ArrowRight /></Link>
                </div>
              ) : (
                <div className="row top" style={{ gap: 14, flexWrap: 'nowrap' }}>
                  <Gauge color="var(--brand)" style={{ flex: 'none', marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <h3>Take your first mock interview</h3>
                    <p className="muted small mt-4">A 5-question full interview takes about 10 minutes and fills in your skill map.</p>
                  </div>
                  <Link href="/interview" className="btn btn-primary btn-sm">Start <ArrowRight /></Link>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Skill map</h2>
              <div className="spacer" />
              <div className="row xs muted" style={{ gap: 12 }}>
                <span className="row" style={{ gap: 5 }}><span className="dot red" /> Weak</span>
                <span className="row" style={{ gap: 5 }}><span className="dot yellow" /> Improving</span>
                <span className="row" style={{ gap: 5 }}><span className="dot green" /> Strong</span>
                <span className="row" style={{ gap: 5 }}><span className="dot gray" /> Not tested</span>
              </div>
            </div>
            <div className="card-body">
              <div className="topics">
                {p.topics.map((t) => {
                  const l = levelOf(stats, t);
                  return (
                    <Link key={t} href={`/bank?topic=${encodeURIComponent(t)}`} className={`topic ${l.cls}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div className="name"><span className={`dot ${l.cls}`} /> {t}</div>
                      <div className="meta">{l.avg != null ? `${l.avg.toFixed(1)}/10 · ${l.count} answer${l.count === 1 ? '' : 's'}` : 'Not tested yet'}</div>
                      {l.avg != null && <div className="mt-8"><Progress value={l.avg} tone={l.cls} /></div>}
                    </Link>
                  );
                })}
              </div>
              {untested.length > 0 && untested.length < p.topics.length && (
                <p className="muted xs mt-12">{untested.length} topic{untested.length === 1 ? '' : 's'} not tested yet. They&apos;ll come up in upcoming interviews.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Recent interviews</h2><div className="spacer" /><Link href="/interviews" className="small">View all</Link></div>
            {sessions === null ? <div className="card-body"><div className="skeleton" style={{ height: 60 }} /></div>
              : sessions.length === 0 ? <Empty icon={Mic} title="No interviews yet">Your results will appear here.</Empty>
              : sessions.slice(0, 5).map((s) => (
                <Link key={s.id} href={`/interviews/${s.id}`} className="list-row">
                  <ScoreRing value={s.question_count ? Number(s.avg_score) : null} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong">{roundLabel(s.round_type)}</div>
                    <div className="muted xs">{new Date(s.created_at).toLocaleString()} · {s.question_count} questions · focus {s.focus_score}%</div>
                  </div>
                  {s.status !== 'completed' && <span className="badge yellow">Incomplete</span>}
                  <ChevronRight size={18} color="var(--muted)" />
                </Link>
              ))}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Practice a round</h2></div>
            <div className="card-body stack-sm">
              <Link href="/interview?round=mixed" className="choice" style={{ textDecoration: 'none' }}>
                <span className="title"><Mic /> Full interview</span>
                <span className="desc">Resume, core rounds for {track.short}, then HR.</span>
              </Link>
              {track.rounds.map((r) => (
                <Link key={r} href={`/interview?round=${r}`} className="list-row" style={{ padding: '10px 4px', borderTop: '1px solid var(--line)' }}>
                  <div style={{ flex: 1 }}>
                    <div className="strong small">{ROUNDS[r].label}</div>
                    <div className="muted xs">{ROUNDS[r].desc}</div>
                  </div>
                  <ChevronRight size={16} color="var(--muted)" />
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Score by round</h2></div>
            <div className="card-body stack-sm">
              {byRound.map(({ r, scores }) => {
                const a = avg(scores);
                return (
                  <div key={r}>
                    <div className="row between small"><span>{ROUNDS[r].label}</span><span className="muted mono">{a != null ? `${a.toFixed(1)}/10` : 'not tried'}</span></div>
                    <div className="mt-4"><Progress value={a ?? 0} tone={a != null ? scoreCls(a) : ''} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

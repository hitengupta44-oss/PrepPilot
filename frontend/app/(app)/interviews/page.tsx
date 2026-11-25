'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Clock, History, Mic } from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { Empty, PageHeader, ScoreRing } from '@/components/ui';
import { getSupabase, SessionRow } from '@/lib/supabase';
import { roundLabel, trackOf } from '@/lib/tracks';

export default function InterviewsPage() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    getSupabase().from('interview_sessions').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setRows(((data as SessionRow[]) ?? []).filter((s) => s.question_count > 0 || s.status === 'completed')));
  }, []);

  const rounds = ['all', 'mixed', ...trackOf(profile.track).rounds];
  const shown = (rows ?? []).filter((s) => filter === 'all' || s.round_type === filter);
  const fmtDur = (s: number | null) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');

  return (
    <>
      <PageHeader title="Interview history" subtitle="Every mock interview you've taken, with scores and full feedback."
        actions={<Link className="btn btn-primary" href="/interview"><Mic /> New interview</Link>} />
      <div className="row" style={{ marginBottom: 14 }}>
        {rounds.map((r) => (
          <button key={r} className={`btn btn-sm ${filter === r ? 'btn-primary' : ''}`} onClick={() => setFilter(r)}>
            {r === 'all' ? 'All' : roundLabel(r)}
          </button>
        ))}
      </div>
      <div className="card">
        {rows === null ? <div className="card-body stack-sm">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}</div>
          : shown.length === 0 ? <Empty icon={History} title="No interviews here yet">Take a mock interview and it will show up here.</Empty>
          : shown.map((s) => (
            <Link key={s.id} href={`/interviews/${s.id}`} className="list-row">
              <ScoreRing value={s.question_count ? Number(s.avg_score) : null} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="strong">{roundLabel(s.round_type)}</span>
                  {s.status !== 'completed' && <span className="badge yellow">Incomplete</span>}
                </div>
                <div className="muted xs row" style={{ gap: 10, marginTop: 2 }}>
                  <span>{new Date(s.created_at).toLocaleString()}</span>
                  <span>{s.question_count} question{s.question_count === 1 ? '' : 's'}</span>
                  {fmtDur(s.duration_seconds) && <span className="row" style={{ gap: 4 }}><Clock size={12} /> {fmtDur(s.duration_seconds)}</span>}
                </div>
              </div>
              <span className={`badge ${s.focus_score < 60 ? 'red' : s.focus_score < 85 ? 'yellow' : 'green'}`}>Focus {s.focus_score}%</span>
              <ChevronRight size={18} color="var(--muted)" />
            </Link>
          ))}
      </div>
    </>
  );
}

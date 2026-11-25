'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/components/AppShell';
import { api, apiProfile } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { levelOf } from '@/lib/topics';

type Roadmap = { stages: { title: string; duration: string; items: { topic: string; detail: string }[] }[] };

export default function RoadmapPage() {
  const { profile, stats, session } = useProfile();
  const [data, setData] = useState<Roadmap | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const load = useCallback(async (regenerate = false) => {
    setError(''); setData(null);
    const sb = getSupabase();
    if (!regenerate) {
      const { data: row } = await sb.from('roadmaps').select('data, done').maybeSingle();
      if (row) { setData(row.data as Roadmap); setDone((row.done as Record<string, boolean>) || {}); return; }
    }
    try {
      const r = await api<Roadmap>('/roadmap', { profile: apiProfile(profile), topics: profile.topics });
      await sb.from('roadmaps').upsert({ user_id: session.user.id, data: r, done: {}, updated_at: new Date().toISOString() });
      setData(r); setDone({});
    } catch (e: any) {
      setError(e.message);
    }
  }, [profile, session.user.id]);

  useEffect(() => { load(); }, [load]);

  async function toggle(id: string, value: boolean) {
    const next = { ...done, [id]: value };
    setDone(next);
    await getSupabase().from('roadmaps').update({ done: next }).eq('user_id', session.user.id);
  }

  return (
    <>
      <h1>Roadmap</h1>
      <p className="sub">Your preparation plan for {profile.role}. Red tags show where mock interviews found you weak.</p>
      <div className="card">
        {error && <p>⚠️ {error} <button onClick={() => load()}>Retry</button></p>}
        {!data && !error && <p><span className="spinner" /> Building your roadmap…</p>}
        {data?.stages?.map((s, si) => (
          <div key={si} className="stage">
            <h2>{si + 1}. {s.title} <span className="muted">· {s.duration}</span></h2>
            {s.items.map((it, ii) => {
              const id = `${si}-${ii}`;
              const l = profile.topics.includes(it.topic) ? levelOf(stats, it.topic) : null;
              return (
                <label key={id} className="check">
                  <input type="checkbox" checked={!!done[id]} onChange={(e) => toggle(id, e.target.checked)} />
                  <span>
                    <b>{it.topic}</b> {l && <span className={`pill ${l.cls}`}>{l.label}</span>}{' '}
                    <Link className="muted" href={`/bank?topic=${encodeURIComponent(it.topic)}`}>practice</Link>
                    <br /><span className="muted">{it.detail}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ))}
        {data && <button onClick={() => load(true)}>↻ Regenerate roadmap</button>}
      </div>
    </>
  );
}

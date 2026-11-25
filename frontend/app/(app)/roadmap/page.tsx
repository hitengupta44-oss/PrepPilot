'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Map, RefreshCw } from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { Empty, PageHeader, Progress } from '@/components/ui';
import { api, apiProfile } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { levelOf } from '@/lib/topics';
import { trackOf } from '@/lib/tracks';

type Roadmap = { stages: { title: string; duration: string; items: { topic: string; detail: string }[] }[] };

export default function RoadmapPage() {
  const { profile, stats, session } = useProfile();
  const [data, setData] = useState<Roadmap | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (regenerate = false) => {
    setError(''); setLoading(true);
    const sb = getSupabase();
    if (!regenerate) {
      const { data: row } = await sb.from('roadmaps').select('data, done').maybeSingle();
      if (row) { setData(row.data as Roadmap); setDone((row.done as Record<string, boolean>) || {}); setLoading(false); return; }
    }
    try {
      const weak = profile.topics.filter((t) => levelOf(stats, t).cls === 'red');
      const r = await api<Roadmap>('/roadmap', { profile: apiProfile(profile), topics: profile.topics, weak_topics: weak });
      await sb.from('roadmaps').upsert({ user_id: session.user.id, data: r, done: {}, updated_at: new Date().toISOString() });
      setData(r); setDone({});
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [profile, stats, session.user.id]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(id: string, value: boolean) {
    const next = { ...done, [id]: value };
    setDone(next);
    await getSupabase().from('roadmaps').update({ done: next }).eq('user_id', session.user.id);
  }

  const totalItems = data?.stages?.reduce((a, s) => a + s.items.length, 0) ?? 0;
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Roadmap"
        subtitle={`Your preparation plan for ${profile.role} (${trackOf(profile.track).label}).`}
        actions={data && <button className="btn" onClick={() => load(true)} disabled={loading}><RefreshCw /> Regenerate</button>}
      />
      {data && totalItems > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row between small"><span className="strong">Progress</span><span className="muted">{doneCount} of {totalItems} done</span></div>
          <div className="mt-8"><Progress value={doneCount} max={totalItems} tone="green" /></div>
        </div>
      )}
      <div className="card card-body">
        {error && <div className="notice danger"><span>{error} <button className="btn btn-sm" onClick={() => load()}>Retry</button></span></div>}
        {loading && !data && <div className="stack-sm"><span className="muted row"><span className="spinner" /> Building your roadmap…</span>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 70 }} />)}</div>}
        {!loading && !data && !error && <Empty icon={Map} title="No roadmap yet" />}
        {data?.stages?.map((s, si) => (
          <div key={si} className="stage">
            <span className="num">{si + 1}</span>
            <div className="row" style={{ gap: 8 }}><h2 style={{ fontSize: 16 }}>{s.title}</h2><span className="badge">{s.duration}</span></div>
            <div className="mt-8">
              {s.items.map((it, ii) => {
                const id = `${si}-${ii}`;
                const l = profile.topics.includes(it.topic) ? levelOf(stats, it.topic) : null;
                return (
                  <label key={id} className="item" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!done[id]} onChange={(e) => toggle(id, e.target.checked)} style={{ marginTop: 4, accentColor: 'var(--brand)' }} />
                    <div style={{ flex: 1 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="strong small" style={{ textDecoration: done[id] ? 'line-through' : 'none' }}>{it.topic}</span>
                        {l && l.cls !== 'gray' && <span className={`badge ${l.cls}`}>{l.label}</span>}
                      </div>
                      <div className="muted small">{it.detail}</div>
                    </div>
                    <Link className="btn btn-sm btn-ghost" href={`/bank?topic=${encodeURIComponent(it.topic)}`}><BookOpen /> Practice</Link>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

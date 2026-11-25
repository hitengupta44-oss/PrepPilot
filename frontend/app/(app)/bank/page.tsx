'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, Mic, Plus } from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { Empty, PageHeader } from '@/components/ui';
import { api, apiProfile } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { levelOf } from '@/lib/topics';

type Q = { id?: string; question: string; difficulty: string; hint: string };

export default function BankPage() {
  const { profile, stats, session } = useProfile();
  const router = useRouter();
  const [topics, setTopics] = useState<string[]>(profile.topics);
  const [topic, setTopic] = useState(profile.topics[0] || '');
  const [qs, setQs] = useState<Q[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState('All');

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('topic');
    if (want) {
      setTopics((t) => (t.includes(want) ? t : [...t, want]));
      setTopic(want);
    }
  }, []);

  async function generate(t: string, existing: Q[]) {
    setBusy(true); setError('');
    try {
      const r = await api<{ questions: { q: string; difficulty: string; hint: string }[] }>('/bank', {
        profile: apiProfile(profile), topic: t, avoid: existing.map((q) => q.question).slice(-80),
      });
      const rows = r.questions.map((q) => ({
        user_id: session.user.id, topic: t, track: profile.track, question: q.q, difficulty: q.difficulty || 'Medium', hint: q.hint || '',
      }));
      const { data, error } = await getSupabase().from('question_bank').insert(rows).select('id, question, difficulty, hint');
      if (error) throw new Error(error.message);
      setQs([...existing, ...((data as Q[]) ?? [])]);
    } catch (e: any) {
      setError(e.message);
      setQs(existing);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    setQs(null);
    getSupabase().from('question_bank').select('id, question, difficulty, hint').eq('topic', topic).order('created_at')
      .then(({ data }) => {
        if (cancelled) return;
        const existing = (data as Q[]) ?? [];
        if (existing.length) setQs(existing);
        else generate(topic, []);
      });
    return () => { cancelled = true; };
  }, [topic]); // eslint-disable-line react-hooks/exhaustive-deps

  const l = levelOf(stats, topic);
  const diffCls = (d: string) => (d === 'Hard' ? 'red' : d === 'Medium' ? 'yellow' : 'green');
  const shown = (qs ?? []).filter((q) => diff === 'All' || q.difficulty === diff);

  return (
    <>
      <PageHeader title="Question bank" subtitle={`Practice questions for ${profile.role}, with what a good answer covers.`}
        actions={<button className="btn btn-primary" onClick={() => router.push('/interview?topic=' + encodeURIComponent(topic))}><Mic /> Interview on this topic</button>} />
      <div className="grid g-main" style={{ gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)' }}>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head"><h2>Topics</h2></div>
          <div style={{ padding: 8 }}>
            {topics.map((t) => {
              const lv = levelOf(stats, t);
              return (
                <button key={t} onClick={() => setTopic(t)} className={`nav-item ${t === topic ? 'active' : ''}`}
                  style={{ width: '100%', border: 0, background: t === topic ? undefined : 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                  <span className={`dot ${lv.cls}`} /> <span style={{ flex: 1 }}>{t}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>{topic}</h2>
            {l.cls !== 'gray' && <span className={`badge ${l.cls}`}>{l.label}</span>}
            <div className="spacer" />
            <div className="segmented">
              {['All', 'Easy', 'Medium', 'Hard'].map((d) => <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>{d}</button>)}
            </div>
          </div>
          {error && <div className="card-body"><div className="notice danger"><span>{error}</span></div></div>}
          {!qs && !error && <div className="card-body stack-sm"><span className="muted row"><span className="spinner" /> Writing questions for {topic}…</span>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>}
          {qs && shown.length === 0 && <Empty icon={BookOpen} title="No questions here">Try another difficulty or generate more.</Empty>}
          {shown.map((q, i) => (
            <details key={q.id || i} className="disclosure">
              <summary>
                <span className="muted small mono" style={{ width: 22 }}>{i + 1}</span>
                <span style={{ flex: 1 }} className="small strong">{q.question}</span>
                <span className={`badge ${diffCls(q.difficulty)}`}>{q.difficulty}</span>
              </summary>
              <div className="inner"><div className="label">A good answer covers</div><p className="small mt-4">{q.hint}</p></div>
            </details>
          ))}
          {qs && (
            <div className="card-foot row">
              <span className="muted small">{qs.length} questions saved</span>
              <div className="spacer" />
              <button className="btn btn-sm" disabled={busy} onClick={() => generate(topic, qs)}>{busy ? <><span className="spinner" /> Generating…</> : <><Plus /> Generate 8 more</>}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

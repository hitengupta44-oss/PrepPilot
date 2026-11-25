'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useProfile } from '@/components/AppShell';
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
      const rows = r.questions.map((q) => ({ user_id: session.user.id, topic: t, question: q.q, difficulty: q.difficulty || 'Medium', hint: q.hint || '' }));
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
    getSupabase()
      .from('question_bank')
      .select('id, question, difficulty, hint')
      .eq('topic', topic)
      .order('created_at')
      .then(({ data }) => {
        if (cancelled) return;
        const existing = (data as Q[]) ?? [];
        if (existing.length) setQs(existing);
        else generate(topic, []);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  const l = levelOf(stats, topic);
  const diffCls = (d: string) => (d === 'Hard' ? 'red' : d === 'Medium' ? 'yellow' : 'green');

  return (
    <>
      <h1>Question bank</h1>
      <p className="sub">Questions per topic for {profile.role}, with answer hints. Saved to your account.</p>
      <div className="card">
        <div className="row">
          <select value={topic} onChange={(e) => setTopic(e.target.value)} style={{ maxWidth: 320 }}>
            {topics.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button disabled={busy || !qs} onClick={() => generate(topic, qs || [])}>{busy ? 'Generating…' : '+ Generate more'}</button>
          <div className="spacer" />
          <button className="primary" onClick={() => router.push('/interview?topic=' + encodeURIComponent(topic))}>▶ Mock interview on this topic</button>
        </div>
        <div style={{ marginTop: 14 }}>
          <p><span className={`pill ${l.cls}`}>{l.label}</span></p>
          {error && <p>⚠️ {error}</p>}
          {!qs && !error && <p><span className="spinner" /> Loading questions…</p>}
          {qs?.map((q, i) => (
            <details key={q.id || i}>
              <summary>{i + 1}. {q.question} <span className={`pill ${diffCls(q.difficulty)}`}>{q.difficulty}</span></summary>
              <p className="muted">{q.hint}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}

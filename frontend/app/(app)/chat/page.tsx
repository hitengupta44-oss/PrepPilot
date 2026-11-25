'use client';
import { useEffect, useRef, useState } from 'react';
import { useProfile } from '@/components/AppShell';
import { api, apiProfile } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { levelOf } from '@/lib/topics';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function ChatPage() {
  const { profile, stats, session } = useProfile();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSupabase()
      .from('chat_messages')
      .select('role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => setMsgs(((data as Msg[]) ?? []).reverse()));
  }, []);

  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [msgs, typing]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || typing) return;
    setText('');
    const sb = getSupabase();
    const history: Msg[] = [...msgs, { role: 'user', content }];
    setMsgs(history);
    setTyping(true);
    try {
      await sb.from('chat_messages').insert({ user_id: session.user.id, role: 'user', content });
      const topic_levels = Object.fromEntries(profile.topics.map((t) => [t, levelOf(stats, t).label]));
      const { reply } = await api<{ reply: string }>('/chat', {
        profile: apiProfile(profile), name: profile.name, topic_levels, messages: history.slice(-12),
      });
      await sb.from('chat_messages').insert({ user_id: session.user.id, role: 'assistant', content: reply });
      setMsgs([...history, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      toast(err.message, 6000);
    }
    setTyping(false);
  }

  async function clear() {
    await getSupabase().from('chat_messages').delete().eq('user_id', session.user.id);
    setMsgs([]);
  }

  return (
    <>
      <h1>Prep chat</h1>
      <p className="sub">Ask anything: concepts, how to answer HR questions, what to study next. It knows your profile and weak spots.</p>
      <div className="card">
        <div className="chat" ref={logRef}>
          {msgs.length === 0 && <p className="muted">No messages yet. Try “Explain my weakest topic simply”.</p>}
          {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
          {typing && <div className="msg assistant"><span className="spinner" /></div>}
        </div>
        <form className="row" onSubmit={send} style={{ marginTop: 12 }}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask your coach…" style={{ flex: 1 }} autoComplete="off" />
          <button className="primary" disabled={typing}>Send</button>
          <button type="button" onClick={clear}>Clear</button>
        </form>
      </div>
    </>
  );
}

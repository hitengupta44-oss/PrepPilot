'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { PageHeader } from '@/components/ui';
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
  const weakest = profile.topics.find((t) => levelOf(stats, t).cls === 'red') || profile.topics[0];

  const suggestions = [
    `Explain ${weakest} simply, with an example`,
    'How do I answer "Tell me about yourself" for my role?',
    `What do interviewers look for in a ${profile.role}?`,
    'Give me 3 smart questions to ask the interviewer',
  ];

  useEffect(() => {
    getSupabase().from('chat_messages').select('role, content, created_at').order('created_at', { ascending: false }).limit(40)
      .then(({ data }) => setMsgs(((data as Msg[]) ?? []).reverse()));
  }, []);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [msgs, typing]);

  async function send(content: string) {
    content = content.trim();
    if (!content || typing) return;
    setText('');
    const sb = getSupabase();
    const history: Msg[] = [...msgs, { role: 'user', content }];
    setMsgs(history);
    setTyping(true);
    try {
      await sb.from('chat_messages').insert({ user_id: session.user.id, role: 'user', content });
      const topic_levels = Object.fromEntries(profile.topics.map((t) => [t, levelOf(stats, t).label]));
      const { reply } = await api<{ reply: string }>('/chat', { profile: apiProfile(profile), name: profile.name, topic_levels, messages: history.slice(-12) });
      await sb.from('chat_messages').insert({ user_id: session.user.id, role: 'assistant', content: reply });
      setMsgs([...history, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      toast(err.message, 6000);
    }
    setTyping(false);
  }

  async function clear() {
    if (!confirm('Clear the whole conversation?')) return;
    await getSupabase().from('chat_messages').delete().eq('user_id', session.user.id);
    setMsgs([]);
  }

  return (
    <>
      <PageHeader title="Coach chat" subtitle="Ask about concepts, answers, rounds or what to study next. Your coach knows your role and weak topics."
        actions={msgs.length > 0 && <button className="btn btn-ghost" onClick={clear}><Trash2 /> Clear</button>} />
      <div className="card">
        <div className="chat-log" ref={logRef}>
          {msgs.length === 0 && (
            <div className="empty" style={{ margin: 'auto' }}>
              <MessageSquare />
              <h3>How can I help you prepare?</h3>
              <div className="suggestions mt-12" style={{ justifyContent: 'center' }}>
                {suggestions.map((s) => <button key={s} className="btn btn-sm" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
          {typing && <div className="msg assistant"><span className="spinner" /></div>}
        </div>
        <form className="card-foot row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask your coach…" autoComplete="off" />
          <button className="btn btn-primary" disabled={typing || !text.trim()}><Send /> Send</button>
        </form>
      </div>
    </>
  );
}

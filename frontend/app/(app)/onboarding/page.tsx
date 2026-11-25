'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppShell';
import { api } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type Parsed = { name: string; target_role: string; level: string; skills: string[]; topics: string[]; summary: string };

export default function OnboardingPage() {
  const { session, profile, refreshProfile } = useApp();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [p, setP] = useState<Parsed | null>(null);
  const [form, setForm] = useState({ name: '', role: '', level: '', skills: '', topics: '' });
  const [saving, setSaving] = useState(false);

  async function analyze() {
    if (!file && text.trim().length < 80) return toast('Choose a resume file or paste its text.');
    setStatus('AI is reading your resume…');
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      else fd.append('text', text);
      const r = await api<Parsed>('/resume/parse', fd);
      setP(r);
      setForm({
        name: r.name || '',
        role: r.target_role || '',
        level: r.level || '',
        skills: (r.skills || []).join(', '),
        topics: (r.topics || []).join(', '),
      });
    } catch (e: any) {
      toast(e.message, 6000);
    }
    setStatus('');
  }

  async function save() {
    const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    if (!form.role.trim() || !split(form.topics).length) return toast('Role and at least one topic are required.');
    setSaving(true);
    const { error } = await getSupabase().from('profiles').upsert({
      id: session.user.id,
      name: form.name.trim(),
      role: form.role.trim(),
      level: form.level.trim(),
      skills: split(form.skills),
      topics: split(form.topics),
      summary: p?.summary || '',
      updated_at: new Date().toISOString(),
    });
    if (!error) await getSupabase().from('roadmaps').delete().eq('user_id', session.user.id); // role may have changed
    setSaving(false);
    if (error) return toast(error.message, 6000);
    await refreshProfile();
    router.replace('/dashboard');
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h1>{profile ? 'Update your resume' : 'Welcome 👋'}</h1>
      <p className="sub">Upload your resume. AI reads your target role and builds a profile around it.</p>
      <div className="card">
        <label>Resume file (PDF, DOCX or TXT)</label>
        <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <label>…or paste the text</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste resume text here" />
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" onClick={analyze} disabled={!!status}>Analyze resume</button>
          {status && <span className="muted"><span className="spinner" /> {status}</span>}
        </div>
      </div>

      {p && (
        <div className="card">
          <h2>Check your profile</h2>
          <p className="muted">{p.summary}</p>
          <div className="grid g3">
            <div><label>Name</label><input type="text" value={form.name} onChange={set('name')} /></div>
            <div><label>Target role</label><input type="text" value={form.role} onChange={set('role')} /></div>
            <div><label>Level</label><input type="text" value={form.level} onChange={set('level')} /></div>
          </div>
          <label>Skills (comma separated)</label>
          <input type="text" value={form.skills} onChange={set('skills')} />
          <label>Interview topics to track (comma separated)</label>
          <input type="text" value={form.topics} onChange={set('topics')} />
          <div style={{ marginTop: 16 }}>
            <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : profile ? 'Update profile' : 'Create my profile'}</button>
          </div>
        </div>
      )}
    </>
  );
}

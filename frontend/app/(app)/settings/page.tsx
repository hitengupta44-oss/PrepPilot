'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProfile } from '@/components/AppShell';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

export default function SettingsPage() {
  const { profile, session } = useProfile();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace('/login');
  }

  async function wipe() {
    if (!confirm('Delete your profile, interview history, roadmap, question bank and chats? This cannot be undone.')) return;
    setBusy(true);
    const sb = getSupabase();
    const uid = session.user.id;
    for (const table of ['answers', 'interview_sessions', 'question_bank', 'chat_messages', 'roadmaps']) {
      const { error } = await sb.from(table).delete().eq('user_id', uid);
      if (error) { setBusy(false); return toast(`Could not delete ${table}: ${error.message}`, 6000); }
    }
    await sb.from('profiles').delete().eq('id', uid);
    await signOut();
  }

  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <h2>Account</h2>
        <p className="muted">Signed in as {session.user.email}</p>
        <p>{profile.name} · {profile.role} · {profile.level}</p>
        <div className="row">
          <Link className="btn" href="/onboarding">Update resume / profile</Link>
          <button onClick={signOut}>Log out</button>
        </div>
      </div>
      <div className="card">
        <h2>Privacy</h2>
        <ul className="tight">
          <li>Camera video is analyzed only in your browser and is never uploaded.</li>
          <li>Optional recordings are saved only to your device as a download.</li>
          <li>Your answer text, scores and chats are stored in your account so the coach can track weak spots.</li>
        </ul>
        <button className="danger" disabled={busy} onClick={wipe}>{busy ? 'Deleting…' : 'Delete all my data'}</button>
      </div>
    </>
  );
}

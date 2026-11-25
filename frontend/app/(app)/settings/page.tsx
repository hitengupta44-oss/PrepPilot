'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileText, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { useProfile } from '@/components/AppShell';
import { PageHeader } from '@/components/ui';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { trackOf } from '@/lib/tracks';

export default function SettingsPage() {
  const { profile, session } = useProfile();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace('/login');
  }

  async function wipe() {
    if (!confirm('Delete your profile, resumes, interviews, answers, roadmap, question bank and chats? This cannot be undone.')) return;
    setBusy(true);
    const sb = getSupabase();
    const uid = session.user.id;
    // answers go with their sessions (cascade); delete children first anyway for sessions without answers
    for (const table of ['answers', 'interview_sessions', 'resumes', 'question_bank', 'chat_messages', 'roadmaps']) {
      const { error } = await sb.from(table).delete().eq('user_id', uid);
      if (error) { setBusy(false); return toast(`Could not delete ${table}: ${error.message}`, 6000); }
    }
    await sb.from('profiles').delete().eq('id', uid);
    await signOut();
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="stack" style={{ maxWidth: 760 }}>
        <div className="card">
          <div className="card-head"><h2>Account</h2></div>
          <div className="card-body stack">
            <div className="grid g2">
              <div><div className="label">Email</div><div className="mt-4">{session.user.email}</div></div>
              <div><div className="label">Name</div><div className="mt-4">{profile.name || '–'}</div></div>
              <div><div className="label">Target role</div><div className="mt-4">{profile.role}</div></div>
              <div><div className="label">Track · Level</div><div className="mt-4">{trackOf(profile.track).label} · {profile.level}</div></div>
            </div>
            <div className="row">
              <Link className="btn" href="/resume"><FileText /> Update resume or profile</Link>
              <button className="btn" onClick={signOut}><LogOut /> Sign out</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><ShieldCheck size={18} color="var(--brand)" /><h2>Privacy</h2></div>
          <div className="card-body stack">
            <ul className="bullets small" style={{ marginTop: 0 }}>
              <li>Camera video is analyzed only in your browser and is never uploaded.</li>
              <li>Optional recordings are saved only to your device.</li>
              <li>We keep structured resume details (not the file, email or phone), answer text, scores and chats so we can track your progress.</li>
            </ul>
            <p className="small muted">
              {profile.terms_accepted_at ? <>You accepted the Terms on {new Date(profile.terms_accepted_at).toLocaleDateString()}. </> : null}
              Read the <Link href="/terms">Terms &amp; Conditions</Link> and <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </div>

        <div className="card" style={{ borderColor: 'var(--red-line)' }}>
          <div className="card-head"><h2 style={{ color: 'var(--red)' }}>Delete all my data</h2></div>
          <div className="card-body row">
            <p className="small muted" style={{ flex: 1, minWidth: 240 }}>Permanently removes your profile, resumes, interviews, answers, roadmap, question bank and chats, then signs you out.</p>
            <button className="btn btn-danger" disabled={busy} onClick={wipe}><Trash2 /> {busy ? 'Deleting…' : 'Delete everything'}</button>
          </div>
        </div>
      </div>
    </>
  );
}

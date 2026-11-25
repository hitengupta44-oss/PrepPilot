'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const sb = getSupabase();
      sb.auth.getSession().then(({ data }) => data.session && router.replace('/dashboard'));
      const { data } = sb.auth.onAuthStateChange((_e, s) => s && router.replace('/dashboard'));
      return () => data.subscription.unsubscribe();
    } catch (e: any) {
      toast(e.message, 8000);
    }
  }, [router]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + '/dashboard' },
    });
    setBusy(false);
    if (error) return toast(error.message, 6000);
    setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await getSupabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) return toast(error.message, 6000);
    router.replace('/dashboard');
  }

  return (
    <main>
      <div className="card narrow">
        <h1>🎯 PrepPilot</h1>
        <p className="sub">AI interview coach that learns your weak spots.</p>
        {!sent ? (
          <form onSubmit={sendCode}>
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <div style={{ marginTop: 18 }}>
              <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send login code'}</button>
            </div>
            <p className="muted" style={{ marginTop: 14 }}>No password needed. We email you a sign-in link and code.</p>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="notice">Check <b>{email}</b>. Click the link in the email, or enter the code below.</p>
            <label>Code from email</label>
            <input type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            <div className="row" style={{ marginTop: 18 }}>
              <button className="primary" disabled={busy || code.trim().length < 6}>{busy ? 'Checking…' : 'Verify & sign in'}</button>
              <button type="button" onClick={() => { setSent(false); setCode(''); }}>Use another email</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Mail } from 'lucide-react';
import { Logo } from '@/components/ui';
import { TERMS_KEY } from '@/lib/site';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [agree, setAgree] = useState(false);
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
    if (!agree) return toast('Please accept the Terms and Privacy Policy to continue.');
    setBusy(true);
    try { localStorage.setItem(TERMS_KEY, new Date().toISOString()); } catch {}
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
    <div className="auth">
      <aside className="auth-side">
        <Logo />
        <div>
          <h2>Walk into your next interview prepared.</h2>
          <ul>
            <li><CircleCheck /> Resume analysis with a score and fixes</li>
            <li><CircleCheck /> Mock interviews for your exact role</li>
            <li><CircleCheck /> Instant scoring with model answers</li>
            <li><CircleCheck /> Weak topics tracked and retested</li>
          </ul>
        </div>
        <p className="small" style={{ opacity: 0.7 }}>Free for students. Your video never leaves your device.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="hidden-desktop" style={{ marginBottom: 28 }}><Logo /></div>
          {!sent ? (
            <form onSubmit={sendCode} className="stack">
              <div>
                <h1>Sign in or create an account</h1>
                <p className="muted mt-8">We'll email you a one-time code. No password needed.</p>
              </div>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input id="email" className="input" type="email" required autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
              </div>
              <label className="check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>I agree to the <Link href="/terms" target="_blank">Terms &amp; Conditions</Link> and{' '}
                  <Link href="/privacy" target="_blank">Privacy Policy</Link>, including camera and microphone use during interviews.</span>
              </label>
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || !agree}>
                {busy ? <span className="spinner" /> : <Mail />} {busy ? 'Sending…' : 'Email me a code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="stack">
              <div>
                <h1>Check your inbox</h1>
                <p className="muted mt-8">We sent a sign-in link and a 6-digit code to <b>{email}</b>. Click the link, or enter the code below.</p>
              </div>
              <div className="field">
                <label htmlFor="code">Verification code</label>
                <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value)} placeholder="123456" style={{ fontSize: 18, letterSpacing: 4 }} />
              </div>
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.trim().length < 6}>
                {busy ? 'Verifying…' : 'Verify and continue'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setSent(false); setCode(''); }}>Use a different email</button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

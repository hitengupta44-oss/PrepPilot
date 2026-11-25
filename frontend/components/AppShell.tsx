'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AnswerRow, getSupabase, Profile } from '@/lib/supabase';
import { buildStats, Stats } from '@/lib/topics';
import { toast } from '@/lib/toast';

type Ctx = {
  session: Session;
  profile: Profile | null;
  answers: AnswerRow[];
  stats: Stats;
  refreshProfile: () => Promise<void>;
  refreshAnswers: () => Promise<void>;
};
const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp must be used inside AppShell');
  return c;
}
/** For pages that require a finished profile (everything except onboarding). */
export function useProfile() {
  const c = useApp();
  return { ...c, profile: c.profile as Profile };
}

const NAV = [
  ['/dashboard', 'Dashboard'],
  ['/interview', 'Interview'],
  ['/roadmap', 'Roadmap'],
  ['/bank', 'Question Bank'],
  ['/chat', 'Chat'],
  ['/settings', 'Settings'],
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [configError, setConfigError] = useState('');
  const userId = session?.user.id;

  useEffect(() => {
    let sb;
    try { sb = getSupabase(); } catch (e: any) { setConfigError(e.message); return; }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await getSupabase().from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) toast(error.message, 6000);
    setProfile((data as Profile) ?? null);
  }, [userId]);

  const refreshAnswers = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await getSupabase()
      .from('answers')
      .select('id, session_id, topic, question, score, verdict, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) toast(error.message, 6000);
    setAnswers((data as AnswerRow[]) ?? []);
  }, [userId]);

  useEffect(() => {
    if (session === null) router.replace('/login');
    else if (userId) { refreshProfile(); refreshAnswers(); }
  }, [session, userId, router, refreshProfile, refreshAnswers]);

  useEffect(() => {
    if (profile === null && pathname !== '/onboarding') router.replace('/onboarding');
  }, [profile, pathname, router]);

  const stats = useMemo(() => buildStats(answers), [answers]);

  if (configError) {
    return <main><div className="card narrow"><h2>Setup needed</h2><p>{configError}</p><p className="muted">Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_API_URL in Vercel → Project → Settings → Environment Variables, then redeploy.</p></div></main>;
  }
  if (!session || profile === undefined || (profile === null && pathname !== '/onboarding')) {
    return <main><p className="muted">Loading…</p></main>;
  }

  return (
    <AppCtx.Provider value={{ session, profile, answers, stats, refreshProfile, refreshAnswers }}>
      {profile && (
        <header className="topbar">
          <div className="brand">🎯 PrepPilot</div>
          <nav>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={pathname === href ? 'active' : ''}>{label}</Link>
            ))}
          </nav>
        </header>
      )}
      <main>{children}</main>
    </AppCtx.Provider>
  );
}

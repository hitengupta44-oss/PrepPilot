'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  BookOpen, FileText, History, LayoutDashboard, LogOut, Map, MessageSquare, Mic, Settings, type LucideIcon,
} from 'lucide-react';
import { AnswerRow, getSupabase, Profile, ResumeRow } from '@/lib/supabase';
import { buildStats, Stats } from '@/lib/topics';
import { toast } from '@/lib/toast';
import { trackOf } from '@/lib/tracks';
import { Logo } from './ui';

/** Answers without the long text fields: enough for stats, skill map and history lists. */
export type AnswerLite = Pick<AnswerRow, 'id' | 'session_id' | 'round_type' | 'topic' | 'question' | 'score' | 'rubric' | 'verdict' | 'created_at'>;

type Ctx = {
  session: Session;
  profile: Profile | null;
  resume: ResumeRow | null;
  answers: AnswerLite[];
  stats: Stats;
  refreshProfile: () => Promise<void>;
  refreshResume: () => Promise<void>;
  refreshAnswers: () => Promise<void>;
};
const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp must be used inside AppShell');
  return c;
}
/** For pages that need a finished profile (every page except /resume). */
export function useProfile() {
  const c = useApp();
  return { ...c, profile: c.profile as Profile };
}

const NAV: { href: string; label: string; icon: LucideIcon; section?: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Practice' },
  { href: '/interview', label: 'Mock Interview', icon: Mic },
  { href: '/interviews', label: 'Interview History', icon: History },
  { href: '/resume', label: 'Resume', icon: FileText, section: 'Prepare' },
  { href: '/roadmap', label: 'Roadmap', icon: Map },
  { href: '/bank', label: 'Question Bank', icon: BookOpen },
  { href: '/chat', label: 'Coach Chat', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'Account' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [resume, setResume] = useState<ResumeRow | null>(null);
  const [answers, setAnswers] = useState<AnswerLite[]>([]);
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

  const refreshResume = useCallback(async () => {
    if (!userId) return;
    const { data } = await getSupabase().from('resumes').select('*').eq('is_active', true).maybeSingle();
    setResume((data as ResumeRow) ?? null);
  }, [userId]);

  const refreshAnswers = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await getSupabase()
      .from('answers')
      .select('id, session_id, round_type, topic, question, score, rubric, verdict, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) toast(error.message, 6000);
    setAnswers((data as AnswerLite[]) ?? []);
  }, [userId]);

  useEffect(() => {
    if (session === null) router.replace('/login');
    else if (userId) { refreshProfile(); refreshResume(); refreshAnswers(); }
  }, [session, userId, router, refreshProfile, refreshResume, refreshAnswers]);

  useEffect(() => {
    if (profile === null && pathname !== '/resume') router.replace('/resume');
  }, [profile, pathname, router]);

  const stats = useMemo(() => buildStats(answers), [answers]);

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace('/login');
  }

  if (configError) {
    return (
      <main className="auth-main" style={{ minHeight: '100vh' }}>
        <div className="card card-pad auth-card">
          <h2>Setup needed</h2>
          <p className="mt-8">{configError}</p>
          <p className="muted small mt-8">Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_API_URL in Vercel → Project → Settings → Environment Variables, then redeploy.</p>
        </div>
      </main>
    );
  }
  if (!session || profile === undefined || (profile === null && pathname !== '/resume')) {
    return <main className="auth-main" style={{ minHeight: '100vh' }}><span className="spinner" /></main>;
  }

  const name = profile?.name || session.user.email || '';
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'U';
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  const navLinks = (mobile: boolean) =>
    NAV.map((n) => (
      <div key={n.href} style={{ display: 'contents' }}>
        {!mobile && n.section && <div className="nav-section">{n.section}</div>}
        <Link href={n.href} className={`nav-item ${isActive(n.href) ? 'active' : ''}`}>
          <n.icon /> {n.label}
        </Link>
      </div>
    ));

  return (
    <AppCtx.Provider value={{ session, profile, resume, answers, stats, refreshProfile, refreshResume, refreshAnswers }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="logo"><Logo href="/dashboard" /></div>
          {profile ? navLinks(false) : <div className="nav-section">Set up your profile</div>}
          <div className="sidebar-foot">
            <div className="user-chip">
              <div className="avatar">{initials}</div>
              <div className="who">
                <div className="strong small">{profile?.name || 'Your account'}</div>
                <div className="muted xs">{profile ? trackOf(profile.track).label : session.user.email}</div>
              </div>
            </div>
            <button className="nav-item btn-ghost" style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer', font: 'inherit' }} onClick={signOut}>
              <LogOut /> Sign out
            </button>
            <div className="row xs muted" style={{ padding: '8px 10px 0', gap: 12 }}>
              <Link href="/terms" className="muted">Terms</Link>
              <Link href="/privacy" className="muted">Privacy</Link>
            </div>
          </div>
        </aside>
        <div className="main">
          {profile && <nav className="mobile-bar">{navLinks(true)}</nav>}
          <div className="page">{children}</div>
        </div>
      </div>
    </AppCtx.Provider>
  );
}

import { getSupabase, ParsedResume, Profile } from './supabase';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7860').replace(/\/$/, '');

/** POST to the Hugging Face backend with the user's Supabase token. */
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: isForm ? (body as FormData) : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error('Could not reach the AI server. If it was asleep, it may take ~30s to wake up. Try again.');
  }
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/** The subset of the profile the backend needs. */
export const apiProfile = (p: Profile) => ({ role: p.role, level: p.level, track: p.track || 'general', skills: p.skills.slice(0, 60) });

/** The parts of the resume used for resume deep-dive and portfolio questions. */
export const apiResume = (r: ParsedResume | null | undefined) =>
  r ? { experience: r.experience.slice(0, 10), projects: r.projects.slice(0, 10), achievements: r.achievements.slice(0, 12) } : null;

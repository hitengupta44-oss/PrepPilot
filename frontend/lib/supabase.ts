import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Lazily created so builds don't fail when env vars are missing. Only call in the browser. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}

export type Profile = {
  id: string;
  name: string;
  role: string;
  level: string;
  skills: string[];
  topics: string[];
  summary: string;
};

export type AnswerRow = {
  id: string;
  session_id: string | null;
  topic: string;
  question: string;
  score: number;
  verdict: string;
  created_at: string;
};

export type SessionRow = {
  id: string;
  avg_score: number;
  focus_score: number;
  flags: string[];
  question_count: number;
  created_at: string;
};

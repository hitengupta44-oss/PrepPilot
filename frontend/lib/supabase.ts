import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { RoundId, TrackId } from './tracks';

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
  track: TrackId;
  headline: string;
  years_experience: number;
  skills: string[];
  topics: string[];
  summary: string;
  terms_accepted_at: string | null;
};

/** The structured resume returned by the backend (/resume/parse) and stored in resumes.parsed. */
export type ParsedResume = {
  name: string;
  headline: string;
  track: TrackId;
  target_role: string;
  level: string;
  years_experience: number;
  education: { degree: string; field: string; institution: string; start: string; end: string; grade: string }[];
  experience: { title: string; company: string; type: string; start: string; end: string; highlights: string[] }[];
  projects: { name: string; description: string; tools: string[]; impact: string }[];
  skills: { hard: string[]; tools: string[]; soft: string[]; languages: string[] };
  certifications: string[];
  achievements: string[];
  links: Record<string, string>;
  summary: string;
  topics: string[];
  resume_score: number | null;
  strengths: string[];
  improvements: string[];
};

export type ResumeRow = {
  id: string;
  file_name: string;
  track: TrackId;
  target_role: string;
  resume_score: number | null;
  parsed: ParsedResume;
  is_active: boolean;
  created_at: string;
};

export type AnswerRow = {
  id: string;
  session_id: string | null;
  round_type: RoundId;
  topic: string;
  question: string;
  answer: string;
  score: number;
  rubric: Record<string, number>;
  verdict: string;
  strengths: string[];
  missed: string[];
  ideal_answer: string;
  is_follow_up: boolean;
  created_at: string;
};

export type SessionRow = {
  id: string;
  track: TrackId;
  round_type: RoundId | 'mixed';
  status: 'in_progress' | 'completed' | 'abandoned';
  avg_score: number;
  focus_score: number;
  flags: string[];
  question_count: number;
  duration_seconds: number | null;
  recorded_video: boolean;
  created_at: string;
  ended_at: string | null;
};

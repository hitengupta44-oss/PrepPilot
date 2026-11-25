import type { AnswerRow } from './supabase';

export type LevelCls = 'red' | 'yellow' | 'green' | 'gray';
export type Level = { cls: LevelCls; avg: number | null; label: string; count: number };
export type Stats = Record<string, { scores: number[]; asked: string[] }>;

/** Group answers (oldest → newest) by topic. */
export function buildStats(answers: AnswerRow[]): Stats {
  const stats: Stats = {};
  const sorted = [...answers].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const a of sorted) {
    const s = (stats[a.topic] ||= { scores: [], asked: [] });
    s.scores.push(a.score);
    s.asked.push(a.question);
  }
  return stats;
}

/** Topic strength from the last 5 answers: red < 5, yellow < 7, green ≥ 7. */
export function levelOf(stats: Stats, topic: string): Level {
  const s = stats[topic]?.scores || [];
  if (!s.length) return { cls: 'gray', avg: null, label: 'Not tested', count: 0 };
  const recent = s.slice(-5);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (avg < 5) return { cls: 'red', avg, label: 'Weak', count: s.length };
  if (avg < 7) return { cls: 'yellow', avg, label: 'Improving', count: s.length };
  return { cls: 'green', avg, label: 'Strong', count: s.length };
}

export const scoreCls = (score: number): LevelCls => (score < 5 ? 'red' : score < 7 ? 'yellow' : 'green');

/** Weighted random pick: weak (red) topics come up most, then untested, yellow, green. */
export function planTopics(topics: string[], stats: Stats, n: number, focus?: string | null): string[] {
  if (focus) return Array(n).fill(focus);
  if (!topics.length) return [];
  const weight = (t: string) => {
    const l = levelOf(stats, t);
    return { red: 6, gray: 3, yellow: 2.5, green: 1 }[l.cls] + (l.avg != null ? (10 - l.avg) / 4 : 0);
  };
  const out: string[] = [];
  let pool = [...topics];
  for (let i = 0; i < n; i++) {
    if (!pool.length) pool = [...topics];
    const total = pool.reduce((a, t) => a + weight(t), 0);
    let r = Math.random() * total;
    const pick = pool.find((t) => (r -= weight(t)) <= 0) || pool[pool.length - 1];
    out.push(pick);
    pool = pool.filter((t) => t !== pick);
  }
  return out;
}

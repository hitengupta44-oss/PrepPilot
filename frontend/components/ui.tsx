import Link from 'next/link';
import {
  Brain, Briefcase, Calculator, ChartLine, Code, Headphones, Megaphone, Palette, Sparkles, Compass, Users,
  type LucideIcon,
} from 'lucide-react';
import type { TrackId } from '@/lib/tracks';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="logo">
      <span className="logo-mark"><Sparkles /></span>
      PrepPilot
    </Link>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div className="titles">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Stat({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card stat">
      <div className="label"><Icon /> {label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon />
      <h3>{title}</h3>
      {children && <div className="small mt-4">{children}</div>}
    </div>
  );
}

/** Circular score. `max` 10 or 100. */
export function ScoreRing({ value, max = 10, size }: { value: number | null; max?: number; size?: 'sm' }) {
  const pct = value == null ? 0 : (value / max) * 100;
  const color = value == null ? 'var(--line-strong)' : pct < 50 ? 'var(--red)' : pct < 70 ? 'var(--amber)' : 'var(--green)';
  return (
    <div className={`ring ${size || ''}`} style={{ '--v': pct, '--c': color } as React.CSSProperties}>
      <span>{value == null ? '–' : max === 10 ? value.toFixed(value % 1 ? 1 : 0) : Math.round(value)}</span>
    </div>
  );
}

export function Progress({ value, max = 10, tone }: { value: number; max?: number; tone?: string }) {
  return (
    <div className={`progress ${tone || ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export const TRACK_ICON: Record<TrackId, LucideIcon> = {
  sde: Code,
  ai_ml: Brain,
  data: ChartLine,
  product: Compass,
  design: Palette,
  marketing: Megaphone,
  sales: Briefcase,
  customer_service: Headphones,
  people_ops: Users,
  finance: Calculator,
  general: Sparkles,
};

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

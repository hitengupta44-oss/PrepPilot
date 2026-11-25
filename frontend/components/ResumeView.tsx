import {
  Award, Briefcase, CircleCheck, ExternalLink, FolderGit2, GraduationCap, Languages, Lightbulb, Link as LinkIcon, Medal, Wrench,
} from 'lucide-react';
import type { ParsedResume } from '@/lib/supabase';
import { ScoreRing } from './ui';

const LINK_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn', github: 'GitHub', behance: 'Behance', dribbble: 'Dribbble', kaggle: 'Kaggle', leetcode: 'LeetCode', portfolio: 'Portfolio',
};

const range = (a: string, b: string) => [a, b].filter(Boolean).join(' – ');

/** Resume score card with strengths and suggested improvements. */
export function ResumeScore({ r }: { r: ParsedResume }) {
  return (
    <div className="card">
      <div className="card-head"><h2>Resume score</h2></div>
      <div className="card-body stack">
        <div className="row" style={{ gap: 16 }}>
          <ScoreRing value={r.resume_score} max={100} />
          <p className="small muted" style={{ flex: 1, minWidth: 180 }}>How well this resume presents you for <b style={{ color: 'var(--text)' }}>{r.target_role}</b>: clarity, impact, relevance and measurable results.</p>
        </div>
        {r.strengths.length > 0 && (
          <div>
            <h3 className="row" style={{ gap: 6 }}><CircleCheck size={16} color="var(--green)" /> What works</h3>
            <ul className="bullets small">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {r.improvements.length > 0 && (
          <div>
            <h3 className="row" style={{ gap: 6 }}><Lightbulb size={16} color="var(--amber)" /> Improve your resume</h3>
            <ul className="bullets small">{r.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-head"><Icon size={18} color="var(--brand)" /><h2>{title}</h2></div>
      <div className="card-body">{children}</div>
    </div>
  );
}

/** Everything extracted from the resume, grouped into sections. Empty sections are hidden. */
export function ResumeDetails({ r }: { r: ParsedResume }) {
  const skills: [string, string[]][] = [
    ['Role skills', r.skills.hard], ['Tools', r.skills.tools], ['Soft skills', r.skills.soft],
  ];
  return (
    <div className="stack">
      {r.summary && (
        <div className="card card-pad">
          <div className="muted xs strong" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Summary</div>
          <p className="mt-8">{r.summary}</p>
        </div>
      )}

      {r.experience.length > 0 && (
        <Section icon={Briefcase} title="Experience">
          <div className="timeline">
            {r.experience.map((e, i) => (
              <div key={i} className="item">
                <div className="icon"><Briefcase /></div>
                <div>
                  <div className="row between top">
                    <div><b>{e.title}</b>{e.company && <span className="muted"> · {e.company}</span>}</div>
                    <span className="badge">{e.type}</span>
                  </div>
                  <div className="muted xs">{range(e.start, e.end)}</div>
                  {e.highlights.length > 0 && <ul className="bullets small">{e.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {r.projects.length > 0 && (
        <Section icon={FolderGit2} title="Projects">
          <div className="grid g2">
            {r.projects.map((p, i) => (
              <div key={i} className="card card-pad" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                <b>{p.name}</b>
                {p.description && <p className="small mt-4">{p.description}</p>}
                {p.impact && <p className="small mt-4" style={{ color: 'var(--green)' }}>{p.impact}</p>}
                {p.tools.length > 0 && <div className="chips mt-8">{p.tools.map((t) => <span key={t} className="badge">{t}</span>)}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {r.education.length > 0 && (
        <Section icon={GraduationCap} title="Education">
          <div className="timeline">
            {r.education.map((e, i) => (
              <div key={i} className="item">
                <div className="icon"><GraduationCap /></div>
                <div>
                  <b>{[e.degree, e.field].filter(Boolean).join(', ')}</b>
                  <div className="small">{e.institution}</div>
                  <div className="muted xs">{[range(e.start, e.end), e.grade].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon={Wrench} title="Skills">
        <div className="stack">
          {skills.filter(([, v]) => v.length).map(([label, v]) => (
            <div key={label}>
              <div className="label">{label}</div>
              <div className="chips mt-4">{v.map((s) => <span key={s} className="chip">{s}</span>)}</div>
            </div>
          ))}
          {r.skills.languages.length > 0 && (
            <div className="row small"><Languages size={16} /> {r.skills.languages.join(', ')}</div>
          )}
          {skills.every(([, v]) => !v.length) && <p className="muted small">No skills found on the resume.</p>}
        </div>
      </Section>

      {(r.certifications.length > 0 || r.achievements.length > 0) && (
        <div className="grid g2">
          {r.certifications.length > 0 && (
            <Section icon={Award} title="Certifications"><ul className="bullets small">{r.certifications.map((c) => <li key={c}>{c}</li>)}</ul></Section>
          )}
          {r.achievements.length > 0 && (
            <Section icon={Medal} title="Achievements"><ul className="bullets small">{r.achievements.map((c) => <li key={c}>{c}</li>)}</ul></Section>
          )}
        </div>
      )}

      {Object.keys(r.links).length > 0 && (
        <Section icon={LinkIcon} title="Links">
          <div className="chips">
            {Object.entries(r.links).map(([k, url]) => (
              <a key={k} className="chip" href={url} target="_blank" rel="noopener noreferrer">
                {LINK_LABEL[k] || k} <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

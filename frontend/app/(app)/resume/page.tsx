'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Pencil, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { useApp } from '@/components/AppShell';
import ChipEditor from '@/components/ChipEditor';
import { ResumeDetails, ResumeScore } from '@/components/ResumeView';
import { PageHeader, TRACK_ICON } from '@/components/ui';
import { api } from '@/lib/api';
import { TERMS_KEY } from '@/lib/site';
import { getSupabase, ParsedResume } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { TRACK_IDS, TRACKS, TrackId, trackOf } from '@/lib/tracks';

const LEVELS = ['Student', 'Fresher', 'Intern', 'Junior', 'Mid', 'Senior'];
type Mode = 'view' | 'upload' | 'review';
type Draft = { parsed: ParsedResume; fileName: string; existingId: string | null };

export default function ResumePage() {
  const { session, profile, resume, refreshProfile, refreshResume } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(resume ? 'view' : 'upload');
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => { if (resume && mode === 'upload' && !draft) setMode('view'); }, [resume]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === 'review' && draft) {
    return (
      <Review
        draft={draft}
        onCancel={() => { setDraft(null); setMode(resume ? 'view' : 'upload'); }}
        onSaved={async (firstTime) => {
          await Promise.all([refreshProfile(), refreshResume()]);
          setDraft(null);
          if (firstTime) router.replace('/dashboard');
          else { setMode('view'); toast('Profile updated'); }
        }}
        userId={session.user.id}
        hadProfile={!!profile}
        termsAcceptedAt={profile?.terms_accepted_at ?? null}
        previousTrack={profile?.track}
        previousRole={profile?.role}
      />
    );
  }

  if (mode === 'upload' || !resume) {
    return (
      <UploadStep
        firstTime={!profile}
        onCancel={resume ? () => setMode('view') : undefined}
        onParsed={(parsed, fileName) => { setDraft({ parsed, fileName, existingId: null }); setMode('review'); }}
      />
    );
  }

  const r = resume.parsed;
  const Icon = TRACK_ICON[r.track in TRACKS ? r.track : 'general'];
  return (
    <>
      <PageHeader
        title="Your resume"
        subtitle={<>{resume.file_name || 'Pasted text'} · analyzed {new Date(resume.created_at).toLocaleDateString()}</>}
        actions={<>
          <button className="btn" onClick={() => { setDraft({ parsed: r, fileName: resume.file_name, existingId: resume.id }); setMode('review'); }}><Pencil /> Edit details</button>
          <button className="btn btn-primary" onClick={() => setMode('upload')}><RefreshCw /> Upload new</button>
        </>}
      />
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 14 }}>
          <div className="avatar" style={{ width: 48, height: 48, borderRadius: 12 }}><Icon size={22} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2>{r.name || profile?.name}</h2>
            <p className="muted small">{r.headline || r.target_role}</p>
          </div>
          <span className="badge brand">{trackOf(r.track).label}</span>
          <span className="badge">{r.level}</span>
          {r.years_experience > 0 && <span className="badge">{r.years_experience} yrs exp.</span>}
        </div>
      </div>
      <div className="grid g-main">
        <ResumeDetails r={r} />
        <div className="stack">
          <ResumeScore r={r} />
          <div className="card">
            <div className="card-head"><h2>Interview topics</h2></div>
            <div className="card-body chips">{(profile?.topics || r.topics).map((t) => <span key={t} className="chip">{t}</span>)}</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- upload */
function UploadStep({ firstTime, onParsed, onCancel }: {
  firstTime: boolean;
  onParsed: (p: ParsedResume, fileName: string) => void;
  onCancel?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.(pdf|docx|txt)$/i.test(f.name)) return toast('Please choose a PDF, DOCX or TXT file.');
    if (f.size > 5 * 1024 * 1024) return toast('That file is over 5 MB.');
    setFile(f);
  }

  async function analyze() {
    if (!paste && !file) return toast('Choose your resume file first.');
    if (paste && text.trim().length < 150) return toast('Paste your full resume text.');
    setBusy(true);
    try {
      const fd = new FormData();
      if (!paste && file) fd.append('file', file);
      else fd.append('text', text);
      const r = await api<{ resume: ParsedResume; file_name: string }>('/resume/parse', fd);
      onParsed(r.resume, r.file_name);
    } catch (e: any) {
      toast(e.message, 7000);
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader
        title={firstTime ? 'Let’s build your profile' : 'Upload a new resume'}
        subtitle="We read your resume, detect your target role and set up interviews and topics for it. Works for tech and non-tech roles."
        actions={onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
      />
      <div className="grid g-main">
        <div className="card card-body stack">
          <div className="segmented" style={{ alignSelf: 'flex-start' }}>
            <button className={!paste ? 'on' : ''} onClick={() => setPaste(false)}>Upload file</button>
            <button className={paste ? 'on' : ''} onClick={() => setPaste(true)}>Paste text</button>
          </div>
          {!paste ? (
            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
            >
              <input ref={input} type="file" accept=".pdf,.docx,.txt" hidden onChange={(e) => pick(e.target.files?.[0])} />
              {file ? <FileText /> : <Upload />}
              <div className="strong mt-8">{file ? file.name : 'Drop your resume here, or click to browse'}</div>
              <div className="muted small mt-4">{file ? `${(file.size / 1024).toFixed(0)} KB · click to change` : 'PDF, DOCX or TXT · up to 5 MB'}</div>
            </div>
          ) : (
            <textarea className="textarea" style={{ minHeight: 260 }} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full text of your resume…" />
          )}
          <div className="row">
            <button className="btn btn-primary btn-lg" onClick={analyze} disabled={busy}>
              {busy ? <><span className="spinner" /> Analyzing your resume…</> : 'Analyze resume'}
            </button>
            {busy && <span className="muted small">This takes 10–30 seconds. The first request of the day may take longer.</span>}
          </div>
        </div>
        <div className="stack">
          <div className="card card-pad stack-sm">
            <h3>What we extract</h3>
            <ul className="bullets small muted">
              <li>Target role and track (SDE, AI/ML, Sales, Marketing, Design, Support and more)</li>
              <li>Education, experience, projects and achievements</li>
              <li>Role skills, tools, soft skills and certifications</li>
              <li>A resume score with specific improvements</li>
              <li>Interview topics for your role</li>
            </ul>
          </div>
          <div className="notice"><ShieldCheck /><span>We don&apos;t keep your file or your email and phone number. Only the structured details above are saved to your account.</span></div>
          <p className="muted xs">Scanned or image-only PDFs can&apos;t be read. Export a text-based PDF, or paste the text.</p>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- review & save */
function Review({ draft, onCancel, onSaved, userId, hadProfile, termsAcceptedAt, previousTrack, previousRole }: {
  draft: Draft;
  onCancel: () => void;
  onSaved: (firstTime: boolean) => void;
  userId: string;
  hadProfile: boolean;
  termsAcceptedAt: string | null;
  previousTrack?: string;
  previousRole?: string;
}) {
  const p = draft.parsed;
  const [name, setName] = useState(p.name);
  const [role, setRole] = useState(p.target_role);
  const [track, setTrack] = useState<TrackId>(p.track in TRACKS ? p.track : 'general');
  const [level, setLevel] = useState(LEVELS.includes(p.level) ? p.level : 'Fresher');
  const [topics, setTopics] = useState<string[]>(p.topics);
  const [skills, setSkills] = useState<string[]>(dedupe([...p.skills.hard, ...p.skills.tools]));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!role.trim()) return toast('Add your target role.');
    if (!topics.length) return toast('Add at least one interview topic.');
    setSaving(true);
    const sb = getSupabase();
    const parsed: ParsedResume = { ...p, name: name.trim(), target_role: role.trim(), track, level, topics };
    let stored: string | null = null;
    try { stored = localStorage.getItem(TERMS_KEY); } catch {}
    try {
      if (draft.existingId) {
        const { error } = await sb.from('resumes').update({ parsed, track, target_role: parsed.target_role }).eq('id', draft.existingId);
        if (error) throw error;
      } else {
        const off = await sb.from('resumes').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);
        if (off.error) throw off.error;
        const { error } = await sb.from('resumes').insert({
          user_id: userId, file_name: draft.fileName, track, target_role: parsed.target_role,
          resume_score: p.resume_score, parsed, is_active: true,
        });
        if (error) throw error;
      }
      const { error } = await sb.from('profiles').upsert({
        id: userId, name: parsed.name, role: parsed.target_role, level, track, headline: p.headline,
        years_experience: p.years_experience, skills, topics, summary: p.summary,
        terms_accepted_at: termsAcceptedAt || stored || new Date().toISOString(),
      });
      if (error) throw error;
      if (previousTrack && (previousTrack !== track || previousRole !== parsed.target_role)) {
        await sb.from('roadmaps').delete().eq('user_id', userId); // plan no longer fits the new role
      }
      onSaved(!hadProfile);
    } catch (e: any) {
      toast(e.message || 'Could not save. Did you run the latest supabase/schema.sql?', 8000);
    }
    setSaving(false);
  }

  return (
    <>
      <PageHeader
        title="Review your profile"
        subtitle="Check what we found and adjust anything that's off. Interviews, topics and your roadmap are based on this."
        actions={<>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : hadProfile ? 'Save changes' : 'Save and continue'}</button>
        </>}
      />
      <div className="grid g-main">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Profile</h2></div>
            <div className="card-body stack">
              <div className="grid g2">
                <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="field"><label>Target role</label><input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Business Development Executive" /></div>
              </div>
              <div className="field">
                <label>Career track</label>
                <div className="choice-grid">
                  {TRACK_IDS.map((id) => {
                    const Icon = TRACK_ICON[id];
                    return (
                      <button key={id} type="button" className={`choice ${track === id ? 'selected' : ''}`} onClick={() => setTrack(id)}>
                        <span className="title"><Icon /> {TRACKS[id].label}</span>
                        <span className="desc">{TRACKS[id].examples}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="help">This decides your interview rounds, for example role-plays for sales and support, or system design for SDE.</span>
              </div>
              <div className="field" style={{ maxWidth: 260 }}>
                <label>Experience level</label>
                <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                  {LEVELS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Interview topics</h2></div>
            <div className="card-body stack-sm">
              <p className="muted small">Each topic gets its own score. Weak ones are marked red and asked more often.</p>
              <ChipEditor value={topics} onChange={setTopics} placeholder="Add a topic, e.g. Objection Handling" max={12} />
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Skills</h2></div>
            <div className="card-body"><ChipEditor value={skills} onChange={setSkills} placeholder="Add a skill or tool" max={40} /></div>
          </div>
          <h2 className="mt-8">Extracted from your resume</h2>
          <ResumeDetails r={p} />
        </div>
        <div className="stack">
          <ResumeScore r={p} />
        </div>
      </div>
    </>
  );
}

function dedupe(a: string[]) {
  const seen = new Set<string>();
  return a.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

import Link from 'next/link';
import {
  ArrowRight, FileText, Gauge, Lock, Map, MessageSquare, Mic, ShieldCheck, Target, TrendingUp, Video,
} from 'lucide-react';
import { PublicFooter, PublicNav } from '@/components/PublicChrome';
import { TRACK_ICON } from '@/components/ui';
import { TRACK_IDS, TRACKS } from '@/lib/tracks';

const FEATURES = [
  { icon: FileText, title: 'Resume reader', text: 'Upload a PDF or DOCX. We extract your education, experience, projects and skills, detect your target role, and score your resume with fixes.' },
  { icon: Mic, title: 'Live AI interviewer', text: 'Questions are read aloud, you answer by voice, and your answer is transcribed live and scored instantly with a model answer.' },
  { icon: Target, title: 'Role-specific rounds', text: 'HR, resume deep-dive, technical, case study, system design, sales role-plays, design challenges and more for each track.' },
  { icon: TrendingUp, title: 'Weak-spot targeting', text: 'Every answer updates your skill map. Weak topics turn red, and your next interview focuses on them until they turn green.' },
  { icon: Video, title: 'Integrity monitoring', text: 'Face and tab-switch checks give a focus score, like a real proctored interview. Video is analyzed in your browser and never uploaded.' },
  { icon: Map, title: 'Roadmap & question bank', text: 'A personal study plan and a growing question bank with answer hints for your role, plus a coach you can chat with.' },
];

const STEPS = [
  { title: 'Upload your resume', text: 'We build a profile for your target role in under a minute.' },
  { title: 'Take a mock interview', text: 'Pick a round or a full interview. Answer out loud with your camera on.' },
  { title: 'Fix your red topics', text: 'Review rubric scores and model answers. Each session gets sharper.' },
];

export default function Landing() {
  return (
    <>
      <PublicNav />
      <main>
        <section className="hero container">
          <span className="eyebrow"><Gauge size={14} /> Built for students and freshers</span>
          <h1>Practice interviews with an AI that <span className="grad">finds your weak spots</span></h1>
          <p className="lead">
            Upload your resume, choose your role, and face a realistic AI interviewer that listens, scores every answer,
            and keeps drilling what you need to improve. For tech and non-tech roles.
          </p>
          <div className="cta">
            <Link href="/login" className="btn btn-primary btn-lg">Start practicing free <ArrowRight /></Link>
            <a href="#how" className="btn btn-lg">See how it works</a>
          </div>
          <p className="muted small mt-16">No credit card. No password. Sign in with your email.</p>
        </section>

        <section className="section alt" id="features">
          <div className="container">
            <div className="section-title">
              <h2>Everything you need to get interview-ready</h2>
              <p>One place to understand your resume, practice real rounds, and track your progress.</p>
            </div>
            <div className="grid g3">
              {FEATURES.map((f) => (
                <div key={f.title} className="card feature">
                  <div className="ic"><f.icon /></div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="tracks">
          <div className="container">
            <div className="section-title">
              <h2>Interviews for your role, not a generic quiz</h2>
              <p>Each track has its own interview rounds, topics and scoring rubric.</p>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
              {TRACK_IDS.filter((t) => t !== 'general').map((id) => {
                const Icon = TRACK_ICON[id];
                return <span key={id} className="track-pill"><Icon /> {TRACKS[id].label}</span>;
              })}
            </div>
          </div>
        </section>

        <section className="section alt" id="how">
          <div className="container">
            <div className="section-title"><h2>How it works</h2></div>
            <div className="grid g3">
              {STEPS.map((s, i) => (
                <div key={s.title} className="step">
                  <div className="n">{i + 1}</div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container grid g3">
            <div className="feature"><div className="ic"><Lock /></div><h3>Your video stays with you</h3><p>Camera checks run in your browser. Recording is off by default and only ever saved to your own device.</p></div>
            <div className="feature"><div className="ic"><ShieldCheck /></div><h3>Your data is yours</h3><p>Only you can see your profile and results. Delete everything with one click in Settings.</p></div>
            <div className="feature"><div className="ic"><MessageSquare /></div><h3>A coach on demand</h3><p>Ask follow-up questions about any topic, answer or round and get help specific to your role.</p></div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="cta-band">
              <h2>Your next interview starts here</h2>
              <p>Upload your resume and take your first mock interview in under five minutes.</p>
              <Link href="/login" className="btn btn-lg">Get started <ArrowRight /></Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

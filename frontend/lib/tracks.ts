// Role tracks and interview round types. Keep ids in sync with backend/tracks.py.

export type RoundId =
  | 'hr' | 'resume' | 'technical' | 'coding' | 'system_design' | 'case'
  | 'domain' | 'situational' | 'roleplay' | 'portfolio' | 'design_challenge';

export type TrackId =
  | 'sde' | 'ai_ml' | 'data' | 'product' | 'design' | 'marketing'
  | 'sales' | 'customer_service' | 'people_ops' | 'finance' | 'general';

export type Round = { label: string; desc: string; topicBased: boolean; minutes: string };

export const ROUNDS: Record<RoundId, Round> = {
  hr: { label: 'HR & Behavioral', desc: 'Motivation, teamwork, conflict and goals using the STAR method.', topicBased: false, minutes: '1-2' },
  resume: { label: 'Resume Deep-Dive', desc: 'Questions on your own projects, internships and achievements.', topicBased: false, minutes: '2-3' },
  technical: { label: 'Technical Concepts', desc: 'Core concepts for your role, explained out loud.', topicBased: true, minutes: '1-2' },
  coding: { label: 'Problem Solving', desc: 'Talk through an approach and its time/space complexity.', topicBased: true, minutes: '2-3' },
  system_design: { label: 'System Design', desc: 'Design a small system: requirements, components, trade-offs.', topicBased: true, minutes: '2-3' },
  case: { label: 'Case Study', desc: 'A short business, product or data case. Structure and recommend.', topicBased: true, minutes: '2-3' },
  domain: { label: 'Role Knowledge', desc: 'Concepts, tools and metrics of your field, with examples.', topicBased: true, minutes: '1-2' },
  situational: { label: 'Situational Judgement', desc: '"What would you do if…" workplace scenarios.', topicBased: true, minutes: '1-2' },
  roleplay: { label: 'Role-play', desc: 'The AI plays a customer or prospect. Reply in character.', topicBased: true, minutes: '1-2' },
  portfolio: { label: 'Portfolio & Process', desc: 'Walk through a design project, from problem to outcome.', topicBased: false, minutes: '2-3' },
  design_challenge: { label: 'Design Challenge', desc: 'An open design problem. Users, ideas, validation.', topicBased: true, minutes: '2-3' },
};

export type Track = { label: string; short: string; examples: string; rounds: RoundId[] };

export const TRACKS: Record<TrackId, Track> = {
  sde: { label: 'Software Engineering', short: 'SDE', examples: 'SDE, frontend, backend, full-stack, mobile, DevOps, QA', rounds: ['hr', 'resume', 'technical', 'coding', 'system_design'] },
  ai_ml: { label: 'AI / ML & Data Science', short: 'AI/ML', examples: 'ML engineer, data scientist, AI engineer', rounds: ['hr', 'resume', 'technical', 'coding', 'case'] },
  data: { label: 'Data & Business Analytics', short: 'Analytics', examples: 'Data analyst, business analyst, BI', rounds: ['hr', 'resume', 'technical', 'case'] },
  product: { label: 'Product Management', short: 'Product', examples: 'PM, APM, product analyst', rounds: ['hr', 'resume', 'case', 'situational'] },
  design: { label: 'UI/UX & Graphic Design', short: 'Design', examples: 'UI/UX, product, graphic and visual design', rounds: ['hr', 'resume', 'portfolio', 'design_challenge'] },
  marketing: { label: 'Marketing', short: 'Marketing', examples: 'Digital, content, SEO, social, brand, growth', rounds: ['hr', 'resume', 'domain', 'case'] },
  sales: { label: 'Sales & Business Development', short: 'Sales', examples: 'Sales executive, BDE, SDR, account executive', rounds: ['hr', 'resume', 'roleplay', 'situational'] },
  customer_service: { label: 'Customer Service & Support', short: 'Support', examples: 'Customer support, success, call center', rounds: ['hr', 'resume', 'roleplay', 'situational'] },
  people_ops: { label: 'HR & Operations', short: 'HR/Ops', examples: 'HR executive, recruiter, operations', rounds: ['hr', 'resume', 'domain', 'situational'] },
  finance: { label: 'Finance & Accounting', short: 'Finance', examples: 'Accountant, financial analyst, banking, audit', rounds: ['hr', 'resume', 'domain', 'case'] },
  general: { label: 'Other / General', short: 'General', examples: 'Any other role', rounds: ['hr', 'resume', 'domain', 'situational'] },
};

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

export const trackOf = (id: string | null | undefined): Track => TRACKS[(id as TrackId)] ?? TRACKS.general;
export const roundOf = (id: string | null | undefined): Round => ROUNDS[(id as RoundId)] ?? ROUNDS.hr;
export const roundLabel = (id: string | null | undefined) =>
  id === 'mixed' ? 'Full interview' : roundOf(id).label;

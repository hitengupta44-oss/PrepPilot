"""Role tracks and interview round types.

Keep the ids in sync with frontend/lib/tracks.ts.
"""

# ---------------------------------------------------------------- interview rounds
# guidance: how the AI interviewer should ask in this round
# rubric:   the 3 dimensions each answer is scored on (0-10)
ROUNDS: dict[str, dict] = {
    "hr": {
        "label": "HR & Behavioral",
        "guidance": "Ask a behavioral or HR question (motivation, teamwork, conflict, failure, strengths, career goals). "
        "Prefer questions answerable with the STAR method.",
        "rubric": ["Structure (STAR)", "Relevance", "Communication"],
    },
    "resume": {
        "label": "Resume Deep-Dive",
        "guidance": "Ask about a SPECIFIC project, internship, job or achievement from the candidate's resume (given below). "
        "Probe their personal contribution, decisions, challenges and measurable results. Name the item you are asking about.",
        "rubric": ["Depth", "Ownership", "Communication"],
    },
    "technical": {
        "label": "Technical Concepts",
        "guidance": "Ask a conceptual technical question on the topic, the kind asked in a first technical round. "
        "It must be answerable verbally without writing code.",
        "rubric": ["Correctness", "Depth", "Clarity"],
    },
    "coding": {
        "label": "Problem Solving",
        "guidance": "Give a short algorithmic or coding problem and ask the candidate to explain their approach out loud: "
        "brute force first, then an optimized approach, with time and space complexity. No need to write full code.",
        "rubric": ["Approach", "Correctness", "Complexity analysis"],
    },
    "system_design": {
        "label": "System Design",
        "guidance": "Ask the candidate to design a small, realistic system (scaled to their level). Expect requirements, "
        "components, data flow and trade-offs, answered verbally in 2-3 minutes.",
        "rubric": ["Requirements", "Architecture", "Trade-offs"],
    },
    "case": {
        "label": "Case Study",
        "guidance": "Present a short business, product or data case relevant to the role (2-4 sentences of context) and ask "
        "for the candidate's analysis and recommendation.",
        "rubric": ["Structure", "Analysis", "Recommendation"],
    },
    "domain": {
        "label": "Role Knowledge",
        "guidance": "Ask a question testing core knowledge of the role (concepts, tools, metrics, best practices), ideally "
        "asking for a real example.",
        "rubric": ["Accuracy", "Depth", "Practical examples"],
    },
    "situational": {
        "label": "Situational Judgement",
        "guidance": "Describe a realistic workplace situation for this role and ask what the candidate would do and why.",
        "rubric": ["Judgement", "Stakeholder awareness", "Communication"],
    },
    "roleplay": {
        "label": "Role-play",
        "guidance": "Start a role-play. In 2-3 sentences, set the scene and speak AS the other person (an upset customer, a "
        "hesitant prospect, a demanding client). The candidate replies in character, as if live. "
        "Format: '[Scenario: ...] Customer: \"...\"'.",
        "rubric": ["Empathy & rapport", "Problem / objection handling", "Next steps & closing"],
    },
    "portfolio": {
        "label": "Portfolio & Process",
        "guidance": "Ask the candidate to walk through a design project (use one from their resume if available): the problem, "
        "research, process, decisions, and outcome.",
        "rubric": ["Process", "Design rationale", "Communication"],
    },
    "design_challenge": {
        "label": "Design Challenge",
        "guidance": "Give a short, open design challenge (e.g. redesign a flow, design a feature for a user group) and ask "
        "how they would approach it verbally: users, problems, ideas, and how they'd validate.",
        "rubric": ["User focus", "Ideation", "Trade-offs & validation"],
    },
}

# ---------------------------------------------------------------- role tracks
TRACKS: dict[str, dict] = {
    "sde": {
        "label": "Software Engineering",
        "examples": "SDE, software developer, frontend, backend, full-stack, mobile, DevOps, QA",
        "rounds": ["hr", "resume", "technical", "coding", "system_design"],
    },
    "ai_ml": {
        "label": "AI / ML & Data Science",
        "examples": "machine learning engineer, data scientist, AI engineer, NLP, computer vision, research",
        "rounds": ["hr", "resume", "technical", "coding", "case"],
    },
    "data": {
        "label": "Data & Business Analytics",
        "examples": "data analyst, business analyst, BI analyst, MIS",
        "rounds": ["hr", "resume", "technical", "case"],
    },
    "product": {
        "label": "Product Management",
        "examples": "product manager, associate PM, product analyst, product owner",
        "rounds": ["hr", "resume", "case", "situational"],
    },
    "design": {
        "label": "UI/UX & Graphic Design",
        "examples": "UI designer, UX designer, product designer, graphic designer, visual designer",
        "rounds": ["hr", "resume", "portfolio", "design_challenge"],
    },
    "marketing": {
        "label": "Marketing",
        "examples": "digital marketing, content, SEO, social media, brand, growth, performance marketing",
        "rounds": ["hr", "resume", "domain", "case"],
    },
    "sales": {
        "label": "Sales & Business Development",
        "examples": "sales executive, BDE, BDR/SDR, account executive, inside sales",
        "rounds": ["hr", "resume", "roleplay", "situational"],
    },
    "customer_service": {
        "label": "Customer Service & Support",
        "examples": "customer support, customer success, call center, client relations, helpdesk",
        "rounds": ["hr", "resume", "roleplay", "situational"],
    },
    "people_ops": {
        "label": "HR & Operations",
        "examples": "HR executive, recruiter, talent acquisition, operations, admin",
        "rounds": ["hr", "resume", "domain", "situational"],
    },
    "finance": {
        "label": "Finance & Accounting",
        "examples": "accountant, financial analyst, banking, audit, CA/CFA aspirant",
        "rounds": ["hr", "resume", "domain", "case"],
    },
    "general": {
        "label": "Other / General",
        "examples": "any role that doesn't fit above",
        "rounds": ["hr", "resume", "domain", "situational"],
    },
}

# Keyword fallback used when the AI returns an unknown track. First match wins, so order matters.
TRACK_KEYWORDS: list[tuple[str, list[str]]] = [
    ("ai_ml", ["machine learning", "deep learning", "data scien", "ml engineer", "nlp", "computer vision", "pytorch", "tensorflow", "llm", "artificial intelligence"]),
    ("design", ["ui/ux", "ux design", "ui design", "figma", "product design", "graphic design", "adobe", "visual design"]),
    ("data", ["data analyst", "business analyst", "power bi", "tableau", "excel", "sql analyst", "analytics"]),
    ("product", ["product manager", "product management", "associate product", "product owner"]),
    ("customer_service", ["customer support", "customer service", "customer success", "call center", "helpdesk", "client relations"]),
    ("sales", ["sales", "business development", "bde", "account executive", "lead generation", "inside sales"]),
    ("marketing", ["marketing", "seo", "social media", "content writ", "brand", "campaign", "growth"]),
    ("people_ops", ["recruit", "talent acquisition", "human resource", "hr executive", "operations executive"]),
    ("finance", ["accountant", "accounting", "finance", "financial analyst", "audit", "tally", "banking"]),
    ("sde", ["software", "developer", "engineer", "react", "java", "python", "node", "backend", "frontend", "full stack", "full-stack"]),
]


def guess_track(text: str, primary: str = "") -> str:
    """Guess a track from keywords. `primary` (target role / headline) wins if it matches anything;
    otherwise the track with the most keyword hits in `text` wins (ties go to the earlier track)."""
    p = (primary or "").lower()
    for track, words in TRACK_KEYWORDS:
        if any(w in p for w in words):
            return track
    t = (text or "").lower()
    best, best_hits = "general", 0
    for track, words in TRACK_KEYWORDS:
        hits = sum(t.count(w) for w in words)
        if hits > best_hits:
            best, best_hits = track, hits
    return best


def track_or_default(track: str | None) -> str:
    return track if track in TRACKS else "general"


def round_or_default(round_type: str | None) -> str:
    return round_type if round_type in ROUNDS else "hr"


def tracks_for_prompt() -> str:
    return "\n".join(f'- "{tid}": {t["label"]} ({t["examples"]})' for tid, t in TRACKS.items())

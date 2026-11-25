"""PrepPilot AI backend (FastAPI), served on a Hugging Face Space by app.py.

- Keeps the Groq API key secret on the server.
- Every request must carry the user's Supabase access token; it is verified against Supabase Auth.
- Stateless: the frontend saves results to Supabase directly (protected by Row Level Security).
"""

import json
import os
import time
from collections import defaultdict, deque

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from resume import EXTRACTION_PROMPT, ResumeError, clean_text, extract_text, normalize, resume_context
from tracks import ROUNDS, TRACKS, round_or_default, track_or_default

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "30"))
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

app = FastAPI(title="PrepPilot API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=os.environ.get("ALLOWED_ORIGIN_REGEX") or None,  # e.g. https://.*\.vercel\.app
    allow_methods=["*"],
    allow_headers=["*"],
)
http = httpx.AsyncClient(timeout=90)

# ---------------------------------------------------------------- auth + rate limit
_token_cache: dict[str, tuple[str, float]] = {}
_hits: dict[str, deque] = defaultdict(deque)


async def current_user(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not signed in")
    token = authorization[7:]
    now = time.time()
    cached = _token_cache.get(token)
    if cached and cached[1] > now:
        uid = cached[0]
    else:
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            raise HTTPException(500, "Server is missing SUPABASE_URL / SUPABASE_ANON_KEY")
        r = await http.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_ANON_KEY},
        )
        if r.status_code != 200:
            raise HTTPException(401, "Session expired, please sign in again")
        uid = r.json()["id"]
        if len(_token_cache) > 5000:
            _token_cache.clear()
        _token_cache[token] = (uid, now + 300)

    hits = _hits[uid]
    while hits and hits[0] < now - 60:
        hits.popleft()
    if len(hits) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(429, "Too many requests. Please wait a minute.")
    hits.append(now)
    return uid


# ---------------------------------------------------------------- Groq
async def groq(messages: list[dict], json_mode: bool = True, temperature: float = 0.4, max_tokens: int = 1500):
    if not GROQ_API_KEY:
        raise HTTPException(500, "Server is missing GROQ_API_KEY")
    body = {"model": GROQ_MODEL, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    try:
        r = await http.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json=body,
        )
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach the AI service. Please retry.")
    if r.status_code == 429:
        raise HTTPException(429, "AI free-tier limit reached. Try again in a minute.")
    if r.status_code == 401:
        raise HTTPException(500, "The server's GROQ_API_KEY is invalid.")
    if r.status_code != 200:
        raise HTTPException(502, f"AI service error ({r.status_code})")
    text = r.json()["choices"][0]["message"]["content"]
    if not json_mode:
        return text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned an invalid response, please retry")


# ---------------------------------------------------------------- models
class Profile(BaseModel):
    role: str = Field(max_length=120)
    level: str = Field(default="", max_length=40)
    track: str = Field(default="general", max_length=40)
    skills: list[str] = Field(default_factory=list, max_length=60)


class ResumeCtx(BaseModel):
    """The parts of the parsed resume used for resume deep-dive / portfolio questions."""
    experience: list[dict] = Field(default_factory=list, max_length=10)
    projects: list[dict] = Field(default_factory=list, max_length=10)
    achievements: list[str] = Field(default_factory=list, max_length=12)


class QuestionReq(BaseModel):
    profile: Profile
    round_type: str = Field(default="hr", max_length=40)
    topic: str = Field(default="", max_length=120)
    topic_label: str = Field(default="Not tested", max_length=40)
    topic_avg: float | None = None
    avoid: list[str] = Field(default_factory=list, max_length=40)
    resume: ResumeCtx | None = None


class EvaluateReq(BaseModel):
    profile: Profile
    round_type: str = Field(default="hr", max_length=40)
    topic: str = Field(default="", max_length=120)
    question: str = Field(max_length=3000)
    answer: str = Field(max_length=8000)


class RoadmapReq(BaseModel):
    profile: Profile
    topics: list[str] = Field(max_length=20)
    weak_topics: list[str] = Field(default_factory=list, max_length=20)


class BankReq(BaseModel):
    profile: Profile
    topic: str = Field(max_length=120)
    avoid: list[str] = Field(default_factory=list, max_length=80)


class ChatMsg(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=6000)


class ChatReq(BaseModel):
    profile: Profile
    name: str = Field(default="", max_length=80)
    topic_levels: dict[str, str] = Field(default_factory=dict)
    messages: list[ChatMsg] = Field(max_length=20)


def who(p: Profile) -> str:
    track = TRACKS[track_or_default(p.track)]["label"]
    return f"{p.level} {p.role} (track: {track})".strip()


# ---------------------------------------------------------------- routes
@app.get("/")
def health():
    return {"ok": True, "service": "PrepPilot API", "model": GROQ_MODEL}


@app.post("/resume/parse")
async def parse_resume(
    file: UploadFile | None = File(default=None),
    text: str = Form(default=""),
    uid: str = Depends(current_user),
):
    file_name = ""
    try:
        if file is not None:
            data = await file.read()
            if len(data) > MAX_UPLOAD_BYTES:
                raise ResumeError("Resume file is too large (max 5 MB).")
            file_name = (file.filename or "resume")[:120]
            text = extract_text(file_name, data)
        else:
            text = clean_text(text)[:14000]
            if len(text) < 150:
                raise ResumeError("Paste the full resume text (at least a few lines).")
    except ResumeError as e:
        raise HTTPException(400, str(e))

    raw = await groq(
        [
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": f'Resume:\n"""\n{text}\n"""'},
        ],
        temperature=0.1,
        max_tokens=3500,
    )
    return {"resume": normalize(raw, text), "file_name": file_name, "chars": len(text)}


@app.post("/interview/question")
async def interview_question(req: QuestionReq, uid: str = Depends(current_user)):
    rt = round_or_default(req.round_type)
    rnd = ROUNDS[rt]
    weak = req.topic_label == "Weak"
    level_txt = req.topic_label + (f" ({req.topic_avg:.1f}/10)" if req.topic_avg is not None else "")
    ctx = resume_context(req.resume.model_dump()) if req.resume else ""
    uses_resume = rt in ("resume", "portfolio")
    prompt = (
        f"Candidate: {who(req.profile)}. Skills: {', '.join(req.profile.skills[:25]) or 'not listed'}.\n"
        f"Interview round: {rnd['label']}. {rnd['guidance']}\n"
        + (f'Focus topic: "{req.topic}" (candidate level on it: {level_txt}). ' if req.topic and not uses_resume else "")
        + ("They are weak on this topic, so probe the fundamentals they likely missed. " if weak and not uses_resume else "")
        + (f"\nCandidate's resume highlights:\n{ctx}\n" if ctx and (uses_resume or rt == "hr") else "")
        + ("\nThe resume has no projects or experience listed, so ask about their education, coursework or a skill instead.\n"
           if uses_resume and not ctx else "")
        + "Ask exactly ONE question, answerable verbally in 1-3 minutes, matched to the candidate's level. "
        f"Do NOT repeat or closely paraphrase any of these: {json.dumps(req.avoid)}.\n"
        'Return {"question": string}'
    )
    r = await groq(
        [{"role": "system", "content": "You are an experienced, friendly but rigorous interviewer. Reply with JSON only."},
         {"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=500,
    )
    q = str(r.get("question", "")).strip()
    if not q:
        raise HTTPException(502, "AI returned an empty question, please retry")
    return {"question": q, "round_type": rt}


@app.post("/interview/evaluate")
async def interview_evaluate(req: EvaluateReq, uid: str = Depends(current_user)):
    rt = round_or_default(req.round_type)
    rnd = ROUNDS[rt]
    dims = rnd["rubric"]
    r = await groq(
        [
            {"role": "system", "content": f"You are a strict but fair interviewer for a {who(req.profile)}. Reply with JSON only."},
            {
                "role": "user",
                "content": f"Round: {rnd['label']}\nTopic: {req.topic or '-'}\nQuestion: {req.question}\n"
                f'Candidate\'s spoken answer (auto-transcribed; ignore small transcription errors and filler words):\n"""{req.answer}"""\n\n'
                f"Score each rubric dimension 0-10: {json.dumps(dims)}. Calibrate to a {req.profile.level or 'fresher'} level.\n"
                'Return {"rubric": {<dimension>: integer}, "score": integer 0-10 (overall), "verdict": one sentence, '
                '"strengths": string[] (max 3), "missed": string[] (key points missed, max 4), '
                '"ideal_answer": string (a strong 3-6 sentence answer for this candidate), '
                '"follow_up": string (a natural follow-up question if the answer was partial, else "")}',
            },
        ],
        temperature=0.2,
        max_tokens=1200,
    )

    def num(v) -> int:
        try:
            return max(0, min(10, round(float(v))))
        except (TypeError, ValueError):
            return 0

    raw_rubric = r.get("rubric") if isinstance(r.get("rubric"), dict) else {}
    rubric = {d: num(raw_rubric.get(d, r.get("score", 0))) for d in dims}
    score = num(r.get("score")) if r.get("score") is not None else round(sum(rubric.values()) / len(rubric))
    return {
        "score": score,
        "rubric": rubric,
        "verdict": str(r.get("verdict", ""))[:400],
        "strengths": [str(x)[:300] for x in (r.get("strengths") or [])][:3],
        "missed": [str(x)[:300] for x in (r.get("missed") or [])][:4],
        "ideal_answer": str(r.get("ideal_answer", ""))[:1500],
        "follow_up": str(r.get("follow_up") or "")[:500],
    }


@app.post("/roadmap")
async def roadmap(req: RoadmapReq, uid: str = Depends(current_user)):
    track = TRACKS[track_or_default(req.profile.track)]
    rounds = ", ".join(ROUNDS[r]["label"] for r in track["rounds"])
    return await groq(
        [
            {"role": "system", "content": "You are a senior career mentor. Reply with JSON only."},
            {
                "role": "user",
                "content": f"Create an interview-prep roadmap for a {who(req.profile)}. Known skills: {', '.join(req.profile.skills[:25])}. "
                f"Typical interview rounds for this track: {rounds}. Tracked topics: {', '.join(req.topics)}. "
                f"Weak topics to prioritize: {', '.join(req.weak_topics) or 'none yet'}. "
                'Return {"stages": [{"title": string, "duration": string, "items": [{"topic": string (use a tracked topic name '
                'exactly when it matches), "detail": string (what to study or practice, 1 sentence)}]}]} with 4-6 stages, '
                "3-6 items each, ordered from fundamentals to interview-ready. Include practice for each interview round.",
            },
        ],
        temperature=0.4,
        max_tokens=2500,
    )


@app.post("/bank")
async def bank(req: BankReq, uid: str = Depends(current_user)):
    r = await groq(
        [
            {"role": "system", "content": "You write interview question banks. Reply with JSON only."},
            {
                "role": "user",
                "content": f'Write 8 interview questions on "{req.topic}" for a {who(req.profile)}, mixed difficulty and question styles '
                f"suited to this role. Avoid: {json.dumps(req.avoid)}. "
                'Return {"questions": [{"q": string, "difficulty": "Easy"|"Medium"|"Hard", '
                '"hint": string (key points of a good answer, 2-3 sentences)}]}',
            },
        ],
        temperature=0.7,
        max_tokens=2000,
    )
    qs = [q for q in (r.get("questions") or []) if isinstance(q, dict) and q.get("q")]
    return {"questions": qs[:10]}


@app.post("/chat")
async def chat(req: ChatReq, uid: str = Depends(current_user)):
    levels = "; ".join(f"{t}: {l}" for t, l in req.topic_levels.items())
    system = (
        f"You are PrepPilot, a friendly, practical interview and career coach. The user is {req.name or 'a candidate'}, "
        f"a {who(req.profile)}. Skills: {', '.join(req.profile.skills[:25])}. Topic levels from mock interviews: {levels}. "
        "Be concise and specific to their role. Use short paragraphs or bullet lists, plain text (no markdown tables)."
    )
    reply = await groq(
        [{"role": "system", "content": system}] + [m.model_dump() for m in req.messages[-12:]],
        json_mode=False,
        temperature=0.6,
        max_tokens=1200,
    )
    return {"reply": reply}

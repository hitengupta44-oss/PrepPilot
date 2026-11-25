"""PrepPilot AI backend: FastAPI app for a Hugging Face Space (Docker SDK).

- Keeps the Groq API key secret on the server.
- Every request must carry the user's Supabase access token; it is verified against Supabase Auth.
- Stateless: the frontend saves results to Supabase directly (protected by Row Level Security).
"""

import io
import json
import os
import time
from collections import defaultdict, deque

import docx
import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader

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
    allow_origin_regex=os.environ.get("ALLOWED_ORIGIN_REGEX") or None,  # e.g. https://.*\.vercel\.app for preview deploys
    allow_methods=["*"],
    allow_headers=["*"],
)
http = httpx.AsyncClient(timeout=60)

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
async def groq(messages: list[dict], json_mode: bool = True, temperature: float = 0.4):
    if not GROQ_API_KEY:
        raise HTTPException(500, "Server is missing GROQ_API_KEY")
    body = {"model": GROQ_MODEL, "messages": messages, "temperature": temperature}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = await http.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
        json=body,
    )
    if r.status_code == 429:
        raise HTTPException(429, "AI free-tier limit reached. Try again in a minute.")
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
    skills: list[str] = Field(default_factory=list, max_length=40)


class QuestionReq(BaseModel):
    profile: Profile
    topic: str = Field(max_length=120)
    topic_label: str = Field(default="Not tested", max_length=40)
    topic_avg: float | None = None
    avoid: list[str] = Field(default_factory=list, max_length=40)


class EvaluateReq(BaseModel):
    profile: Profile
    topic: str = Field(max_length=120)
    question: str = Field(max_length=2000)
    answer: str = Field(max_length=8000)


class RoadmapReq(BaseModel):
    profile: Profile
    topics: list[str] = Field(max_length=20)


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
    return f"{p.level} {p.role}".strip()


# ---------------------------------------------------------------- routes
@app.get("/")
def health():
    return {"ok": True, "service": "PrepPilot API", "model": GROQ_MODEL}


def extract_text(name: str, data: bytes) -> str:
    ext = name.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        return "\n".join((page.extract_text() or "") for page in PdfReader(io.BytesIO(data)).pages)
    if ext == "docx":
        return "\n".join(p.text for p in docx.Document(io.BytesIO(data)).paragraphs)
    return data.decode("utf-8", errors="ignore")


@app.post("/resume/parse")
async def parse_resume(
    file: UploadFile | None = File(default=None),
    text: str = Form(default=""),
    uid: str = Depends(current_user),
):
    if file is not None:
        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Resume file is too large (max 5 MB)")
        try:
            text = extract_text(file.filename or "resume.txt", data)
        except Exception:
            raise HTTPException(400, "Could not read that file. Try PDF, DOCX or paste the text.")
    text = text.strip()
    if len(text) < 80:
        raise HTTPException(400, "Could not read enough text from the resume (scanned PDFs are not supported yet).")
    return await groq(
        [
            {"role": "system", "content": "You extract structured data from resumes. Reply with JSON only."},
            {
                "role": "user",
                "content": f'Resume:\n"""{text[:12000]}"""\n\nReturn JSON: {{"name": string, "target_role": string '
                '(the role this person is aiming for, inferred from objective/titles/experience), "level": '
                '"Intern"|"Fresher"|"Junior"|"Mid"|"Senior", "years_experience": number, "skills": string[] (max 15), '
                '"summary": string (2 sentences), "topics": string[] (7-9 interview topics most relevant to target_role, '
                'e.g. "React Hooks", "SQL Joins", "System Design Basics", plus one "Behavioral / HR")}',
            },
        ],
        temperature=0.2,
    )


@app.post("/interview/question")
async def interview_question(req: QuestionReq, uid: str = Depends(current_user)):
    weak = req.topic_label == "Weak"
    level_txt = req.topic_label + (f" ({req.topic_avg:.1f}/10)" if req.topic_avg is not None else "")
    r = await groq(
        [
            {"role": "system", "content": "You are an experienced interviewer. Reply with JSON only."},
            {
                "role": "user",
                "content": f'Ask ONE interview question for a {who(req.profile)} candidate on the topic "{req.topic}". '
                f"Candidate skills: {', '.join(req.profile.skills)}. Their current level on this topic: {level_txt}; "
                + ("they are weak here, so probe the fundamentals they likely missed. " if weak else "adjust difficulty to their level. ")
                + "It must be answerable verbally in 1-2 minutes (no long code). "
                f"Do NOT repeat these: {json.dumps(req.avoid)}. Return {{\"question\": string}}",
            },
        ],
        temperature=0.8,
    )
    return {"question": str(r.get("question", "")).strip()}


@app.post("/interview/evaluate")
async def interview_evaluate(req: EvaluateReq, uid: str = Depends(current_user)):
    r = await groq(
        [
            {"role": "system", "content": f"You are a strict but fair interviewer for a {who(req.profile)} role. Reply with JSON only."},
            {
                "role": "user",
                "content": f"Topic: {req.topic}\nQuestion: {req.question}\n"
                f'Candidate\'s spoken answer (auto-transcribed, ignore small transcription errors):\n"""{req.answer}"""\n\n'
                'Return {"score": integer 0-10, "verdict": one sentence, "strengths": string[] (max 3), '
                '"missed": string[] (key points they missed, max 4), "ideal_answer": string (3-5 sentences), '
                '"follow_up": string (a follow-up question a real interviewer would ask next if the answer was partial, else "")}',
            },
        ],
        temperature=0.2,
    )
    try:
        score = max(0, min(10, round(float(r.get("score", 0)))))
    except (TypeError, ValueError):
        score = 0
    return {
        "score": score,
        "verdict": str(r.get("verdict", "")),
        "strengths": list(r.get("strengths") or [])[:3],
        "missed": list(r.get("missed") or [])[:4],
        "ideal_answer": str(r.get("ideal_answer", "")),
        "follow_up": str(r.get("follow_up") or ""),
    }


@app.post("/roadmap")
async def roadmap(req: RoadmapReq, uid: str = Depends(current_user)):
    return await groq(
        [
            {"role": "system", "content": "You are a senior career mentor. Reply with JSON only."},
            {
                "role": "user",
                "content": f"Create an interview-prep roadmap for a {who(req.profile)}. Known skills: {', '.join(req.profile.skills)}. "
                f"Tracked topics: {', '.join(req.topics)}. Return {{\"stages\": [{{\"title\": string, \"duration\": string, "
                '"items": [{"topic": string (use a tracked topic name exactly when it matches), "detail": string (what to study, 1 sentence)}]}]} '
                "with 4-6 stages, 3-6 items each, ordered from fundamentals to advanced.",
            },
        ],
        temperature=0.4,
    )


@app.post("/bank")
async def bank(req: BankReq, uid: str = Depends(current_user)):
    r = await groq(
        [
            {"role": "system", "content": "You write interview question banks. Reply with JSON only."},
            {
                "role": "user",
                "content": f'Write 8 interview questions on "{req.topic}" for a {who(req.profile)}, mixed difficulty. '
                f"Avoid: {json.dumps(req.avoid)}. Return {{\"questions\": [{{\"q\": string, \"difficulty\": \"Easy\"|\"Medium\"|\"Hard\", "
                '"hint": string (key points of a good answer, 2-3 sentences)}]}',
            },
        ],
        temperature=0.7,
    )
    return {"questions": r.get("questions", [])}


@app.post("/chat")
async def chat(req: ChatReq, uid: str = Depends(current_user)):
    levels = "; ".join(f"{t}: {l}" for t, l in req.topic_levels.items())
    system = (
        f"You are PrepPilot, a friendly interview coach. The user is {req.name or 'a candidate'}, a {who(req.profile)}. "
        f"Skills: {', '.join(req.profile.skills)}. Topic levels from mock interviews: {levels}. "
        "Be concise and practical; short paragraphs or bullet lists, plain text (no markdown tables)."
    )
    reply = await groq(
        [{"role": "system", "content": system}] + [m.model_dump() for m in req.messages[-12:]],
        json_mode=False,
        temperature=0.6,
    )
    return {"reply": reply}

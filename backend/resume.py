"""Resume reading and extraction.

1. extract_text(): PDF / DOCX / TXT -> clean plain text (paragraphs, tables, headers).
2. find_links(): LinkedIn / GitHub / portfolio links, found with regex (no AI needed).
3. EXTRACTION_PROMPT: what the AI must return.
4. normalize(): coerce the AI's JSON into a guaranteed shape, so the frontend never breaks.

Contact details (email, phone, address) are deliberately NOT extracted or stored.
"""

import io
import re
import unicodedata

import docx
from pypdf import PdfReader

from tracks import TRACKS, guess_track, tracks_for_prompt

MAX_CHARS = 14000
LEVELS = ["Student", "Fresher", "Intern", "Junior", "Mid", "Senior"]
EXPERIENCE_TYPES = ["Full-time", "Internship", "Part-time", "Freelance", "Volunteer", "Other"]


class ResumeError(ValueError):
    """A problem the user can fix (shown to them as-is)."""


# ---------------------------------------------------------------- text extraction
def _pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:
            raise ResumeError("This PDF is password-protected. Remove the password and upload it again.")
    pages = []
    for page in reader.pages[:6]:  # resumes are short; ignore huge attachments
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def _docx_text(data: bytes) -> str:
    d = docx.Document(io.BytesIO(data))
    parts: list[str] = []
    for section in d.sections:  # name/contact often live in the header
        parts += [p.text for p in section.header.paragraphs]
    parts += [p.text for p in d.paragraphs]
    for table in d.tables:  # many resume templates are built from tables
        for row in table.rows:
            cells = []
            for cell in row.cells:
                text = cell.text.strip()
                if text and text not in cells:  # merged cells repeat their text
                    cells.append(text)
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("•", "- ").replace("", "- ").replace("●", "- ").replace("▪", "- ")
    text = re.sub(r"[^\S\n]+", " ", text)  # collapse spaces, keep newlines
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def extract_text(filename: str, data: bytes) -> str:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    try:
        if ext == "pdf" or data[:4] == b"%PDF":
            raw = _pdf_text(data)
        elif ext == "docx":
            raw = _docx_text(data)
        elif ext in ("txt", "md", ""):
            raw = data.decode("utf-8", errors="ignore")
        elif ext == "doc":
            raise ResumeError("Old .doc files aren't supported. Save it as PDF or DOCX and upload again.")
        else:
            raise ResumeError("Unsupported file type. Upload a PDF, DOCX or TXT resume.")
    except ResumeError:
        raise
    except Exception:
        raise ResumeError("Couldn't read that file. It may be damaged. Try exporting it again as PDF.")
    text = clean_text(raw)
    if len(text) < 150:
        raise ResumeError(
            "Couldn't find enough text. If your resume is a scanned image or a Canva export with text as images, "
            "export it as a text-based PDF, or paste the text instead."
        )
    return text[:MAX_CHARS]


# ---------------------------------------------------------------- links
_LINK_RE = re.compile(r"(?:https?://)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:/[A-Za-z0-9_\-./?=&%#~+]*)?", re.I)
_LINK_KINDS = [
    ("linkedin", "linkedin.com"),
    ("github", "github.com"),
    ("behance", "behance.net"),
    ("dribbble", "dribbble.com"),
    ("kaggle", "kaggle.com"),
    ("leetcode", "leetcode.com"),
]


def find_links(text: str) -> dict[str, str]:
    links: dict[str, str] = {}
    for m in _LINK_RE.finditer(text):
        url = m.group(0).rstrip("./?&#")
        low = url.lower()
        if "@" in text[max(0, m.start() - 1) : m.start()] or low.endswith((".pdf", ".png", ".jpg")):
            continue  # part of an email address, or a file name
        kind = next((k for k, host in _LINK_KINDS if host in low), None)
        if kind is None:
            if any(x in low for x in ("portfolio", "vercel.app", "netlify.app", "github.io", "wixsite", "notion.site", "medium.com")):
                kind = "portfolio"
            else:
                continue
        if kind not in links:
            links[kind] = url if low.startswith("http") else "https://" + url
    return links


# ---------------------------------------------------------------- AI prompt
EXTRACTION_PROMPT = """You are an expert resume parser and career coach for students and early-career candidates across ALL fields
(tech and non-tech). Read the resume and return ONE JSON object with exactly these keys:

{
  "name": string,
  "headline": string (one line, e.g. "Final-year B.Com student aiming for sales roles"),
  "track": one of the track ids below,
  "target_role": string (the specific role they are aiming for; infer from objective, titles, projects and skills),
  "level": "Student" | "Fresher" | "Intern" | "Junior" | "Mid" | "Senior",
  "years_experience": number (full-time experience only; internships count as 0),
  "education": [{"degree": string, "field": string, "institution": string, "start": string, "end": string, "grade": string}],
  "experience": [{"title": string, "company": string, "type": "Full-time"|"Internship"|"Part-time"|"Freelance"|"Volunteer"|"Other",
                  "start": string, "end": string, "highlights": string[] (max 4, keep numbers/results)}],
  "projects": [{"name": string, "description": string (1-2 sentences), "tools": string[], "impact": string}],
  "skills": {"hard": string[] (role/technical skills), "tools": string[] (software/platforms), "soft": string[], "languages": string[] (spoken languages)},
  "certifications": string[],
  "achievements": string[] (awards, competitions, leadership, positions of responsibility),
  "summary": string (2-3 sentences about the candidate),
  "topics": string[] (7-9 interview topics most relevant to target_role and track; always include "Behavioral / HR"),
  "resume_score": integer 0-100 (quality of this resume for target_role: clarity, impact, relevance, quantified results),
  "strengths": string[] (max 4, what stands out),
  "improvements": string[] (max 5, specific, actionable fixes to the resume itself)
}

Track ids:
TRACKS

Rules:
- Use "" or [] when something is missing. Never invent facts that are not in the resume.
- Dates as written (e.g. "Jun 2023", "2021").
- Do NOT include email addresses, phone numbers or home addresses anywhere.
- topics must suit the track: e.g. sales -> "Objection Handling", "Sales Funnel & Pipeline"; design -> "Design Process", "Usability Heuristics";
  customer_service -> "De-escalation", "CRM Tools"; sde -> "Data Structures", "OOP"; ai_ml -> "Model Evaluation", "Feature Engineering".
""".replace("TRACKS", tracks_for_prompt())


# ---------------------------------------------------------------- normalization
def _s(v, max_len: int = 300) -> str:
    if v is None:
        return ""
    if isinstance(v, (int, float)):
        v = str(v)
    return str(v).strip()[:max_len] if isinstance(v, str) else ""


def _list(v, max_items: int = 20, max_len: int = 200, split: str = r"[,\n;]") -> list[str]:
    """Coerce to a de-duplicated list of strings. A plain string is split on `split`
    (commas for short items like skills; pass r"[\n;]" for sentences like highlights)."""
    if isinstance(v, str):
        v = re.split(split, v)
    if not isinstance(v, list):
        return []
    out: list[str] = []
    for x in v:
        s = _s(x, max_len)
        if s and s.lower() not in (o.lower() for o in out):
            out.append(s)
    return out[:max_items]


def _dicts(v, max_items: int) -> list[dict]:
    return [x for x in v if isinstance(x, dict)][:max_items] if isinstance(v, list) else []


_CONTACT_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s()-]{8,}\d")


def _scrub(s: str) -> str:
    return _CONTACT_RE.sub("", s).strip()


def _pick(v, options: list[str], default: str) -> str:
    """Case-insensitive match against allowed values ("internship" -> "Internship")."""
    s = _s(v, 40).lower()
    return next((o for o in options if o.lower() == s), default)


def _level(v) -> str:
    s = _s(v, 40).lower()
    exact = _pick(s, LEVELS, "")
    if exact:
        return exact
    if "intern" in s:
        return "Intern"
    if any(w in s for w in ("student", "year", "undergrad", "graduating", "pursuing")):
        return "Student"
    if "senior" in s or "lead" in s:
        return "Senior"
    if "mid" in s:
        return "Mid"
    if "junior" in s:
        return "Junior"
    return "Fresher"


def normalize(raw: dict, text: str) -> dict:
    """Return a resume dict with a guaranteed shape and safe values."""
    raw = raw if isinstance(raw, dict) else {}
    skills_raw = raw.get("skills") if isinstance(raw.get("skills"), dict) else {}

    track = raw.get("track")
    target_role = _s(raw.get("target_role"), 120)
    if track not in TRACKS:
        track = guess_track(text[:6000], primary=f"{target_role} {_s(raw.get('headline'))}")

    level = _level(raw.get("level"))
    try:
        years = max(0.0, min(50.0, float(raw.get("years_experience") or 0)))
    except (TypeError, ValueError):
        years = 0.0

    try:
        score = int(round(float(raw.get("resume_score"))))
        score = max(0, min(100, score))
    except (TypeError, ValueError):
        score = None

    topics = _list(raw.get("topics"), 10, 80)
    if not any("behavio" in t.lower() or "hr" in t.lower().split() for t in topics):
        topics.append("Behavioral / HR")

    return {
        "name": _scrub(_s(raw.get("name"), 80)),
        "headline": _scrub(_s(raw.get("headline"), 160)),
        "track": track,
        "target_role": target_role or TRACKS[track]["label"],
        "level": level,
        "years_experience": years,
        "education": [
            {k: _s(e.get(k), 160) for k in ("degree", "field", "institution", "start", "end", "grade")}
            for e in _dicts(raw.get("education"), 6)
        ],
        "experience": [
            {
                "title": _s(e.get("title"), 120),
                "company": _s(e.get("company"), 120),
                "type": _pick(e.get("type"), EXPERIENCE_TYPES, "Other"),
                "start": _s(e.get("start"), 40),
                "end": _s(e.get("end"), 40),
                "highlights": [h for h in (_scrub(x) for x in _list(e.get("highlights"), 4, 300, split=r"[\n;]")) if h],
            }
            for e in _dicts(raw.get("experience"), 8)
        ],
        "projects": [
            {
                "name": _s(p.get("name"), 120),
                "description": _scrub(_s(p.get("description"), 400)),
                "tools": _list(p.get("tools"), 10, 60),
                "impact": _scrub(_s(p.get("impact"), 300)),
            }
            for p in _dicts(raw.get("projects"), 8)
        ],
        "skills": {
            "hard": _list(skills_raw.get("hard"), 20, 60),
            "tools": _list(skills_raw.get("tools"), 20, 60),
            "soft": _list(skills_raw.get("soft"), 12, 60),
            "languages": _list(skills_raw.get("languages"), 8, 40),
        },
        "certifications": _list(raw.get("certifications"), 12, 160),
        "achievements": [a for a in (_scrub(x) for x in _list(raw.get("achievements"), 10, 240, split=r"[\n;]")) if a],
        "links": find_links(text),
        "summary": _scrub(_s(raw.get("summary"), 600)),
        "topics": topics,
        "resume_score": score,
        "strengths": _list(raw.get("strengths"), 4, 240, split=r"[\n;]"),
        "improvements": _list(raw.get("improvements"), 5, 300, split=r"[\n;]"),
    }


def resume_context(parsed: dict, max_chars: int = 1800) -> str:
    """A short text summary of the resume, used to ask resume deep-dive questions."""
    lines = []
    for e in parsed.get("experience", [])[:4]:
        hl = "; ".join(e.get("highlights", [])[:2])
        lines.append(f"Experience: {e.get('title')} at {e.get('company')} ({e.get('type')}). {hl}")
    for p in parsed.get("projects", [])[:4]:
        lines.append(f"Project: {p.get('name')}: {p.get('description')} Tools: {', '.join(p.get('tools', []))}. {p.get('impact')}")
    for a in parsed.get("achievements", [])[:3]:
        lines.append(f"Achievement: {a}")
    return "\n".join(lines)[:max_chars]

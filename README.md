# PrepPilot: AI interview coach

Reads your resume, builds a profile for your target role, runs live AI mock interviews with camera focus checks, marks weak topics red, and targets them in the next interview. All services used are free tier.

```
┌──────────────────────┐   login + save data (RLS)   ┌──────────────────────┐
│  Next.js frontend    │ ──────────────────────────▶ │  Supabase            │
│  (Vercel)            │                             │  Auth + Postgres     │
│                      │   AI calls + user token     └──────────▲───────────┘
│  • speech-to-text    │ ──────────────┐                        │ verifies token
│    (browser/Google)  │               ▼                        │
│  • face detection    │   ┌──────────────────────┐             │
│    (in browser)      │   │  FastAPI backend     │ ────────────┘
│  • video never sent  │   │  (Hugging Face Space)│ ──▶ Groq API (LLM)
└──────────────────────┘   └──────────────────────┘
```

| Folder | What |
|---|---|
| `frontend/` | Next.js 16 app → deploy to **Vercel** |
| `backend/` | FastAPI served by `app.py` → deploy to a **Hugging Face Space (Gradio SDK)** |
| `supabase/schema.sql` | Tables + Row Level Security → run in **Supabase** |
| `prototype/` | The earlier single-file version (not needed anymore) |

---

## Setup (about 20 minutes, in this order)

### 1. Groq (free LLM key)
console.groq.com → **API Keys** → *Create API Key*. Copy it (starts with `gsk_`).

### 2. Supabase (auth + database)
1. supabase.com → **New project** (free plan).
2. **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: make sure Email is enabled.
4. **Authentication → Emails → Magic Link** template: add the line `Your code: {{ .Token }}` so users can type the code as well as click the link.
5. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**.

### 3. Hugging Face Space (backend)
1. huggingface.co → **New Space** → SDK **Gradio** → Hardware **CPU basic (free)** or **ZeroGPU** → Visibility **Public** (a private Space can't be called from the website). The backend doesn't need a GPU because the AI runs on Groq. `app.py` includes a never-called `@spaces.GPU` placeholder so that ZeroGPU Spaces start.
2. Upload the 3 files from `backend/` (`app.py`, `main.py`, `requirements.txt`) using *Files → Add file → Upload*. Replace the Space's `app.py` and `requirements.txt`, and **keep the Space's own `README.md`** because it holds the Gradio settings. `app.py` serves the FastAPI routes and adds a status page at `/ui`.
3. **Settings → Variables and secrets**:
   - Secret `GROQ_API_KEY` = your Groq key
   - Variable `SUPABASE_URL` = Supabase Project URL
   - Variable `SUPABASE_ANON_KEY` = Supabase **publishable** key (`sb_publishable_…`), never the secret key
   - Variable `ALLOWED_ORIGIN_REGEX` = `https://.*\.vercel\.app` (until you know your Vercel URL)
   - Variable `ALLOWED_ORIGINS` = `https://your-app.vercel.app` (after step 4)
   - Optional: `GROQ_MODEL` (default `llama-3.3-70b-versatile`), `RATE_LIMIT_PER_MIN` (default `30`)
4. Wait for the build. Your API URL is `https://<username>-<space-name>.hf.space`. Opening it should show `{"ok": true, ...}`, and `/ui` shows which keys are set.

### 4. Vercel (frontend)
1. Push this project to GitHub.
2. vercel.com → **Add New → Project** → import the repo → set **Root Directory** to `frontend`.
3. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` = your `.hf.space` URL
4. Deploy.

### 5. Connect them
- Hugging Face Space → `ALLOWED_ORIGINS` = `https://your-app.vercel.app,http://localhost:3000` (optionally `ALLOWED_ORIGIN_REGEX` = `https://.*\.vercel\.app` for preview deploys).
- Supabase → **Authentication → URL Configuration**: Site URL = `https://your-app.vercel.app`, and add `http://localhost:3000/**` and `https://your-app.vercel.app/**` to Redirect URLs.

---

## Configuration

There are no `.env` files in this repo. All keys and settings live in the hosting dashboards:
- **Backend:** Hugging Face Space → Settings → Variables and secrets (see the table in step 3)
- **Frontend:** Vercel → Project → Settings → Environment Variables (see step 4)

Use **Chrome or Edge**, which have live speech-to-text.

---

## Privacy
- **Video is never uploaded.** Face detection (MediaPipe) runs inside the browser. If the user turns on the optional recording, it is only offered as a download to their device.
- Spoken answers are turned into text by the browser's speech service (Google in Chrome). The text is sent to the backend to be scored.
- The Groq key lives only on the Hugging Face server and never reaches the browser.
- Row Level Security means each user can only read and write their own rows.
- Settings → *Delete all my data* removes every row the user owns.

## Free-tier limits to know
| Service | Limit |
|---|---|
| Supabase | Built-in email sends only a few login emails per hour. For real users, add free SMTP (e.g. Resend or Brevo) under Auth → SMTP. Free projects pause after 1 week with no activity. |
| Hugging Face | A free Space sleeps after ~48 h without traffic. The first request after that takes ~30 s while it wakes up. |
| Groq | Per-minute and per-day request limits. The backend also limits each user to 30 requests per minute (`RATE_LIMIT_PER_MIN`). |
| Vercel | Hobby plan is for non-commercial use. |

---
title: PrepPilot API
emoji: 🎯
colorFrom: indigo
colorTo: blue
sdk: gradio
sdk_version: "6.32.0"
python_version: "3.12"
app_file: app.py
pinned: false
---

# PrepPilot API

Backend for the PrepPilot interview coach. `app.py` serves the FastAPI routes from `main.py`
and a status page at `/ui`.

Set in **Settings → Variables and secrets**:

| Type | Name | Value |
|---|---|---|
| Secret | `GROQ_API_KEY` | Groq API key |
| Variable | `SUPABASE_URL` | Supabase Project URL |
| Variable | `SUPABASE_ANON_KEY` | Supabase publishable key (`sb_publishable_…`) |
| Variable | `ALLOWED_ORIGIN_REGEX` | `https://.*\.vercel\.app` |
| Variable | `ALLOWED_ORIGINS` | your Vercel URL (optional, after deploy) |

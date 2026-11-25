"""Entry point for the Hugging Face Space (Gradio SDK).

Hugging Face runs `python app.py`. This serves the PrepPilot FastAPI API (main.py) on port 7860
and mounts a small Gradio status page at /ui. The API routes stay at the root:
  GET  /                    health check
  POST /resume/parse, /interview/question, /interview/evaluate, /roadmap, /bank, /chat
"""

import os

# `spaces` is preinstalled on Hugging Face Spaces and must be imported before Gradio builds the app.
try:
    import spaces
except ImportError:  # running outside Hugging Face
    spaces = None

import gradio as gr
import uvicorn

from main import GROQ_API_KEY, GROQ_MODELS, SUPABASE_ANON_KEY, SUPABASE_URL, app as api

if spaces is not None:

    @spaces.GPU
    def zerogpu_placeholder():
        """Never called. ZeroGPU Spaces stop at startup ("No @spaces.GPU function detected") unless
        at least one @spaces.GPU function exists. The AI runs on Groq, so no GPU time is ever used."""
        return None


def status() -> str:
    def mark(ok: bool) -> str:
        return "✅ set" if ok else "❌ missing"

    return (
        "## PrepPilot API is running\n\n"
        f"- `GROQ_API_KEY` (secret): {mark(bool(GROQ_API_KEY))}\n"
        f"- `SUPABASE_URL`: {mark(bool(SUPABASE_URL))}\n"
        f"- `SUPABASE_ANON_KEY`: {mark(bool(SUPABASE_ANON_KEY))}\n"
        f"- Models (tried in order): {', '.join(f'`{m}`' for m in GROQ_MODELS)}\n\n"
        "This Space is the backend for the PrepPilot website. It has no UI of its own."
    )


with gr.Blocks(title="PrepPilot API") as status_page:
    gr.Markdown(status())

# ssr_mode=False: Spaces turn on Gradio's SSR mode, which starts a Node.js proxy that grabs port 7860
# before uvicorn can bind it ("address already in use"). The status page doesn't need SSR.
app = gr.mount_gradio_app(api, status_page, path="/ui", ssr_mode=False)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))

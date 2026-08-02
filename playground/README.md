# Commit Review — Version 1 Product UI

Milestone 16A built the original single-file playground; Milestone 23
replaced its visual design and split it into three static files — no
framework, no build step, no dependency of its own — to serve as the
shipping Version 1 interface for `POST /review` (Milestone 14B).

## Run it

1. Start the API: `uvicorn src.api.app:app --reload` (from the project root).
2. Open `playground/index.html` directly in a browser (double-click it, or
   `open playground/index.html`).
3. Enter a repository URL (and, optionally, a commit hash), click
   **Review Commit**.

## Files

- `index.html` — structure: the form and the single output region.
- `styles.css` — the visual system (neutral palette, typography-first,
  no gradients/glassmorphism/animation beyond one loading indicator).
- `config.js` (Milestone 24A) — sets `window.API_BASE_URL`, loaded before
  `app.js`. Deploying this frontend against a backend running somewhere
  other than `http://localhost:8000` (e.g. a Railway deployment) is a
  one-line edit to this file only — no other file needs to change.
- `app.js` — vanilla JS: submits the form, renders exactly one of four
  states (idle, loading, error, result), and maps the API's real HTTP
  status codes (404/500/502/504) to plain-language messages. Never
  displays the raw `detail` string or a stack trace.

## Scope

One workflow: repository URL, optional commit hash, Review Commit button,
loading state, the five review sections in the backend's own order, and a
quiet note when the Response Validation Layer attaches a formatting
finding. The Review Engine's `findings` field is not shown — it is always
empty by design (ADR-016's category-1 catalogue doesn't exist yet), and
displaying a counter that can only ever read zero would misrepresent it as
a working feature. No authentication, no persistence/history, no
deployment, and no new backend endpoints or logic beyond the existing CORS
policy `src/api/app.py` already allows so this static file (opened from a
`file://` origin) can reach the API.

Not in scope, deliberately: saving past reviews, comparing commits,
feedback capture, dark mode, or any richer UI than the one workflow above.
See `docs/MILESTONES.md` (Milestones 16A, 23) for the full rationale.

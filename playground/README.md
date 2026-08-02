# Review Playground

Milestone 16A. A single static HTML file — no framework, no build step, no
dependency of its own — that replaces curl/Postman for exercising the
`POST /review` API built in Milestone 14B.

## Run it

1. Start the API: `uvicorn src.api.app:app --reload` (from the project root).
2. Open `playground/index.html` directly in a browser (double-click it, or
   `open playground/index.html`).
3. Enter a repository URL (and, optionally, a commit hash), click **Analyze**.

## Scope

Repository URL field, optional commit hash field, an Analyze button, a
loading state, and formatted rendering of the existing `POST /review`
response — nothing else. No authentication, no persistence/history, no
deployment, and no new backend endpoints or logic beyond the CORS policy
`src/api/app.py` now allows so this static file (opened from a `file://`
origin) can reach the API.

Not in scope, deliberately: saving past reviews, comparing commits,
feedback capture, or any richer UI. See `docs/MILESTONES.md` (Milestone 16A)
for the full rationale.

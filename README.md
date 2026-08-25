# Intent-Aware Self-Healing

An AI-assisted pull request review system that reasons about a change the way a senior engineer would — not just describing a diff, but checking whether it's actually correct, complete, and consistent with the rest of the codebase.

A deterministic evidence pipeline (git + AST) feeds a constrained LLM reasoning stage, so every finding is grounded in something a reviewer could independently verify.

**What it does:**
- Decomposes a PR into its real distinct changes and flags what's undisclosed or unsupported by the description
- Flags code that works but breaks an established convention elsewhere in the repo
- Actually runs a repo's own tests in a sandbox (Python, Node, Java, Ruby, Go, Rust) instead of guessing
- Writes and runs targeted verification probes for specific claims, validated against both the PR's base and head commit
- Detects real breaking changes in API contracts (OpenAPI)

Known limits — concurrency bugs, cross-file claims, full integration testing — are documented honestly in `docs/`, not glossed over.

## Quick start

```bash
pip install -r requirements.txt && cp .env.example .env
uvicorn src.api.app:app --reload --port 8020   # backend

cd frontend && npm install && npm run dev       # frontend
```

## Docs

`docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/CURRENT_STATE.md`

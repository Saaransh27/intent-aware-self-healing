# Intent-Aware Self-Healing

An AI-assisted pull request review system that reasons about a change the way a senior engineer would: what did this PR actually do, does that match what the author said, does it fit how the rest of the codebase already works, and — where possible — does it actually behave correctly when run for real.

This is not a CI replacement and not another static-analysis linter. It is a pre-merge reasoning layer: a deterministic evidence-extraction pipeline feeds a constrained LLM reasoning stage, and every claim the system makes is grounded in something a reviewer could independently check.

## Why this exists

Most PR-review tooling stops at pattern-matching: linters, dependency scanners, security scanners, and AI summarizers that describe a diff back to you. Very few systems attempt the harder, more valuable question a real reviewer asks: *is this change actually correct, actually complete, and actually what it claims to be?*

This project is built around a simple discipline: **never assert something the reviewer can't check for themselves.** Deterministic facts (from git and AST analysis) always outrank the model's own inference. Confidence is never a bare number — every finding states in plain language how directly it's supported by evidence, and the system explicitly declines to guess when it can't verify something honestly.

## What it actually does today

| Capability | What it catches |
|---|---|
| **Intent decomposition** | Every distinct logical change in a PR, grouped by what it's actually for — not by file or directory — with each group tagged as disclosed, undisclosed, or unclear relative to the PR's own description. Also flags "phantom claims": things the description says happened that the diff doesn't actually support. |
| **Convention consistency** | New code that's functionally fine but diverges from an established pattern elsewhere in the same codebase (e.g. every other handler wraps a call in the same error type, and this one doesn't) — gated so a single other file doing something differently is never mistaken for "the convention." |
| **Execution-based verification** | Actually clones the PR, detects how the repository runs its own tests (Python, Node, Java/Maven, Java/Gradle, Ruby, Go, Rust), and runs them in a real sandbox — install phase network-allowed, test phase network-denied — rather than trusting the model's guess about whether something passes. |
| **Agent-written test probes** | For a specific reviewer claim with no existing test to lean on, generates a minimal, targeted probe and actually runs it — validated by running the *same* probe against both the PR's base and head commit, and only trusting a result that genuinely discriminates between them (the same technique SWE-bench uses to validate a generated test means something). Covers pure functions, clock-dependent code, background tasks, raw-SQL database access, and — for Java — real object construction with inferred constructor arguments. |
| **Cross-language contract checking** | Real, structural breaking-change detection between two versions of an OpenAPI/Swagger spec (removed endpoints, newly-required parameters, removed response fields, changed field types) when the repository maintains one. |

Every one of these has been validated against real, live model calls and real toolchains — not just unit tests with a fixed script. Where a capability doesn't hold up (a false positive, a sandboxing gap, a language-specific quirk), the failure and its fix are part of this project's own history, not hidden.

## What it deliberately does not attempt (yet)

Being honest about limits is part of the design, not an afterthought:

- **Async/concurrency bugs** — confirmed, across this project's own research, to be a genuine dead end for LLM-generated probes; a real fix means a different class of tool (race detectors, model checkers), not a better prompt.
- **A claim spanning multiple files/functions together** — no system anywhere, as far as this project's research found, reliably verifies a cross-component interaction claim this way.
- **Full running-app / integration-level verification** — would require standing up the whole application, not one function; a materially larger undertaking than anything built so far.
- **Object construction for JavaScript**, and **database access through an ORM session** rather than raw SQL, remain open problems this project has not solved.
- **UI/DOM-level verification** and **cost-tiered orchestration** (deciding automatically when the expensive execution/probe stages should fire) are planned but not yet built.

## Architecture

```
GitHub PR ──▶ deterministic evidence extraction (git + AST, no LLM)
                 │
                 ▼
          reasoning modules (independent, claim/gap-producing)
                 │
                 ▼
          review context (5 fixed sections) ──▶ LLM reasoning stage
                 │                                      │
                 ▼                                      ▼
      execution / probe verification            structured findings
        (sandboxed, on demand)                   (schema-validated)
                 │                                      │
                 └──────────────┬───────────────────────┘
                                 ▼
                        review response (API) ──▶ frontend dashboard
```

- **Backend** — FastAPI (`src/api/`), a frozen deterministic reasoning core (`src/reasoning/`, `src/fusion/`, `src/review/`), a constrained prompt/response contract with the LLM (`src/prompt/`, `src/response_validation/`), and a standalone execution/verification layer (`src/execution/`, `src/contracts/`) that is *not* wired into the always-on review path — it's deliberately on-demand, since running real code costs real time.
- **Model** — Shakti Studio (`openai/gpt-oss-120b`) via `src/pipeline/shakti_execute.py`.
- **Frontend** — a React + Vite dashboard (`frontend/`) presenting the review as a single fixed-viewport "command deck": a categorical verdict, inferred intent vs. implementation, and click-to-expand finding sections.

See `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` for the full, ADR-level detail behind these choices.

## Getting started

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # fill in SHAKTI_API_KEY at minimum

uvicorn src.api.app:app --reload --port 8020
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Running a review from the command line

```bash
python3 run_full_pipeline.py <repository_url> <commit_or_pr>
```

## Testing

```bash
python3 -m pytest tests/ -q      # backend — 516 tests at time of writing
cd frontend && npm test          # frontend
```

Every capability above was also validated against real, live model calls and real language toolchains (Python, Node, Maven, Gradle, Bundler, Go, Cargo) during development — not just the automated suite.

## Project status

This project follows a deliberately incremental process: research how proven systems solve a problem before building, ground every new capability in real evidence, and never silently claim more than what's actually demonstrated. `docs/DECISIONS.md` records the architectural reasoning behind the frozen deterministic core; `docs/CURRENT_STATE.md` and `docs/MILESTONES.md` record its build history in detail.

## Repository layout

```
src/
  api/            FastAPI app, request/response models
  reasoning/       independent, claim-producing reasoning modules (frozen core)
  fusion/          evidence fusion into a unified per-file/per-commit view
  review/          review context assembly (the LLM's fixed input contract)
  prompt/          system/user prompt construction, incl. probe-generation prompts
  response_validation/  strict parsing of the model's structured output
  execution/       sandboxed test execution and agent-written probe verification
  contracts/       deterministic API-contract (OpenAPI) breaking-change diffing
  semantic/        language-specific source extraction (Python AST, Java)
  git/ github/     git operations and GitHub API/OAuth integration
frontend/          React + Vite review dashboard
docs/              architecture, decisions (ADRs), milestones, current state
tests/             mirrors src/, one test module per source module
```

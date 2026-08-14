# Milestone 6 — V1 Product Validation & Release Readiness

_2026-08-13. Cross-referenced from `docs/CURRENT_STATE.md`,
`docs/MILESTONES.md`, `docs/CHANGELOG.md`. Written to be read critically
— this document states what is NOT true or NOT verified as plainly as
what is._

## 1. Objective

Not "do the automated tests pass" (they already did, per Milestone 5) —
whether this product is genuinely ready to call V1: whether the real
user journey works end to end as far as this environment allows,
whether production configuration is actually correct, and whether
deployment is genuinely possible right now. No architecture changes, no
reasoning-pipeline changes, no prompt changes, no new features — only
validation, and fixes for issues actually demonstrated.

## 2. The single most important finding, up front

**Every change from Milestone 1 through Milestone 5 — the entire
PR-review backend, GitHub OAuth, the new `frontend/` React app, and all
of Milestone 5's hardening fixes — existed only as uncommitted local
changes when this milestone began.** `git log` showed the last commit as
`86e3fde` ("Milestone 25A"), and the live, deployed Render backend
confirmed this for real: `curl https://intent-aware-self-healing.onrender.com/github/me`
returned a genuine `404 Not Found` — the endpoint doesn't exist in
whatever code is actually running there. The live service is running
the pre-PR-review, commit-only system.

This was surfaced to the user directly. Per explicit instruction, the
handling was:
- One commit was made (`864f5a7`, the pre-existing Milestone 25A
  playground markdown/card-redesign changes that predated this entire
  PR-review migration arc) before a second commit was interrupted and
  the user clarified the intent.
- **Per the user's explicit final instruction, no further commits were
  made.** The backend PR-review/OAuth/hardening files remain `git add`-ed
  (staged) but uncommitted. The entire `frontend/` directory remains
  untracked. Nothing has been pushed to `origin/main` at any point.

**Practical consequence for this milestone**: "deployment" of Milestones
1–5's work is not possible from this state regardless of any other
factor (see §7/§8) — there is nothing on `origin/main` for a connected
deployment platform to pick up. This is stated as fact, not worked
around.

## 3. Validation workflow

The 19-step journey requested, tested against the real, locally-running
backend (`uvicorn src.api.app:app`, with the real `SHAKTI_API_KEY` from
`.env` loaded into its process environment) wherever possible, with the
real GitHub API (unauthenticated, for public repos — the only path
available, since no GitHub OAuth App is registered), and with a real
production frontend build (`vite build` + `vite preview`) for the
static-serving/navigation questions.

## 4. What was actually tested, and how

| # | Step | Result |
|---|---|---|
| 1 | User opens frontend | **Verified, local**: `npm run build` succeeds; `vite preview` (production-mode static server) serves the built SPA shell correctly at `/`. |
| 2 | Unauthenticated → LoginGate | **Verified, real backend + local component**: `curl http://localhost:8020/github/me` (real, running server) returns a genuine `401`; `App.test.jsx` confirms the frontend renders `LoginGate` on exactly that response. |
| 3 | User authenticates with GitHub | **Unable to verify — no credentials.** No GitHub OAuth App is registered (no `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` exist anywhere, confirmed by checking both the shell environment and `.env`). `curl http://localhost:8020/github/login` against the real server returns a real `500` with a clean JSON error (`OAuthError: GITHUB_CLIENT_ID is not configured`) — confirms the missing-config path fails cleanly, not with a crash, but the actual OAuth redirect/consent/callback dance cannot be exercised without a real registered app and a real browser. |
| 4 | Frontend obtains user via `/github/me` | **Verified for the unauthenticated case (real 401, above). Unable to verify the authenticated case** — requires a real session, which requires step 3. |
| 5 | Sidebar/repo list loads | **Verified with local component tests only** (`RepositoryList.test.jsx`, `Sidebar` rendering inside `App.test.jsx`) — real component logic, mocked network responses. Not exercised against real GitHub repo data. |
| 6 | User selects a repository | **Verified with local tests** (`RepositoryList` real `<Link>` hrefs to `/r/:owner/:repo`, confirmed via DOM assertions). |
| 7 | Open PR list loads | **Verified with local component tests** (`PRList.test.jsx`). **Not verified against a real authenticated `/github/repos/{owner}/{repo}/pulls` call** (needs a real session). |
| 8 | User selects a PR | **Verified with local tests** (`PRList` row → `/r/:owner/:repo/pull/:number` link). |
| 9 | PR detail loads | **Verified with local component tests** (`PRDetail.test.jsx`, mocked `fetchPullRequestDetail`). |
| 10 | User requests/generates the review | **Verified for real, end to end**: a real `POST /review/pr` HTTP request against the locally running server, for a real public PR (`pallets/click#2202`), completed in ~12s with a real Shakti LLM call, returning `HTTP 200` and a fully real, correctly shaped response. |
| 11 | Backend performs the real PR pipeline | **Verified for real** — same request as #10: real clone, real Evidence Fusion/reasoning, real LLM call, real `sanitize_response`/`validate_response`. |
| 12 | Review result renders correctly | **Verified for real, closing the loop end to end**: the exact JSON body captured from step 10/11 was saved as a fixture (`frontend/src/test/fixtures/real_pr_review_response.click_2202.json`) and fed into a real render of `PRDetail` (`PRDetail.realdata.test.jsx`) — the real verdict text, and every real changed file, render correctly; no fabricated risk/confidence language appears anywhere in the rendered output. This is real backend output rendered by the real frontend component tree, not two halves independently assumed to agree. |
| 13 | Critical/relevant file information is visible | **Verified via the same real-data render test** (#12) — `FileOverview`/`ReviewFindings` render against the real `review_context`/`observations` captured above. |
| 14 | Supporting details behave correctly | **Verified with local tests** (`SupportingDetails.test.jsx`'s real emptiness-check logic) plus indirectly confirmed against the real fixture (#12) rendering without error. |
| 15 | Previous/next PR navigation works | **Verified with local tests** (`PRNavigation.test.jsx`) — this is pure, deterministic logic over an array of PR numbers; no network dependency to begin with, so a component test is the complete, correct verification, not a lesser substitute. |
| 16 | Navigation boundaries behave correctly | **Verified with local tests** — same file, explicit first/last/not-in-list cases. |
| 17 | Refresh/re-entry does not create broken UI state | **Verified locally, and a real gap found and fixed** — see §5/§6 (F1). |
| 18 | Logout works | **Verified with local tests** (`App.test.jsx`). |
| 19 | Expired/invalid session returns to auth | **Verified with local tests**, all added in Milestone 5 (`App.test.jsx`'s session-expiry case, `PRList`/`PRDetail`'s 401 "Sign in again" tests). |

Additionally, beyond the 19 steps: real malformed/unsupported-PR
requests were sent to the real running server (a PR number that doesn't
exist, a malformed repository URL, a nonexistent repository) — all
returned clean `404`s with no stack traces or internal detail leaked
(see §3 output captured during this milestone).

## 5. Issues discovered

### F1 — [Real, fixed] No SPA-fallback configuration for `frontend/`'s eventual static deployment

`frontend/` has never been deployed and has no `vercel.json` (or
equivalent) at all. A production static host (Vercel, the established
pattern for this project's `playground/`) serves files as literally
requested by default — a hard refresh (or a direct link, or a shared
URL) on a nested client-side route like `/r/octocat/hello-world/pull/42`
would 404, because no file exists at that path; only React Router,
running in the browser after `index.html` loads, knows how to render it.
Confirmed the underlying mechanism is real (`vite preview`, a
production-mode static server, already handles this correctly by
default locally — the gap is specifically the *absence of equivalent
config for the actual target host*, not a bug in the app itself).

**Fixed**: `frontend/vercel.json` added with a catch-all rewrite to
`/index.html`, the standard, minimal configuration for a Vercel-hosted
SPA using client-side routing. No code changed; this is deploy
configuration only.

### F2 — [Confirmed, not a defect in this milestone's scope] The live backend is stale

Covered in full in §2. Not a code defect — a deployment-process gap. No
code fix applies; the fix is committing and deploying, both explicitly
out of scope for this session per the user's instruction.

### No other real workflow blockers found

Every other real check performed (malformed PR requests, session
expiry, navigation boundaries, the real end-to-end review generation)
behaved correctly on the first real attempt, with no code changes
required.

## 6. Fixes made

| Fix | File(s) | Type |
|---|---|---|
| SPA rewrite config for production static hosting (F1) | `frontend/vercel.json` (new) | Deploy config only, no code change |

That is the only code/config change made this milestone. Everything
else in Phase A/B was validation that passed without needing a fix.

## 7. Deployment configuration

**Backend (Render)** — currently deployed, but running stale
(pre-Milestone-1) code (§2). To bring it current, whenever committing
and pushing is authorized:
- Push `main` to `origin` (this alone does nothing to Render unless
  Render's dashboard has auto-deploy-on-push configured for this repo —
  not something this session can confirm without Render dashboard
  access).
- Set these environment variables on the Render service (all currently
  documented in `.env.example`, none currently set on the live service
  as far as this session can observe):
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — from a real GitHub
    OAuth App, which does not yet exist. Must be registered by the repo
    owner at `https://github.com/settings/developers`.
  - `GITHUB_OAUTH_REDIRECT_URI` — must be exactly
    `https://intent-aware-self-healing.onrender.com/github/callback`
    (or wherever the backend actually ends up), and must exactly match
    the OAuth App's own configured "Authorization callback URL".
  - `FRONTEND_URL` — must be the real deployed URL of `frontend/` once
    it exists (see below); currently there is no such URL.
  - `SESSION_COOKIE_SECURE` — defaults to `true`; correct for a real
    HTTPS deployment, no change needed.
  - `SHAKTI_API_KEY` — a real, valid key must be set (the one used for
    this milestone's real testing was supplied directly to this session
    and lives only in the local, gitignored `.env`; it was not committed
    or logged anywhere in this repository).

**Frontend (`frontend/`)** — **no deployment target exists at all** —
no Vercel project, no Netlify site, nothing. This needs a new static
site deployment (Vercel is the established pattern for this project).
Once created:
  - `VITE_API_BASE_URL` should point at the real backend URL — already
    the default fallback in `frontend/src/lib/api.js` if unset, so this
    only needs explicit configuration if a different backend URL is
    ever used.
  - `vercel.json` (added this milestone, F1) handles SPA routing
    automatically once the project exists — no manual dashboard rewrite
    configuration should be needed.

**GitHub OAuth App** — does not exist. Must be created by the repo
owner (an action only they can take, being tied to their own GitHub
account), with:
  - Homepage URL: the frontend's eventual real URL.
  - Authorization callback URL: the backend's real URL + `/github/callback`.
  - The resulting Client ID and Secret then go into the backend's env
    vars above.

**CORS** — `_ALLOWED_ORIGINS` (`src/api/app.py`) already includes
`FRONTEND_URL` and the existing `playground/` Vercel URL; once
`frontend/`'s real URL is known, it needs to be set as `FRONTEND_URL` on
the backend (no code change — this is already how the existing config
is designed to work).

**HTTPS assumption** — the session cookie's `SameSite=None` requires
`Secure`, which requires real HTTPS. Both Render and Vercel provide this
by default; no additional configuration needed once both are real
deployments.

## 8. Deployment verification status

**Not deployed, and deployment was not attempted this session.** No
Render or Vercel dashboard/API access exists in this environment, and no
GitHub OAuth App is registered — both are prerequisites this session
cannot supply regardless of git state. Combined with §2 (nothing new
committed to `origin/main` per explicit instruction), there is currently
nothing that could be deployed even with platform access. §7 above is
the precise, actionable list of what a session with the right access
would need to do next.

## 9. Known accepted limitations (unchanged from Milestone 5, re-confirmed still acceptable)

No CSRF token on state-changing endpoints; in-memory session store;
access token as a subprocess argument during git clone/fetch; GitHub API
rate limits; React StrictMode's dev-only double-fetch on mount; the
backend's coverage-ledger risk-bearing definition (`context_builder.py`)
still over-broad, matching the issue the frontend's own definition was
narrowed for in Milestone 5. None of these block the real V1 workflow —
re-confirmed, not re-litigated, this milestone.

## 10. Final V1 status

**The product is code-complete and functionally validated as far as
this environment's credentials allow, and no workflow-blocking defect
was found in that validation. It is not deployed, and as of this
milestone, most of its code is not even committed** — that is the
actual, honest release-readiness status, not "ready to ship." Real
release requires, in order: (1) a decision to commit the remaining
staged/untracked work, (2) a decision to push, (3) a real GitHub OAuth
App registered by the repo owner, (4) Render/Vercel access to configure
and deploy both services. None of the four happened this session, by
explicit instruction for (1)/(2) and by environment limitation for (3)/(4).

## 11. Exact test/build/lint results

- Backend: `python3 -m pytest -q` → **316 passed, 12 subtests passed**.
  Unchanged from Milestone 5 — no backend code was modified this
  milestone (`frontend/vercel.json` is the only new file, and it is not
  backend code).
- Frontend: `npx vitest run` → **59 passed** (58 from Milestone 5 + 1 new
  real-fixture render test, `PRDetail.realdata.test.jsx`).
- Frontend build: `npm run build` → succeeds cleanly.
- Frontend lint: `npm run lint` (`oxlint`) → no output, clean.

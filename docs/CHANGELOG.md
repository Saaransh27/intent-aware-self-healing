# Changelog

## 2026-08-16 (Milestone 8 — Review Intelligence Reliability and UX)

Full detail: `docs/MILESTONE_8_REVIEW_INTELLIGENCE_AND_UX.md`. Fresh (non-cached)
live model generations against the same two real demo PRs Milestone 7
evaluated surfaced two real, repeatable classifier failures: a benign fact
phrased with "Confirmed" pushed a safe PR to `HIGH RISK` (severity and
confidence conflated into one keyword signal); a real defect worded with
"order" instead of "ordering" was missed by the behavioral-change keyword
list. Explicit instruction: replace the classification mechanism, not add
more keywords.

- **Prompt change (first revision to Prompt v1 since its Milestone 15E
  freeze)**: `src/prompt/prompt_builder.py`'s section 3 now requires a
  fenced JSON array of structured findings (14 fields each, `Literal`-typed
  enums — `src/api/models.py:StructuredFinding`), with an explicit
  six-question justification requirement for `confidence` and language
  stating that word choice in a finding's own prose carries no
  classification weight. A follow-up fix, found on the very first live
  test: the finding-level confidence vocabulary is now explicitly
  distinguished from the separate four-term prose vocabulary used
  elsewhere in the response (the model had bled "Likely" across the two).
- **New**: `src/response_validation/structured_findings.py` — extracts and
  strictly validates this JSON server-side; mechanical repair only
  (casing/whitespace/bare-string-to-array/trailing-comma); anything else
  is a rejected finding, never fabricated. Reports `state: "ok"`/
  `"reduced"`/`"unavailable"`, exposed as a new `structured_findings`
  field on `ReviewResponse`/`PRReviewResponse` (both endpoints), separate
  from the existing, still-empty ADR-016 `findings` field.
- **`frontend/src/lib/reviewIntelligence.js` rewritten**: the Milestone 7
  keyword classifiers (`classifyConfidence`/`classifySeverity`/
  `classifyCategory`/`isBehavioralChange`) are removed. `deriveVerdict` now
  requires Confirmed confidence **and** Critical/High severity **and** a
  real-risk status together for `HIGH RISK` — never confidence alone.
  `deriveIntentVsImplementation`/behavioral-change detection read
  `status`/`proofType`/`category` directly. `attributeFindingsToFiles`
  reads each finding's own `affectedFiles` field instead of cross-
  referencing quoted identifiers against prose.
- **PRDetail redesigned**: new order — Review Status (renamed
  `ReviewVerdict`, visually strengthened), Review at a Glance (new,
  `ReviewAtAGlance.jsx`, jump links with real counts), Intent vs
  Implementation, Findings (primary content, new severity/confidence/
  category filters on structured fields only), What Changed (new,
  `WhatChanged.jsx`, deterministic directory-grouped walkthrough), Risk
  Hotspots (renamed `FileOverview`), What We Could Not Verify (renamed
  `BlindSpots`, reworded to honest non-bug language), Test Impact
  (renamed `TestSignal`, explicit "tests passing ≠ safe" disclaimer),
  Supporting Details (unchanged). Optional sticky sidebar (spec's B10)
  deliberately not built — disclosed, not silently skipped.
- Real fixtures regenerated via live end-to-end calls using the actual
  updated response code (not hand-edited); repository selection confirmed
  unchanged (12 tests, untouched files).

318 backend tests, 114 frontend tests across 19 files (was 125 across
16 files — net new coverage on top of Milestone 7's, some rewritten for
the new structured-field shape); build and lint clean.

## 2026-08-15 (Milestone 7 precision fix pass — 7 real gaps found and fixed)

Full detail: `docs/MILESTONE_7_REVIEW_INTELLIGENCE.md`. A self-audit against
the milestone's own 25-part spec — re-reading actual rendered output
against real data rather than trusting the first pass's own comments —
found the initial implementation was shallower than claimed in several
places. Each was genuinely fixed, not just re-described:

- **Evidence (Part 4/5)**: was folded into the narrative body with no
  label; now a real, separately-labeled field per finding.
- **Test-coverage bug (Part 8)**: the plain "tests changed?" fact was only
  shown when nothing else was — for a PR with a real test mismatch, it
  never appeared at all. Now always shown first, unconditionally.
- **Intent vs Implementation bug (Part 9)**: a mismatch finding's two
  conflicting identifiers both landed under "Implementation," leaving
  "Test" permanently empty for exactly the real case this feature exists
  for. Fixed with real text-proximity extraction, verified against real
  PR #3 data (`Implementation: history.high_recent_curn`,
  `Test: history.high_recent_churn`).
- **Behavioral change detection (Part 10, called "a core differentiator"
  in the spec)**: only a boolean flag existed; the actual Before/After/
  Impact/Evidence/Tests structured card was never built. Now built for
  real, extracting genuine clauses from the model's own text (or honestly
  showing "not stated" rather than guessing).
- **IA ordering (Part 11)**: `ExecutiveSummary` was still rendered
  alongside the new verdict banner, contradicting the spec's clean 10-item
  order and duplicating content now covered elsewhere. Removed from
  `PRDetail` (the component itself, and the legacy flow using it,
  untouched).
- **File Overview Risk column (Part 13)**: only the header label had been
  changed; the actual values were still the old claims-only tier system,
  which is silent for both real evaluation PRs (zero Python files, zero
  deterministic claims). Properly fixed: findings are now cross-referenced
  against `what_changed_and_why`'s real per-file breakdown to attribute
  real severity to the real file — verified end to end, `reviewTiers.js`
  (the file with the actual bug) now correctly shows High/Critical risk.
- **Part 15 (reduce generic AI language)**: confirmed, stated plainly, as
  not attempted — requires a `SYSTEM_PROMPT` change, out of scope.

125 frontend tests (was 104; +21), 318 backend tests (unchanged); build
and lint clean. All fixes re-verified against the real captured PR #2/#3
API responses, not just at the unit level.

## 2026-08-15 (Milestone 7 — Review Intelligence)

Full detail: `docs/MILESTONE_7_REVIEW_INTELLIGENCE.md`. Refines the review
UI's information architecture and analysis presentation to answer "is this
safe, what's the evidence, what would a normal reviewer miss" — no
architecture, reasoning pipeline, or existing working component rewritten.

- **New**: `frontend/src/lib/reviewIntelligence.js` — turns the model's
  real prose plus the real deterministic `review_context`/`observations`
  into a verdict (`SAFE TO REVIEW`/`REVIEWER ATTENTION`/`HIGH RISK`, never
  "SAFE TO MERGE"), per-finding severity/confidence/category/evidence,
  intent-vs-implementation (PASS/MISMATCH), and evidence-based blind
  spots. Confidence classification's primary signal is Prompt v1's own,
  already-frozen four-term uncertainty vocabulary (Confirmed/Likely/Worth
  checking/Unknown — `src/prompt/prompt_builder.py`, present since
  Milestone 10B, never previously surfaced in the UI), with a disclosed
  hedge-language fallback for its already-documented non-literal use.
- **Real, load-bearing discovery**: neither evaluation PR touches Python,
  so the deterministic reasoning layer produces zero claims for either
  (confirmed via both PRs' real captured responses) — severity/confidence
  had to be derived primarily from the model's own real text, not
  deterministic claims data.
- **One additive backend field**: `PullRequestSummary.head_sha` (present
  on both GitHub's list and single-PR endpoints, like `state` — previously
  unextracted) enables real stale-review detection.
- **New components**: `ReviewVerdict`, `IntentVsImplementation`,
  `BlindSpots`, `TestSignal`, `StaleReviewBanner`. **Restructured**:
  `ReviewFindings` (grouped by confidence, not file-risk tier),
  `FileOverview` (relabeled columns), `PRList` (real per-row risk status —
  `Not reviewed` never fabricated), `PRDetail` (new information
  architecture, real client-stamped review timestamp, "Review again" on
  a real `head_sha` mismatch).
- **Verified against real, captured production output** for two
  deliberately-paired PRs (identical claimed change, one correct, one with
  two real defects) — they render meaningfully differently: PR #2 →
  `SAFE TO REVIEW`, 0 confirmed; PR #3 → `HIGH RISK`, 3 confirmed
  (including the real typo and a real, previously-untested logic
  regression, both surfaced as evidence-quoted, not merely asserted).
- 104 frontend tests (was 80; +24), 318 backend tests (was 317; +1); build
  and lint clean.

## 2026-08-15 (Production verified end to end, for the first time — real)

After the Basic-vs-Bearer clone fix deployed and Render's `GITHUB_CLIENT_ID`/
`GITHUB_CLIENT_SECRET`/`GITHUB_OAUTH_REDIRECT_URI`/`FRONTEND_URL`/
`SHAKTI_API_KEY` were all set on the dashboard, the complete real
workflow was confirmed live in production for the first time:

- Real frontend: `https://intent-aware-self-healing-2.vercel.app`
- Real backend: `https://intent-aware-self-healing.onrender.com`
- Real GitHub OAuth login completed through the actual browser, real
  session established.
- Real `POST /review/pr` against a real private repository
  (`Saaransh27/intent-aware-self-healing#1`, a real PR opened this
  session) returned `200`, `adapter_state: "success"`,
  `outcome: "evaluated"`, with a real, accurate verdict correctly
  naming the one real file that PR actually changed
  (`frontend/.gitignore`).

**Noted, not a defect**: every Render redeploy restarts the process and
wipes the in-memory session store (by design, an already-accepted V1
limitation) — each redeploy during this verification required a fresh
login, which is expected behavior, not a bug.

This closes the deployment-configuration gap left open in Milestones 6
and 7 ("could not be deployed/verified this session, no dashboard
access") — deployment access became available this session, and the
full stack is now genuinely live and functional, not just committed.

## 2026-08-15 (Real bug found and fixed — private-repo clone auth was broken since Milestone 3A)

The very first real private-repo review attempt (your own repo, via the
production frontend) failed with `"could not clone repository"`.
Traced to `src/git/git_client.py`'s `_auth_args`: it has been sending
`Authorization: Bearer <token>` since Milestone 3A, but GitHub's
smart-HTTP git clone/fetch endpoint (unlike its REST API) rejects
Bearer and only accepts **HTTP Basic auth**, token as the password.
Confirmed directly: a real clone of a real private repo with the exact
old header failed with `remote: invalid credentials`; the same clone
with a Basic-auth header (`x-access-token:<token>`, base64-encoded)
succeeded immediately.

This went undetected for three milestones because every existing test
(`AuthArgsTests`, `AuthenticatedCloneAndFetchTests`) only ever spied on
`_auth_args`'s own output or exercised it against a local, non-HTTP
git remote — never against real GitHub. Milestone 3A's own report
named this exact gap explicitly ("confirming it actually authenticates
against a real private GitHub repo is out of scope here... that gap is
named explicitly"); it's the first time real private-repo access was
actually attempted.

**Fixed**: `_auth_args` now sends `Authorization: Basic
<base64(x-access-token:token)>`. Verified twice: directly with `gh`'s
own token against a real private repo (clone succeeded), and through
the actual `GitClient.clone_repository` code path (not a standalone
script). Two `AuthArgsTests` updated (Bearer -> Basic), one new test
added confirming the Basic header decodes back to the real token. 317
backend tests pass (was 316).

## 2026-08-15 (Commit + partial deploy — real, not fully working)

Per explicit instruction, all of Milestones 28-35's previously-uncommitted
work was committed (`a086b79`) and pushed to `origin/main` via `gh`'s
stored auth (plain `git push` couldn't reach the sandboxed shell's
keychain; `gh auth setup-git` wired git to reuse `gh`'s existing token
instead — no new credentials were created or exposed).

**The push triggered a real Render auto-deploy** — confirmed genuinely,
not assumed: the live backend's `/github/me` now returns a real `401`
(previously a real `404`, proving it ran pre-Milestone-28 code). This
is real progress, stated plainly alongside what's still broken:

- **`GET /github/login` returns a real `500`** on the live service —
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` were only ever added to the
  local `.env`, never to Render's dashboard (no access to it exists in
  this environment). Real GitHub login does not work in production yet.
- **`POST /review/pr` returns a real `502` ("the model did not produce a
  usable response")** on two different real, public PRs
  (`psf/requests#7603`, `pallets/click#2202`) — a genuine, reproduced
  `execution_boundary_failure`, the same failure mode Milestone 5
  diagnosed as an expired `SHAKTI_API_KEY`. The key works locally
  (5 real PRs succeeded in Milestone 7); Render's own copy of it is
  unverified and cannot be checked or updated without dashboard access.
- **`frontend/` remains undeployed** — no Vercel/Render CLI is
  installed in this environment and no Vercel project for `frontend/`
  exists; nothing changed here.

**Not invented as a success**: the deploy is real but the product is
not currently functional in production. Fixing this needs Render
dashboard access to set the four OAuth env vars and verify/refresh
`SHAKTI_API_KEY`, plus a new Vercel project for `frontend/` — none of
which this session can perform.

## 2026-08-14 (Milestone 7 — V1 Functional QA, real end-to-end)

The first real, credentialed, browser-driven pass through the complete
PR-review workflow — a real GitHub OAuth App was registered, real login
completed through an actual browser, and the resulting real session
used to drive every authenticated flow directly. No UI changes; the
brief was fix-only-if-reproduced.

**All 12 requested flows verified for real** (not inferred, not
mocked): login (real OAuth code exchange, confirmed via backend log)
and logout (real `POST /github/logout`, confirmed old session
immediately returns `401`, followed by a real re-login); authenticated
repository discovery (real account, 21 accessible repositories, mixed
owned/private/collaborator); repository selection and open-PR listing
(real empty lists for two personal repos with no open PRs, real 72-entry
list for `fastapi/fastapi`); PR review generation across 5 real,
differently-shaped PRs (`pallets/click#2202` refactor,
`pallets/flask#6133` feature, `psf/requests#7603` dependency bump,
`fastapi/fastapi#16171` translation, `fastapi/fastapi#16174` bugfix) —
all `200`, all `adapter_state: success`; review rendering and
file/finding data verified structurally sound against the real
`ReviewContext`/`Observations` Pydantic contract for every one of the 5;
prev/next navigation logic reconfirmed against real, multi-entry PR
data; refresh behavior confirmed on the dev server (a nested route
returns the real app shell, `200`, not a blank page); expired/invalid
session handling confirmed clean (`401`, no leak, for a garbage cookie,
a missing cookie, and a well-formed-but-unknown one); empty/error states
confirmed via real empty PR lists and Milestone 6's real malformed-request
`404`s.

**No new functional bug required fixing.** One real, reproducible
finding was verified but deliberately **not** fixed, being outside this
milestone's own explicit boundary ("do not improve model prompts"):
`fastapi/fastapi#16171`'s real review output leaked two literal internal
claim-id strings (`shape.narrow_change`, `shape.touches_documentation`)
into "Minor Notes." The backend's existing Response Validation Layer
already caught this (`outcome: "invalid"`, both `literal_claim_id_leak`
findings), consistent with this project's established, deliberately
strict `502`-free design (Milestone 26) — the response is still
delivered, findings attached, not rejected. Confirmed via a real render
check that the frontend (which never reads the `validation` field at
all) displays the leaked text verbatim, with no visual indication
anything was flagged. This is the same stochastic, systemic Prompt v1
behavior Milestone 16B measured at ~9/24 real commits and explicitly
declined to patch ad hoc; a safe fix would require either a prompt
change (out of scope here) or content-aware sentence repair (a
larger, riskier change than "the smallest possible thing" allows) —
named here as a real, standing, unfixed finding, not silently dropped.

Zero errors/tracebacks across 165 real backend requests over the full
session. 316 backend tests, 80 frontend tests unchanged (no code
changed this milestone — verification only). Build/lint unaffected.

## 2026-08-14 (Milestone 7A — Selective Repository Workspace)

Frontend-only, additive product improvement: `GET /github/repos` is
unchanged, still returns every repository the authenticated user
actually has access to; the sidebar now shows only a user-selected
subset of that list, persisted client-side.

- New `frontend/src/lib/repoSelection.js` — pure functions:
  `readStoredSelection`/`writeStoredSelection` (localStorage, key
  `pr-review:selected-repos`) and `reconcileSelection` (drops
  no-longer-accessible repos from a saved selection, never adds a
  newly-accessible one automatically). Identifier is `full_name`
  (owner/name) — `RepositorySummary` has no numeric GitHub id field to
  prefer instead.
- New `frontend/src/components/RepositorySelector.jsx` — a modal:
  search/filter, per-repo checkbox, "Select all visible" (scoped to the
  current filter, not the whole list), "Clear selection" (all, not just
  visible), Cancel/"Save selection". Nothing is persisted until Save is
  pressed.
- `Sidebar.jsx`: now takes `allRepositories` (the full API list, used
  only to decide whether to show the manage action / onboarding state)
  and `selectedRepositories` (what actually renders in the repo list).
  Adds a "Manage repositories" action, shown whenever there's at least
  one accessible repository. Shows a first-time onboarding empty state
  when a selection has never been confirmed, and a distinct "no
  repositories selected" state when one has been confirmed as empty —
  these are deliberately different states per the spec.
- `App.jsx` owns the selection: reads it once on mount, reconciles it
  against every successful `GET /github/repos` response, and re-persists
  only when reconciliation actually removed something.
- `EmptyState.jsx` gained a small, backward-compatible extension:
  `action.onClick` renders a `<button>` instead of `action.href`'s
  `<a>`, same visual treatment — needed since "open the selector" isn't
  a navigation.
- No GitHub OAuth, session/token handling, `/review/pr`, review
  pipeline, backend reasoning, or existing PR review UI touched.
  Existing repo → PR list → PR detail → prev/next navigation is
  unaffected — selection only changes what appears in the sidebar list,
  never what a direct route can reach.
- 21 new frontend tests (`repoSelection.test.js` — 8; `RepositorySelector.test.jsx`
  — 7; 6 new `App.test.jsx` cases covering the onboarding state,
  selected-only rendering, reconciliation-on-refresh, the manage-repositories
  flow end to end, and selected-repository navigation to its PR list).
  One pre-existing `App.test.jsx` case was updated, not just left to
  fail, since it asserted the exact old (now-superseded) "all
  repositories shown by default" behavior. 316 backend tests unchanged
  (no backend code touched); 80 frontend tests total (59 + 21), all
  passing; build and lint clean.

## 2026-08-13 (Milestone 6 — V1 Product Validation & Release Readiness)

Full detail: `docs/MILESTONE_6_RELEASE_READINESS.md`. Release-readiness
validation, not feature work — no architecture, reasoning-pipeline, or
prompt changes.

- **Major finding, not a code defect**: the live deployed Render backend
  (`https://intent-aware-self-healing.onrender.com`) returns real `404`s
  for `/github/me`/`/github/login`, confirmed via `git log` to still be
  running pre-Milestone-28 code — everything from Milestone 28 (PR
  review) through Milestone 32 (hardening) had never been committed
  until this session, so it was never deployable.
- **Git state, per explicit user instruction**: one commit was made
  (`864f5a7`, unrelated pre-existing Milestone 25A leftovers); the user
  then explicitly stopped further commits mid-session ("leave as-is,
  stop committing"). No further `git add`/`commit`/`push` was performed.
  The rest of Milestones 28–32's work remains staged-or-untracked;
  nothing has been pushed or deployed.
- **Fixed**: `frontend/vercel.json` (new) — a catch-all SPA rewrite to
  `index.html`. `frontend/` had no rewrite configuration at all; a
  production static host serves files as literally requested by
  default, so a hard refresh on a nested client-side route (e.g. a PR
  detail URL) would 404. Deploy configuration only, no application code
  changed.
- **New real-data test**: `frontend/src/pages/PRDetail.realdata.test.jsx`
  + `frontend/src/test/fixtures/real_pr_review_response.click_2202.json`
  — the exact, unmodified JSON body captured from a real `POST
  /review/pr` call (real clone, real Shakti LLM output) for
  `pallets/click#2202`, rendered through the real `PRDetail` component
  tree (only the network boundary mocked). Confirms the real verdict,
  every real changed file, and no fabricated risk/confidence language
  render correctly — closing the loop between "the backend produces
  this shape" and "the frontend renders it correctly" with real data.
- **Verified for real, beyond the 19-step journey's already-covered
  states**: malformed/unsupported real requests against the locally
  running backend (a nonexistent PR number, a malformed repository URL,
  a nonexistent repository) all returned clean `404`s with no leaked
  stack traces.
- **Not fixed, because nothing else was found**: every other real check
  performed this milestone passed without needing a code change.
- **Deployment not attempted**: no Render/Vercel dashboard access and no
  registered GitHub OAuth App exist in this environment; a precise
  deployment/env-var checklist is documented instead of a claimed
  deployment.
- 316 backend tests (unchanged — no backend code modified this
  milestone), 59 frontend tests (58 + 1 new); build and lint clean.

## 2026-08-12 (Milestone 5 — V1 Hardening & Real-World Validation)

Full detail: `docs/MILESTONE_5_HARDENING.md`. Real evaluation, not just
"tests pass" — 8 diverse real PRs run through the complete real pipeline
(real Shakti LLM call, after diagnosing and refreshing an expired
`SHAKTI_API_KEY`), critically read for usefulness, noise, and fabrication.

- **Fixed**: file/finding prioritization was nearly useless in practice
  — 87% of real files across the 8-PR sample tiered "Requires Immediate
  Review" (including a one-line doc typo fix), because
  `claimVocabulary.js` treated the whole `reach` module as risk-bearing.
  Narrowed to `contract_stability` + specific claims (including only
  `reach.expected_co_change_partner_missing` from `reach`); re-measured
  at 63%, with the typo fix now correctly clearing to 0. Frontend-only;
  the backend's coverage ledger has the identical issue and was
  deliberately left untouched (named as a separate, later finding).
- **Fixed, security**: removed `"null"` from the CORS origin allowlist
  (`src/api/app.py`) — it let a sandboxed-iframe attacker page make a
  credentialed, readable cross-origin request, not just the legacy
  `file://` case it was added for.
- **Fixed, real bug**: `PullRequestSummary`/`PullRequestDetail` gained a
  real `state` field; `PRHeader` no longer defaults to "Open" for a
  closed/merged PR (reachable via prev/next navigation or a stale
  bookmark).
- **Fixed, real UX gap**: a session expiring mid-browsing used to leave
  the sidebar stuck on a text error forever; now routes back to
  `LoginGate` (repos-fetch 401) or shows a real "Sign in again" action
  (`PRList`/`PRDetail`'s own 401s, via a new `EmptyState` `action` prop).
- **Fixed, approved explicitly given its protected history**:
  `llm_adapter.py` now logs the real exception server-side before
  swallowing it into `execution_boundary_failure` — one line, no change
  to any return value/signature. This is what an expired API key looked
  like with zero diagnostic trace before this fix.
- **Fixed, real false positive**: `response_validator.py`'s bold-balance
  check misread `` `**kwargs` `` (Python syntax inside backticks, found
  in real model output) as unbalanced Markdown bold. Now excludes inline
  code spans before counting, matching how fenced code blocks are
  already excluded from heading detection.
- **Not fixed, classified acceptable for V1**: no CSRF token on state-
  changing endpoints (no destructive actions exist yet to abuse);
  in-memory sessions; token-as-subprocess-argument during git clone;
  GitHub rate limits; React StrictMode's dev-only double-fetch on mount.
- **Reviewed, unchanged**: `pages/CommitReviewPage.jsx` (dead code, kept
  per instruction) — still fully functional, no regressions found.
- 313 → 316 backend tests, 41 → 58 frontend tests, all passing; build and
  lint clean. No V1 blockers found.

## 2026-08-11 (Milestone 4 of PR Review Migration — Product Frontend / PR Review Workspace)

- **The frontend's primary flow changed**: GitHub login → accessible
  repositories → open PRs → PR review workspace, with a persistent
  sidebar. The old commit-URL flow (`SearchPanel` + `POST /review`) is
  unchanged and still fully working, just no longer linked from the main
  UI — moved verbatim to `pages/CommitReviewPage.jsx`, reachable only at
  `/legacy/commit`.
- New frontend dependencies: `react-router-dom` (real URLs —
  `/r/:owner/:repo`, `/r/:owner/:repo/pull/:number` — shareable,
  back/forward works); `vitest` + `@testing-library/react` +
  `@testing-library/jest-dom` + `@testing-library/user-event` + `jsdom`
  (dev-only — this project's first frontend test infrastructure; there
  was none before this milestone).
- One small, additive backend touch, not review logic: `src/github/
  client.py`'s `get_pull_request`/`_pull_request_summary` now extract
  `additions`/`deletions`/`changed_files` — real GitHub fields already
  in the API response but previously unextracted. `PullRequestSummary`/
  `PullRequestDetail` (`src/api/models.py`) gained the matching optional
  fields, `None` by default. **Named limitation, not fixed**: GitHub's
  PR *list* endpoint never returns these three fields (only the
  single-PR endpoint does) — so PR list rows always show them as
  `None`; only the PR header (fetched via the single-PR endpoint) shows
  real values. Fixing this for the list would mean one extra GitHub API
  call per row (N+1) — deliberately not done.
- New library layer: `lib/authApi.js` (`fetchCurrentUser`,
  `fetchRepositories`, `fetchOpenPullRequests`, `fetchPullRequestDetail`,
  `logout`, `loginUrl` — every call `credentials: "include"`, so the
  session cookie rides along; the GitHub access token itself never
  appears in any response body the browser receives). `lib/api.js`
  gained `fetchPRReview` — `POST /review/pr` with the same retry-on-502
  behavior as the existing `fetchReview`, but its own independent
  request/message functions; `fetchReview`/`requestReview` (the old
  flow's) are untouched.
- New components: `Sidebar`, `RepositoryList`, `LoginGate`, `PRHeader`,
  `PRNavigation`, `ReviewLoadingState`, `EmptyState`, `ProseSection`,
  `SupportingDetails` (a collapsed-by-default accordion for What-changed-
  and-why / Open Questions / Manual Verification / Review Strategy /
  Minor Notes — each `<details>` only renders when its own section
  would actually show something, reusing the exact emptiness checks
  those components already make internally). New pages: `RepoWorkspace`
  (owns the open-PR list fetch per repository plus a session-only,
  in-memory review cache — a plain `Map`, no persistence, so navigating
  PR #5 → #6 → back to #5 doesn't re-run an already-completed ~90s
  review), `PRList`, `PRDetail`.
- Reused almost verbatim (already generic over `review_context`/
  `observations`, never assumed "commit"): `FileOverview`,
  `ReviewFindings`, `OpenQuestions`, `ManualVerification`,
  `ReviewStrategy`, `reviewContext.js`, `reviewTiers.js`,
  `claimVocabulary.js`, `textFormatting.jsx`. Two small, additive,
  backward-compatible prop extensions: `ExecutiveSummary` gained
  `showIdentity = true` (the PR workspace passes `false`, since
  `PRHeader` already shows repo/PR identity once — no metric has two
  homes); `FileOverview` gained optional `owner`/`repo`/`headSha` props
  enabling a real per-file GitHub link (`.../blob/<head_sha>/<path>` —
  the most specific correct URL constructible client-side without
  GitHub's own undocumented diff-anchor hashing).
- **Data integrity, checked file-by-file against this milestone's own
  rule**: every visible field traces to a real API response — no
  invented risk scores, confidence percentages, severity values,
  estimated review time, or fabricated file/PR statistics anywhere in
  the new code.
- 41 new frontend tests (this project's first-ever) across 9 files —
  `EmptyState`, `RepositoryList`, `PRNavigation` (prev/next boundary
  behavior, including a PR not present in the list at all),
  `PRHeader` (real stats shown when present, never a fabricated 0 when
  absent), `LoginGate`, `SupportingDetails` (each section's real
  emptiness check, collapsed-by-default), `PRList`, `PRDetail` (the
  header not waiting on the slow review; cache hit/miss behavior;
  real error rendering), and `App` (the auth gate itself — loading,
  login gate, authenticated shell, logout). All 313 backend tests still
  pass; the frontend build and lint are both clean.
- **Manual verification is honestly partial**, the same limitation
  class this migration has flagged since Milestone 2: no registered
  GitHub OAuth App or personal access token exists in this sandbox, so
  the live login → repo list → PR list → review flow could not be
  exercised end-to-end in a real browser against real GitHub data. What
  *was* verified for real: the backend serving a genuine `401` for
  `/github/me` when unauthenticated (confirmed via `curl` against a
  locally running server), and the frontend dev server/build/lint all
  clean. The authenticated states are verified by the 41 tests above,
  with the network layer mocked — the same discipline this project
  applies to every other external call it can't fully exercise live.
- Not deployed.

## 2026-08-09 (Milestone 3A of PR Review Migration — Authenticated Private-Repo PR Review)

- Closed the gap Milestone 2 named but deliberately left open: `POST
  /review/pr` can now review a **private** repository's PR, when the
  caller has a valid session. Authentication is additive, not required —
  a request with no session cookie behaves byte-identically to Milestone
  1 (re-verified live against `pallets/click#3704`: same base/head SHAs,
  same 10 files, same 291/165 diff totals).
- `src/api/session_store.py` gained `get_optional_access_token` — like
  `get_current_access_token`, but never raises. A missing cookie and an
  unknown/expired `session_id` both resolve to `None` identically: for
  this endpoint, invalid auth means "proceed unauthenticated," not "reject
  the request" (a public repo must keep working either way).
- `src/github/client.py` gained `get_pull_request_refs(token,
  repository_url, pr_number)` — an authenticated drop-in for `src/github/
  pr_resolver.py`'s `resolve_pull_request` (**untouched, Milestone 1
  frozen**), same exact output shape (`base_sha`/`head_sha`/etc.), able
  to see a private repo's PR the token has access to.
- `src/git/git_client.py`'s `clone_repository`/`fetch_ref` gained an
  optional `access_token=None` parameter. When present, both add `-c
  http.extraHeader="Authorization: Bearer <token>"` to the git
  invocation — **a header, not a token-embedded URL**. Two concrete
  reasons: `repository_url` stays clean in every error message this
  project already constructs, so a token can never leak into an API
  response; and git's own failure text echoes the URL, never a header,
  so a URL-embedded token would leak into git's stderr on an auth
  failure in a way a header cannot. **Residual risk, named not solved**:
  the header value is still a subprocess argument, visible via `ps`/
  `/proc/*/cmdline` for the life of the git process, and would appear in
  a raw traceback if the underlying `CalledProcessError` (not this
  project's own wrapping `CommitResolutionError`) were ever logged with
  full args. Avoiding that needs `GIT_ASKPASS`-based credential
  injection — more machinery than this milestone's scope.
- `src/pipeline/orchestrator.py`'s `run_pipeline_for_pr` gained optional
  `access_token=None`, threaded only to its own two direct network
  operations (`clone_repository`, `fetch_ref`) — never to `resolve_pr`,
  whose caller already chose (and closed over the token in, if needed)
  the right resolver. Confirmed unnecessary to thread further: every
  other git operation downstream (`get_pr_diff`, `get_merge_base`,
  `get_changed_files`, symbol-content reads, history walks) runs against
  the already-fetched local object store — no further network access, no
  further auth needed.
- `src/api/app.py`'s `get_pr_pipeline_runner` gained a `Depends
  (get_optional_access_token)` parameter and now picks the resolver at
  request time: `resolve_pull_request` (unauthenticated) when there's no
  token, an `get_pull_request_refs`-bound closure when there is.
  `review_pr()` itself, `review()`, `get_pipeline_runner()`,
  `run_pipeline_for_commit` — all untouched.
- 27 new tests: 5 `GitClient` (pure `_auth_args` construction + two real
  local clone/fetch calls proving the extra flag doesn't corrupt a normal
  invocation), 3 `session_store`, 5 `client.py` (`get_pull_request_refs`,
  mocked HTTP), 6 orchestrator (the core proof: a real local two-branch
  PR fixture with a spy on `_auth_args` showing a token reaches exactly
  the 3 real git calls and no more; simulated git/GitHub auth-failure
  paths confirming a token never appears in the resulting
  `CommitResolutionError`), 8 API-layer (resolver selection as a plain
  function call, real-cookie-parsing HTTP tests including the forged-
  session-falls-back-gracefully case, and confirming `POST /review` is
  unaffected by a valid session cookie riding along). All 311 tests pass
  (284 pre-existing + 27 new), zero regressions.
- **Verification is honestly partial, same as Milestones 2's**: no real
  private GitHub repository exists in this sandbox to test against, so
  "authenticated private PR review" is proven at the mechanism level
  (a real local git remote + a spy confirming the token reaches every
  git call that would matter for a real private repo) rather than against
  genuine private-repo GitHub data end-to-end.
- Not deployed. No frontend changes.

## 2026-08-09 (Milestone 2 of PR Review Migration — GitHub Auth + Discovery)

- Added GitHub OAuth login: `GET /github/login` (redirects to GitHub's
  authorize URL with a CSRF `state`, set via a short-lived `oauth_state`
  cookie), `GET /github/callback` (verifies `state`, exchanges `code` for
  a real access token, creates a session, redirects to `FRONTEND_URL`),
  `POST /github/logout`. No custom username/password system — GitHub is
  the only identity provider.
- **Access tokens never reach the frontend.** `src/api/session_store.py`
  is a new in-memory `dict[session_id → access_token]`; the browser only
  ever holds an opaque, random `session_id` cookie (`httponly`,
  `secure` — configurable via `SESSION_COOKIE_SECURE`, `samesite=none`
  since it must ride cross-origin `fetch()` calls from the frontend). A
  new dependency, `get_current_access_token`, is the single place a
  request's cookie is turned into a real token; every discovery route
  below goes through it and returns 401 for a missing or unknown session.
  **Known, deliberate limitation**: this store is in-memory only — a
  server restart drops every session, and it does not work across
  multiple worker processes. Matches this project's existing "no
  database anywhere" design; revisit if this needs to survive a redeploy
  or scale past one process.
- Added authenticated GitHub discovery: `GET /github/me`, `GET
  /github/repos` (the token's own accessible repos — owned, collaborator,
  or org member; respects GitHub's real permission model directly, no
  separate authorization logic of this project's own; not paginated past
  the first 100), `GET /github/repos/{owner}/{repo}/pulls` (open PRs),
  `GET /github/repos/{owner}/{repo}/pulls/{number}` (one PR's real
  metadata, including body). New module `src/github/client.py`. A repo
  the token can't see surfaces as a real `404` (GitHub's own semantics,
  not a 403 — GitHub deliberately doesn't confirm a private repo's
  existence to someone without access; this project just relays it
  rather than re-deriving its own authorization rule).
- New module `src/github/oauth.py`: `build_authorize_url`,
  `exchange_code_for_token`. Handles a real GitHub quirk directly:
  token exchange returns HTTP 200 with `{"error": ...}` in the body for
  a bad/reused code, not a non-200 status — checked explicitly, not
  assumed from the status code.
- **`src/github/pr_resolver.py` (Milestone 1) is completely untouched** —
  `POST /review/pr` still calls the unauthenticated resolver exactly as
  before. **Known, deliberate gap, not silently left**: a user can now
  discover a *private* repo's PR through the new endpoints, but
  `/review/pr` still can't actually review it — both the unauthenticated
  GitHub API call inside `resolve_pull_request` and the unauthenticated
  `git clone` itself would fail for a private repository. Flagged as
  expected follow-up work, out of this milestone's explicit scope
  (`/review/pr`'s logic was not to be modified).
- **One necessary shared-infrastructure change**: `CORSMiddleware`'s
  `allow_origins=["*"]` is incompatible with credentialed (cookie-
  bearing) requests — browsers reject the combination outright. Switched
  to an explicit allowlist (`FRONTEND_URL`, the deployed `playground/`
  Vercel URL, `"null"` for a `file://`-opened page) plus
  `allow_credentials=True`. `/review` and `/review/pr`'s own route
  handlers are untouched; this is the one shared config both new and old
  routes sit behind.
- New env vars (`.env.example`): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
  `GITHUB_OAUTH_REDIRECT_URI`, `FRONTEND_URL`, `SESSION_COOKIE_SECURE`.
- **Real-network verification is partial, honestly**: this sandbox has no
  registered GitHub OAuth App and no personal access token, so the full
  login→callback→discovery flow could not be exercised against real
  GitHub data end-to-end (the same class of limitation `SHAKTI_API_KEY`'s
  absence already caused for the LLM call). What *was* verified for
  real: `get_pull_request` against the real GitHub API with a
  deliberately invalid token returned a real, correctly-parsed `401`
  (`GitHubApiError(status_code=401)`) — confirming the request
  construction, headers, and error handling all work against the actual
  API, not just mocks. Logic correctness (field extraction, session
  isolation, 401/404 propagation, OAuth state/error handling) is covered
  by 46 new tests with the HTTP layer mocked, consistent with this
  project's existing convention for external network calls
  (`call_shakti`/`call_gemini`/Milestone 1's `pr_resolver` tests).
- 46 new tests (9 `session_store`, 6 `oauth`, 9 `client`, 22 `app.py`).
  All 284 tests pass (238 pre-existing through Milestone 1 + 46 new),
  zero regressions.
- Not deployed. No frontend changes — neither `playground/` nor
  `frontend/` can call any `/github/*` route yet, per explicit scope.

## 2026-08-09 (Milestone 1 of PR Review Migration — Backend PR Review)

- Added `POST /review/pr {repository_url, pr_number}` as a **separate**
  endpoint, alongside the existing `POST /review` — the commit flow is
  byte-for-byte unchanged (`review()`, `get_pipeline_runner()` untouched).
  A PR is reviewed as one synthetic diff: git's real three-dot
  (`base...head`) semantics, i.e. the diff against the merge-base of the
  two refs — not a naive two-dot diff against base's current tip, which
  would incorrectly include whatever the base branch did *after* the PR
  forked off it.
- `GitClient` gained three new methods, nothing existing touched:
  `get_merge_base(repo_path, ref_a, ref_b)`, `get_pr_diff(repo_path,
  base_ref, head_ref)` (literal `git diff base...head`), `fetch_ref(repo_path, ref)`
  (a PR's head — especially from a fork — isn't guaranteed present in the
  initial clone).
- `DatasetCollector._build_commit_change_set`, `_build_commit_diff_stats`,
  and `_build_commit_semantic_analysis` each gained one optional
  `parent_hash=None` override — generalizing a pattern the codebase
  already had (`GitClient.get_changed_files`/`get_diff_stats` already
  accepted an explicit `parent_hash`; this just threads it through). This
  was evaluated deliberately as the smallest safe change before
  implementation, rather than assumed: of the 8 `_build_commit_*`
  builders, only these 3 make a git call that derives "the old side" from
  a commit's own first parent; the other 5 either take no such ref or
  already treat their `commit_hash` argument as "as-of this point in
  time," which a PR's `head_sha` satisfies with zero changes.
  `_build_commit_metadata` is **not** reused for PRs — a PR's identity
  (title, body, author) comes from the GitHub API, not from any single
  commit's message.
- New package `src/github/pr_resolver.py`: `resolve_pull_request(
  repository_url, pr_number)`, an unauthenticated call to GitHub's public
  REST API resolving a PR number to real `base_sha`/`head_sha`/title/
  body/author/created_at. No OAuth in this milestone, by explicit scope —
  subject to GitHub's public rate limit (60 req/hour/IP). Needed an
  explicit `certifi` CA bundle (added to `requirements.txt`) rather than
  the platform default SSL context — this local environment has no usable
  CA trust store for raw `urllib` calls, the same class of issue already
  documented for Milestone 13's real Gemini call.
- New `src/pipeline/orchestrator.py` functions, entirely additive:
  `_pr_metadata(pr_info)`, `_build_pr_evidence(collector, repo_path,
  base_sha, head_sha)`, `run_pipeline_for_pr(repository_url, pr_number,
  execute, resolve_pr)`. `resolve_pr` is injected exactly the way
  `execute` already is — production wiring passes the real GitHub
  resolver, tests pass a stub against a real local repo fixture, no
  network involved in the test suite. Everything from `fuse_evidence`
  onward (Evidence Fusion, all 6 reasoning modules, `context_builder`,
  `prompt_builder`, the Adapter, the Review Engine) runs **completely
  unmodified** — the PR evidence dict is shaped identically to the
  commit-flow's, so the existing chain has no idea it's reviewing a PR
  instead of a commit.
- **Known, deliberate limitation, documented rather than fixed**:
  `_build_commit_file_history`/`_build_commit_co_change` treat their
  `commit_hash` argument as "this one entry is current, everything before
  it in the log is history." For a PR whose own commits touch the same
  file more than once, only the head commit is excluded — the PR's
  *other* commits are counted as historical churn rather than current
  change, mildly inflating `history.rapid_iteration`/`hot_file`-style
  claims. Fixing this needs those two methods to exclude a *set* of
  commits, not one; deferred rather than risking their tested
  single-commit behavior for a secondary signal. Single-commit PRs (the
  majority in practice) are unaffected.
- New models in `src/api/models.py`: `PRReviewRequest{repository_url,
  pr_number}`, `PRReviewResponse(ReviewResponse)` adding only `pr_number`,
  `base_sha`, `head_sha` — every other field is the exact same
  `ReviewResponse` shape a commit review returns, `commit_hash` set to
  the PR's `head_sha`.
- **Verified against a real, merged public PR** — `pallets/click#3704`
  ("Deprecate `isolated_filesystem` and document its limits," 1 commit,
  10 files). Real GitHub API resolution, real clone, real fetch, real
  three-dot diff. Local environment has no `SHAKTI_API_KEY`, so the final
  model call was stubbed; everything upstream of it is real. The real
  `git diff --numstat` totals (291 insertions / 165 deletions) matched
  GitHub's own reported PR stats (`additions: 291, deletions: 165`)
  exactly — an independent cross-check of the diff computation, not just
  an internal assertion.
- 21 new tests (4 `GitClient`, 8 `pr_resolver`, 3 `orchestrator`, 6 API) —
  the orchestrator test constructs a real local repo where the base
  branch advances *after* the PR forks and the PR itself has two commits
  touching the same file, directly proving three-dot semantics (the
  base's later commit never appears in the PR diff) and "complete PR
  diff, not just the latest commit" together, plus real added/deleted/
  renamed-file handling. All 238 tests pass (217 pre-existing + 21 new),
  zero regressions — the existing `POST /review` test class is completely
  unmodified.
- Not deployed — same undeployed status as Milestone 26's fix.

## 2026-08-09 (Milestone 27 — React Frontend Rebuild)

- Built a new React 19 + Vite app, `frontend/`, entirely separate from
  `playground/` (untouched, still the deployed Vercel site). Went through
  several redesign rounds against the same live backend, ending on a
  7-section layout — `ExecutiveSummary`, `CommitStats`, `FileOverview`,
  `ReviewFindings`, `OpenQuestions`, `ManualVerification`, `ReviewStrategy`
  — chosen to answer one question in under 30 seconds: is this commit
  safe, and what should I inspect next.
- The defining constraint, given directly by the user after an early
  draft used invented severity language: **every visible label must be
  traceable to a real backend fact** — no synthetic risk scores,
  confidence percentages, or time estimates. `frontend/src/lib/
  reviewTiers.js` implements this as deterministic rules over
  `review_context`/`observations` (see Milestone 26): `Requires Immediate
  Review` (a real risk-bearing claim on that file), `Standard Review`
  (changed, no risk-bearing claim), `Routine` (the backend's own coverage
  ledger already collapsed it) for files; `Critical`/`Medium`/`Low` for
  findings, based on whether the finding names a file with a risk-bearing
  claim — never on rank position. Both rules are rendered on-screen next
  to the labels they justify (`FILE_TIER_RULE`/`FINDING_TIER_RULE`), not
  hidden.
- `frontend/src/lib/reviewContext.js`/`claimVocabulary.js` derive
  everything else the UI shows straight from the API contract: per-file
  claims/gaps/line stats (`filesWithContext`), gaps aggregated by reason
  instead of repeated per file (`gapsByReason` — collapsed 12 individual
  gaps to 2 lines on a real `pallets/click` commit), and the routine/
  needs-attention split reusing the backend's own coverage ledger
  (`reviewStrategyGroups`) rather than a second UI-side heuristic.
- `frontend/src/lib/textFormatting.jsx` renders the model's prose as real
  React elements (bold/inline-code/lists) instead of literal markdown
  characters, via React's own child-escaping — no
  `dangerouslySetInnerHTML` anywhere.
- "Ink Ledger" visual design (hue-neutral ink palette, one indigo accent)
  produced by a multi-agent design workflow (3 directions, 3 judges,
  synthesis), citing Material 3/Linear/Vercel/GitHub/Stripe Dashboard as
  reference points per explicit instruction.
- Not deployed. `frontend/.env.local` (gitignored) points at
  `http://localhost:8020`; `playground/` remains the only frontend live
  on Vercel. `frontend/README.md` was still the unmodified Vite scaffold
  template until this documentation pass — corrected below.
- All 217 backend tests unaffected (frontend-only milestone). See
  Milestone 26 for the backend contract this UI consumes.

## 2026-08-06 (Milestone 26 — Review Context/Observations Exposure + Response Contract Softening)

- **Root-caused a live production bug**: the deployed backend was
  returning `502 the model did not produce a usable response` for almost
  all commits on a real public repository. Traced empirically (repeated
  identical requests, direct code reads of `app.py`/
  `response_validator.py`/`prompt_builder.py`) to Milestone 17B's
  Category B validation rejection (`literal_claim_id_leak`/
  `reserved_confidence_tier_self_tagging`) firing non-deterministically —
  GPT-OSS-120B has no fixed seed, so the identical request could pass or
  fail on different calls, exactly the systematic-but-stochastic leak
  behavior Milestone 16B's full-execution round already found and left
  unaddressed.
- A prompt-only fix was tried first and rejected on its own evidence: a
  rigorous 20-commit A/B test (identical prompt, before/after) showed 3
  commits flip fail→pass and 2 flip pass→fail — statistical noise, not an
  improvement — so the prompt change was reverted, per the explicit
  instruction to keep a fix only if it measurably helped.
- **Real fix, verified deterministic**: `response_validator.py` gained
  `sanitize_response(text)`, stripping only the reserved-confidence-tier
  self-tagging pattern (a known, mechanically-safe artifact) before the
  response is ever shown. `src/api/app.py`'s Category B hard-rejection
  path (`_PARSEABILITY_RELATED_RULES`/`_CONTRACT_VIOLATION_RULES`/
  `_has_contract_violation`) was removed entirely — `POST /review` now
  returns `502` only for a genuine `execution_boundary_failure` from the
  Adapter (ADR-015's own failure taxonomy), never for a content/format
  finding. Validation findings are still computed and attached
  (`ReviewResponse.validation`) for transparency, just never used to deny
  the response. Verified against 20 real commits on the same repository
  that originally failed: contract-violation rate dropped from 35% to 0%.
- **Backend API contract expansion (additive only)**: `POST /review` now
  also returns `review_context` (the Milestone 10A `ReviewContext` —
  commit summary, per-commit/per-file claims and gaps, coverage ledger)
  and `observations` (touched directories, file classification, change
  statistics/categories, extraction confidence, and a new `diff_stats`
  field). Both were already computed internally by the pipeline; this
  milestone is the first time they leave the process boundary. New
  Pydantic models in `src/api/models.py` (`Claim`, `Gap`, `CommitSummary`,
  `CoverageLedgerEntry`, `ReviewContext`, `ChangeStatistics`,
  `ExtractionConfidence`, `DiffStats`, `Observations`, etc.) mirror these
  shapes exactly; no existing field changed shape or meaning.
- Added `GitClient.get_diff_stats` (`git diff --numstat`) for real,
  objective per-file insertion/deletion counts — a `-` in git's own
  output (binary file) maps to `None`, never `0`, confirmed against a
  real null-byte binary file, not a printable-but-fake stand-in (the
  first attempt used a byte sequence git didn't actually treat as
  binary, caught before it was baked into a test). `DatasetCollector.
  _build_commit_diff_stats` and `orchestrator.run_pipeline_for_commit`
  wire it into `observations.diff_stats`.
- Test suite grew from 205 to 217 (`sanitize_response` tests, real
  `git diff --numstat` tests including the binary-detection case, a
  hand-verified real-repo assertion added to the existing end-to-end
  orchestrator test, and `review_context`/`observations` exposure tests
  in `tests/api/test_app.py`). Existing fixed-value tests were kept
  deliberately (they isolate plumbing/serialization, not real git
  behavior) alongside the new real-data tests, not replaced by them.
- Not deployed. The live Render backend still runs the pre-fix code as
  of this documentation pass — deploying was raised once, not
  reconfirmed, and this project does not deploy without explicit
  instruction each time.

## 2026-08-03 (Milestone 25A — Review Presentation Polish)

- `playground/app.js`: added `renderMarkdownLite`/`renderInlineMarkdown` —
  renders the model's actual markdown (bold, inline code, ordered/
  unordered lists) instead of showing literal asterisks/dashes, the
  concrete cause of review output looking like a raw `.md` file. Escapes
  raw text first; only ever wraps the escaped output in fixed, hardcoded
  tags, so model text can never inject an arbitrary tag. Verified with a
  direct XSS-style test — caught and fixed a flaw in the test's own DOM
  stub (didn't replicate real browser escaping) before trusting the
  result. The raw/unparsed-response fallback is untouched, still shown
  as-received.
- `playground/styles.css`: each of the five review sections is now its
  own light-blue-tinted card with soft elevation and a blue left accent
  border; Verdict given slightly more visual weight as the headline
  summary. Page background, form, and metadata strip shifted to match.
  Still within Milestone 23's constraint — no gradients, glassmorphism,
  or animation beyond the existing spinner.
- Verified against real saved API responses run through the actual
  `renderResult` function (a clean success, and a response with two real
  attached validation findings). All 205 backend tests still pass
  (frontend-only change).

## 2026-08-03 (Milestone 25 — Version 1 Deployment, live)

- Deployed the backend. **Railway was attempted first and abandoned**:
  the service built and ran correctly (confirmed clean `Uvicorn running
  on http://0.0.0.0:$PORT` startup), but every real `POST /review`
  request failed with `404 could not clone repository` on a plain
  public repo URL that cloned instantly on a local machine. Tested and
  ruled out both leading hypotheses directly via Railway's own build
  logs: `git` and `ca-certificates` were both already present in the
  build image. Could not isolate the true cause further — Railway does
  not provide a way to get a shell inside the actual running container
  (confirmed: `railway shell`/`railway run` execute locally with the
  project's env vars injected, not inside the deployed container).
- Deployed to **Render** instead with the same code, same
  `SHAKTI_API_KEY`, same start command — worked correctly on the first
  real request. Live at `https://intent-aware-self-healing.onrender.com`.
- Deployed the frontend to **Vercel** (Root Directory `playground/`,
  Framework Preset "Other," no build step). Live at
  `https://intent-aware-self-healing.vercel.app/`.
- Updated `playground/config.js`'s `API_BASE_URL` to the Render URL
  (confirmed with the user before editing; committed and pushed as its
  own commit, separate from this milestone's other work).
- Verified end-to-end through the actual live, deployed UI: a real
  repository submitted through the Vercel frontend produced a complete,
  correctly rendered review from the Render backend.
- The `Procfile` (Milestone 24A) is unused by the current deployment
  (Render's start command is set directly in its dashboard) but left in
  place. The Railway project was left running, not deleted.

## 2026-08-02 (Milestone 24A — Version 1 Deployment Implementation)

- Moved the frontend's API base URL out of `app.js` into a new
  `playground/config.js` (`window.API_BASE_URL`), loaded before `app.js`
  in `index.html`. No deployment URL is hardcoded into the repository;
  pointing the frontend at a deployed backend is a one-line edit to this
  one file.
- Added `Procfile` (repo root): `web: uvicorn src.api.app:app --host
  0.0.0.0 --port $PORT` — required for Railway to bind reachably; the
  previously-documented run command binds to `127.0.0.1` by default.
- Added `.env.example` (repo root): documents `SHAKTI_API_KEY` (required)
  and `GEMINI_API_KEY` (not required for deployment), no real values.
- No backend functionality changed. Verified: all 205 backend tests still
  pass; the `config.js`/`app.js` wiring verified directly (Node harness);
  all four response states (success, validation-flagged, 404, 502)
  re-confirmed against the real API. `.env` confirmed still gitignored.

## 2026-08-02 (Milestone 24 — Version 1 Deployment Planning, no code)

- Findings-only deployment plan for Vercel (frontend) + Railway (backend).
  Confirmed no backend code references `localhost`; the request path
  writes nothing to disk beyond an ephemeral `tempfile.TemporaryDirectory()`
  per request; `GitClient` only performs read-only git operations. No
  architectural blockers found — see Milestone 24A for the implementation.

## 2026-08-02 (Milestone 23 — Version 1 Product UI)

- Replaced `playground/index.html`'s original Milestone 16A dev-tool
  styling with the Version 1 shipping interface, split into
  `playground/index.html` (structure), `playground/styles.css` (neutral,
  typography-first visual system — no gradients, glassmorphism, or
  animation beyond one loading spinner), and `playground/app.js` (vanilla
  JS). No backend code changed; CORS policy and endpoint surface unchanged
  from Milestone 16A.
- One workflow: repository URL, optional commit hash, one Review Commit
  button, one output region cycling through exactly four states (idle,
  loading, error, result). Five sections render in the backend's own
  order/labels; an unparsed response shows as raw text with a plain note,
  not as an error. A quiet secondary note appears only when
  `validation.findings` is genuinely non-empty. The Review Engine's
  always-empty `findings` field is deliberately not displayed.
- All four real HTTP failure modes (404/500/502/504) mapped to plain-
  language messages; the raw `detail` string and any stack trace are
  never shown.
- Verified end-to-end against the real, running API: a successful parsed
  response with no validation findings (a real poetry commit); a
  successful response with two attached `module_jargon_leak` findings (a
  real fastapi commit); a real `502` contract-violation rejection (a real
  black commit); and a real `404` for an unresolvable repository path —
  all four states confirmed rendering correctly. All 205 backend tests
  still pass (no backend code touched).
- Updated `playground/README.md` to describe the new file split and
  Version 1 scope.

## 2026-08-02 (Milestone 22A — Fix the Final Release Blocker)

- Closed the one blocker Milestone 22 identified. `src/git/git_client.py`'s
  `get_co_change_history` now passes `--follow` to its single `git log`
  call — the same one-line change already applied to `get_file_history`
  in Milestone 19.
- Tests: 2 new in `tests/git/test_git_client.py`
  (`GetCoChangeHistoryFollowTests`) — a renamed file's co-change history
  now includes its pre-rename co-committed sibling; a never-renamed
  file's co-change history is unchanged. 205 tests total (203 + 2 new),
  zero regressions.
- Verified against the original reproduction: `get_co_change_history` on
  the real `rename_reorg` (click) commit now returns 6 historical entries
  (was 0); re-running the real production reasoning pipeline on the same
  commit no longer emits `reach.no_historical_coupling` at all.
- Backend freeze confirmed complete — no further release blockers open.

## 2026-08-02 (Milestone 22 — Final Backend Freeze Audit, verification only)

- Re-applied a stricter 5-criteria release-blocker test (reproducible,
  real-user-affecting, affects correctness/reliability/availability/data
  integrity, not already an accepted V1 limitation, would justify
  delaying release) to every finding from Milestones 18/20 — all failed
  Criterion 4 (already explicitly dismissed on the record) and did not
  resurface.
- Re-verified Milestone 19's `_CLAIM_IDS` fix against a fresh grep of
  `src/reasoning/modules/*.py` — byte-for-byte identical, no transcription
  errors.
- Found one new instance of the same missing-`--follow` defect class in
  `GitClient.get_co_change_history` (not covered by Milestone 19's fix,
  which only touched `get_file_history`). Confirmed directly against the
  real production reasoning pipeline on the `rename_reorg` (click) commit:
  emitted a false `reach.no_historical_coupling` claim at
  `confidence: "observed"`.
- **Verdict: NOT READY.** No code or docs modified in this milestone
  (audit-only scope) — see Milestone 22A for the fix.

## 2026-08-02 (Milestone 21 — Product Definition, no code)

- Findings-only pass defining the product as it exists today: what a user
  receives (a five-section triage review of one commit), the primary user
  (backend engineers reviewing pull requests in Python codebases, given the
  symbol-level semantic evidence is Python-only), the problem solved, the
  first-time-user workflow end to end, the deliberate Version 1 non-goals
  drawn from `PROJECT.md`, the strongest technical differentiator
  (deterministic evidence kept separate from the LLM's narrowed triage
  role, backed by a deterministic leak validator), and a 25-word
  description. No code, prompt, architecture, or documentation changed; no
  future work proposed.

## 2026-08-02 (Milestone 20 — Final Release Audit, verification only)

- Fresh, skeptical audit before tagging Version 1: re-traced the request
  lifecycle, re-read all core docs plus `DECISIONS.md`, reconfirmed both
  Milestone 19 fixes intact (203/203 tests).
- Found one reproducible bug meeting the full reproducible/user-visible/
  correctness/availability/reliability bar: the root-commit `IndexError` in
  `_build_commit_semantic_analysis` (known since Milestone 14B), masked as
  a misleading 404.
- Found three hidden architectural inconsistencies: `run_full_pipeline.py`
  and `src/api/app.py` now call two different models with no
  reconciliation; the API's 90s request timeout is shorter than
  `shakti_execute.py`'s own 120s internal HTTP timeout; and
  `response_parser.py` keeps the *last* duplicate section heading while
  the validator's own `duplicate_section_heading` message claims "only the
  first is used."
- Found two doc-vs-implementation disagreements, both a direct consequence
  of Milestone 19 being scoped to exclude documentation — resolved in this
  same documentation pass (see below).
- Found one dead-in-effect function: `review_engine.py`'s
  `_evaluate_response(response)` ignores its own argument and always
  returns `[]`, executed on every request.
- Found one production-critical test gap: `gemini_execute.py`/
  `shakti_execute.py` — the actual real-provider HTTP integration code,
  one of which is what every real production request executes — have zero
  automated tests.
- **Verdict: "I would tag this repository as Version 1."** No code or docs
  modified in this milestone.

## 2026-08-02 (Documentation pass — resolving Milestone 19's doc staleness)

- Milestone 19 (below) was explicitly scoped to exclude documentation
  updates; Milestone 20's audit found the resulting staleness and this
  pass corrects it, alongside adding the missing Milestone 18/19/20/21
  entries themselves.
- `docs/CURRENT_STATE.md`: corrected the `get_file_history` "not yet
  fixed" note (Milestone 8 section) and the `literal_claim_id_leak`
  "10 claim-id prefixes" description (Milestone 17A section) to point to
  Milestone 19's fixes; corrected the claim that `src/git/exceptions.py`
  "exists but is empty" — the file does not exist in the repository.
- `docs/modules/git_client.md`: same two corrections (the `--follow` gap
  is fixed; the `src/git/exceptions.py` claim removed) in its Future
  Improvements section.
- `docs/ARCHITECTURE.md`: corrected the `src/pipeline/` description —
  `shakti_execute.py` is no longer "used only for the Milestone 16B
  benchmark"; it is `src/api/app.py`'s production default as of the
  Milestone 16B full-execution round, and `run_full_pipeline.py`'s
  continued use of `call_gemini` is now noted as an unreconciled
  divergence rather than left implicit.
- `docs/MILESTONES.md` / `docs/CURRENT_STATE.md`: added the missing
  Milestone 18 (Release Readiness), 19 (Release Blockers), 20 (Final
  Release Audit), and 21 (Product Definition) entries — none of the four
  had any documentation trail before this pass.

## 2026-08-02 (Milestone 19 — Release Blockers: fixed)

- Closed exactly the two release blockers Milestone 18 identified. No
  architecture, cleanup, refactoring, or unrelated changes.
- **Blocker 1**: `src/response_validation/response_validator.py`'s
  `_CLAIM_ID_PREFIXES` (10 prefixes + a generic `[a-z][a-z_]*` suffix
  wildcard) replaced with `_CLAIM_IDS` — the complete, exact enumeration
  of all 34 claim-id strings actually emitted by
  `src/reasoning/modules/*.py` (re-confirmed via direct grep), matched by
  exact alternation. Every existing legitimate detection preserved; the
  false-positive class (ordinary filenames like `documentation.md`,
  `structure.py`) eliminated.
- **Blocker 2**: `src/git/git_client.py`'s `get_file_history` now passes
  `--follow`. No-op for never-renamed files (verified by test); renamed
  files now have history correctly traced through the rename, and every
  field derived from the same call (`recent_commit_count`,
  `author_commit_count`, `is_first_touch_by_author`) inherits the fix
  automatically, exactly as ADR-009/ADR-010 anticipated.
- Tests: 2 new in `tests/response_validation/test_response_validator.py`;
  a new file, `tests/git/test_git_client.py` (3 tests — `GitClient`'s
  first-ever test suite, using a real hermetic temp repo rather than
  mocks). 203 tests total (198 + 5 new), zero regressions.
- Regression cases confirmed directly against real data: the real
  `mixed_doc_and_code` (click) response now validates `outcome: clean`
  (was `invalid`); the real `rename_reorg` (click) commit's renamed file
  now reports `is_first_appearance: false` (was `true`).
- Per this milestone's explicit scope, no documentation was updated as
  part of it — see the dedicated documentation-pass entry above for the
  resulting staleness and its resolution.

## 2026-08-02 (Milestone 18 — Release Readiness Audit, findings only)

- Full release-readiness audit: read `ARCHITECTURE.md`/`CURRENT_STATE.md`/
  `MILESTONES.md`/`CHANGELOG.md` in full, traced the real `POST /review`
  request lifecycle stage-by-stage against actual source, ran a dead-code
  sweep. No code or docs modified.
- Found two release blockers: the response validator rejecting factually
  correct reviews mentioning ordinary filenames (`documentation.md`), and
  `GitClient.get_file_history` missing `--follow`, producing a misleading
  "new file" claim in real, delivered GPT-OSS-120B review content for a
  renamed file.
- Found and explicitly labeled non-blocking: the CLI/API model divergence
  (`run_full_pipeline.py` vs. `src/api/app.py`); the API/Shakti timeout
  mismatch; the parser-vs-validator duplicate-heading inconsistency
  (never observed in ~48 real responses); the root-commit `IndexError`;
  the Review Engine's permanently-empty `findings`; the lack of prompt
  truncation/context-window handling.
- Confirmed dead code: `DatasetCollector._build_commit_identity`,
  `DatasetCollector._build_commit_artifacts` (both unused), and
  `_PARSEABILITY_RELATED_RULES` in `src/api/app.py` (unused constant).
- Recommendation: **NOT READY**, pending the two blockers — see
  Milestone 19.

## 2026-08-02 (Milestone 16B — full 24-commit execution + production model swap)

- **Production model swap** (an explicit, in-milestone user decision, not
  part of the original evaluation-only scope): `src/pipeline/shakti_execute.py`'s
  `SHAKTI_MODEL` changed from `llama3_3` to `openai/gpt-oss-120b`; the
  request no longer sends a deployment-specific `id` header (not required
  for this model). `src/api/app.py`'s `get_pipeline_runner` now wires
  `execute=call_shakti` instead of `execute=call_gemini`. **GPT-OSS-120B via
  Shakti Studio is now the real production model** for `POST /review`;
  Gemini is no longer called anywhere in the shipped path (`gemini_execute.py`
  is unchanged and still callable, just unused). All 198 pre-existing tests
  pass unmodified.
- Ran the full frozen 24-commit Milestone 16B corpus (12 categories × 2, 12
  repositories: click, flask, pytest, requests, django, numpy, httpx,
  sqlalchemy, poetry, black, fastapi, jinja) fresh against the new
  production pipeline, and fact-checked every response against the real
  `git show` diff.
- **A partial run of this same corpus was discarded mid-milestone**: an
  earlier attempt reused 10 commits from Milestone 15D's `eval_results_v3`
  to conserve Gemini's daily quota, but those 10 records were found to
  have been generated under an earlier revision of Prompt v1 (missing the
  heading-format instruction) — invalid as "current production pipeline"
  evidence. The production model swap made this moot by requiring a full
  fresh 24-commit run regardless.
- **Finding: internal-terminology leakage is systematic for GPT-OSS-120B
  under Prompt v1**, per the workflow's own threshold (3+ commits, 2+
  repositories). `terminology_leak` fired on 9/24 commits across 9/12
  repositories, several as verbatim internal claim-id strings. `over_warning`
  (8/24, 6 repos), `semantic_padding` (5/24, 5 repos), and `verbosity`
  (5/24, 3 repos) also cross the threshold; `missed_issue` (2/24, 2 repos)
  and `hallucination` (1/24, 1 repo) do not.
- **Cross-checked against the live Response Validation Layer** (Milestone
  17B) on the 9 leaking responses: 3 are hard-rejected (`502`,
  `literal_claim_id_leak`), 4 more are flagged but still delivered (`200`,
  `module_jargon_leak`), and 2 return `outcome: clean` — no validator
  signal at all. **6 of 9 real leaks (67%) would reach an actual end user
  today.**
- No prompt, validator, or jargon-pattern change was made in response to
  this finding — per this milestone's explicit "evidence collection only"
  instruction. No ADR was touched.

## 2026-08-01 (Milestone 17B — Response Validation Layer: integration)

- Wired the Milestone 17A validator into `POST /review`: pipeline order is
  now `run_adapter` → `run_review_engine` → `parse_review_sections` →
  `validate_response` → API response, run on the exact `response` text
  returned in `review.raw`. No prompt, parser, Review Engine, Adapter,
  reasoning-module, or `response_validator.py` code was touched.
- **Found a genuine architectural conflict during integration, not
  before it, and stopped to report it rather than resolving it silently**:
  Milestone 14B already decided a response missing sections is a
  recoverable condition (`parsed: false`, still `200`), while 17A's
  `missing_section` rule is `ERROR`-severity and the original "invalid →
  reject" instruction would have silently reversed that decision and broken
  an existing, passing test.
- **Resolved by explicit user decision**: findings split into Category A
  (`missing_section`, `unclosed_code_fence` — exactly what `parsed: false`
  already represents; never rejected, findings attached instead) and
  Category B (`literal_claim_id_leak`, `reserved_confidence_tier_self_tagging`
  — genuine contract violations Milestone 14B never addressed; rejected
  with `502`, the first case in this project where a generated response is
  never returned to a client). Category B takes precedence when both fire
  together. This preserves Milestone 14B's original layering (parsing
  answers structural-interpretability; the validator answers
  contract-compliance) rather than letting the newer component silently
  override the older decision.
- **API schema**: `ReviewResponse` gains one new optional field,
  `validation: ValidationResult | None = None` — `None` when there are no
  findings, populated (with `outcome` + `findings`) whenever there are,
  including for non-rejected Category A cases. Additive only; no existing
  field renamed, removed, or restructured.
- **Verified**: 14 new tests
  (`tests/api/test_app.py::ResponseValidationIntegrationTests`) — clean,
  flagged, both Category A rules individually, both Category B rules
  individually (rejected, no `review` body ever returned), Category B
  precedence over co-occurring Category A findings, validator invocation
  with the exact raw text (spied), validator-exception propagation as an
  unhandled server error, and full backward-compatibility of every
  pre-existing field. **All 9 pre-existing API tests pass unmodified** — none
  needed to change. All 198 tests across the repository pass (184
  pre-existing + 14 new), zero regressions.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`.

## 2026-08-01 (Milestone 17A — Response Validation Layer: implementation)

- Implemented `docs/research/response_validation_layer_design.md` exactly,
  as a standalone component only — no wiring into `POST /review` yet (that's
  Milestone 17B). No prompt, parser, Review Engine, Adapter, or
  reasoning-module code was touched.
- Built `src/response_validation/response_validator.py` (new package): one
  public function, `validate_response(response_text) -> dict`. Deterministic,
  side-effect-free, independent of any LLM — response text only, no
  evidence/Claims/Gaps access, never logs/prints/raises/mutates/sanitizes.
- Implemented all 11 catalogued rules, none invented beyond the approved
  design: 4 Formatting (`missing_section` ERROR; `duplicate_section_heading`,
  `sections_out_of_order`, `unknown_heading` WARNING), 3 Internal terminology
  (`literal_claim_id_leak` ERROR, anchored on the exact 10 claim-id prefixes
  derived from `src/reasoning/modules/*.py`; `reserved_confidence_tier_self_tagging`
  ERROR, the 4 words `FORBIDDEN BEHAVIORS` reserves for Claims, carefully
  distinguished from the 4 allowed uncertainty terms; `module_jargon_leak`
  WARNING, a growable phrase list seeded from Milestone 16B's real leaks), 4
  Structural (`empty_section_body`, `duplicated_paragraph`,
  `malformed_markdown` WARNING; `unclosed_code_fence` ERROR — implemented via
  a fence-aware heading scanner so an unclosed fence naturally cascades into
  `missing_section` findings alongside the root-cause finding, both
  reported).
- Reused `src/api/response_parser.py`'s already-public `SECTION_KEYS`
  constant without modifying that module at all; implemented a private,
  independent heading-scan helper rather than touching the parser's private
  internals.
- **Verified**: 75 new tests (`tests/response_validation/test_response_validator.py`)
  — every rule covered positively and negatively, all 10 claim-id prefixes
  individually tested plus confirmed non-flagging of real code references
  (`numpy.pad`, `self.band.id`), all 4 reserved words individually tested
  plus confirmed non-flagging of the 4 allowed uncertainty terms, the
  unclosed-fence cascade tested explicitly, combined multi-violation cases,
  determinism, non-mutation, and defensive input handling. All 184 tests
  across the repository pass (109 pre-existing + 75 new), zero regressions.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`.

## 2026-08-01 (Milestone 17 — Response Validation Layer: design only)

- Delivered `docs/research/response_validation_layer_design.md`, answering
  Milestone 16B's root-cause recommendation with a full design: a new,
  deterministic, post-Review-Engine layer inspecting response text only (no
  evidence, no second LLM call) for formatting compliance, internal-
  terminology leaks, and structural well-formedness. Covers placement
  (outside the Review Engine and outside `response_parser.py`, justified via
  the same elimination test used throughout this project's ADRs),
  input/output contract, a full validation catalogue split into Formatting/
  Internal terminology/Structural, a per-rule severity model
  (ERROR/WARNING, reject/sanitize/log-only), and a minimal architecture
  proposal (one new package, `src/response_validation/`, one public
  function, zero modified files).
- No code, prompt, parser, or ADR changes were made — design review only,
  per explicit instruction. Implementation is named as the next milestone.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`.

## 2026-08-01 (Milestone 16B execution — three-model benchmark + GPT-OSS prompt calibration)

- Ran the Milestone 16B evaluation workflow's first 6-commit batch (django,
  numpy, httpx, sqlalchemy, poetry) against three alternative models via
  Shakti Studio's OpenAI-compatible API: Llama 3.3 70B Instruct, DeepSeek
  V3, GPT-OSS-120B. No pipeline/prompt/evaluation-logic code changed to run
  this; only `src/pipeline/shakti_execute.py` (new, additive, Llama 3.3) and
  two scratch-only equivalents (kept outside `src/` per that round's
  explicit instruction) were added.
- Found each model has a genuinely different, non-dominant trade-off
  profile across structural reliability, uncertainty-vocabulary use,
  internal-terminology leak rate, length-risk scaling, and technical depth —
  no single model wins cleanly on every axis.
- **Reopened `SYSTEM_PROMPT` twice after Milestone 15E's freeze**, each time
  explicitly justified against the freeze's own four-condition test on real
  GPT-OSS-120B evidence: (1) an explicit Markdown-heading instruction,
  closing a genuine specification gap — GPT-OSS-120B went from 0/6 to 6/6
  heading compliance, held across two independent re-runs, zero regression;
  (2) two additive counter-examples for internal-terminology leaks, seeded
  from observed phrases — reduced but did not eliminate leaks; the
  *identical* prompt produced different leak outcomes across consecutive
  re-runs (0/6 then 1/6), and suppressing one jargon phrase caused a
  differently-worded variant to appear instead.
- **Root-cause investigation** (no further prompt changes) concluded the
  heading gap was genuinely deterministic and is now durably closed; the
  terminology-leak family is stochastic, proven by identical-prompt/
  different-outcome evidence, and **Prompt v1 has reached diminishing
  returns on this failure family for GPT-OSS-120B**. Recommended a
  deterministic post-processing check as the next engineering investment,
  not further prompt iteration — see Milestone 17.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`.

## 2026-07-31 (Milestone 16A/16B — Review Playground + Evaluation Workflow design)

- Per explicit instruction: product validation before product polish. Split
  into a minimal internal tool (16A, built) and a structured evaluation
  workflow design (16B, design only — not executed).
- **16A**: built `playground/index.html` — a single, self-contained,
  dependency-free static HTML/CSS/vanilla-JS page (no framework, no build
  step, no new Python package) replacing curl/Postman for `POST /review`:
  repository URL field, optional commit hash field, Analyze button, loading
  state, and formatted rendering of the five review sections (or the raw
  response, when unparsed). The one necessary backend touch:
  `src/api/app.py` gained `CORSMiddleware` (`allow_origins=["*"]`) so a
  `file://`-opened page can reach the API — transport-level permission, not
  new logic; the endpoint surface is still exactly `POST /review` and `GET
  /health`, unchanged from Milestone 14B. Verified live: `/health` responds
  and a CORS preflight from a `file://`-style origin returns the expected
  `access-control-allow-origin: *` header. All 109 tests still pass.
- **16B**: delivered `docs/research/evaluation_workflow.md` — a repeatable
  methodology for a future ~24-commit evaluation (12 categories across 7-8+
  repositories, up from Milestone 15's 10 categories across 4), a
  structured per-commit JSON recording schema extending the already-proven
  rubric with one new `failure_tags` field for cross-round aggregation, and
  an explicit rule mapping aggregated results onto Milestone 15E's
  four-condition freeze test (a tag must recur on 3+ commits across 2+
  repositories to count as systematic; any resulting wording change must be
  re-validated against the same frozen corpus). No evaluation was executed
  and no code was written for 16B — design only.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`.

## 2026-07-31 (Milestone 15E — Freeze Prompt v1)

- Closed the full Milestone 15/15B/15C/15D arc. Summary: semantic-analysis
  padding 5/10 → 0/10; review length scales proportionally with commit
  complexity; the 15B "nothing requires special attention" regression was
  largely recovered in 15D (8/10 commits fully recovered or held clean); the
  two remaining differences (dependency-update co-change nudge partially
  reappearing, Requests test-only missing-test-case gap staying absent) are
  isolated edge cases, not systematic failures. No architecture changed
  throughout; all 109 tests passed at every step.
- **Decision: `SYSTEM_PROMPT` is frozen as Prompt v1**, under the same
  discipline this project applies to every ADR — frozen until evidence
  justifies revision. Recorded the exact four-condition test a future
  revision must satisfy: (1) observed in real usage/production evaluation,
  not synthetic testing; (2) repeatable across multiple commits; (3) a
  systematic failure, not expected model variance; (4) a proposed fix
  demonstrably verified not to introduce a larger regression, using the same
  evaluate-then-re-validate discipline as Milestones 15-15D.
- **Prompt Engineering is considered finished** as a distinct workstream as
  of this milestone. No prompt or code changes were made in this milestone.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`.

## 2026-07-31 (Milestone 15D — Final Prompt Calibration)

- Diagnosed the exact regression Milestone 15C found: Milestone 15B's
  "nothing requires special attention" clause only distinguished between a
  headline concern and nothing, giving no permission for legitimate modest
  observations, and let that conclusion become available as a shortcut
  before the reasoning sequence's evidence-checking steps actually ran.
- Applied one further additive edit to `SYSTEM_PROMPT` section 3 in
  `src/prompt/prompt_builder.py`, replacing only that clause: every point
  that would reasonably change how the reviewer evaluates or follows up on
  the commit must now be included, even if modest, and "nothing requires
  special attention" is gated on every concern already being fully covered
  by the Verdict and What-changed-and-why sections. No other line changed.
  All 109 tests still pass.
- Re-ran the identical 10 Milestone 15 commits. 8 of 10 fully recovered or
  held clean; semantic-analysis padding improved further (0/10); trivial
  commits stayed concise while only commits needing restored content grew
  back toward their original length. The Flask refactor and Flask
  large-multi-file commits both recovered strong, substantive findings, not
  always via the identical original framing — consistent with ordinary
  non-deterministic generation.
- Two residual issues confirmed, both narrower than the original
  regression: the dependency-update co-change nudge partially reappeared;
  the Requests test-only missing-test-case gap remained permanently absent
  (present both before and after this change, so not something this edit
  caused).
- Recommended one more narrow wording adjustment as a possible next step;
  the user chose to freeze instead — see "Prompt v1 frozen" above.

## 2026-07-31 (Milestone 15C — Prompt Validation: findings only)

- Re-ran the identical 10 Milestone 15 commits against the Milestone 15B
  prompt with no prompt or code changes. Semantic-analysis padding and
  length-scaling both validated cleanly. The third change regressed:
  "nothing requires special attention" caused three commits with legitimate
  moderate-value findings to collapse to "nothing," and softened the single
  most valuable finding from the whole Milestone 15 sample (a real Flask
  backward-compatibility break) into a materially weaker point.
- Delivered a "do not freeze yet" recommendation with the exact regressed
  commits and root-cause diagnosis named.

## 2026-07-31 (Milestone 15B — Prompt Calibration)

- Implemented the smallest possible fix for the three product issues
  Milestone 15's real-commit evaluation confirmed, per explicit instruction:
  not a prompt redesign, no new ADR-013 sections, no Prompt Builder logic
  changes, no Review Engine changes, no new deterministic modules,
  uncertainty vocabulary unchanged.
- Judged all three issues solvable primarily through prompt wording (the
  Claims/Gaps data was never wrong — only the model's judgment about what to
  surface from it), with one honest caveat: verbosity scaling can be
  strongly nudged by wording but not mechanically enforced without Prompt
  Builder logic these constraints forbid.
- Three purely additive edits to `SYSTEM_PROMPT`'s `OUTPUT FORMAT` in
  `src/prompt/prompt_builder.py` — zero existing lines removed or reworded:
  a length-proportionality sentence reusing the existing `OBJECTIVE`
  paragraph's "cost" framing (verbosity); two sentences in section 3
  explicitly legitimizing "nothing requires special attention" as a valid
  answer (over-warning); a relevance gate added to section 4 using the
  exact observed semantic-analysis-padding pattern as its own counter-example
  (Open Questions padding).
- Explicitly named, not glossed over, the regression risks: permitting
  "nothing requires attention" could make the model less likely to surface a
  genuinely subtle concern on a commit that only looks safe; the Open
  Questions relevance gate could cause over-generalization, dismissing a
  gap that matters in a rare case; the verbosity instruction anchors on
  "complexity and risk" rather than diff size specifically to avoid
  under-writing a small-but-dangerous commit, but wording cannot force that
  distinction every time.
- **Verified**: all 109 existing tests pass unchanged — the edit is purely
  additive, so every exact-substring fidelity test from Milestone 10B's
  fidelity pass still holds.
- **Not done in this milestone**: no re-validation against real commits —
  the Milestone 15 10-commit sample was not re-run against the new prompt.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, including a
  retroactive Milestone 15 (evaluation findings) entry.

## 2026-07-31 (Milestone 15 — Real-world Pipeline Evaluation: findings only)

- Ran the real pipeline (real Gemini calls) against 10 hand-selected real
  commits across 4 public repos (`pallets/click`, `pallets/flask`,
  `pytest-dev/pytest`, `psf/requests`), covering 10 distinct commit
  categories, evaluated purely as a real early user reading each review —
  no implementation inspection, no ADR comparison.
- Zero hallucinations found across the sample after spot-checking every
  notable claim against the real diffs, including two independently
  verified high-value findings: a real backward-compatibility break in
  Flask's `RequestContext` alias (a 36-file refactor) and two unrelated
  Click commits where the model caught a genuine changelog/behavior
  contradiction. No internal claim-id leaks recurred (Milestone 13's single
  example did not repeat in this sample).
- Confirmed three recurring product issues, prioritized by user impact:
  generic "no semantic analysis for non-Python files" padding in Open
  Questions (5/10 commits); a real-but-minor deterministic signal elevated
  to a headline concern on an otherwise safe dependency bump; comparable
  prose density on trivial commits and a 36-file refactor.
- No code written — findings/prioritization only. See Milestone 15B above
  for the resulting fix.

## 2026-07-31 (Milestone 14B — MVP API implemented)

- Per explicit instruction, this milestone implemented Milestone 14's proposal
  exactly as agreed, with four decisions fixed up front: use FastAPI; expose
  exactly `POST /review` and `GET /health`; keep the existing pipeline
  completely unchanged; no auth/databases/queues/retries/caching/provider
  abstraction/deployment concerns. No ADR was touched. The Adapter and Review
  Engine were not redesigned — `run_adapter`/`run_review_engine` are called
  exactly as Milestone 11A/12 left them.
- **Refactored the orchestration.** `run_full_pipeline.py`'s inline `main()`
  logic is now `src/pipeline/orchestrator.py`'s `run_pipeline_for_commit(
  repository_url, commit_hash, execute) -> dict` — a plain function, no class,
  matching this project's established data-contract convention. It knows
  nothing about any specific provider (`execute` is a required parameter, no
  default, mirroring `run_adapter`'s own signature discipline) and raises a
  new `CommitResolutionError` when the repository can't be cloned or the
  target commit can't be resolved, giving the API a single, clean exception to
  map to a 404. `run_full_pipeline.py` is now a thin CLI wrapper around it,
  the same thinness `main.py` already has around `DatasetCollector`. The real
  Gemini `execute` implementation (`call_gemini`/`_ssl_context`, unchanged
  logic) moved to `src/pipeline/gemini_execute.py` so both the CLI and the API
  can import it without inverting this project's established dependency
  direction (`src/` never imports from a root-level script).
- **Built `src/api/`** (new package): `response_parser.py` —
  `parse_review_sections(text) -> dict | None`, a regex-based splitter
  matching the five literal section headings `SYSTEM_PROMPT` instructs
  (`prompt_builder.py`'s `OUTPUT FORMAT`), tolerant of heading order and case,
  returning `None` (never raising) if any of the five is missing. Deliberately
  does not parse anything below heading level — the model's own internal
  sub-structure (e.g. bolded "Concern:"/"Traceability:" labels observed in the
  real Milestone 13 response) is unspecified by ADR-013 and not reliable.
  Lives outside the Review Engine entirely, per explicit instruction — ADR-016
  is untouched. `models.py` — Pydantic request/response schema matching the
  previously agreed design. `app.py` — the FastAPI app: `GET /health` (trivial
  liveness only) and `POST /review`, which resolves a pipeline-runner via a
  `Depends()` seam (overridden in tests, never touching the network), wraps
  the call in a `concurrent.futures.ThreadPoolExecutor` with a 90-second
  bound for the 504 case, and maps outcomes to status codes: request
  validation errors → 422 (FastAPI's default, not the 400 discussed
  informally — reconciled as an acceptable convention, not a deviation);
  `CommitResolutionError` → 404; `adapter_boundary_failure` → 500;
  `execution_boundary_failure` → 502 (deliberately one uniform response for
  all of timeout/rate-limit/provider-error/malformed-response, since
  `run_adapter` collapses them indistinguishably by ADR-015's own frozen
  Explicit Absence/No Fabrication invariants — differentiating them at the API
  layer would mean fabricating certainty the pipeline doesn't have); success
  with an unparseable response → 200, `parsed: false`, `raw` preserved
  exactly, not an error.
- Added `fastapi`, `uvicorn`, `httpx` to `requirements.txt` — this project's
  first-ever runtime dependencies, a decision the user made explicitly rather
  than left to be inferred.
- **A real, pre-existing bug was found, not fixed**: `DatasetCollector.
  _build_commit_semantic_analysis` unconditionally indexes
  `get_parent_hashes(...)[0]`, which is empty for a repository's root commit
  (no parent to diff `.py` files against) — raises `IndexError`. Pinned by a
  new test (`test_root_commit_is_a_known_pre_existing_limitation`) rather than
  fixed, per this milestone's explicit "keep the existing pipeline completely
  unchanged" instruction. `run_pipeline_for_commit`'s own exception handling
  around evidence assembly happens to catch it and surface it as
  `CommitResolutionError` (a clean 404), rather than crashing the API
  unhandled — a side effect, not a deliberate fix.
- **One resource-leak bug fixed during the refactor**: Milestone 13's script
  called `tempfile.mkdtemp()` once per run to satisfy `DatasetCollector`'s
  constructor, creating a directory that was never written to or cleaned up
  (the collector's `.collect()` method, the only thing that writes to
  `output_directory`, is never called in this workflow). Fixed by passing the
  already-existing, already-cleaned-up clone directory instead — trivial,
  non-architectural, applied directly.
- **Verified**: 24 new tests (`tests/pipeline/test_orchestrator.py` — 6,
  including one real synthetic local git repo built via subprocess, mirroring
  Milestone 4A's synthetic-repo precedent, with a stubbed `execute`, no
  network; `tests/api/test_response_parser.py` — 8, pure unit tests;
  `tests/api/test_app.py` — 10, using FastAPI's `TestClient` with
  `app.dependency_overrides` to control every pipeline outcome, no real
  Gemini call anywhere). All 109 tests across every `tests/` package pass
  together, including all 85 pre-existing tests unchanged.
- No changes to any ADR. `run_adapter` and `run_review_engine` are byte-for-byte
  unchanged.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md` — including a
  retroactive Milestone 14 (API preparation proposal) entry that should have
  been synced when it was first delivered and was not.

## 2026-07-31 (Milestone 14 — API preparation: proposal, no code)

- Reviewed the real Milestone 13 Gemini response against `SYSTEM_PROMPT`'s
  literal instructed text rather than ADR-013's paraphrased summary — this
  corrected an earlier informal claim of "section header drift" (there was
  none; all five headings were reproduced exactly, including the unusual
  "What deserves attention, ranked" phrasing) and confirmed the one real
  defect already known (the leaked claim id `verification.no_test_files_changed`)
  is the only genuine ADR-013 violation in that response — the "Resolution:"
  line under Open Questions is compliant, not a violation, since
  `prompt_builder.py`'s Open Questions section explicitly instructs "here is
  what would resolve it."
- Proposed exactly one revised `SYSTEM_PROMPT` edit — a concrete
  counter-example added to `WHAT MUST NEVER APPEAR` — responding to the one
  trigger condition Milestone 10B's freeze explicitly reserved for future
  wording changes: "a measurable behavioral problem from real model output."
  Not applied in this entry — presented as a proposal pending confirmation.
- Determined the five-section markdown format can be parsed reliably at the
  section-heading level (one real sample, but a clean one — headings matched
  literally, in order) and NOT reliably below heading level (unspecified,
  model-discretionary sub-structure). Recommended a lenient, best-effort
  parser living outside the Review Engine.
- Recommended the minimal REST surface (`POST /review`, `GET /health`),
  clarified that the four requested failure categories (timeout/rate
  limit/provider error/malformed response) collapse to fewer HTTP-observable
  buckets than requested, because `run_adapter` erases which of them occurred
  by design (ADR-015's Explicit Absence/No Fabrication invariants) — not a
  gap to fix, a boundary to respect.
- Flagged one decision requiring explicit confirmation before implementation:
  taking on this project's first-ever runtime dependency (a micro-framework)
  versus a stdlib-only HTTP layer. Resolved by explicit instruction in
  Milestone 14B: use FastAPI.
- No code written — proposal only, per this milestone's own scope. See
  Milestone 14B above for the implementation.

## 2026-07-30 (Milestone 13 — Real LLM Integration: first end-to-end execution)

- Per explicit instruction, this milestone was implementation-only: "implementation
  is the default... we are no longer designing architecture unless implementation
  exposes a genuine contradiction." No ADR was touched; no architectural
  contradiction was found — the only stopping point along the way was a missing
  credential in the environment, resolved directly by the user supplying a real
  Gemini API key.
- Built `run_full_pipeline.py` (new, root-level, sibling to `main.py`) — the first
  script to exercise every layer from a cloned commit through to a real model
  response and back through the Review Engine in one run. `src/`  itself is
  untouched: `build_evidence()` calls `DatasetCollector`'s existing private
  builder methods (`_build_commit_metadata`, `_build_commit_change_set`,
  `_build_commit_observations`, `_build_commit_repository_signals`,
  `_build_commit_file_history`, `_build_commit_co_change`,
  `_build_commit_local_module_context`, `_build_commit_semantic_analysis`) in
  sequence to assemble the full evidence dict Evidence Fusion expects — closing,
  for this one script's purposes only, the "nothing wires these together" gap
  every milestone since 4A has carried forward. `DatasetCollector.collect()`
  itself is still not wired to do this; that gap remains, named explicitly below
  as future work rather than fixed here.
- `call_gemini(system_prompt, user_prompt)` is the first real `execute`
  implementation for `run_adapter` (Milestone 11A/ADR-015) — a plain function
  using stdlib `urllib.request` against Google's Generative Language API
  (`gemini-flash-latest`), reading `GEMINI_API_KEY` from the environment only,
  never written to any file or persisted. It lives in the script, not in `src/`,
  since a permanent home for a real provider implementation is explicitly future
  work (see below), not this milestone's scope.
- **Real end-to-end execution achieved**: cloned `pallets/click`, selected commit
  `0f4738df88e3ea47c40a4a442103596a61cfee79` ("Fix docs and changelog," 11 files),
  ran the full chain — `fuse_evidence` → `run_reasoning`/`synthesize` →
  `build_review_context` → `build_prompt` → `run_adapter` (against the real
  Gemini call) → `run_review_engine`. Result: `adapter_result.state == "success"`,
  `review_result.outcome == "evaluated"`, the real response preserved
  byte-for-byte through the Review Engine, `findings: []` (the category-1
  catalogue remains deliberately unimplemented, per ADR-016's own deferral).
  System prompt: 7,551 characters. User prompt: 26,190 characters, rendering 4
  commit-level claims, 11 files' `file_claims`, and 0 symbol-level claims (the
  real Python edits were docstring/comment/annotation-only).
- **Two real environment obstacles found and fixed, neither a `src/` code bug**:
  this Python installation has no configured default SSL CA trust store
  (`ssl.get_default_verify_paths()` returns `cafile=None`), fixed via a
  script-local `_ssl_context()` helper falling back to `certifi`'s bundle —
  deliberately not added to `requirements.txt` or any `src/` module, preserving
  the project's zero-third-party-dependency discipline for the actual codebase.
  The first Gemini model tried (`gemini-2.0-flash`) had a `0` free-tier quota
  under the supplied key (`429 RESOURCE_EXHAUSTED`); `gemini-flash-latest` was
  confirmed to have quota and used instead.
- **One real model-behavior finding, not a pipeline bug**: the real Gemini
  response literally surfaced the raw internal claim id
  `verification.no_test_files_changed` in its "What deserves attention" section
  — exactly what ADR-013's "must never appear" rule (internal deterministic
  vocabulary as visible jargon) forbids. Applying ADR-014's own bug-vs-mistake
  diagnostic test (was everything required present, correct, and complete in
  what was actually sent?) against the real system/user prompt confirms yes —
  so this is classified as a model mistake, not a Prompt Builder or pipeline
  defect. This is the first time that diagnostic test has been exercised
  against real, not hypothetical, output.
- No regressions: all 85 existing tests (`tests/review/`, `tests/prompt/`,
  `tests/adapter/`, `tests/review_engine/`) still pass — no `src/` module was
  modified by this milestone.
- Explicitly not implemented, per this milestone's own "do NOT implement" list:
  retries, caching, provider abstraction redesign, prompt optimization, model
  comparison, frontend, authentication, GitHub API integration, databases,
  analytics, telemetry, pricing, deployment, background workers.
- **Future milestone candidates named, not built**: wiring `DatasetCollector.
  collect()` itself to produce the full evidence dict as a permanent, reusable
  capability (rather than the ad hoc sequencing this script performs); deriving
  the Review Engine's category-1 validation catalogue for `_evaluate_response`
  (the leaked-claim-id finding above is now a concrete, real motivating case);
  a permanent `src/`-resident home for a real `execute` implementation, with
  model/provider selection as configuration; retries/resilience for the
  Adapter's `execute`, still deferred per ADR-015; a delivery/presentation
  layer consuming the Review Engine's result, which does not exist yet.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`.

## 2026-07-30 (Milestone 12 — Review Engine implemented)

- Froze ADR-016 (Review Engine Contract) through the same one-question-at-a-time
  methodology as ADR-015, across eleven questions, with two abstraction leaks
  caught and corrected before freezing (a validation-catalogue leak in the
  information contract; a premature invariant, Evaluation Portability, dropped
  entirely rather than demoted), the state model corrected twice by
  elimination-testing every candidate state rather than assuming symmetry with
  ADR-015, and the Adapter-trust boundary re-derived a second time after an
  initial justification was found to depend on Milestone 11A's implementation
  rather than on architecture. A final six-category consistency audit across
  ADR-011–016 found and fixed one residual abstraction-leak echo before
  declaring the freeze clean.
- Produced a full implementation plan for ADR-016 (public interface, internal
  helpers, data flow, observable branches, edge cases, testing plan,
  documentation, plan-level adversarial audit) before writing any code.
  Incorporated two reviewer-requested refinements before implementation: removed
  a proposed `_is_artifact_present` helper as unnecessary abstraction (a single
  comparison with one call site, inlined instead of named), and corrected the
  plan's premature freezing of concrete field names, deferring the exact result
  shape to implementation itself — the same discipline ADR-015 applied to the
  Adapter's own result shape.
- Built `src/review_engine/review_engine.py` (new package, sibling to
  `src/adapter/`): one public function, `run_review_engine(adapter_result) ->
  dict`, taking exactly the Adapter's output with no second parameter, since
  evaluation has no external dependency to inject. Two helpers:
  `_evaluate_response(response)`, currently returning `[]` unconditionally since
  ADR-016 explicitly defers which category-1 properties are checkable to a
  later derivation; and `_build_result(...)`, the one uniform shape shared by
  both outcomes (`no_artifact`, `evaluated`).
- Wrote `tests/review_engine/test_review_engine.py` — 11 tests, stdlib
  `unittest`, including a `unittest.mock.patch` test proving
  `_evaluate_response` is never called for either Adapter failure kind. All
  pass; all 85 tests across `tests/review/`, `tests/prompt/`, `tests/adapter/`,
  and `tests/review_engine/` pass together. Validated end-to-end through the
  real `build_prompt` → `run_adapter` → `run_review_engine` chain, on both a
  successful and a failing model stub.
- Synced `docs/modules/review_engine.md`, `MILESTONES.md`, `CURRENT_STATE.md`,
  `ARCHITECTURE.md`. No changes made to any ADR during implementation.

## 2026-07-26 (Milestone 11A — LLM Adapter implemented)

- Produced a full implementation plan for ADR-015 (package layout, public API,
  data flow, state transitions, error handling, testing strategy, integration
  points, explicit list of decisions not revisited) before writing any code,
  then ran the same adversarial-audit process used to freeze ADR-015 itself
  against that plan. Found zero architectural violations and zero drift, one
  real internal inconsistency in the plan's own description of `execute`'s
  contract, and two genuine specification gaps (non-`str`/non-`None` returns
  from `execute`; extra-key handling in prompt validation) — all corrected
  before implementation began.
- **A genuine conflict with ADR-015's frozen text was found and reported,
  not silently resolved**, while incorporating a requested refinement: an
  instruction to classify a non-`str` return from `execute` (including
  `None`) as `adapter_boundary_failure` conflicted with ADR-015's closed
  transition rule — "Attempting resolves to either Execution-boundary
  failure or Success" — since `execute` must already be invoked (Attempting
  under way) to return anything at all, malformed or not. Stopped and
  presented three resolutions rather than picking one silently. Resolved (by
  explicit instruction) in favor of the ADR's literal transition table:
  every outcome of an invoked `execute` — raising, or returning a non-`str`
  value — is `execution_boundary_failure`; the specific reason for a
  malformed return is preserved internally only, via a dedicated,
  directly-tested helper function, never exposed in the public result.
- Built `src/adapter/llm_adapter.py` (new package, sibling to `src/review/`
  and `src/prompt/`): one public function, `run_adapter(prompt, execute) ->
  {"state": ..., "response": ...}`. Plain function, no class, per ADR-015's
  "holds no state across calls." `execute` is an injected, deliberately
  opaque callable standing in for a real model call — its own
  implementation is explicitly out of scope, per ADR-015's own deferral.
  Prompt validation requires `system_prompt`/`user_prompt` present and typed
  as `str`; additional keys are explicitly allowed and ignored. Both
  validation-failure and malformed-execution-result reasons are preserved
  internally via `_invalid_prompt_reason`/`_invalid_execution_result_reason`,
  never surfaced in the public return value.
- Wrote `tests/adapter/test_llm_adapter.py` — 27 tests, stdlib `unittest`,
  including the two internal reason-computing helpers tested directly (a
  deliberate exception to testing only the public function, since the
  reason-preservation property has no other way to be verified once it
  never appears in `run_adapter`'s return value). All pass; all 74 tests
  across `tests/review/`, `tests/prompt/`, and `tests/adapter/` pass
  together. Validated end-to-end against a real `build_prompt(...)` output —
  no adapter shim needed between the two modules.
- **Post-implementation architecture audit against ADR-015, run before
  considering this milestone complete:** re-traced the actual implemented
  code (not the plan) clause by clause against ADR-015's frozen text.
  Confirmed: Adapter-boundary failure is reachable only before `execute` is
  ever called (line-level check — `execute` cannot be reached once
  `_invalid_prompt_reason` finds a problem); every path that calls `execute`
  resolves only to `execution_boundary_failure` or `success`, matching the
  closed transition table exactly; `_success` is reachable only when the
  result has already been proven to be a `str` by
  `_invalid_execution_result_reason`, so `response` can never be a non-`str`
  value in a success result; both failure branches hardcode `response: None`
  with no parameter that could smuggle content through (No Fabrication
  structurally enforced, not just by convention); no cross-call state, no
  randomness, no wall-clock dependency anywhere in the module (Bounded
  determinism of the Adapter's own logic, satisfied); exactly one `return`
  reached per call, from one of four mutually-exclusive branches, so the
  four forbidden transitions remain unrepresentable by construction, not
  merely disallowed. Both specification gaps flagged during the plan-level
  audit are confirmed closed in the actual code and covered by tests. No
  new violations or drift found. `docs/DECISIONS.md` was not modified this
  session — ADR-015 remains exactly as frozen.
- Synced `docs/modules/llm_adapter.md`, `MILESTONES.md`, `CURRENT_STATE.md`,
  `ARCHITECTURE.md`.

## 2026-07-26 (Milestone 10C — ADR-015 frozen: LLM Adapter Contract)

- Researched and froze ADR-015 (LLM Adapter Contract) through the same
  one-question-at-a-time methodology as Milestone 9: responsibility boundary,
  input/output contract, failure contract, state contract — each answered from
  first principles with alternatives explicitly rejected, each followed by a
  critical or adversarial review before moving to the next question. No code
  written; architecture only, per `PROJECT.md` rule 4.
- Key decisions: the Adapter's sole responsibility is transport plus
  *structural* normalization of whatever a model execution produces, never
  semantic normalization — the same structure-never-meaning philosophy ADR-011
  gave `ReviewContextBuilder`, carried one boundary further. Named explicitly
  as the first deliberate exception to this project's full-pipeline
  determinism (every ADR from ADR-006 through ADR-014 holds determinism as an
  invariant; this is the first boundary where it cannot hold, because it
  depends on an external process outside this project's control). A two-kind
  failure taxonomy — Adapter-boundary failure (never validly attempted) vs.
  Execution-boundary failure (attempted, concluded, nothing resulted) — and a
  five-state contract (Received, Attempting, plus three terminal states)
  express this without touching retries, providers, or any implementation
  technology, all explicitly deferred. Presence/absence is defined
  structurally (an answer-shaped result exists or it doesn't), never by
  content adequacy. Four invariants — Response Transparency, Content
  Preservation, Explicit Absence, No Fabrication — produce provider
  independence as their consequence, inherited by reference from ADR-012/014
  rather than re-derived.
- **A dedicated adversarial audit was run before freezing**, hunting explicitly
  for duplication across ADR-011–015, misplaced ownership, unobservable
  distinctions, indistinguishable states, and invariants restating each other
  without adding a guarantee. It found and corrected real issues: two
  candidate invariants (a determinism guarantee scoped to the Adapter's own
  logic; a guarantee against losing already-obtained information) were found
  fully subsumed by other statements in the ADR once its state contract
  existed, and removed rather than kept for symmetry with other ADRs'
  invariant counts; a genuine ambiguity (does minimal/empty content count as
  "present") was surfaced and resolved structurally rather than left implicit;
  Provider Independence's rationale was redirected to inherit from ADR-012/014
  by reference rather than re-derived from scratch; Adapter-boundary failure
  was reframed as existing for contract completeness, not expected operation,
  matching Evidence Fusion's `not_collected` precedent. All five corrections
  were incorporated before freezing, not after.
- **Froze ADR-015 as Accepted** in `docs/DECISIONS.md` (architecture only, no
  code, per `PROJECT.md` rule 4).
- **Final cross-ADR consistency audit (ADR-011 through ADR-015), run after
  freezing:** found and fixed one real error — ADR-015's Context paragraph
  originally stated ADR-011 through ADR-014 were all "frozen and implemented,"
  which is inaccurate: only ADR-011 and ADR-014 are implemented (Milestones
  10A, 10B); ADR-012 and ADR-013 remain frozen architecture, restated as fixed
  instructions inside the Prompt Builder's system prompt, not independently
  implemented by anything. Corrected in place before this entry was written.
  No contradictory responsibilities or duplicated ownership were found between
  ADR-015 and ADR-011–014 — the responsibility handoff (ReviewContext →
  Prompt → Adapter) is consistent at every boundary checked, and no ADR claims
  a responsibility already claimed by another. One non-blocking observation,
  not rising to a contradiction or broken reference: request-side integrity
  (the Adapter must transmit `system_prompt`/`user_prompt` unmodified) is
  stated in ADR-015's architectural-drift list but not elevated to a formally
  named invariant the way response-side integrity is (Content Preservation,
  Response Transparency) — the guarantee exists in substance, just
  asymmetrically documented; noted for awareness, not corrected, since the
  actual guaranteed behavior is unaffected and this ADR is now frozen.
- **This completes the Milestone 10 architecture.** ADR-011 and ADR-014 are
  implemented; ADR-012, ADR-013, and ADR-015 are frozen architecture with no
  code. Per explicit instruction, architectural work on this line stops here —
  the next milestone begins implementation of the LLM Adapter against
  ADR-015, not further ADR refinement.
- Synced `MILESTONES.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`.

## 2026-07-26 (Milestone 10B — ADR-014 fidelity pass, freeze)

- Ran a clause-by-clause trace of `SYSTEM_PROMPT` against ADR-012/013's literal
  text. Found six deviations: `HOW TO WRITE EACH POINT`'s worked example had
  paraphrased ADR-013's directly-quoted example instead of reproducing it verbatim;
  Reasoning Step 4 included wording ("specific, falsifiable theories about how the
  change could fail") sourced from `docs/research/reviewer_reasoning_model.md`
  rather than ADR-012's own frozen text; two of ADR-013's per-section content
  exclusions were missing (Verdict's "not a claim inventory, not style detail";
  "What changed and why"'s "not line-by-line detail, not raw diff text reproduced
  wholesale"); ADR-012's "not something to resolve silently in either direction"
  (message/diff disagreement) was missing; ADR-013's third usefulness principle
  ("silence about the unknown is a defect, not a virtue") was missing.
- Fixed all six in place. Added six regression tests, one per fix, so none can
  silently regress (`tests/prompt/test_prompt_builder.py`: 19 → 25 tests; 47 tests
  total across `tests/review/` and `tests/prompt/`, all pass).
- Ran a second clause-by-clause trace after the fix. No further fixable deviations
  found. The remaining differences from the ADRs' exact wording — shortened
  rationale clauses, one structurally-moot exclusion, an unlabeled
  receiving/generating distinction, one unrestated rejected-role-alternative — are
  recorded as **accepted editorial compressions, not architectural deviations** in
  `docs/modules/prompt_builder.md`'s new "Fidelity review outcome (frozen)" section.
- **Milestone 10B is frozen as complete. ADR-014 is treated as fully implemented**
  for the Prompt Builder's scope. `SYSTEM_PROMPT` wording is not to be refined
  further against the ADRs' phrasing — only against a measurable behavioral problem
  from real model output, should one ever be found. `DECISIONS.md` was not
  modified — ADR-014's own text remains untouched, per this project's append-only
  ADR discipline; the "fully implemented" status is recorded in `MILESTONES.md`
  and `CURRENT_STATE.md` instead. Milestone 9 as a whole remains incomplete: no
  LLM Adapter or ReviewEngine exists yet.
- Synced `docs/modules/prompt_builder.md`, `MILESTONES.md`, `CURRENT_STATE.md`.

## 2026-07-26 (Milestone 10B — Prompt Builder implemented)

- Before writing code: read ADR-014 in full, ADR-011/012/013 for interfaces only,
  and the current architecture, produced a written implementation plan (package
  layout, public API, data flow, integration point, determinism, testing strategy,
  edge cases, explicit assumptions, what ADR-014 leaves unspecified), then a
  self-critical review against ADR-014 (responsibility mapping, layer drift, model
  specificity, model-agnosticism) before presenting it — no code written until the
  plan was confirmed.
- Resolved three genuinely open questions by explicit instruction rather than
  implementation judgment: `commit_hash` is never included in either prompt half
  (internal addressing identifier, not evidence, no semantic value to the model);
  Claims/Gaps/Evidence Units/Coverage Ledger are embedded as verbatim `json.dumps`
  blocks, not hand-formatted prose (faithful transmission, not translation); output
  keys are `system_prompt`/`user_prompt` (provider-neutral, any SDK-specific mapping
  belongs to a future LLM Adapter).
- Built `src/prompt/prompt_builder.py` (new package, sibling to `src/review/`): one
  public function, `build_prompt(review_context) -> {"system_prompt", "user_prompt"}`.
  `SYSTEM_PROMPT` is a fixed constant restating ADR-012's role/reasoning
  sequence/precedence/decline boundary/uncertainty vocabulary/forbidden
  behaviors/objective plus ADR-013's output format/content rules/tone/philosophy —
  never trimmed, never computed per call. The user prompt renders the
  `ReviewContext`'s five sections as verbatim JSON, in fixed order — deliberately
  chosen over hand-formatted prose to eliminate any paraphrasing surface.
- Wrote `tests/prompt/test_prompt_builder.py` — 19 tests, stdlib `unittest`. All
  pass; all 41 tests across `tests/review/` and `tests/prompt/` pass together.
  Validated end-to-end against the same real on-disk commit used for Milestone 10A.
- Synced `docs/modules/prompt_builder.md`, `MILESTONES.md`, `CURRENT_STATE.md`,
  `ARCHITECTURE.md`. No changes made to ADR-011/012/013/014 — treated as accepted,
  frozen architecture throughout, per explicit instruction.

## 2026-07-25 (Milestone 10A — ADR-011 review fixes)

- Ran a critical implementation review of `src/review/context_builder.py` against
  ADR-011's literal text. Fixed the five confirmed defects, without redesigning any
  architecture:
  - Added the required minimal commit-identity reference: `build_review_context`
    now takes a `commit_hash` parameter, returned as `ReviewContext["commit_hash"]`.
  - Removed `author`/`date` from Commit Summary — ADR-011 enumerates only the
    message plus file-change facts; those two fields weren't in that enumeration.
  - Unified ordering: the collapse representative is now the first file in
    `change_set["changed_files"]`'s own order (was: alphabetically first), and
    `coverage_ledger`'s file list uses that same order instead of a separate
    alphabetical sort — one canonical sequence across the whole `ReviewContext`,
    not two.
  - Renamed `coverage_ledger[]["collapsed_files"]` to `collapsed_group_files` — it
    lists the whole collapse group including the representative (tagged `"full"`,
    not `"collapsed"`), so the old name misdescribed its own contents.
  - `commit_claims`/`file_claims`/`symbol_claims`/`gaps` are now `copy.deepcopy`'d
    before being placed in the `ReviewContext`, so mutating the returned object can
    never corrupt the Synthesizer's original output.
- Left three findings deliberately unfixed, per instruction not to change the
  public-contract exemption behavior, not to implement per-hunk Evidence Units, and
  not to redesign the Claim contract — documented instead as explicit decisions/open
  questions in `docs/modules/context_builder.md`'s new "Explicit decisions and open
  questions" section.
- Updated `tests/review/test_context_builder.py` for the new signature and field
  name; added 6 new tests (commit-identity presence, author/date absence, non-
  aliasing, diff-order representative selection, added-file line range,
  coverage-ledger/evidence-units order consistency). 22 tests total, all pass.
  Re-validated against the same two real `diff.patch` files as before.

## 2026-07-25 (Milestone 10A — Review Context Builder implemented)

- Built `src/review/context_builder.py` (new package, sibling to `src/fusion/` and
  `src/reasoning/`), implementing ADR-011 exactly: one public function,
  `build_review_context(synthesized, metadata, change_set, diff_text) -> dict`,
  returning a plain dict (no new class, matching existing project convention).
- Splits the raw diff into per-file Evidence Units with a new file-path-plus-
  line-range address; relays Claims/Gaps from the Synthesizer verbatim; collapses a
  file only when commit-wide-candidate (`shape.wide_change`/`homogeneous_categories`)
  and not risk-bearing (checked against both `file_claims` and the symbol-scoped
  `contract_stability` claims in `symbol_claims`); records every collapse in a
  Coverage Ledger with its justifying claim(s).
- Wrote `tests/review/test_context_builder.py` — 16 tests, stdlib `unittest`, this
  project's first real test suite. All pass. Additionally validated against two real
  `diff.patch` files already on disk (`benchmark/fastapi/...`,
  `benchmark/tcx_nogrunt-1/...`) — correct line ranges confirmed by hand against the
  visible `@@` hunk headers.
- Explicitly did not implement per-hunk Evidence Unit splitting (ADR-011 names it as
  conditional, "where warranted," without defining the trigger — flagged as a
  documented limitation, not invented here) or any of PromptBuilder/LLMAdapter/
  ReviewEngine (ADR-012–014), per this milestone's explicit scope.
- Synced `docs/modules/context_builder.md`, `MILESTONES.md`, `CURRENT_STATE.md`,
  `ARCHITECTURE.md`.

## 2026-07-24 (Milestone 9 — Semantic Reasoning: architecture frozen across four ADRs)

- Recorded ADR-011 (Review Context), ADR-012 (LLM Reasoning Contract), ADR-013
  (Review Output Contract), and ADR-014 (Prompt Builder Contract) — the full
  architecture connecting the frozen deterministic layer to a future LLM-driven
  review, consolidated from the Milestone 9 research arc
  (`docs/research/reviewer_reasoning_model.md`,
  `docs/research/milestone9_transition_research.md`). Architecture only — no
  code exists yet, per `PROJECT.md` rule 4.
- ADR-011 names a new component, the Review Context Builder, sitting between the
  Reasoning Layer and everything downstream — separates Input Sources from a
  constructed, five-section, fully addressable Review Context; owns all
  summarization deterministically using only already-computed claims.
- ADR-012 freezes the model's role as triage (not review), a seven-stage
  reasoning sequence, a four-tier evidence-precedence hierarchy, a decline
  boundary, a four-term non-numeric uncertainty vocabulary, forbidden behaviors,
  and one optimization objective — maximize the reviewer's justified trust per
  unit of reading time.
- ADR-013 freezes the human-facing review's five-section shape, ordered by cost
  of missing each point, read as a prioritized reviewer assistant rather than a
  report or checklist.
- ADR-014 freezes what any Prompt Builder must guarantee regardless of model
  family — strict system/user separation, verbatim-vs-referenced content rules,
  forbidden instruction categories, a Prompt-Builder-bug-vs-model-mistake test,
  forbidden assumptions about model capability, and two refinements: the Prompt
  Builder guarantees only faithful delivery (never model compliance or output
  quality), and a new Prompt Transparency invariant — no hidden per-commit
  instructions outside the frozen system contract.
- Caught and corrected a numbering collision during this consolidation: the
  requested ADR numbers (009–012) collided with two already-real, already-
  implemented ADRs (009 Historical Evidence Depth, 010 Author Familiarity). Used
  011–014 instead, continuing the real sequence. The standalone research file
  informally titled "ADR-011: The Reviewer Reasoning Model" was retitled to
  avoid the same collision, since it was never part of the numbered `DECISIONS.md`
  sequence to begin with.

## 2026-07-24 (Milestone 8.5C — Author Familiarity: designed, built, verified — final deterministic capability)

- Recorded ADR-010. Answers one reviewer question only — "has this commit's author
  worked on this file before?" — closing the one candidate ADR-009's first-principles
  review judged highest-value but left unbuilt pending real-data justification.
- Extended `GitClient.get_file_history` with an optional `author_email` parameter:
  the existing single git log call gains one more `\x1f`-delimited format field
  (`%ae`), still one subprocess call; when provided, the returned dict gains
  `author_commit_count` and `is_first_touch_by_author`. Every existing caller and
  field is unaffected by omitting it.
- `_build_commit_file_history` gains a `metadata` parameter to pass the author's
  email through — the project's first builder method depending on two upstream
  builders' output rather than one, documented explicitly.
- Evidence Fusion needed zero code changes — the existing `file_history` passthrough
  already exposes whatever keys the dict carries.
- Added `history.first_author_touch` to `historical_risk.py` — deliberately named as
  a fact ("first touch"), not an interpretation ("unfamiliar author"), which is left
  to Milestone 9. No new `CONSUMES`, no new gap type, no new module.
- Verified against four real cases in `pallets/flask`, including a real,
  naturally-occurring alternating-author history confirming `author_commit_count`
  excludes the current commit with no off-by-one.
- **Final assessment**: no further architecturally-justified deterministic
  capability gaps remain. The deterministic layer (Milestones 5A–8.5C) is frozen;
  Milestone 9 is semantic/LLM reasoning.

## 2026-07-23 (Milestone 8.5B — Historical Evidence Depth: designed, built, verified)

- Recorded ADR-009. Unlike 8.5A, this milestone started from a first-principles
  review of the deterministic ceiling for historical evidence (reviewer workflow +
  existing evaluation), not a named batch finding — six candidates evaluated against
  the pipeline's actual existing fields; two (author familiarity, ownership
  concentration) judged highest-value but deferred pending new per-file author
  extraction; four declined (fix/bug keyword density, diff-size stats, time-of-day
  patterns, cross-file author overlap).
- Extended `GitClient.get_file_history` with `recent_commit_count` (free — reuses
  the date list its git call already fetches). Added `history.rapid_iteration` and
  `history.high_recent_churn` to `historical_risk.py`, and
  `reach.expected_co_change_partner_missing` to `reach.py` (zero new extraction —
  cross-references `co_change`'s existing partner list against the commit's own
  changed-file set for the first time).
- Verified against real commits in `pallets/click`, including both the positive and
  negative case for the new `reach` claim on two different real commits.
- Not wired into any pipeline entrypoint — verified standalone, same status every
  prior milestone has had at this stage.

## 2026-07-23 (Milestone 8.5A retest — 20 real commits, 2 per original batch)

- `docs/research/body_evidence_retest.md`: re-ran the actual pipeline
  (`contract_stability` alone vs. `contract_stability` + `body_evidence`) against 20
  real commits, 2 selected from each of the 10 original evaluation batches, chosen as
  the ones the original evaluation most directly implicated in body-only blindness.
- Of the 16 commits where Python re-extraction was possible: 10 previously-invisible
  body-only changes are now correctly surfaced (including the exact commits the
  original evaluation named for `warnings.warn`, the `_is_set` crash fix, and the
  `stream_with_context` refactor); 2 remain correctly invisible for the
  already-documented control-flow/no-surface reasons.
- **New finding, not predicted by ADR-008**: 2 commits (`langchain`, `requests`)
  remain invisible for a distinct reason — the set-diff representation shows no
  delta when a call/exception site changes but the same name already exists
  elsewhere in the same function. Confirmed independently in two unrelated repos.
  Flagged, not fixed.
- Also confirmed at scale on two large multi-file commits (crewAI's 2447-line, 20-file
  commit; Django's 47-file mail commit): `structure.internal_symbol_added`'s
  same-file-modified gate behaved correctly under real pressure, and no measurable
  performance cost was observed.

## 2026-07-23 (Milestone 8.5A — Function-Body Evidence: designed, built, verified)

- Recorded ADR-008, closing the #1 cross-batch finding from the 10-batch reasoning
  evaluation, "Function Body Blindness" — a symbol with unchanged signature/
  decorators/docstring produced no diff entry at all, even with a substantially
  changed body. An initial ~7-candidate proposal organized by AST node type was
  revised once at the user's direction into five reviewer-facing evidence categories:
  interaction changes, error-handling changes, resource-management changes,
  documentation/deprecation changes, internal-structure changes — AST node types stay
  the extraction mechanism, never the schema's vocabulary. A standalone
  `warnings.warn` detector was dropped in favor of general callee-tracking, which for
  free also explains two other real batch findings (Requests' `hasattr` addition,
  Django's `functools.wraps` addition).
- Extended `src/semantic/python/symbol_extractor.py`: `_record_function` extracts
  `callees`/`exceptions_raised`/`exceptions_caught`/`context_managers` per symbol;
  `_diff_symbol_tables` set-diffs each and nests them under a new `body_evidence` key
  grouped by the five categories, plus a `deprecation_marker_added` boolean. Added
  `body_evidence`-changed to the existing modified-check — the actual fix, since
  extracting the facts without this would leave them computed but still unreachable.
- Built `src/reasoning/modules/body_evidence.py` (`CONSUMES = ["semantic_analysis"]`),
  emitting six claims across the five categories; registered in `registry.MODULES`
  alongside the existing five, as a sibling to `contract_stability`, not a merge into
  it.
- Verified against two real, independently-selected commits: `pallets/click`'s
  `c2ed414` (the exact commit that originally surfaced the `warnings.warn` question)
  and `pallets/click`'s `555fa9b` (`Context.__exit__`/`Context.close` changing their
  callee target with signature/decorators/docstring all unchanged — previously
  invisible, now correctly surfaced).
- Not wired into any pipeline entrypoint — verified standalone, same status every
  prior milestone has had at this stage.

## 2026-07-21 (Milestone 8 — Deterministic Reasoning Layer: designed, built, verified)

- Recorded ADR-007. Reflects five real design revisions before implementation: enforced
  per-module `consumes` contracts (registry filters evidence before invoking a module,
  not just self-discipline); removed a static per-evidence-category confidence ranking
  in favor of confidence computed per claim from that claim's own basis; added stable,
  dotted, machine-addressable claim IDs (`contract.public_signature_changed`); removed
  cross-module conflict detection from the Synthesizer entirely (interpreting whether
  two modules' claims contradict each other is reasoning, not aggregation); required
  every module to declare `NAME`/`CONSUMES`/`PRODUCES`/`LIMITATIONS` as plain,
  inspectable metadata.
- Built `src/reasoning/contracts.py` (the enforced-consumes filter plus Claim/Gap/scope
  builders) and five modules — `change_shape`, `historical_risk`, `reach`,
  `verification_coverage`, `contract_stability` — each single-file, each with its own
  declared contract. `src/reasoning/registry.py` runs them as a flat list (no DAG:
  Fusion is every module's only possible input). `src/reasoning/synthesizer.py`
  collects and groups by scope only — no ranking, no cross-module conflict detection.
- Verified against real commits: `pallets/flask` (`06ea505c`) — `reach.
  corroborated_wide_reach` fired correctly where both `co_change` and
  `local_module_context` independently indicated wide reach; `contract_stability`'s 22
  claims for a real test-file rewrite were hand-verified against the raw
  `semantic_analysis` symbols to rule out double-processing. `tcx_nogrunt-1`
  (`d99f6cb`) — dropping `semantic_analysis` entirely correctly produced 24 gaps, zero
  false claims.
- **Real, previously-unknown upstream gap found via this validation**: every renamed
  file in `d99f6cb` incorrectly produced `history.first_appearance`, because
  `GitClient.get_file_history` (Milestone 5A) has no `--follow` and stops at the rename
  boundary. The reasoning layer correctly reported what it was given — the gap is in
  extraction, not reasoning. Flagged in `docs/modules/reasoning.md`, not fixed inline.
- Not wired into any pipeline entrypoint — verified standalone, same status every prior
  milestone has had at this stage. The five-module registry is explicitly provisional.

## 2026-07-21 (Milestone 7 — Evidence Fusion: designed, built, and verified)

- Recorded ADR-006: Evidence Fusion, a lossless, entity-centric adapter between the
  extraction sections and the future Reasoning Engine. Reflects three real design
  iterations, not a single pass: rejected relabeling sections into reviewer vocabulary
  (`co_change` → "reach") as unearned interpretation; rejected a `{status, reference}`
  pointer design (a `{section, key, locator}` descriptor into the original evidence) on
  the grounds that a pointer doesn't actually hide structure — the consumer still has
  to know how to dereference it; landed on `{status, evidence}` with the value copied
  out directly, making Fusion the only code coupled to each section's internal shape.
- Built `src/fusion/evidence_fusion.py` — one public function, `fuse_evidence`,
  producing one commit-level bundle and one bundle per changed file. Status
  (`ok`/`not_applicable`/`not_collected`) is determined purely by presence, never by
  inspecting a value's content. No `"context"` wrapper — the four Milestone 5A sections
  are treated as flat, independently-optional top-level keys, since that nesting was
  proposed in `docs/context_design.md` but never decided or built.
- The one genuine reshape in the module: a file's `change_set` bundle entry is a
  derived `file_status` (which of four lists the path was found in, or a rename), using
  `change_set`'s own existing words — not an invented concept. The complete, untouched
  `change_set` object is still passed through verbatim in the commit bundle, so nothing
  is lost even here.
- Verified against real commits, not constructed examples: `pallets/flask` (`06ea505c`)
  — non-Python files correctly `not_applicable` for `semantic_analysis`, and a direct
  comparison confirmed every `"ok"` value is byte-identical to the raw extractor
  output; `tcx_nogrunt-1` (`d99f6cb`) — the real non-trivial rename validated in
  Milestone 6 correctly reshapes to `{"file_status": "renamed", "old_path": ...}`, and
  the file-bundle count exactly matched `change_set.changed_files`'s count (24),
  confirming no file was silently dropped. `not_collected` verified by simulating a
  missing section.
- Not wired into `DatasetCollector` or any pipeline entrypoint — verified standalone
  only, same status every extractor has had at this stage of its own milestone. Not
  persisted, by design — `fuse_evidence` is meant to be called on demand, not written
  to disk as its own artifact.

## 2026-07-21 (Milestone 6 — Stage 6: real-world validation, all 6 stages complete)

- Searched three real repositories (`pallets/flask`, `fastapi/fastapi`,
  `tcx_nogrunt-1`) for the two hardest cases to construct synthetically: a non-trivial
  rename and a naturally-occurring unparseable Python file.
- **Found and verified a non-trivial rename**: `tcx_nogrunt-1` commit `d99f6cb`
  (`.../backend/main.py` → `.../router.py`, git similarity R084 — real content change,
  not a pure move). A FastAPI `app` being converted to an `APIRouter`: all 15 functions
  correctly reported `change_type: "modified"`, `signature_changed: false`,
  `decorators_changed: true` (e.g. `app.get(...)` → `router.get(...)`) — exactly what
  the content-diff-across-paths rename design (ADR-005) should produce, and evidence
  the alternative it rejected (treating renames as delete+create) would have wrongly
  reported 15 removals + 15 additions instead. Also exercised
  `_build_commit_change_set`'s rename branch against real data for the first time.
- **Searched for and did not find** a naturally-occurring unparseable Python snapshot:
  checked every `.py` blob at every non-merge commit in `tcx_nogrunt-1`'s full history
  (275 commits, 394 snapshots) plus a sample of `flask`'s oldest commits, and searched
  all three repos for committed merge-conflict markers. Zero hits — broken Python does
  not appear to survive into these repos' merged history. The `parseable: false` path
  remains verified via the hand-constructed cases from Stages 1/4 only, following the
  same precedent set for `_build_commit_change_set`'s rename branch in Milestone 4A.
- All six ADR-005 stages are now complete. Milestone 6 is still not "complete" per
  `PROJECT.md` rule 4: nothing is wired into `collect()`, no `commit.json` exists.
  Assembly is a distinct next step from extraction — same distinction already drawn for
  Milestone 5A.

## 2026-07-21 (Milestone 6 — Stage 5: DatasetCollector integration)

- Built `DatasetCollector._build_commit_semantic_analysis(repo_path, commit_hash,
  change_set)` — filters changed files to Python only, resolves old/new source per file
  via `GitClient.get_file_content_at_commit`, and delegates entirely to
  `extract_symbol_semantics`. Contains no AST logic itself, matching the orchestration
  discipline already established for the four Milestone 5A extractors.
- This method is the one place that resolves renames: `extract_symbol_semantics` cannot
  see git identity, so after calling it with `old_path`'s source (at the parent commit)
  and the new path's source (at `commit_hash`), this method overwrites the result's
  `change_type` to `"renamed"` and sets `old_path`.
- Verified against a real commit in `pallets/flask` (`06ea505c`, "separate copy per
  call"): `pyproject.toml`/`uv.lock` correctly excluded (non-Python); `src/flask/ctx.py`
  (a logic-only edit) correctly produced zero symbol entries — a real, honest
  demonstration of this layer's limit (can't see inside a function body), not a bug;
  `tests/test_reqctx.py` (a real test rewrite) correctly produced both `removed` and
  `added` symbols, including a genuine four-level-deep nested function resolved with the
  correct dotted qualified name.
- Synced `docs/modules/dataset_collector.md` with the new orchestration method and its
  verification detail.
- Not wired into `collect()` — no `semantic_analysis` section has been written to an
  actual `commit.json` yet (which itself still doesn't exist). Stage 6 (broader
  real-world validation) remains.

## 2026-07-21 (Milestone 6 — Stages 2-4: Semantic Diff, Import Analysis, public API)

- Built `_diff_symbol_tables` (Stage 2): compares two symbol tables by qualified name,
  emitting only symbols that are `added`/`removed`/genuinely `modified`; identical
  symbols are omitted entirely. Verified against a real added/removed/modified mix:
  signature and decorator diffs correct (decorator swap reported as one add + one
  remove, not a full replace), docstring transitions correct both directions, an
  untouched method produced no entry, self-diff produced zero entries.
- Built `_diff_imports` (Stage 3): diffs imports at per-imported-name granularity, not
  whole-statement text — reordering names within one `from X import a, b` does not
  false-positive as a change. Verified with a combined reorder+add+remove case,
  relative imports, `as`-aliasing, and `None` (added/deleted file) on either side.
- Built `extract_symbol_semantics` (Stage 4), the module's only public function —
  assembles Stages 1-3, infers `change_type` from source presence, and degrades
  honestly (`parseable: false`, `imports`/`symbols` both `null`) on a `SyntaxError` in
  either source. Explicitly cannot detect renames (no git identity available at this
  layer) — documented as `DatasetCollector`'s responsibility for Stage 5. Verified
  across all six branches: added, deleted, modified, unparseable old source,
  unparseable new source, no-op diff.
- Synced `docs/modules/symbol_extractor.md` to reflect the public API (previously
  documented as not existing).

## 2026-07-21 (Milestone 6 — Stage 1: AST + Symbol Extraction)

- Built `src/semantic/python/symbol_extractor.py` (`_build_symbol_table`), the first of
  six staged pieces of Milestone 6, per ADR-005.
- Verified directly, not assumed: module docstrings excluded from the symbol table;
  dunder methods (`__init__`) correctly classified `public` despite the
  leading-underscore convention; a function nested inside a method gets a correct
  dotted qualified name (`Foo.bar.helper`) and is classified `function`, not `method`;
  positional-only/keyword-only parameter markers unparse cleanly via `ast.unparse`; a
  genuine `SyntaxError` propagates rather than being swallowed (`parseable` handling is
  Stage 4, not this stage); conditionally redefined same-named symbols (`if`/`else`,
  `try`/`except`) collapse to one table entry — the exact edge case ADR-005 already
  flagged as an accepted trade-off, now confirmed with real input rather than only
  discussed.
- No public API yet, nothing wired into `DatasetCollector` — Stages 2-6 remain.

## 2026-07-20 (Milestone 6 — architecture frozen)

- Recorded ADR-005: a new, independent, Python-only symbol-level semantic evidence
  layer, architecturally parallel to Milestone 5A's `context`, motivated directly by
  the 20-commit evaluation's and a follow-up critique's shared conclusion that code
  semantics — not more git-derived statistics — is the highest-value remaining gap.
- Amended the same day, before any code was written: module path changed from
  `src/semantic/symbol_extractor.py` to `src/semantic/python/symbol_extractor.py` (a
  language-named subpackage from the start, so a second language never requires
  renaming existing code); output section renamed from `code_semantics` to
  `semantic_analysis` (leaves room for multiple future semantic extractors under one
  section name); Stage 1 renamed from "Symbol Table" to "AST + Symbol Extraction" to
  name the actual parser -> AST -> symbol-table pipeline being built, not just its
  output.
- Six implementation stages defined, each gated by explicit confirmation before the
  next begins: AST + Symbol Extraction, Semantic Diff, Import Analysis, public
  extractor API, `DatasetCollector` integration, real-world validation.
- No code written yet at this point — design-only, per the user's explicit instruction
  to freeze architecture before implementation.

## 2026-07-16 (20-commit qualitative evaluation)

- Evaluated the full evidence pipeline (`repository.json`, all `commit.json` builder
  methods, all four Milestone 5A extractors) against 20 real commits across 4
  repositories (`fastapi/fastapi`, `pallets/flask`, `tcx_nogrunt-1`, and a local personal
  repo found on this device, `~/Projects/Triple`), using a structured per-commit
  template judging evidence sufficiency, not code correctness.
- Delivered `docs/research/experiments.md` (20 full per-commit evaluations) and
  `docs/research/observations.md` (cross-commit synthesis) — the first real content in
  either file since project scaffolding.
- Average rated usefulness 6.4/10 (range 4-9). Confirmed with real data:
  `local_module_context` rated lowest in every commit; `change_set`/`co_change`/
  `observations` rated highest.
- New findings from comparing across commits (not visible from any single commit):
  wide homogeneous commits produce repetitive per-file evidence blocks (Commits 6, 17);
  a `.txt`/`.lock` dependency-file classification gap recurred in two unrelated repos
  (Commits 8, 16); two consecutive commits in `tcx_nogrunt-1` (13, 14) fixed the same bug
  in near-identical sibling files — the first concrete (not hypothetical) evidence that
  the shelved "duplication relationship" idea from the earlier research phase would have
  had real value.
- No pipeline changes made — this is a findings-only evaluation.

## 2026-07-15 (Efficiency review — two caps added)

- Generated real `repository.json` output and a full `commit.json` preview (all builder
  methods combined, not written as an actual file) for direct user review of data
  volume/usefulness, with exact byte measurements per section.
- Found `repository.json`'s `contributors` (932 entries for `fastapi/fastapi`) dominated
  its 107KB size, and `commit.json`'s `local_module_context` alone was 71.9% of a full
  preview's size — almost entirely low-signal raw filename dumps, versus `co_change`
  (capped, ranked) at 13.1% for a comparable purpose.
- Also found (not yet fixed): `repository.json`'s `primary_language: "Markdown"` for
  FastAPI — `language_detector` ranks by file count, and fastapi has more doc files than
  `.py` files. A previously-documented limitation, now confirmed to mislead in practice.
- Fixed: `GitClient.get_contributors(repo_path, max_count=None)` — `DatasetCollector`
  passes `20`. `repository.json` for `fastapi/fastapi`: 107KB → 3.4KB (~97% reduction).
- Fixed: `module_context_detector.get_local_module_files(..., max_results=20)`. Both caps
  are explicit stopgaps — first-N, not most-relevant-N — flagged by the user as needing
  a real design later (e.g. ranking by co-change frequency or recency instead of
  truncating).

## 2026-07-15 (Full-pipeline validation — real bug found and fixed)

- Ran every builder method end-to-end against a real commit in `pallets/flask` — chosen
  specifically because it's a repo not previously exercised (`fastapi/fastapi` and
  `tcx_nogrunt-1` had been tested repeatedly; this checks for overfitting to their
  specific structure). Picked a commit touching 8 files across documentation/dependency/
  source/test categories to exercise as much of the pipeline as possible in one pass.
- **Real bug found and fixed:** `_build_commit_local_module_context` returned 0 siblings
  for two files that actually had 10 real siblings at commit time. Root cause:
  `GitClient.get_tracked_files(repo_path)` runs `git ls-files`, which lists the *current*
  checkout, not the target commit's tree — and flask's `requirements/` directory (12
  files as of the 2023 commit under test) has since been deleted entirely from current
  HEAD. Fixed: `get_tracked_files` now takes an optional `commit_hash` (uses
  `git ls-tree -r --name-only <commit_hash>` when given), and
  `_build_commit_local_module_context` passes it through. Recorded as ADR-004 — a
  generalizable principle (per-commit extractors must scope tree queries to the target
  commit, never the current checkout), not just a one-off patch. Backward compatible:
  `repository.json`'s existing call (which correctly wants current-HEAD semantics) needed
  no changes.
- **Real coverage gap found, left unfixed by design:** `requirements/tests-pallets-min.in`/
  `.txt` (a common pip-tools convention — a `requirements/` folder with multiple
  per-purpose `.in`/`.txt` files) correctly fell to `Unknown` in `file_classifier`, caught
  correctly by `extraction_confidence.unsupported_extensions` rather than silently
  missed. Not fixed, since extending `Dependency` matching to cover this edges toward the
  kind of broader/fuzzy matching this project has been deliberately cautious about
  elsewhere.
- Confirmed non-redundancy in practice: the same commit showed `touches_documentation:
  true` (from `file_classifier` seeing `CHANGES.rst`) while `repository_signals.documentation`
  stayed empty (signal_detector only recognizes root-level README/CONTRIBUTING,
  deliberately excluding changelogs since Milestone 3) — two different signals behaving
  exactly as designed, not overlapping.
- Reran `main.py` end-to-end against `fastapi/fastapi` afterward to confirm the fix
  introduced no regression in the actual shipping pipeline.

## 2026-07-15 (Milestone 5A — fourth extractor built, all four complete)

- Built **Repository Signals relevant to the changed file**, the last of the four
  scoped-down evidence extractors. Reused `signal_detector.detect_repository_signals`
  completely unmodified — it was already generic over its input file-path list, so no
  new code was needed in that module; `DatasetCollector._build_commit_repository_signals`
  just feeds it `change_set`'s changed files instead of the whole repo's tracked files.
- Distinguished this from `observations.change_categories` (Milestone 4B): that one uses
  `file_classifier` to categorize any file anywhere; this one specifically answers "did
  the commit touch one of the repo's own well-known root-level marker files" (README,
  pyproject.toml, Dockerfile, `.github/workflows/`).
- Verified across a scan of real `fastapi/fastapi` commits: `README.md` correctly fired
  `documentation`, `pyproject.toml` fired `build`, `.github/workflows/*.yml` fired `ci`,
  and one release-prep commit correctly fired both `build` and `ci` simultaneously.
- All four Milestone 5A evidence extractors are now built and verified standalone. None
  are wired into `collect()`; no `commit.json` is assembled or written yet. Per
  `PROJECT.md` rule 4, this remains "in progress," not complete — assembly is a distinct
  next step from extraction, not implied by having all four exist.

## 2026-07-15 (Milestone 5A — third extractor built)

- Built **Local Module Context**, the third of the four scoped-down evidence
  extractors, and the cheapest — zero new git calls, reuses
  `GitClient.get_tracked_files` (already fetched for `repository.json`). New module
  `src/utils/module_context_detector.py` (`get_local_module_files`) — pure path logic,
  no git access at all — plus `DatasetCollector._build_commit_local_module_context`
  (orchestration only, no extraction logic).
- Scoped to a file's own *immediate* directory (which can be nested), deliberately
  different from `layout_detector`'s top-level-only scoping — verified against the same
  `fastapi/routing.py` commit used for co-change: siblings correctly came only from
  `fastapi/` itself, not `fastapi/dependencies/` or other subdirectories.
- Found a real scaling concern while testing, not just a theoretical one: a file living
  in fastapi's flat `tests/` directory returned 208 siblings. Technically correct, but
  flagged as needing a cap before it's genuinely "directly useful during code review" —
  not silently left unbounded.

## 2026-07-15 (Milestone 5A — second extractor built)

- Built **Historical Co-Change**, the second of the four scoped-down evidence
  extractors. Split across three independent pieces: `GitClient.get_co_change_history`
  (bounded git history walk — up to 50 most recent historical commits per file, one log
  call plus one `get_changed_files` call per historical commit, scoped to `commit_hash`
  not `HEAD`), `src/utils/co_change_detector.rank_co_changed_files` (pure counting/
  ranking, no git access at all — new module), and
  `DatasetCollector._build_commit_co_change` (orchestration only — loops and delegates,
  no counting logic of its own).
- Chose a default bound of 50 historical commits per file since none was specified —
  flagged clearly rather than assumed silently. Noted a real side benefit: bounding to
  the *most recent* N commits gives free, coarse recency-weighting, partially answering
  a weakness flagged in earlier research (unbounded co-change treats decade-old patterns
  the same as last week's).
- Verified against a real `fastapi/fastapi` commit touching `fastapi/routing.py`: top
  co-change partners were genuinely plausible FastAPI internals (`dependencies/utils.py`,
  `applications.py`, `openapi/utils.py`), not noise, and the whole lookup ran in under a
  second — a real validation, not just a theoretical one.

## 2026-07-14 (Milestone 5A — first extractor built)

- User narrowed Milestone 5A to exactly four evidence extractors (file history,
  historical co-change, local module context, repository signals for the changed file)
  and set an architecture rule: each independent, `DatasetCollector` orchestrates but
  contains no extraction logic itself, none require changes if another is
  removed/replaced — matching the discipline already used by the five existing
  `src/utils/*_detector.py` modules.
- Built the first: `GitClient.get_file_history(repo_path, commit_hash, file_path)` —
  `total_commit_count`/`first_commit_date`/`previous_commit_date`/`is_first_appearance`,
  one git call, scoped to `commit_hash` (not `HEAD`) to avoid temporal leakage. Paired
  with `DatasetCollector._build_commit_file_history`, which contains no extraction logic
  — pure loop-and-delegate per changed file.
- Verified against real `fastapi/fastapi` history: a known "hot" file correctly showed
  176 historical commits; found and used a real first-appearance case (a workflow file
  added in a recent commit) to confirm `previous_commit_date: null` /
  `is_first_appearance: true` behave correctly, not just in theory.

## 2026-07-14 (Milestone 5A — design only)

- Delivered `docs/context_design.md`: a researched proposal for "Context," the minimum
  additional repository information needed to understand a commit's likely ripple
  effects. Researched prior art (SWE-bench's context fields, change-impact-analysis
  literature, test-impact-analysis, AST-based blast-radius tools used by modern AI code
  review) before proposing anything.
- Verified feasibility against real `fastapi/fastapi` history rather than assuming:
  confirmed no single git command produces co-change data (requires an N+1 pattern);
  measured real file history depths (176/105/7 commits across three sampled files) to
  establish that history walks need an explicit bound; confirmed scoping history walks
  to the target commit (not `HEAD`) is required to avoid temporal leakage.
- Recommended centerpiece: historical co-change/logical coupling — the one established
  change-impact-analysis technique requiring zero language-specific parsing.
- Raised four open questions rather than deciding unilaterally: where `context` lives in
  `commit.json`'s schema, whether "no language-specific parsing" extends past Milestone
  4B, the concrete history-walk bound, and whether a naming-convention-based
  `likely_related_tests` field is in scope.
- No code written — deliberately a research/design deliverable per the user's request.

## 2026-07-13 (Milestone 4B, cont.)

- Renamed the provisional `change_understanding` `commit.json` section to `observations`,
  matching the user's own diagram of the intended structure (identity/metadata/
  change_set/observations/artifacts/collection).
- Added `src/utils/file_classifier.py` (`classify_file`, `is_build_file`) — deterministic,
  path/extension-only classification of a changed file into Source/Test/Documentation/
  Configuration/Dependency/CI-CD/Infrastructure/Binary/Unknown, fixed precedence order,
  no fuzzy matching, reuses `language_detector.EXTENSION_LANGUAGES` (first cross-import
  between two `src/utils` detectors).
- `_build_commit_observations(change_set)` now also builds `file_classification`,
  `change_statistics` (add/delete/modify/rename counts), `change_categories` (6
  booleans), and `extraction_confidence` (unknown count, unsupported extensions, binary
  count), alongside the existing `touched_directories`.
- Verified against multiple real commits from `tcx_nogrunt-1`'s actual history —
  including finding and fixing a real gap (`.gitignore` had no rule and silently inflated
  `unknown_file_count`) before it shipped, and confirming `requirements_nover.txt` and
  `Test Studio.html` correctly avoid false-positive matches rather than fuzzy-matching.

## 2026-07-13 (Milestone 4B, in progress)

- Defined Milestone 4B charter: deterministic Change Understanding, constrained to
  git-artifact-derived observations only — no AI, no subjective heuristics, no
  language-specific parsing, no new architecture/modules/folders.
- Added `DatasetCollector._build_commit_change_understanding(change_set)` — Tier 1
  deliverable: reuses `layout_detector.detect_layout` on `change_set`'s `changed_files`
  to report which of source/tests/documentation/examples/scripts a commit touched. Zero
  new git calls; pure re-slicing of already-collected data.
- New `commit.json` section: `change_understanding` (6th section; user explicitly
  authorized new sections for this milestone).
- Verified against a real commit touching `tests/`/`docs/`/`fastapi/` (all three
  populated correctly) and a real commit touching only `.github/...` (correctly
  all-empty — same known limitation `layout_detector` already has, not a new bug).

## 2026-07-13 (Milestone 4A, in progress)

- Began structured per-commit `commit.json` (5 sections: `identity`, `metadata`,
  `change_set`, `artifacts`, `collection`), specified and built one section at a time per
  the user's explicit instruction — not all together.
- Added `DatasetCollector._build_commit_identity` (`hash`/`parent_hashes`/`repository`),
  `_build_commit_metadata` (`author`/`date`/`message`, reshaped from
  `GitClient.get_commit_metadata`), `_build_commit_change_set` (changed/added/deleted/
  renamed/modified files from `GitClient.get_changed_files` — this gives
  `get_changed_files` its first real caller), `_build_commit_artifacts` (relative paths).
  All four verified standalone against real repos; none wired into `collect()` yet.
- Real behavior change: `metadata.json`/`diff.patch` moved from `commits/<hash>/` to
  `commits/<hash>/artifacts/` (ADR-003), to leave room for `commit.json` at the commit
  directory's top level. Verified live against `fastapi/fastapi`.
- `collection`, the fifth section, not yet specified — `commit.json` itself is not yet
  written anywhere.

## 2026-07-13 (Milestone 3, step 1 cont.)

- Added `src/utils/layout_detector.py` with `detect_layout(file_paths)` — classifies
  top-level tracked directories into `source`/`tests`/`documentation`/`examples`/`scripts`.
  `source` is deliberately a catch-all (everything non-hidden that doesn't match the other
  four keyword sets), not a keyword match itself — a repo's real source directory is
  usually named after the project, not a fixed word.
- Verified live against `fastapi/fastapi`: matched your example closely (`tests/`,
  `documentation`, `scripts` identical); `source` additionally picked up `docs_src/`
  (fastapi's folder of code snippets embedded in its docs — correct, since it's actual
  source, not prose); `examples` came back empty since fastapi has no such directory.
- Added `src/utils/signal_detector.py` with `detect_repository_signals(file_paths)` —
  flags `documentation`/`build`/`containerization`/`ci` marker files per the "can this
  influence reasoning about a future patch?" test. Found and fixed a real gap during
  testing: `requirements.txt` wasn't in the original marker list, so `tcx_nogrunt-1`
  (a real Pip-based repo) came back with an empty `build` list — added
  `requirements.txt`/`Pipfile`/`Pipfile.lock` after confirming with the user.
- Verified live against `fastapi/fastapi` (`README.md`, `pyproject.toml`,
  `.github/workflows/`) and `tcx_nogrunt-1` (`README.txt`, `requirements.txt`,
  `.github/workflows/`).

## 2026-07-10 (Milestone 3, step 1)

- Added `GitClient.get_default_branch`, `get_commit_count`, `get_first_commit_date`,
  `get_last_commit_date`, `get_contributors` — all single git calls, no API/auth needed.
- Caught a real bug before shipping it: `git log --reverse -1` does not return the oldest
  commit (the `-1` limit applies before `--reverse` affects display order) — fixed by
  reading the first line of the full `--reverse` output instead.
- `DatasetCollector` now fetches and saves repository-level metadata once per `collect()`
  call, to `benchmark/<repository_name>/repository.json`.
- Added `GitClient.get_tracked_files` (`git ls-files`) and a new module,
  `src/utils/language_detector.py`, with `detect_languages(file_paths)` — extension-based
  `primary_language`/`detected_languages` detection. Kept out of `GitClient` deliberately:
  language classification isn't git knowledge.
- Added `src/utils/build_system_detector.py` with `detect_build_system(repo_path, file_paths)`
  — `package_manager` detection from root-level lock files, `pyproject.toml` content
  (disambiguates Poetry/Hatch/PDM), and language-specific config files (Maven/Gradle,
  npm/pnpm/yarn). `build_system` is a deliberate `null` placeholder — no detection rule
  defined for it yet, confirmed with the user rather than guessed.
- Verified against `Nogrunt-Collaborations-Private-limited/tcx_nogrunt-1`
  (`package_manager: "Pip"`) and directly unit-tested the Poetry/Hatch/PDM/Java/Node
  branches.

## 2026-07-09 (Milestone 2)

- Replaced `GitClient.get_latest_non_merge_commit_hash` with
  `get_non_merge_commit_hashes(repo_path, max_count)`, returning a list instead of a
  single hash — one `git log --no-merges` call regardless of how many are requested.
- `DatasetCollector` now takes a `commit_count` param, clones once, and collects up to
  that many non-merge commits from the single clone; `collect()` returns a list of hashes
  instead of one.
- `main.py` is now a real CLI: `python3 main.py <repository_url> <commit_count>`, no more
  hardcoded repo/output.
- Considered injecting `GitClient` into `DatasetCollector` (found a half-written
  `__init__(self, git_client, workspace)` already in the file) and deliberately deferred
  it — no second git implementation exists yet to justify it.
- Verified: real run against `fastapi/fastapi` with `commit_count=3` produced 3 samples;
  a throwaway repo with only 3 non-merge commits, requested with `commit_count=10`,
  correctly returned all 3 instead of erroring.

## 2026-07-09

- Fixed `main.py`: it called `DatasetCollector()` and `collect(repo_url=..., output_dir=...)`,
  which didn't match the actual constructor/method signatures and raised `TypeError`
  immediately. Now calls `DatasetCollector(repository_url=..., output_directory=...)` and
  `collect()` correctly.
- Verified Milestone 1 end-to-end for the first time: `main.py` run against
  `fastapi/fastapi` produced `benchmark/fastapi/commits/7cb06f360dd44efac059848df1a9beee7643b018/{metadata.json, diff.patch}`.
- Restructured the repo to match `docs/PROJECT.md`'s documentation layout (`docs/`,
  `docs/modules/`, `docs/research/`); removed superseded top-level placeholder files.

## 2026-07-08

- Built `GitClient` (`src/git/git_client.py`): `clone_repository`, `get_commit_hashes`,
  `get_commit_metadata`, `get_parent_hashes`, `get_commit_diff`, `get_changed_files`,
  `get_file_content_at_commit`, `checkout_commit`.
- Built `DatasetCollector` (`src/collector/dataset_collector.py`) implementing
  Milestone 1's collection flow.
- Refactored merge-commit detection out of `DatasetCollector` and into
  `GitClient.get_latest_non_merge_commit_hash` (ADR-002).

## 2026-07-05

- Initial project scaffold created.

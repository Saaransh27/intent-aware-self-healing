# Milestone 5 — V1 Hardening & Real-World Validation

_2026-08-12. Dedicated document, per explicit instruction, given the
scope of what real evaluation actually found. Cross-referenced from
`docs/CURRENT_STATE.md`, `docs/MILESTONES.md`, `docs/CHANGELOG.md`._

## Objective

Not "do the automated tests pass" — this project's tests already did.
The question was whether the PR-review workspace built in Milestones
1–4 is actually useful and trustworthy against real-world PRs, and
whether its real security/operational limitations are acceptable for a
V1 or need fixing now. Every fix below was made only after being
demonstrated against real data — nothing was fixed speculatively.

## Methodology

`.env` contains real `SHAKTI_API_KEY`/`GEMINI_API_KEY` values. The
Shakti key was initially **expired** (a real `401 Unauthorized` from
Shakti Studio; its own `exp` claim showed it had lapsed four days
earlier) — diagnosed by calling `call_shakti` directly, bypassing the
adapter, which is what surfaced Finding S3 below. The user supplied a
fresh key mid-session, verified working, then used for the rest of this
milestone's real-data evaluation.

Eight real, diverse PRs were selected via the real (unauthenticated)
GitHub API — no external research, no synthetic data:

| Category | PR | Commits | Files | +/− |
|---|---|---|---|---|
| Documentation-only | `pallets/flask#5650` | 1 | 1 | 1/1 |
| Bug fix | `pallets/click#3678` | 2 | 6 | 172/4 |
| Feature | `pallets/click#3473` | 1 | 6 | 184/7 |
| Multi-file refactor | `pallets/flask#4748` | 5 | 10 | 43/681 |
| Test-only | `pallets/flask#5111` | 2 | 5 | 59/119 |
| Dependency/config bump | `fastapi/fastapi#16142` | 1 | 1 | 48/51 |
| Multi-subsystem (proxy for "multi-service") | `fastapi/fastapi#14459` | 5 | 5 | 198/25 |
| Multi-commit (small) | `pallets/click#2202` | 3 | 1 | 20/28 |

Each was run through the real, complete pipeline
(`run_pipeline_for_pr` → Evidence Fusion → reasoning → the real Shakti
LLM → `sanitize_response`/`parse_review_sections`/`validate_response`)
exactly as `POST /review/pr` does. Full real output was read and
critically evaluated, not just checked for a 200/`adapter_state`.

**Real browser E2E (login → click through the UI) was not possible**:
no registered GitHub OAuth App or client secret exists in this sandbox
— the same limitation class flagged in every prior migration milestone.
What substitutes for it here: the real backend pipeline end-to-end (8
PRs above) plus this project's existing 58 frontend tests (mocked
network layer, real component logic) plus manual code-path tracing for
the specific flows (navigation, caching, auth-expiry) requested.

## Findings and what was done about each

### F1 — [Fixed] File/finding prioritization was nearly useless in practice

Before any fix, `claimVocabulary.js`'s `RISK_BEARING_MODULES` treated
the entire `reach` module as risk-bearing. Measured against the 8 real
PRs: **34 of 39 files (87%) tiered "Requires Immediate Review," 0%
"Routine"** — including the single file in the one-line documentation
typo fix (`flask#5650`). Confirmed this wasn't cosmetic: the real
`findingTier()` computation cascades the same file-level tier into
"Critical" for that PR's own findings, so a trivial typo fix would have
displayed Critical-tier findings identical in visual weight to a real
security fix.

Root cause: `reach.large_neighborhood` (>15 sibling files) and
`reach.corroborated_wide_reach` are common structural facts about where
a file lives, not risk signals about what changed. Any file in a
normal-sized directory of a real, mature codebase triggers them.

**Fix** (`frontend/src/lib/claimVocabulary.js`, frontend-only —
`src/review/context_builder.py`'s coverage ledger, which uses the same
broad definition for its own separate purpose, was deliberately left
untouched; see F1-backend below): `RISK_BEARING_MODULES` narrowed to
`{"contract_stability"}`; `RISK_BEARING_CLAIM_IDS` gained
`reach.expected_co_change_partner_missing` (the one genuinely surprising
`reach` claim — an expected co-change partner conspicuously absent).
Re-measured against the same 8 real PRs after the fix: **22/35 (63%)**,
and critically, the documentation typo fix now correctly shows 0
flagged files / "Standard Review" scope. The remaining 63% was checked,
not just accepted — it's driven by individually-justified signals
(`history.hot_file`, `history.first_author_touch`) common in these
particular long-lived, heavily-maintained repos, not by the removed
blanket inclusion.

New tests: `frontend/src/lib/claimVocabulary.test.js`, 8 cases directly
grounded in the real claim shapes that caused this.

### F1-backend — [Named, not fixed] The backend's coverage ledger has the identical issue

`src/review/context_builder.py`'s `RISK_BEARING_MODULES` (ADR-011) uses
the same broad `reach`-as-risk-bearing definition the frontend used to.
Across all 8 real PRs, `coverage_ledger` had **zero entries** — the
"collapse safe files into Routine" mechanism never fired once. This
means the "Routine" tier is effectively dead code against real-world
data at the backend level too, not just the (now-fixed) frontend
presentation. Deliberately **not fixed this milestone** — it's backend
reasoning territory this and prior milestones have consistently kept
off-limits, and deserves its own dedicated review (a change to ADR-011's
frozen text, not a UI tweak) rather than a fix squeezed into a hardening
pass. Flagged here so it isn't lost.

### F2 — [Fixed, security] `CORSMiddleware` allowlisted `Origin: "null"`

Added in Milestone 2 to cover a legacy `file://`-opened static page. A
browser also sends `Origin: null` for a sandboxed iframe with no
`allow-same-origin` — allowlisting it let an attacker-controlled page
make a credentialed, *readable* cross-origin request to this API. (CORS
governs whether the response is *readable* by the attacker's JS, not
whether a cookie-bearing request is *sent and executed* — `SameSite=None`
on the session cookie, required for the legitimate architecture to work
at all, already means the request itself always goes through regardless
of this allowlist.)

**Fix**: `"null"` removed from `_ALLOWED_ORIGINS` (`src/api/app.py`). No
current legitimate origin needs it. New regression test:
`GithubCorsCredentialsTests::test_null_origin_is_not_granted_cors_access`.

**Classified, not fixed**: the broader "no CSRF token for state-changing
endpoints" gap (`POST /review/pr`, `POST /github/logout`) remains — see
the security classification table below. `POST /review/pr` has no
destructive GitHub actions to abuse (Milestone 4 explicitly excluded
those), so the realistic impact is API-cost abuse and repo-access
probing, not account takeover — acceptable for V1, real fix (CSRF
tokens) is later work.

### F3 — [Fixed] `PRHeader` had no way to show a closed/merged PR correctly

`PullRequestSummary`/`PullRequestDetail` never captured GitHub's real
`state` field. `PRHeader` defaulted to "Open" for anything not
explicitly `draft`. Reachable today via prev/next navigation into a PR
that gets merged mid-session, or a stale bookmark to a PR that's since
closed.

**Fix**: `state` added to `PullRequestSummary`/`Detail`
(`src/api/models.py`) and extracted in `_pull_request_summary`
(`src/github/client.py`) — present on both list and detail payloads,
unlike additions/deletions/changed_files. `PRHeader.jsx` now shows a
real "Closed" badge when `state !== "open"`, checked before `draft`.
New tests in both `tests/github/test_client.py` (state extraction) and
`frontend/src/components/PRHeader.test.jsx` (closed badge, closed-but-
stale-draft-flag case).

### F4 — [Fixed] A 401 mid-session left the user stuck with no way back to login

`App.jsx` checked auth status once on mount and never again. If the
session died while browsing (expired, revoked), the sidebar's repo list
just showed a text error forever — `authStatus` was never re-evaluated,
so `LoginGate` never reappeared short of a full page reload.

**Fix**: the repos-fetch catch block in `App.jsx` now checks for a `401`
specifically and routes through the exact same path an explicit logout
uses (clear user, `authStatus` → `unauthenticated`), rather than setting
a local error. `PRList`/`PRDetail`'s own 401 error states (deeper in the
tree, can't reach `App`'s state) each gained a real "Sign in again"
action instead of just prose — `EmptyState` gained an optional `action`
prop (`{label, href}`) for this. New tests: `App.test.jsx` (session-
expiry-mid-browsing case), `PRList.test.jsx`/`PRDetail.test.jsx`
(sign-in-again action on 401, absent on other errors),
`EmptyState.test.jsx` (action rendering).

### F5 — [Fixed, approved explicitly] `llm_adapter.py` swallowed the real exception with zero trace

`run_adapter`'s `except Exception: return _failure(...)` discarded the
actual exception completely. This is what hid the expired-key diagnosis
above — from the API consumer's side, an expired credential and a
genuine transient model hiccup are indistinguishable, both a generic
`execution_boundary_failure` → `502`, and there was no server-side log
of which. `llm_adapter.py` has been an explicitly protected file in
every prior milestone's instructions; given its history, explicit
confirmation was requested before touching it.

**Fix** (approved): one `logging.exception(...)` call added before the
existing `return _failure(...)` — no change to any return value,
signature, or behavior any caller/test can observe; confirmed via all 27
pre-existing adapter tests passing unmodified. ADR-015's Explicit
Absence/No Fabrication invariants are unaffected — the log is server-
side only, never part of the function's own contract.

### F6 — [Fixed] `response_validator.py`'s bold-balance check had a real false positive

Found directly in real model output (`pallets/click#3473`, the feature
PR): the response legitimately referenced `` `**kwargs` `` inside
backticks — Python double-star syntax, not Markdown bold — which the
naive `text.count("**") % 2` check read as an odd, "unbalanced" bold
marker, producing a `malformed_markdown` WARNING that wasn't real.

**Fix**: `_check_bold_balance` now strips inline code spans
(`` `[^`\n]*` ``) before counting `**`, the same "don't count what's
inside code" discipline `_scan_headings` already applies to fenced code
blocks. Re-ran the validator against the exact real response that
surfaced this — now `clean`. New tests grounded in that exact real
pattern, plus a regression test confirming a genuine unbalanced bold
marker *outside* a code span is still caught.

**Context on impact**: this WARNING was never displayed anywhere in the
current frontend (`validation.findings` isn't surfaced in any UI yet) —
so its current user-facing impact was zero. Fixed anyway since it's a
real, cheap, safe correctness fix to a layer this project has always
held to high precision, and will matter the moment `validation.findings`
is ever surfaced (a legitimate future feature, not built here).

### F7 — [Not fixed, dev-only] React StrictMode double-fetches on mount

Confirmed by code inspection: `<StrictMode>` (`main.jsx`) double-invokes
`useEffect` in dev, and while the `cancelled` flag in every data-fetching
effect already prevents a double state update, it can't prevent the
first invocation's fetch from firing before its cleanup runs — meaning
every mount fires two real network calls in dev. Production builds don't
double-invoke effects, so this doesn't reproduce there. **Classified
acceptable for V1** — GitHub's authenticated rate limit (5000/hr/user) is
nowhere close to being pressured by this in practice; fixing it properly
means an `AbortController` per effect, more machinery than this
milestone's remit for a dev-only cosmetic cost.

### Strength found, not a defect: the model adds real value beyond the deterministic layer

Worth recording, not just defects. The `multi_service` PR
(`fastapi/fastapi#14459`) review correctly identified a **real syntax
error** in a newly added test file
(`async def get_token(...]) ) -> str:` — an extra closing bracket) purely
by reading the raw diff text, something no deterministic claim covers.
Across all 8 real reviews: no fabricated certainty, no numeric
confidence language, hedged/evidence-grounded phrasing throughout
("verify that…", "confirm that…"), and review length visibly tracked
each PR's real complexity (the one-line doc fix got 3 short findings;
the 10-file refactor got 6).

### Residual, not newly investigated this milestone

The model's prose does not literally use the 4 mandated uncertainty
terms (Confirmed/Likely/Worth checking/Unknown) — it uses equivalent but
different phrasing ("is unresolved," "cannot be determined"). This is a
real gap between `SYSTEM_PROMPT`'s literal instruction and GPT-OSS-120B's
actual behavior, observed across all 8 samples. **Not touched**: Prompt
v1 is frozen (Milestone 15E) under an explicit 4-condition bar for
revision (real, repeatable, systematic, verified-not-to-regress) that
this single evaluation round doesn't attempt to clear — named here as a
candidate for a future, dedicated prompt-revision round, consistent with
the discipline that froze it in the first place.

## Security limitations — classified

| Limitation | Classification | Why |
|---|---|---|
| `"null"` CORS origin | **Fixed this milestone** | Concrete, one-line, real exploit path (F2) |
| No CSRF token on state-changing endpoints | Acceptable for V1 / later work | No destructive GitHub actions exist yet to abuse; real fix needs a dedicated CSRF-token design |
| In-memory session store (Milestone 29) | Acceptable for V1 | By design, matches "no database" constraint; blocker only at multi-instance scale |
| Access token as a subprocess argument during git clone/fetch (Milestone 30) | Acceptable for V1 | Narrow window, single-tenant-per-request; real fix (`GIT_ASKPASS`) is later work |
| `llm_adapter.py` swallowing exceptions silently | **Fixed this milestone** | One-line, behavior-preserving, directly demonstrated (F5) |
| GitHub API rate limits (60/hr unauth, 5000/hr per authenticated user) | Acceptable for V1 | Expected usage is well under both; StrictMode dev-double-fetch (F7) is the only thing that could pressure it, and only in dev |
| Response-validator false positive (F6) | **Fixed this milestone** | Real, cheap, safe; zero current UI impact but latent |

No V1 blockers were found. Everything classified "acceptable for V1"
has a stated reason it doesn't need to block release, not just a
deferral by default.

## Dead code reviewed

`pages/CommitReviewPage.jsx` (the pre-Milestone-4 commit-URL flow, moved
verbatim, not deleted per instruction) was re-read in full. Still
functionally intact — no regressions, no changes made. No decision was
made about its ultimate fate; it remains reachable at `/legacy/commit`,
unlinked from the product shell.

## API/request behavior re-verified (no new issues found)

- PR list is fetched once per repository (owner/repo), not once per PR —
  confirmed by re-reading `RepoWorkspace.jsx`'s effect dependency array.
- The review cache (`RepoDetail`'s `Map`) is checked before every
  `fetchPRReview` call — confirmed by the existing Milestone 4 cache-hit
  test, still passing.
- The fast PR-detail fetch and the slow review fetch are independent,
  parallel effects, not chained — confirmed by design and by the "header
  renders without waiting on the review" test.

## Full results

313 → 316 backend tests (3 net new: 1 CORS null-origin regression, 2
response-validator bold-balance regressions — several existing tests'
fixtures were also updated in place for the new required `state` field,
not counted as new). 41 → 58 frontend tests (17 new: 8
`claimVocabulary.js` risk-bearing cases, 2 PRHeader closed-state, 2
EmptyState action, 2 PRList 401, 2 PRDetail 401, 1 App session-expiry —
existing PR fixtures across several files were also updated in place
for the new `state` field). All passing. Frontend build and lint both
clean.

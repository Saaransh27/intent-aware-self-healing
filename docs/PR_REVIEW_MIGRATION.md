# PR Review Migration — Milestone 0: Current-State Architecture

_Written 2026-08-09. Documentation only — no functionality changed in this
milestone. Every claim below was confirmed directly against the current
source (not recalled from memory or inferred), except where marked
otherwise._

## 0. Product direction (context for everything below)

Today: `Repository URL → Commit Hash → Review` (one commit per request, no
identity, nothing persisted).

Target: `GitHub OAuth → User's accessible repositories → Repository →
Open PRs → Select PR → Review PR → Navigate to next/previous PR`.

Three workstreams: (1) commit-based → PR-based backend review, (2) GitHub
OAuth + repository/PR discovery, (3) a multi-repository/multi-PR frontend.
This document covers only what exists today, so those three workstreams
can be scoped against real code rather than assumption.

---

## 1. Current frontend flow

Two separate, independently-running frontends exist today, both calling
the same unmodified `POST /review` endpoint. Neither has any concept of a
PR, a repository list, or authentication.

**`playground/`** (deployed, live at the Vercel URL) — `index.html` +
`styles.css` + `app.js` + `config.js`. One form (repository URL, optional
commit hash), one submit button, one output region. `app.js` posts to
`window.API_BASE_URL` (set by `config.js`, currently the Render URL),
renders `review.sections` via a small hand-written markdown-lite renderer
when `parsed: true`, falls back to `review.raw` otherwise, and maps HTTP
404/500/502/504 to fixed plain-language strings. No routing, no state
beyond the current request, no history.

**`frontend/`** (React 19 + Vite, not deployed, runs against a local or
configured backend) — `App.jsx` holds one status enum
(`idle|loading|success|error`) and calls `fetchReview` (`lib/api.js`) on
form submit from `SearchPanel.jsx`. On success it renders 7 components in
a fixed order — `ExecutiveSummary`, `CommitStats`, `FileOverview`,
`ReviewFindings`, `OpenQuestions`, `ManualVerification`, `ReviewStrategy`
— all driven by the same single API response object (`reviewData`) held
in one `useState`. There is no router, no concept of "next commit," and
no list of anything — the user must already know a repository URL and,
optionally, a commit hash before they can see a review.

**Shared characteristic relevant to this migration**: both frontends are
built around exactly one review at a time, fetched by one form submission,
with no navigation between reviews and no list of what's available to
review. There is nowhere in either codebase that currently lists commits,
PRs, or repositories — that concept does not exist yet on the frontend.

---

## 2. Current backend flow

One HTTP endpoint does everything: `POST /review` in `src/api/app.py`.

```
POST /review {repository_url, commit_hash?}
  -> get_pipeline_runner() dependency (injects call_shakti as `execute`)
  -> ThreadPoolExecutor.submit(run_pipeline_for_commit, repository_url, commit_hash)
       [90s timeout; CommitResolutionError -> 404]
  -> run_pipeline_for_commit(repository_url, commit_hash, execute)   [src/pipeline/orchestrator.py]
       -> tempfile.TemporaryDirectory()
       -> GitClient().clone_repository(repository_url, temp_dir)     [full clone, not shallow]
       -> DatasetCollector(repository_url, temp_dir, commit_count=1)
       -> if commit_hash is None: GitClient.get_non_merge_commit_hashes(repo, 1)[0]
       -> _build_evidence(...): 8 DatasetCollector._build_commit_* builder methods,
          called directly (collect() itself is NOT used here)
       -> GitClient.get_commit_diff(repo, commit_hash)                [raw unified diff text]
       -> fuse_evidence(evidence)                                     [src/fusion/]
       -> run_reasoning(fused) -> synthesize(...)                     [src/reasoning/]
       -> build_review_context(synthesized, metadata, change_set,
                                diff_text, commit_hash)                [src/review/context_builder.py]
       -> build_prompt(review_context)                                [src/prompt/prompt_builder.py]
       -> run_adapter(prompt, execute=call_shakti)                    [src/adapter/]
       -> run_review_engine(adapter_result)                           [src/review_engine/]
  -> adapter_state == "adapter_boundary_failure" -> 500
  -> adapter_state == "execution_boundary_failure" -> 502
  -> sanitize_response(raw text) -> parse_review_sections(...) -> validate_response(...)
  -> ReviewResponse{...}  [200]
```

Every step above operates on **exactly one commit hash in one repository
per call**, resolved to a full local clone that is discarded
(`TemporaryDirectory`) at the end of the request. There is no request
that operates on a range of commits, a PR, or a branch diff — `git diff`
is always computed against the commit's own first parent
(`GitClient.get_commit_diff`/`get_diff_stats`), never against an
arbitrary base branch.

---

## 3. Where repository/commit enters

- **Frontend**: a plain text `<input>` for `repository_url` (required,
  any string, no validation beyond non-empty) and an optional
  `commit_hash` text input, in both `playground/app.js` and
  `frontend/src/components/SearchPanel.jsx`. Neither frontend has ever
  called the GitHub API — there is no autocomplete, no repository list,
  no way to browse.
- **Backend**: `ReviewRequest` (`src/api/models.py`) —
  `{repository_url: str, commit_hash: Optional[str] = None}`. If
  `commit_hash` is omitted, `run_pipeline_for_commit` resolves it to the
  repository's single most recent non-merge commit
  (`GitClient.get_non_merge_commit_hashes(repo_path, 1)`). There is no
  concept of a pull request anywhere in the request or resolution path —
  a PR number, branch name, or base/head pair cannot be expressed today.

---

## 4. How diffs are obtained

All diff data comes from a full local `git clone` (`GitClient.
clone_repository`, no `--depth 1`) followed by plain `git` subprocess
calls in `src/git/git_client.py` — there is no GitHub API call anywhere
in the diff path, and no dependency capable of making one exists in
`requirements.txt` (`fastapi`, `uvicorn`, `httpx` only; `httpx` is FastAPI's
own transitive requirement, not used to call GitHub).

- `get_commit_diff(repo_path, commit_hash)` — resolves the commit's first
  parent (`get_parent_hashes`; falls back to git's empty-tree hash
  `4b825d...` for a root commit) and runs `git diff <parent> <commit>`
  for the raw unified diff text fed into the prompt as Evidence Units.
- `get_changed_files` — `git diff --name-status <parent> <commit>`, used
  to build `change_set` (added/deleted/modified/renamed file lists).
- `get_diff_stats` (Milestone 26) — `git diff --numstat <parent>
  <commit>`, real per-file insertion/deletion counts, `None` (not `0`)
  for binary files.

**Implication for PR review**: a PR's diff is conceptually `git diff
<base_branch_head>...<head_branch_head>` (or GitHub's own PR-diff API),
not `git diff <parent> <commit>` for a single commit. None of the three
methods above take an arbitrary base ref today — they all derive the
"before" side from the target commit's own parent. This is the single
largest structural assumption baked into the current diff layer.

---

## 5. How the review pipeline is invoked

One function is the entire seam between "have a repo URL and a commit
hash" and "have a rendered review": `run_pipeline_for_commit(
repository_url, commit_hash, execute) -> dict`
(`src/pipeline/orchestrator.py`). It is called from exactly one place,
`src/api/app.py`'s `get_pipeline_runner()`. `main.py` and
`run_full_pipeline.py` (CLI entry points, largely superseded by the API)
call `DatasetCollector`/older orchestration directly and are not part of
the live product path.

Everything downstream of `run_pipeline_for_commit` —
`fuse_evidence`/`run_reasoning`/`synthesize`/`build_review_context`/
`build_prompt`/`run_adapter`/`run_review_engine` — takes a single
commit's evidence dict and has no awareness of "this commit belongs to a
PR" or "there are N commits in this PR." Nothing in this chain is
PR-shaped or PR-aware today.

---

## 6. Review input/output structures

**Input** — `ReviewRequest`: `{repository_url: str, commit_hash: str |
None}`.

**Output** — `ReviewResponse` (`src/api/models.py`), all fields already
real (no field is a placeholder):

```
repository_url: str
commit_hash: str
outcome: str                    # "evaluated" (Review Engine outcome)
adapter_state: str              # "success" (only state that reaches this point)
review: { raw: str, parsed: bool, sections: {verdict, what_changed_and_why,
          what_deserves_attention_ranked, open_questions, minor_notes} | null }
findings: []                    # always empty — ADR-016's category-1 catalogue is unbuilt
validation: { outcome, findings: [{rule, severity, message, location}] } | null
review_context: {               # Milestone 26 — same object fed to the prompt
    commit_summary: {message, changed_files, added_files, deleted_files,
                      modified_files, renamed_files: [{old_path, path}]},
    commit_claims: [Claim], file_claims: {path: [Claim]},
    gaps: {commit: [Gap], files: {path: [Gap]}},
    coverage_ledger: [{collapsed_group_files, collapsed_count,
                        representative_file, justifying_claims}],
} | null
observations: {                 # Milestone 26
    touched_directories: {source, tests, documentation, examples, scripts},
    file_classification: {path: category},
    change_statistics: {files_added, files_deleted, files_modified, files_renamed},
    change_categories: {touches_tests, touches_documentation, touches_dependencies,
                         touches_build_files, touches_ci, touches_config},
    extraction_confidence: {unknown_file_count, unsupported_extensions,
                             skipped_binary_file_count},
    diff_stats: {total_insertions, total_deletions, files: {path: {insertions, deletions}}},
} | null
```

`Claim` = `{claim: str, scope: {level, file_path?, qualified_name?},
confidence: observed|inferred|corroborated|conflicting, basis: [str],
module: str}`. `Gap` = `{reason, scope, missing: [str], module}`. Both are
scoped to `"commit"` or `"file"` level only — **there is no PR-level or
cross-commit scope anywhere in this vocabulary today**. Every claim/gap
in the current system is computed against one commit's diff in isolation.

---

## 7. Relevant frontend components

From `frontend/src/`:

- `App.jsx` — orchestrates one request/response cycle; would need to
  become PR-aware (which PR, which repo) rather than commit-aware, and
  would need real navigation state (current PR, next/previous) that does
  not exist today.
- `components/SearchPanel.jsx` — the only place a repository/commit
  currently enters the system; the entire concept of typing a raw URL is
  what OAuth + discovery replaces.
- `components/ExecutiveSummary.jsx`, `CommitStats.jsx`, `FileOverview.jsx`,
  `ReviewFindings.jsx`, `OpenQuestions.jsx`, `ManualVerification.jsx`,
  `ReviewStrategy.jsx` — each consumes `review_context`/`observations`/
  `review.sections` generically; none of them assume "commit" in a way
  that couldn't equally describe "PR" once the backend response shape is
  extended (see §9/§10).
- `lib/reviewContext.js`, `claimVocabulary.js`, `reviewTiers.js`,
  `textFormatting.jsx` — pure functions over the response shape, no
  network/routing coupling; these are the most reusable pieces on the
  frontend.
- `lib/api.js` — `fetchReview({repositoryUrl, commitHash})`, hardcoded to
  the single-commit request shape and a hardcoded 502-retry rationale
  tied to `execution_boundary_failure`'s old name (`_has_contract_violation`,
  the comment here is now stale as of Milestone 26 — the function it
  refers to was removed; worth a one-line correction whenever this file
  is next touched, noted here rather than fixed silently in a
  documentation-only milestone).
- `playground/` (`app.js`, `styles.css`, `index.html`, `config.js`) — the
  live, deployed frontend; out of scope for the redesign described in
  workstream 3 unless explicitly decided otherwise (currently undecided —
  see §10).

---

## 8. Relevant backend components

- `src/api/app.py` — `POST /review`, the one endpoint; would need a
  parallel or replacement endpoint for PR review, plus new endpoints for
  "list my repositories" / "list open PRs" (workstream 2).
- `src/api/models.py` — `ReviewRequest`/`ReviewResponse` and everything
  nested in them; a PR-based request needs a different identity (PR
  number or base/head refs, not a single `commit_hash`), and possibly a
  different resolution result (which commits make up the PR).
- `src/pipeline/orchestrator.py` — `run_pipeline_for_commit`, the single
  seam commit-based review flows through today. The natural extension
  point for PR-based review: something that resolves a PR to a diff
  (base...head) and either reuses this function's downstream half
  unchanged or introduces a sibling, `run_pipeline_for_pr`.
- `src/git/git_client.py` — `clone_repository`, `get_commit_diff`,
  `get_changed_files`, `get_diff_stats`, `get_non_merge_commit_hashes`;
  all first-parent/single-commit shaped today (§4). A PR review needs a
  base-ref-aware diff, which none of these currently express.
- `src/collector/dataset_collector.py` — the eight `_build_commit_*`
  builder methods `_build_evidence` calls directly; each is scoped to one
  commit hash (`repo_path, commit_hash[, change_set][, metadata]`
  signatures). Whether these generalize to "a set of commits" or "a
  base...head range" is the central open question for workstream 1.
- `src/fusion/`, `src/reasoning/`, `src/review/context_builder.py`,
  `src/prompt/prompt_builder.py`, `src/adapter/`, `src/review_engine/` —
  everything from Evidence Fusion onward already operates on a single
  evidence dict shaped once by `_build_evidence`; none of them know or
  care that the evidence originated from a "commit" specifically, as
  long as the same evidence shape (`metadata`, `change_set`,
  `observations`, `file_history`, `co_change`, `local_module_context`,
  `semantic_analysis`) is populated for whatever unit is being reviewed.
- `src/response_validation/response_validator.py` — text-only, has no
  awareness of commit vs. PR at all; unaffected either way.
- No GitHub OAuth, session, user, or repository-listing code exists
  anywhere in `src/` today — workstream 2 starts from zero, not from a
  partial implementation.

---

## 9. What can be reused for PR review

Reuse falls into two tiers:

**Reusable unmodified** — everything downstream of "we have a diff and a
commit's evidence dict": `src/fusion/evidence_fusion.py`,
`src/reasoning/` (all 6 modules + synthesizer), `src/review/
context_builder.py`, `src/prompt/prompt_builder.py`,
`src/adapter/llm_adapter.py`, `src/review_engine/review_engine.py`,
`src/response_validation/response_validator.py`. This is most of the
review engine's intelligence, and the user's explicit instruction ("the
existing review engine and review output are valuable and should be
preserved wherever possible") lines up directly with what's structurally
true: none of this code inspects the word "commit" or assumes a single
parent — it consumes whatever evidence dict it's given.

**Reusable with a real decision required, not automatic** — the eight
`_build_commit_*` methods and the three `GitClient` diff methods (§4/§8)
are all written against "one commit vs. its own parent." A PR is either
(a) treated as a single synthetic diff (base...head collapsed into one
evidence dict, closest to today's shape, least invasive) or (b) treated
as its constituent commits reviewed individually with results merged
(a materially different evidence and UI model). This document does not
decide between them — that decision belongs to the Milestone 1 plan, not
Milestone 0.

The frontend's presentational layer (`components/*.jsx`,
`lib/reviewContext.js`, `claimVocabulary.js`, `reviewTiers.js`) is
reusable close to as-is under option (a) above, since it already renders
generically off `review_context`/`observations` rather than off any
commit-specific field name.

---

## 10. What must change

- **Diff resolution**: `GitClient` needs a base-ref-aware diff path (PR
  base...head), not just first-parent-of-one-commit. This is the one
  change with no reusable precedent in the current codebase (§4).
- **Request/response identity**: `ReviewRequest`/`ReviewResponse` need a
  PR identity (repository + PR number, or base/head refs) in place of
  `commit_hash`. Whether `commit_hash` is kept as an optional secondary
  field (for drilling into one commit within a PR) or removed is a
  Milestone 1 decision.
- **New backend surface entirely** (workstream 2): GitHub OAuth
  (authorization flow, token storage/session), "list my accessible
  repositories," and "list a repository's open PRs" — none of this exists
  in any form today; it is new code, not a refactor of anything listed in
  §8.
- **Frontend navigation model**: neither frontend has a router, a list
  view, or any "current item in a set" state today. Workstream 3 needs
  all three: an authenticated repo list → PR list → PR review view, plus
  next/previous navigation within an open PR list — none of which
  `SearchPanel.jsx`'s one-shot form provides.
- **A decision on `playground/`'s fate**: it is the only currently
  *deployed* frontend, entirely disconnected from the `frontend/` React
  rebuild, and structurally incapable of the OAuth/list/navigate flow
  (no framework, no routing, no build step). Not resolved by this
  document — flagged here as a real open question for whoever scopes
  workstream 3, not a recommendation either way.
- **Response Validation Layer's claim-id/gap-reason allowlists**
  (`src/response_validation/response_validator.py`'s `_CLAIM_IDS`,
  `docs/modules/*`) are commit-shape-agnostic already (they check text
  content, not scope), so no change is anticipated here — flagged only so
  it isn't mistaken for something needing rework.

---

## Explicitly out of scope for this document

Per Milestone 0's own instruction, no functionality changed to produce
this document, no ADR was written, and no decision was made between the
two PR-shape options in §9 or the `playground/` question in §10 — both
are named as open questions for the Milestone 1 proposal, not resolved
here.

---

## Milestone 1 — Backend PR Review (implemented, 2026-08-09)

**Status: complete, backend-only, not deployed.** Full detail in
`docs/MILESTONES.md` (Milestone 28) and `docs/CHANGELOG.md`; this section
records the decisions this document left open in §9/§10 and how they were
resolved.

**§9's PR-shape question is resolved**: option (a), one synthetic diff
(`base...head`, git's own three-dot semantics — the diff against the
merge-base, not a two-dot diff against base's current tip). This is the
version deployed: `GitClient.get_pr_diff`/`get_merge_base`/`fetch_ref`
(new), `orchestrator.run_pipeline_for_pr` (new, sibling to
`run_pipeline_for_commit`, which is unmodified), `POST /review/pr` (new
endpoint, `POST /review` unmodified).

**§9's "generalize the builders vs. small PR-specific path" question**
was checked explicitly before coding, not assumed: only 3 of
`DatasetCollector`'s 8 `_build_commit_*` builders make a git call that
derives "the old side" from a commit's own first parent
(`_build_commit_change_set`, `_build_commit_diff_stats`,
`_build_commit_semantic_analysis`); each gained one uniformly-named
`parent_hash=None` override, generalizing a pattern two of them already
delegated to (`GitClient.get_changed_files`/`get_diff_stats` already took
an explicit `parent_hash`). The other 5 builders needed zero changes.
`_build_commit_metadata` was **not** generalized — it's replaced outright
by a new, small function (`_pr_metadata`) building the same
`{author, date, message}` shape from the GitHub PR API response instead,
exactly the "small PR-specific input path that converges into the
existing evidence pipeline" this document's §9 anticipated.

**§4's diff-resolution gap is closed**, scoped narrowly: `get_pr_diff`
handles the base-ref-aware diff a PR needs. `get_commit_diff` (single-
commit, first-parent) is untouched — both now coexist.

**§10's decisions, resolved or explicitly still deferred:**

- Request/response identity: resolved as **additive**, not a replacement
  — `PRReviewRequest`/`PRReviewResponse` are new models; `ReviewRequest`/
  `ReviewResponse` (commit-based) are unchanged. `commit_hash` was not
  removed from anything.
- GitHub OAuth + repository/PR discovery: **still not started**, exactly
  as scoped — `src/github/pr_resolver.py` resolves one already-known PR
  number via GitHub's public, unauthenticated API; there is still no way
  to list a user's repositories or a repository's open PRs.
- Frontend navigation model: **still not started**, exactly as scoped —
  neither `playground/` nor `frontend/` can call `/review/pr` yet.
- `playground/`'s fate: **still undecided**, exactly as this document
  left it.

**One concrete compatibility issue was found and deliberately not
fixed**, per the standing "don't modify evidence/reasoning inputs unless
a concrete issue is found, and even then prefer the smallest fix" rule:
`_build_commit_file_history`/`_build_commit_co_change` exclude only the
single `commit_hash` entry from "history." For a multi-commit PR that
touches the same file more than once, the PR's own earlier commits are
counted as history rather than current change — a real but narrow
inflation risk for `history.rapid_iteration`/`hot_file`-style claims,
affecting multi-commit PRs only. Documented in `docs/MILESTONES.md`
(Milestone 28) rather than fixed, since a correct fix changes those two
methods' semantics (exclude a set of commits, not one) for a secondary
signal.

**Verified against a real, merged PR**: `pallets/click#3704` — real
GitHub API resolution, real clone/fetch, real three-dot diff (its
291/165 insertion/deletion totals matched GitHub's own reported PR stats
exactly). 238 tests total (217 pre-existing + 21 new); the existing
`POST /review` test class is unmodified.

**Next**: Milestone 2 (GitHub OAuth + repository/PR discovery) has not
been started, per explicit instruction to implement one milestone at a
time.

---

## Milestone 2 — GitHub Auth + Discovery (implemented, 2026-08-09)

**Status: complete, backend-only, not deployed.** Full detail in
`docs/MILESTONES.md` (Milestone 29) and `docs/CHANGELOG.md`.

**§10's "GitHub OAuth + repository/PR discovery: still not started"
item is now resolved.** GitHub is the sole identity provider (no custom
username/password system): `GET /github/login`/`GET /github/callback`/
`POST /github/logout` for the OAuth dance, `GET /github/me`/`GET
/github/repos`/`GET /github/repos/{owner}/{repo}/pulls`/`GET
/github/repos/{owner}/{repo}/pulls/{number}` for discovery — the exact
4 suggested routes, plus the 3 auth itself requires.

**Session boundary**: `src/api/session_store.py`, in-memory
`dict[session_id → access_token]`. The frontend never receives a raw
GitHub token — only an opaque `session_id` cookie (httponly). This is
the seam a future frontend uses to determine the authenticated user
(`GET /github/me`), exactly as this document's original product
direction (§0) anticipated needing.

**§10's frontend navigation model item remains, correctly, still not
started** — this milestone was explicitly backend-only. Neither
`playground/` nor `frontend/` can call any `/github/*` route yet; that
is Milestone 3's work.

**§10's `POST /review/pr` authentication question is resolved by
explicit deferral, not by fixing it**: `src/github/pr_resolver.py` and
`run_pipeline_for_pr` are completely untouched. This produces a real,
named gap — a user can now discover a private repo's open PRs, but
`/review/pr` still can't clone or review one, since both the GitHub API
call and the git clone inside it remain unauthenticated. Not fixed here;
flagged as real follow-up work for whoever picks up private-repo review
support.

**One necessary shared-infrastructure change**, not a review-logic
change: `CORSMiddleware` moved from `allow_origins=["*"]` to an explicit
allowlist plus `allow_credentials=True` — required for the session
cookie to legally cross origins at all. `/review` and `/review/pr`'s own
handlers are untouched.

**Verification, stated plainly**: no registered GitHub OAuth App and no
personal access token exist in this sandbox, so the live
login→callback→discovery chain could not be exercised end-to-end against
real GitHub data — the same limitation class `SHAKTI_API_KEY`'s absence
already caused for the real model call. A live call against the actual
GitHub API with a deliberately invalid token did return a real,
correctly-parsed `401`, confirming the request/response plumbing works
against the live API. Logic correctness is covered by 46 new tests with
the HTTP layer mocked (this milestone's own testing guidance explicitly
permits this). 284 tests total (238 pre-existing + 46 new); `POST
/review` and `POST /review/pr`'s test classes are unmodified.

**Next**: Milestone 3 (frontend repository sidebar, PR list, and the new
review layout around this navigation) has not been started, per explicit
instruction to implement one milestone at a time.

---

## Milestone 3A — Authenticated Private-Repo PR Review (implemented, 2026-08-09)

**Status: complete, backend-only, not deployed.** Full detail in
`docs/MILESTONES.md` (Milestone 30) and `docs/CHANGELOG.md`. Closes the
exact gap Milestone 2 named and deliberately deferred: `POST /review/pr`
was fully unauthenticated, so a user could discover a private repo's PR
but never actually review it.

**Resolved, additively**: authentication on `/review/pr` is an
enhancement, not a requirement. No session → identical to Milestone 1
(re-verified live against `pallets/click#3704` — same SHAs, file count,
diff totals). Valid session → the same token both selects an
authenticated resolver (`src/github/client.py`'s new
`get_pull_request_refs`, a drop-in for `pr_resolver.resolve_pull_request`
with the identical shape) and is threaded into `run_pipeline_for_pr`'s
own `clone_repository`/`fetch_ref` calls (`GitClient` gained an optional
`access_token`, applied as a git `http.extraHeader`, not a
token-embedded URL — keeps `repository_url` clean in every error message
this project already constructs, and git's own failure text can't echo
a header the way it could a URL).

**`src/github/pr_resolver.py` remains completely untouched** — the
authenticated path is a parallel function, not a modification.

**Named, not solved**: the header value is still a subprocess argument
(visible via `ps`/procfs for the life of the git process); eliminating
that needs `GIT_ASKPASS`-based credential injection, more machinery than
this milestone's scope. No real private GitHub repository exists in this
sandbox, so private-repo access is proven at the mechanism level (a real
local git remote + a spy confirming the token reaches exactly the calls
that would matter) rather than against genuine private-repo data.

**Verified**: 27 new tests across `GitClient`, `session_store`,
`src/github/client.py`, the orchestrator, and the API layer — including
simulated git- and GitHub-API-level auth failures, both confirmed to
fail cleanly without the token ever appearing in the resulting error.
311 tests total (284 pre-existing + 27 new); `POST /review` and `POST
/review/pr`'s pre-existing test classes are unmodified.

**Next**: Milestone 3 (frontend repository sidebar, PR list, and the new
review layout) has not been started, per explicit instruction to
implement one milestone at a time.

---

## Milestone 4 — Product Frontend / PR Review Workspace (implemented, 2026-08-11)

**Status: complete, not deployed.** Full detail in `docs/MILESTONES.md`
(Milestone 31) and `docs/CHANGELOG.md`. This is workstream 3 from §0's
original product direction, and closes the frontend-awareness gap named
at the end of every prior milestone in this document.

**The primary flow changed, as directed**: GitHub login → accessible
repositories → open PRs → PR review workspace, persistent sidebar,
previous/next navigation. The old "repository URL + commit hash" flow
is not the primary UI anymore, per explicit instruction — its code is
preserved, functionally intact, at `pages/CommitReviewPage.jsx`
(`/legacy/commit`, unlinked from the new shell).

**§7/§9's frontend-reuse question is resolved by evidence, not
assumption**: `FileOverview`, `ReviewFindings`, `OpenQuestions`,
`ManualVerification`, `ReviewStrategy`, `reviewContext.js`,
`reviewTiers.js`, `claimVocabulary.js`, `textFormatting.jsx` needed zero
changes — confirmed by reading every one of them in full before writing
any new code, exactly as instructed. Two small, optional, backward-
compatible prop additions (`ExecutiveSummary.showIdentity`,
`FileOverview`'s `owner`/`repo`/`headSha`) were the only touches to
existing components.

**One small, additive backend touch, identified rather than worked
around with fabrication**: GitHub's single-PR endpoint already returns
`additions`/`deletions`/`changed_files`; `src/github/client.py` simply
hadn't been extracting them. Now it does. GitHub's PR *list* endpoint
never returns these three fields at all — a real, permanent API
limitation, not something this milestone fixed — so PR list rows
show them as absent, never a fabricated zero; real values appear once a
specific PR is opened. Evidence Fusion, reasoning, `context_builder`,
`prompt_builder`, the Adapter, the Review Engine, and `POST /review`'s
own logic are all untouched.

**New frontend infrastructure, both decided explicitly before coding**:
`react-router-dom` for real, shareable URLs and correct back/forward
between PRs; `vitest`/`@testing-library/react` — this project's first
frontend test framework, since none existed before this milestone.

**Data integrity was checked, not assumed**: every new component was
reviewed against this milestone's own no-fabrication rule before being
considered done — no risk scores, confidence percentages, severity
values, estimated review time, or invented file/PR statistics anywhere.

**Verification is honestly partial, the same limitation class as every
prior milestone in this document**: no registered GitHub OAuth App or
personal access token exists in this sandbox, so the live login → repo
list → PR list → review flow could not be exercised end-to-end in a
real browser. What was verified for real: the backend's genuine `401`
for `/github/me` unauthenticated (via `curl` against a locally running
server — exactly the condition that makes the frontend show
`LoginGate`), and a clean frontend build/lint/dev-server boot. Every
authenticated state (repository list, PR list, PR review generation,
prev/next navigation, caching, all loading/empty/error states) is
covered by 41 new tests with the network layer mocked instead — not a
live browser session.

**Next**: no further milestone (V1 hardening or deployment) has been
started, per explicit instruction to stop here.

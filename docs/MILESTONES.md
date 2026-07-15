# Milestones

## Milestone 1 — Generate one benchmark sample from a GitHub repository

**Status: Complete** (verified 2026-07-09)

Deliverables (per `PROJECT.md`):

- [x] Clone repository
- [x] Fetch latest non-merge commit
- [x] Save `metadata.json`
- [x] Save `diff.patch`

Verified by running `python3 main.py` against `fastapi/fastapi`, producing
`benchmark/fastapi/commits/7cb06f360dd44efac059848df1a9beee7643b018/{metadata.json, diff.patch}`.

Explicitly out of scope, per `PROJECT.md`, and not present: AI, embeddings, context
graphs, evaluation.

## Milestone 2 — Configurable multi-commit dataset generator

**Status: Complete** (verified 2026-07-09)

Goal: turn the one-commit prototype into a reproducible generator — input is just a
repository URL and `n`, output is up to `n` non-merge commit samples.

Deliverables:

- [x] `main.py <repository_url> <commit_count>` CLI
- [x] Clone once, collect up to `commit_count` non-merge commits from that single clone
- [x] If the repo has fewer non-merge commits than requested, collect what exists (no error)
- [x] Same per-commit output layout as Milestone 1, for each collected commit

Verified by running `python3 main.py https://github.com/fastapi/fastapi 3` (produced 3
samples) and against a throwaway local repo requesting more commits than it had (correctly
returned all available commits instead of erroring).

Explicitly deferred, not in this milestone: commit-quality filtering (bot authors, vague
messages, diff size), injecting `GitClient` instead of constructing it internally — both
considered, deliberately not built since no concrete need for either exists yet.

## Milestone 3 — Repository-level metadata + (future) commit quality

**Status: In progress** — step 1 complete (2026-07-10)

Step 1: extract basic repository metadata alongside commit collection.

- [x] `GitClient.get_default_branch/get_commit_count/get_first_commit_date/`
      `get_last_commit_date/get_contributors` — all git-derived, no API/auth needed
      (per ADR-001).
- [x] `GitClient.get_tracked_files` + `src/utils/language_detector.detect_languages` —
      `primary_language`/`detected_languages` from tracked file extensions.
- [x] `src/utils/build_system_detector.detect_build_system` — `package_manager` from
      lock files / `pyproject.toml` content / language-specific config files.
      `build_system` is a deliberate `null` placeholder — no detection rule defined yet.
- [x] `src/utils/layout_detector.detect_layout` — classifies top-level directories into
      `source`/`tests`/`documentation`/`examples`/`scripts`. `source` is a catch-all, not
      a keyword match.
- [x] `src/utils/signal_detector.detect_repository_signals` — flags `documentation`
      (README/CONTRIBUTING), `build` (pyproject.toml/package.json/go.mod/Cargo.toml/
      Makefile/requirements.txt/Pipfile), `containerization` (Dockerfile/docker-compose),
      `ci` (`.github/workflows/`). Selection test: "can this file influence how we reason
      about a future patch?" LICENSE/CHANGELOG.md/.gitignore excluded on that basis;
      CODEOWNERS/SECURITY.md deferred until ownership/security reasoning exists.
- [x] `DatasetCollector` fetches and saves all of this once per `collect()` call, to
      `benchmark/<repository_name>/repository.json`, alongside the per-commit output.

Verified against `Nogrunt-Collaborations-Private-limited/tcx_nogrunt-1` (a real private
org repo, reachable via plain `git clone`): produced `repository.json` with 352 commits,
first/last commit dates, default branch `main`, 12 contributors, `primary_language:
"Python"` with 5 detected languages, `package_manager: "Pip"` (via `requirements.txt`),
and `repository_signals` correctly showing `README.txt` (not `.md`), `requirements.txt`
under `build`, and `.github/workflows/` under `ci`. Also unit-verified the Poetry/Hatch/PDM
disambiguation logic and the Java/Node fallbacks directly. Layout detection verified live
against `fastapi/fastapi` (correctly matched `tests/`, `docs/`, `scripts/`; put `fastapi/`
and `docs_src/` under `source`; `examples` came back empty since fastapi has no such
directory).

Deliberately deferred from step 1: GitHub API metadata (stars, description, license) —
would need API access/auth not yet set up. Commit-quality filtering (bot authors, vague
messages, diff size) — not yet scoped as part of this milestone. `build_system` detection
itself — no concrete rule defined. `CODEOWNERS`/`SECURITY.md` signals — deferred per the
user's own criteria.

Not yet defined: what comes after step 1.

## Milestone 4A — Structured per-commit `commit.json`

**Status: In progress**

Goal: replace the raw `metadata.json`/`diff.patch` pair as the primary per-commit record
with a structured `commit.json` made of five sections: `identity`, `metadata`,
`change_set`, `artifacts`, `collection`. Being specified and built one section at a time,
not all together, per the user's explicit instruction.

- [x] `identity` — `hash`, `parent_hashes`, `repository`. Nothing more, per spec.
- [x] `metadata` — Git metadata reshaped to `author` (`{name, email}`), `date`, `message`
      (subject+body combined). Reuses `GitClient.get_commit_metadata`.
- [x] `change_set` — `changed_files`, `added_files`, `deleted_files`, `renamed_files`,
      `modified_files`, built from `GitClient.get_changed_files`'s status codes. Verified
      against real add/modify commits and a synthetic repo built specifically to exercise
      the rename branch (no real commit tested so far happened to contain one).
- [x] `artifacts` — `{"diff": "artifacts/diff.patch", "metadata": "artifacts/metadata.json"}`.
      Unlike the previous three sections, this one required a real behavior change (not
      just a builder method): `metadata.json`/`diff.patch` physically moved from
      `commits/<hash>/` to `commits/<hash>/artifacts/` — confirmed with the user before
      moving them (see ADR-003). Verified live against `fastapi/fastapi`.
- [ ] `collection` — not yet specified.

**Not yet true, per `PROJECT.md` rule 4 ("never document planned features as
completed"):** `commit.json` itself does not exist yet. `collect()` does not call any of
the four builder methods above — they're verified standalone but not assembled or
written to disk. This milestone is not complete until `collection` is specified and
`commit.json` is actually written.

## Milestone 4B — Deterministic Change Understanding

**Status: In progress** (charter set 2026-07-13)

Objective: implement deterministic Change Understanding on top of the existing
architecture — observations derived directly from Git artifacts, no subjective judgement.

Constraints:
- No architecture changes, no module renames, no folder structure changes.
- No `commit.json` schema changes unless explicitly instructed.
- No AI, no heuristics requiring subjective judgement, no language-specific parsing, no
  new architectural abstractions.

Allowed: helper methods; helper classes inside existing modules if complexity justifies
it; internal code quality improvements; deterministic observations derived directly from
Git artifacts.

Rule for this milestone specifically: if a proposed implementation would require changing
architecture, stop and explain why instead of implementing it — don't implement a
workaround silently.

New `commit.json` section decided: `observations` (6th section, user explicitly
authorized adding new sections for this milestone; renamed from the provisional
`change_understanding` to match the user's own diagram of the intended `commit.json`
structure: identity / metadata / change_set / observations / artifacts / collection).

Deliverables:

- [x] `touched_directories` — cross-references `change_set`'s `changed_files` against the
      existing `layout_detector` categories (source/tests/documentation/examples/scripts).
      Zero new git calls. Verified against a real commit touching `tests/`/`docs/`/
      `fastapi/` (all three correctly populated) and a real commit touching only
      `.github/...` (correctly all-empty — same known hidden-dir/root-file limitation
      `layout_detector` already has for `repository.json`, not a new bug).
- [x] `file_classification` — every changed file classified into one of Source/Test/
      Documentation/Configuration/Dependency/CI-CD/Infrastructure/Binary/Unknown, via a
      new module `src/utils/file_classifier.py` (`classify_file`). No AI, no fuzzy
      matching, no language parsing — pure path/name/extension rules with a fixed
      precedence order. Verified against multiple real commits from `tcx_nogrunt-1`'s
      actual history: nested `requirements.txt` at any depth correctly classified as
      Dependency; `.xlsx` files correctly classified as Binary; `requirements_nover.txt`
      correctly fell to Unknown rather than fuzzy-matching `requirements.txt` (fuzzy
      matching would violate the no-subjective-heuristics constraint); `Test Studio.html`
      correctly did NOT match the Test name-pattern (word-boundary check prevented a false
      positive from a filename that merely contains "test" as an ordinary word). Found and
      fixed a real gap during testing: `.gitignore` had no extension and no root-file
      entry, so it silently inflated `unknown_file_count` — added it (and
      `.gitattributes`/`.dockerignore`) to the Configuration root-file set.
- [x] `change_statistics` — `files_added`/`files_deleted`/`files_modified`/`files_renamed`
      counts (from `change_set`'s already-computed lists). Lines added/deleted
      deliberately not built — deferred until a downstream consumer needs them, per the
      user's explicit instruction.
- [x] `change_categories` — booleans: `touches_tests`, `touches_documentation`,
      `touches_dependencies`, `touches_build_files` (a narrower check than
      `touches_config` — specifically build-orchestration tools like Makefile/
      build.gradle, via `file_classifier.is_build_file`, not just any config file),
      `touches_ci`, `touches_config`.
- [x] `extraction_confidence` — `unknown_file_count`, `unsupported_extensions` (the
      specific extensions behind the unknown count — e.g. this surfaced `.db`/`.sqlite3`
      from real committed database files in `tcx_nogrunt-1`'s history), and
      `skipped_binary_file_count`. Matches the example shape given: "Unknown file types: N
      / Unsupported extension: X / Skipped binary files: N."
- [ ] Line-level diff stats (`git diff --numstat`) and diff-hunk-level observations — from
      my original Tier 2/3 proposal, not requested as part of this batch, not started.

All five delivered pieces live in `_build_commit_observations(change_set)` in
`DatasetCollector`. Not yet wired into `collect()` or written to disk — same status as the
rest of Milestone 4A/4B: builder methods exist and are verified standalone, `commit.json`
itself is not assembled or written anywhere yet.

## Milestone 5A — Context

**Status: In progress** — all 4 evidence extractors built (proposal delivered 2026-07-14)

Full design document: `docs/context_design.md`. Researched prior art (SWE-bench,
change-impact-analysis literature, test-impact-analysis, AST-based "blast radius" tools)
and verified feasibility against real `fastapi/fastapi` history before proposing anything.

Centerpiece recommendation: historical co-change/logical coupling (which files have
empirically changed together over a file's git history) — the one established
change-impact-analysis technique that requires zero language parsing, unlike import/call
graphs (which every comparable modern tool actually uses, and which this project
currently excludes via the no-language-specific-parsing constraint).

Confirmed by testing against `fastapi/fastapi` (7,487 commits): computing co-change
requires an N+1 git-call pattern (no single git command produces it), and real file
history depths (176/105/7 commits for three sampled files) mean this needs an explicit
bound before it's built, not unbounded history walks. Also identified a correctness
requirement: history walks must be scoped to the target commit itself (its ancestors
only), never `HEAD`, to avoid a benchmark sample "seeing" commits from its own future.

Open questions raised, not yet decided: where `context` lives in `commit.json`'s schema
(proposed: a 7th section, sibling to `observations` — but this is a schema change per
Milestone 4B's own rule, needs explicit instruction); whether "no language-specific
parsing" extends beyond 4B to this milestone; the concrete history-walk bound; whether a
naming-convention-based `likely_related_tests` field (weaker than pure co-change) is in
scope given 4B's precedent of rejecting fuzzy matching elsewhere.

**Scope decision (2026-07-14):** after further research into the conceptual relationship
types a reviewer draws on (not yet written to a doc — delivered conversationally, pending
a decision on whether/where to persist it), the user deliberately narrowed Milestone 5A
to exactly four evidence extractors. Everything else surfaced during research explicitly
waits:

- [x] **File history** — a changed file's own age/frequency/recency profile. Built as
      `GitClient.get_file_history(repo_path, commit_hash, file_path)` (single git call,
      scoped to `commit_hash` not `HEAD` to avoid temporal leakage) plus
      `DatasetCollector._build_commit_file_history` (pure orchestration — loops and
      delegates, no extraction logic of its own). Verified against real `fastapi/fastapi`
      history: a "hot" file correctly showed 176 historical commits, and a real
      first-appearance file (a workflow file added in a recent commit) correctly showed
      `total_commit_count: 1`, `previous_commit_date: null`, `is_first_appearance: true`.
- [x] **Historical co-change** — files that have empirically changed alongside this one
      across its (bounded) history. Bound chosen: 50 most recent historical commits per
      file (a default, not a validated tuning — flagged as such). Built as
      `GitClient.get_co_change_history` (raw bounded history walk — one log call plus one
      `get_changed_files` call per historical commit) plus
      `src/utils/co_change_detector.rank_co_changed_files` (pure counting/ranking, no
      git) plus `DatasetCollector._build_commit_co_change` (orchestration only). Verified
      against a real `fastapi/fastapi` commit touching `fastapi/routing.py`: top
      co-change partners were genuinely plausible FastAPI internals
      (`dependencies/utils.py`, `applications.py`, `openapi/utils.py`) — a real
      validation the signal captures meaningful coupling, not noise — and ran in under a
      second.
- [x] **Local module context** — other files sharing the changed file's directory/module.
      Zero new git calls — reuses `GitClient.get_tracked_files` (already fetched for
      `repository.json`). Built as `src/utils/module_context_detector.get_local_module_files`
      (pure path logic, no git access at all) plus
      `DatasetCollector._build_commit_local_module_context` (orchestration only). Uses a
      file's own immediate directory (can be nested), unlike `layout_detector`'s
      top-level-only scoping. Verified against the same `fastapi/routing.py` commit:
      siblings correctly came only from `fastapi/` itself, not `fastapi/dependencies/` or
      other subdirectories. Found a real scaling concern while testing: a file in the flat
      `tests/` directory returned 208 siblings — technically correct, no cap applied yet,
      flagged rather than silently left unbounded.
      **Real bug found and fixed 2026-07-15** during full-pipeline validation against
      `pallets/flask` (see below): `get_tracked_files` was scoped to the current
      checkout, not the target commit, so a directory that existed at commit time but
      was later deleted from HEAD silently returned 0 siblings instead of the real 10.
      Fixed via ADR-004 — `get_tracked_files(repo_path, commit_hash=None)` now supports
      point-in-time scoping, and `_build_commit_local_module_context` uses it.
- [x] **Repository signals relevant to the changed file** — configuration/docs/CI/etc.
      markers, scoped to the changed files rather than the whole repo. Reuses
      `signal_detector.detect_repository_signals` completely unmodified — it was already
      generic over its input list, so no new code was needed in that module at all; just
      `DatasetCollector._build_commit_repository_signals` feeding it `change_set`'s
      changed files instead of repo-wide tracked files. Distinct from
      `observations.change_categories` (Milestone 4B): that's `file_classifier`
      categorizing any file anywhere, this is specifically "did the commit touch one of
      the repo's own well-known root-level marker files." Verified across a scan of real
      `fastapi/fastapi` commits: `README.md` → `documentation`, `pyproject.toml` →
      `build`, `.github/workflows/*.yml` → `ci`, including one release-prep commit that
      correctly fired both `build` and `ci` at once.

**Architecture rule for these four, stated by the user:** each must be an independent
component; `DatasetCollector` orchestrates them but must not contain extraction logic
itself; removing or replacing one must require no changes to any other. This is not a
new rule — it's the same discipline already followed by the five existing
`src/utils/*_detector.py` modules (see `ARCHITECTURE.md`'s Layering section) — just
confirmed to extend to these four as well. **File history** follows it by keeping all
git mechanics in `GitClient` and all orchestration in `DatasetCollector`, with nothing
in between.

**Full-pipeline validation (2026-07-15):** ran every builder method (`identity`,
`metadata`, `change_set`, `observations`, all four Milestone 5A extractors, `artifacts`)
against a real commit in `pallets/flask` — a repo not previously used for testing,
deliberately chosen to check for overfitting to `fastapi`'s/`tcx_nogrunt-1`'s specific
structure. Picked a commit with 8 files spanning documentation/dependency/source/test
categories to exercise as much of the pipeline as possible in one pass. Found two real,
concrete issues, both already covered above and fixed: the `get_tracked_files` scoping
bug (ADR-004), and a genuine `file_classifier` coverage gap (`.in`/`.txt` requirements
files under per-purpose names, documented in `docs/modules/file_classifier.md`, left
unfixed since extending it edges toward the fuzzy-matching this project has been
cautious about). Also reran `main.py` end-to-end against `fastapi/fastapi` to confirm no
regression in the actual shipping pipeline.

All four evidence extractors built and verified against real repos. Per `PROJECT.md`
rule 4, this milestone is still not "complete": none of the four are wired into
`collect()`, no `commit.json` is assembled or written, and `commit.json`'s `collection`
section (from Milestone 4A) remains unspecified. What's left is assembly, not
extraction — a distinct next step, not automatically implied by "all four exist."

**Efficiency review (2026-07-15):** generated real `repository.json` output and a full
`commit.json` preview (all sections combined, not yet written as a real file) for the
user to inspect directly. Found, with exact byte measurements:
- `repository.json`'s `contributors` — 932 entries for `fastapi/fastapi`, dominating the
  file's 107KB size.
- `repository.json`'s `primary_language: "Markdown"` for FastAPI (a Python project) —
  `language_detector` ranks by file count, and fastapi has more doc files than `.py`
  files. A previously-documented limitation now confirmed to actually mislead on the
  project's own flagship test repo. Not yet fixed — flagged for a decision.
- `commit.json` preview: `local_module_context` was 71.9% of total size (13.1% for
  `co_change`, which is capped and ranked, by contrast) — almost entirely low-signal raw
  filename dumps.

**Fixes applied:** `GitClient.get_contributors(repo_path, max_count=None)` — capped to
20 for `repository.json` (107KB → 3.4KB, ~97% reduction). `module_context_detector.get_local_module_files`
now takes `max_results=20`. Both are explicit stopgaps, not final designs — the user
flagged both need a proper look later (e.g. ranking by relevance instead of truncating
alphabetically). `primary_language`'s file-count ranking issue was not fixed — no
decision made yet on the right approach.

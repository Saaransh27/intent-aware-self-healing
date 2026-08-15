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

**20-commit qualitative evaluation (2026-07-16):** ran the full evidence pipeline against
20 real commits across 4 repositories (`fastapi/fastapi`, `pallets/flask`,
`tcx_nogrunt-1`, and a local personal repo, `~/Projects/Triple`, found on this device —
deliberately messy, with `.DS_Store`/`.pyc` committed and vague "initial"-style
messages), and evaluated each against a structured template judging whether the evidence
alone (not code correctness) is sufficient for an engineer or LLM to understand the
commit and reason about impact. Full write-up: `docs/research/experiments.md` (per-commit)
and `docs/research/observations.md` (cross-commit synthesis).

Average rated usefulness: **6.4/10** across 20 commits (range 4-9). Key findings:
`change_set`, `co_change` (when real history exists), and `observations` consistently
rated highest; `local_module_context` rated lowest in every commit it appeared in — the
20-commit sample confirms with real data what the single-commit efficiency review
already suspected. Two *new* findings only visible by comparing across commits: wide
homogeneous commits (Commits 6, 17) produce heavily repetitive per-file evidence blocks
that could be summarized once instead; and a `.txt`/`.lock`-style dependency-file gap in
`file_classifier` recurred independently in two unrelated repos. One unexpected discovery:
two consecutive real commits in `tcx_nogrunt-1` (13, 14) fixed the identical escaping bug
in near-identical sibling files one commit apart — concrete evidence (not hypothetical)
that the duplication/similarity relationship flagged and shelved during the earlier
research phase would have had real value here.

Nothing was changed in the pipeline as a result of this evaluation — it's a findings
document, prioritization/implementation is a separate future decision.

## Milestone 6 — Symbol-Level Semantic Evidence

**Status: In progress** — architecture frozen as ADR-005 (2026-07-20), all 6 stages
complete (2026-07-21); not "complete" per `PROJECT.md` rule 4 (see below)

Motivation: the 20-commit evaluation above and a follow-up first-principles critique
(conversational, not written to a doc) both converged on the same conclusion — the
git-only evidence layer has a real ceiling, and the highest-value remaining gap is code
semantics, not more git-derived statistics. `fastapi`'s Commit 4 (see
`docs/research/experiments.md`) was the concrete case: a 300-line refactor and a
two-line typo fix produced structurally similar evidence, because nothing in the
pipeline looks inside a file's contents.

Architecture (ADR-005, `docs/DECISIONS.md`; amended the same day, before any code was
written, to remove Python from the module path/section name/stage naming): a new,
independent evidence extractor, deterministic and Python-only for now, architecturally
parallel to — not a replacement for — Milestone 5A's `context`. New package
`src/semantic/python/`, sibling to `src/utils/` and `src/git/`, deliberately separated
so the layer's language coupling is visible in the directory structure rather than
hidden in a doc. Output is destined for a new `commit.json` section,
`semantic_analysis`, alongside `context`. Six stages, built and confirmed one at a
time; guiding principle stated in the ADR: prefer fewer high-confidence facts over more
facts with uncertain interpretation — ambiguous cases are omitted or flagged, never
guessed. No reasoning, scoring, or impact prediction at any stage.

- [x] **Stage 1 — AST + Symbol Extraction.** `src/semantic/python/symbol_extractor.py`:
      `_build_symbol_table(source)` parses one source string into an AST and walks it
      into a qualified-name-keyed table (`Foo.bar`, `Foo.bar.helper`) capturing
      `symbol_type` (function/async_function/method/async_method/class),
      `enclosing_scope`, `visibility`, `signature` (via `ast.unparse`), `decorators`,
      `docstring`. Recursion is generic over `ast.iter_child_nodes`, so symbols nested
      inside `if`/`try`/`for`/`with` blocks are still found, not silently missed. See
      `docs/modules/symbol_extractor.md`.

      Verified directly, not assumed: module docstrings correctly excluded (not a
      tracked symbol type); dunder methods (`__init__`) correctly classified `public`,
      not `private`, despite the leading-underscore rule; a function nested inside a
      method gets the correct dotted qualified name (`Foo.bar.helper`) and is
      classified `function`, not `method` (its immediate parent is a function, not a
      class); positional-only/keyword-only markers (`a, b, /, c, *, d`) unparse
      cleanly; a genuine `SyntaxError` propagates rather than being swallowed
      (`parseable` handling is deliberately deferred to Stage 4); an `if`/`else` and a
      `try`/`except` each conditionally redefining a same-named function both collapse
      to one table entry (last-write-wins) — the exact "conditionally redefined
      symbol" edge case ADR-005 flagged as a known, accepted trade-off, now
      demonstrated with real input rather than only discussed.
- [x] **Stage 2 — Semantic Diff.** `_diff_symbol_tables(old_table, new_table)`
      compares two tables by qualified name, emitting only symbols that are
      `added`/`removed`/genuinely `modified` — a symbol identical on both sides is
      omitted, matching `change_set`'s own discipline. Verified: signature and
      decorator changes detected correctly (decorator swap reported as one added + one
      removed, not a wholesale replace), docstring transitions correct in both
      directions (`added`/`removed`), a genuinely untouched method produced no entry,
      and diffing a table against itself produced zero diffs.
- [x] **Stage 3 — Import Analysis.** `_diff_imports(old_source, new_source)` diffs at
      per-imported-name granularity, not whole-statement text. Verified: reordering
      names within one `from X import a, b` line produces no diff; genuine adds/removes
      alongside a reorder are correctly isolated; relative imports and `as`-aliasing
      handled; `None` on either side (added/deleted file) correctly treated as "no
      imports."
- [x] **Stage 4 — Public semantic extractor API.**
      `extract_symbol_semantics(old_source, new_source, file_path)` assembles Stages
      1-3 behind one call, inferring `change_type` (`added`/`deleted`/`modified`) from
      which source is `None`, with an honest `parseable: false` degradation path
      (`imports`/`symbols` both `null`) when either present source fails to parse.
      Explicitly cannot detect renames — that requires git identity this function never
      sees, and is deferred to Stage 5. Verified across every branch: added, deleted,
      modified, unparseable old source, unparseable new source, and a true no-op diff
      (identical source both sides → empty output).
- [x] **Stage 5 — `DatasetCollector` integration.**
      `_build_commit_semantic_analysis(repo_path, commit_hash, change_set)` filters
      changed files to Python only, resolves old/new source via
      `GitClient.get_file_content_at_commit` (parent hash for "old," `commit_hash` for
      "new"), and delegates all AST work to `extract_symbol_semantics` — no extraction
      logic of its own, same discipline as the four Milestone 5A extractors. It is the
      one place that resolves renames: since the pure extractor has no git identity, this
      method overwrites `change_type` to `"renamed"` and sets `old_path` itself after
      calling the extractor with each side's correct source. Verified against a real
      commit in `pallets/flask` (`06ea505c`) — see `docs/modules/dataset_collector.md`
      for the full result, including a real four-level-deep nested function correctly
      resolved, and a real "logic changed but no symbol-level fact changed" case that
      honestly produced zero symbol entries rather than a false signal.
- [x] **Stage 6 — Real-world validation.** Searched three real repositories
      (`pallets/flask`, `fastapi/fastapi`, `tcx_nogrunt-1`) specifically for the two
      hardest cases to construct synthetically: a non-trivial rename (content changed,
      not just moved) and a naturally-occurring unparseable Python snapshot.

      **Non-trivial rename — found and verified**, `tcx_nogrunt-1` commit `d99f6cb`
      (`impact_lens/step_visualizer/backend/main.py` → `.../router.py`, git similarity
      R084 — an 84% match, not a pure move). Correctly reported as `change_type:
      "renamed"` with `old_path` set. This single commit is the clearest real evidence
      the rename design (ADR-005) is correct: the file is a FastAPI `app` being
      converted into an `APIRouter` — all 15 functions correctly show `change_type:
      "modified"` with `signature_changed: false` and `decorators_changed: true`
      (e.g. `get_page`'s decorator changed from `app.get(...)` to `router.get(...)`,
      signature `filename: str` untouched) — exactly what a content-diff-across-paths
      should produce. Treating this rename as delete-then-create (the alternative
      ADR-005 explicitly rejected) would have wrongly reported 15 removed + 15 added
      functions instead of 15 correctly-matched modifications. The same commit's ~30
      other renamed files (mostly pure `R100` moves, one `.db` binary, one `.md`) were
      also verified: non-Python renames correctly excluded from `semantic_analysis`
      entirely; pure-content renames correctly produced empty symbol/import diffs.
      This also incidentally exercised `_build_commit_change_set`'s rename branch
      against real data for the first time — previously only synthetic-repo-tested.

      **Naturally-occurring unparseable Python — searched for, not found.**
      Programmatically checked every `.py` blob at every non-merge commit in
      `tcx_nogrunt-1`'s full history (275 commits, 394 file-snapshots) and a 76-snapshot
      sample of `pallets/flask`'s oldest commits (checking for Python-2-only syntax);
      also searched all three repos' full history for committed merge-conflict markers
      in `.py` files. Zero hits. This is itself a real, if modest, finding — broken
      Python essentially doesn't survive into a maintained repository's merged history
      — and it means the `parseable: false` path remains verified only via the
      hand-constructed cases from Stages 1 and 4, the same precedent already set for
      `_build_commit_change_set`'s rename branch back in Milestone 4A (built and tested
      against a synthetic repo when no real commit happened to contain one).

**Six of six stages complete. Still not "complete" per `PROJECT.md` rule 4** —
`_build_commit_semantic_analysis` is verified standalone but `collect()` does not call
it, and no `semantic_analysis` section has ever been written to an actual `commit.json`
(which itself still doesn't exist — same status as `observations` and `context`).
Assembly is a distinct next step, not implied by extraction being finished — the exact
same distinction Milestone 5A drew after all four of its extractors were built. Only
Python is supported, by design (ADR-005); any other language present in a repository is
simply absent from this evidence category.

## Milestone 7 — Evidence Fusion

**Status: In progress** — architecture frozen as ADR-006, built and verified
(2026-07-21)

Motivation: with extraction complete through Milestone 6, the user deliberately paused
before designing a Reasoning Engine to insert an adapter layer — extraction sections
(`change_set`, `observations`, `file_history`, `co_change`, `local_module_context`,
`repository_signals`, `semantic_analysis`) were each built independently and don't
compose: different join semantics, different shapes (dict-keyed-by-path vs. list-of-
dicts vs. flat lists), and no uniform way to say "this evidence category doesn't apply
here" versus "wasn't computed at all." Evidence Fusion closes that gap without adding
any reasoning, scoring, classification, or inference — see ADR-006 for the three design
iterations that arrived at the final shape (rejecting both a reviewer-vocabulary
relabeling and a reference/pointer-based indirection before landing on direct,
lossless value copies).

- [x] **`src/fusion/evidence_fusion.py`** — one public function,
      `fuse_evidence(evidence) -> {"commit": {...}, "files": [...]}`. Every field in
      every bundle is `{"status": "ok"|"not_applicable"|"not_collected", "evidence":
      <verbatim value>|None}` — status determined purely by presence, never by
      inspecting a value. Bundle keys are the extraction layer's own names, unrenamed.
      No dependency on `GitClient` or `DatasetCollector` — a pure function of a plain
      evidence dict, not persisted, regenerable on demand. Full detail:
      `docs/modules/evidence_fusion.md`.
- [x] **Verified against real commits**, not just constructed examples:
      `pallets/flask` (`06ea505c`) confirmed non-Python files correctly resolve
      `semantic_analysis: not_applicable` while every other category is `ok`, and a
      direct comparison confirmed `evidence` values are byte-identical to the raw
      extractor output (true losslessness, not claimed). `tcx_nogrunt-1` (`d99f6cb`,
      the same non-trivial rename validated in Milestone 6) confirmed the one genuine
      reshape in the module — `change_set`'s per-file `file_status` — correctly
      produces `{"file_status": "renamed", "old_path": "impact_lens/step_visualizer/
      backend/main.py"}` for the real rename, and that the file-bundle count (24)
      exactly matches `change_set.changed_files`'s count, confirming no file was
      silently dropped. `not_collected` verified by simulating a missing section and
      confirming every affected file correctly reports it.

**Not yet true, per `PROJECT.md` rule 4:** nothing calls `fuse_evidence` from
`DatasetCollector` or any pipeline entrypoint yet — it exists and is verified
standalone, same status every extractor has had at this stage. Not persisted, by
design (ADR-006) — there is no `evidence.json` to wire in, only an on-demand call the
future Reasoning Engine will make.

## Milestone 8 — Deterministic Reasoning Layer

**Status: In progress** — architecture frozen as ADR-007, built and verified
(2026-07-21)

Motivation: with extraction and Evidence Fusion complete, the user asked for the
architecture of a deterministic reasoning layer that consumes only Fusion's output —
explicitly excluding LLMs, prompts, fixes, and implementation from the first design
pass. The design went through five concrete revisions before any code was written (see
ADR-007): enforced per-module `consumes` contracts instead of handing every module the
whole bundle; dropped a static per-evidence-category reliability ranking in favor of
confidence computed per claim; added stable, dotted, machine-addressable claim IDs;
removed cross-module conflict detection from the Synthesizer entirely (that requires
interpreting meaning across modules — reasoning, not aggregation); required every
module to declare `NAME`/`CONSUMES`/`PRODUCES`/`LIMITATIONS` as plain, inspectable
metadata.

- [x] **`src/reasoning/contracts.py`** — `filter_evidence` (the enforced consumes
      mechanism), Claim/Gap/scope builders.
- [x] **Five reasoning modules**, each single-file, each declaring its own
      `CONSUMES`/`PRODUCES`/`LIMITATIONS`: `change_shape`, `historical_risk`, `reach`,
      `verification_coverage`, `contract_stability`. Full per-module detail:
      `docs/modules/reasoning.md`.
- [x] **`src/reasoning/registry.py`** — a flat list (no DAG needed; Fusion is every
      module's only possible input, so there's no dependency graph to resolve),
      `run_reasoning(fused_evidence)` filters and invokes each module.
- [x] **`src/reasoning/synthesizer.py`** — `synthesize(module_outputs)`: collects,
      groups by scope (`commit_claims`/`file_claims`/`symbol_claims` and matching gap
      groupings), tags each with its originating module. No ranking, no filtering, no
      cross-module conflict detection, per ADR-007.
- [x] **Verified against real commits** — `pallets/flask` (`06ea505c`): `reach.
      corroborated_wide_reach` fired correctly on two real files with genuinely high
      `co_change` and large `local_module_context` together; `contract_stability`
      produced exactly 22 claims for a real 10-symbol test-file rewrite, hand-verified
      against the raw `semantic_analysis` data to rule out double-processing.
      `tcx_nogrunt-1` (`d99f6cb`): `not_collected` propagation confirmed by dropping
      `semantic_analysis` entirely (24 correctly-attributed gaps, zero false claims).

  **A real upstream gap surfaced by this validation, not fixed here:** every renamed
  file in `d99f6cb` incorrectly produced `history.first_appearance`, because
  `GitClient.get_file_history` (Milestone 5A) has no `--follow` and stops at the rename
  boundary. `historical_risk` correctly reported what it was given — the extraction
  layer, not the reasoning layer, has the gap. Flagged in `docs/modules/reasoning.md`,
  not patched mid-milestone, matching this project's standing practice.

**Not yet true, per `PROJECT.md` rule 4:** nothing calls `run_reasoning`/`synthesize`
from any pipeline entrypoint — verified standalone only. The five-module registry is
explicitly provisional, same status the original eight evidence categories had before
Milestone 5A narrowed to four.

## Milestone 8.5A — Function-Body Evidence

**Status: In progress** — architecture frozen as ADR-008, built and verified
(2026-07-23)

Motivation: the 10-batch reasoning-layer evaluation (`docs/research/
reasoning_experiments.md`/`reasoning_observations.md`) named "Function Body
Blindness" as the single most consistently-evidenced cross-batch gap — a symbol whose
signature, decorators, and docstring are all unchanged produces no diff entry at all,
even when its body changed substantially, because `_diff_symbol_tables` had nothing
else to check. An initial proposal organized around ~7 candidate AST node types was
revised once, at the user's direction, into five reviewer-facing evidence categories
before implementation (see ADR-008): interaction changes (which names a body calls),
error-handling changes (exceptions raised/caught), resource-management changes
(context managers entered), documentation/deprecation changes (a docstring marker),
and internal-structure changes (a new private symbol appearing) — AST node types
remain the extraction mechanism, never the schema's vocabulary. A standalone
`warnings.warn` detector was dropped in favor of the more general callee-tracking
fact, which for free also explains two other real batch findings (Requests' `hasattr`
addition, Django's `functools.wraps` addition) that would otherwise have needed their
own bespoke detectors.

- [x] **`src/semantic/python/symbol_extractor.py`** extended: `_record_function` now
      extracts `callees`, `exceptions_raised`, `exceptions_caught`, and
      `context_managers` per symbol (walking each function's own body, never
      descending into nested defs); `_diff_symbol_tables` set-diffs each old vs. new
      and nests them under a new `body_evidence` key, grouped by the five reviewer
      categories, plus a `deprecation_marker_added` boolean derived from the
      docstring. **The fix for Function Body Blindness itself**: `body_evidence`
      changes were added to the existing modified-check, so a symbol whose only
      change is one of these facts now correctly produces a `change_type: "modified"`
      entry instead of being silently skipped.
- [x] **`src/reasoning/modules/body_evidence.py`** — new reasoning module,
      `CONSUMES = ["semantic_analysis"]`, emits `interaction.callees_changed`,
      `error_handling.exceptions_raised_changed`, `error_handling.
      exceptions_caught_changed`, `resource_management.context_managers_changed`,
      `documentation.deprecation_marker_added`, and `structure.internal_symbol_added`
      (the last requiring no new extraction — it surfaces `_diff_symbol_tables`'s
      already-existing added/private detection, gated to fire only when at least one
      other, pre-existing symbol in the same file was also modified — an unscoped
      first version was flagged as implicitly resolving the still-open Batch 4
      private-symbol policy question without sign-off, and tightened before freeze).
      Registered in `registry.MODULES` alongside the existing five; sibling to
      `contract_stability`, not a merge into it.
- [x] **Verified against two real, independently-selected commits**: `pallets/click`'s
      `c2ed414` (the exact commit that originally surfaced the `warnings.warn`
      question) correctly produces `interaction.callees_changed` for the new
      `warnings.warn` call and `documentation.deprecation_marker_added` for the
      docstring marker, with no bespoke handling of either. `pallets/click`'s
      `555fa9b`: `Context.__exit__`/`Context.close` change their callee from
      `self.close`/`self._exit_stack.close` to a new `self._close_with_exception_info`
      method, with signature/decorators/docstring all unchanged on both — previously
      silently invisible, now correctly surfaced as `modified` with
      `interaction.callees_changed`; the new method itself correctly fires
      `structure.internal_symbol_added`.

**Not yet true, per `PROJECT.md` rule 4:** nothing calls this from any pipeline
entrypoint — verified standalone only, same status as every other extractor/reasoning
module at this stage.

## Milestone 8.5B — Historical Evidence Depth

**Status: In progress** — architecture frozen as ADR-009, built and verified
(2026-07-23)

Motivation: unlike 8.5A (driven by a named batch-evaluation finding), this milestone
came from a first-principles review of the deterministic ceiling for *historical*
evidence — the user explicitly asked to reason from the established reviewer
workflow and the existing evaluation before proposing anything to build, mirroring
how body evidence was scoped before ADR-008. That review produced six candidates
against the pipeline's actual existing fields; two (author familiarity, ownership
concentration) were judged highest-value but require new per-file author extraction
and were deferred; four were explicitly declined (broad fix/bug keyword density,
historical diff-size statistics, time-of-day/weekend patterns, cross-file author
overlap). Three were selected and built:

- [x] **`GitClient.get_file_history`** gains a `recent_window_days=30` parameter and
      a new `recent_commit_count` field — computed from the same date list the
      function's git call already fetches and previously discarded past the first
      two entries. No new subprocess call.
- [x] **`src/reasoning/modules/historical_risk.py`** gains two claims:
      `history.rapid_iteration` (`<=1 hour` since the file's previous touch — the
      structural counterpart to the existing `long_dormant_reactivated`, same two
      fields, opposite threshold direction) and `history.high_recent_churn`
      (`recent_commit_count >= 5`).
- [x] **`src/reasoning/modules/reach.py`** gains `reach.expected_co_change_partner_missing`
      — needs no new extraction. For any of a file's `co_change` partners meeting
      the existing `HIGH_COUPLING_THRESHOLD`, if that partner's path isn't among the
      current commit's own changed files, the claim fires. `reach` previously only
      ever checked the single strongest partner's count (`co_change[0]`) to decide
      `high_historical_coupling`; it never cross-referenced the partner list against
      the commit's actual file set at all.
- [x] **Verified against real commits in `pallets/click`**: `history.rapid_iteration`
      and `history.high_recent_churn` both fired correctly on `src/click/core.py` at
      a real commit (`c040135a`) sitting inside a genuine ~28-minute-apart commit
      cluster with 15 touches in the preceding 30 days.
      `reach.expected_co_change_partner_missing` fired correctly on a real commit
      (`3495fba1`) that changed `core.py` without its 27-historical-count partner
      `CHANGES.rst`, and correctly did **not** fire on a different real commit
      (`82f377c`) that changed `core.py` alongside all of its strong historical
      partners together — both the positive and negative case confirmed on real,
      not hand-constructed, data.

**Not yet true, per `PROJECT.md` rule 4:** nothing calls this from any pipeline
entrypoint — verified standalone only, same status as every other extractor/reasoning
module at this stage.

## Milestone 8.5C — Author Familiarity (final deterministic capability)

**Status: In progress** — architecture frozen as ADR-010, built and verified
(2026-07-24)

Motivation: closes the one candidate the ADR-009 first-principles review judged
highest-value but left unbuilt pending real-data justification — "has this commit's
author worked on this file before?" Framed deliberately as a fact, not an
interpretation: the claim name is `history.first_author_touch`, not
"unfamiliar_author" — judging what a first touch *means* is left to Milestone 9.

- [x] **`GitClient.get_file_history`** gains an optional `author_email=None`
      parameter. The existing single git log call gains one more `\x1f`-delimited
      format field (`%ae`, the author's email, alongside the existing `%ad`) — still
      exactly one subprocess call. When `author_email` is provided, the returned
      dict gains `author_commit_count` (commits to this file, before this one, by
      that exact author) and `is_first_touch_by_author` (`author_commit_count ==
      0`). Omitting the parameter preserves every existing field and caller
      unchanged.
- [x] **`src/collector/dataset_collector.py`**: `_build_commit_file_history` gains a
      `metadata` parameter, passing `metadata["author"]["email"]` through — the
      project's first builder method depending on two upstream builders' output
      (`change_set` and `metadata`) rather than one, documented explicitly rather
      than left implicit.
- [x] **Evidence Fusion: zero changes.** The existing per-file `file_history`
      passthrough already exposes whatever keys the dict carries, verbatim — the
      two new fields ride through automatically.
- [x] **`src/reasoning/modules/historical_risk.py`** gains one claim,
      `history.first_author_touch`, firing when `is_first_touch_by_author` is true
      **and** `is_first_appearance` is false (a brand-new file's trivially-true
      first-touch-by-everyone is deliberately excluded). No new `CONSUMES` (the
      module already declared `file_history`), no new gap type (the existing
      `cannot_assess_history` gap already covers a missing `file_history` entry;
      a present-but-author-less entry is silently skipped, not gapped).
- [x] **Verified against four real cases in `pallets/flask`**: a genuine first-time
      touch (`philip.graham.jones@googlemail.com`'s first-ever commit to
      `src/flask/templating.py`, `77237093da` — fires); a frequent maintainer
      (`davidism@gmail.com`'s 15th touch to the same file, `daca74d93a`, 14 prior
      commits — silent); a brand-new file (`src/flask/debughelpers.py`'s addition
      commit, `ca278a8694` — `is_first_touch_by_author` true but the claim
      correctly does not fire, gated by `is_first_appearance`); and
      alternating-author exclusion — a real, naturally-occurring history on
      `src/flask/templating.py` alternating between two authors confirmed
      `author_commit_count` computes to exactly the hand-counted value (3, verified
      directly against `git log --format=%ae`) with no off-by-one from the current
      commit itself.

**Not yet true, per `PROJECT.md` rule 4:** nothing calls this from any pipeline
entrypoint — verified standalone only, same status every prior milestone has had at
this stage.

**This is the final deterministic capability.** See `docs/DECISIONS.md` (ADR-010)
for the explicit reassessment: no further architecturally-justified deterministic
gaps remain; the deterministic layer is frozen, and Milestone 9 is semantic/LLM
reasoning.

## Milestone 9 — Semantic Reasoning (architecture frozen, not yet implemented)

**Status: Architecture only** — ADR-011 through ADR-014 are Accepted; no code
exists yet, per `PROJECT.md` rule 4. This milestone freezes the full architecture
between the deterministic layer (Milestones 5A–8.5C) and an actual LLM-driven
review, across four ADRs, each a distinct layer:

- [x] **ADR-011 (Review Context)** — a new component, the **Review Context
      Builder**, sitting between the Reasoning Layer's Synthesizer and everything
      downstream. Separates raw **Input Sources** (the Synthesizer's Claims/Gaps,
      the commit message, the raw diff) from a constructed **Review Context** —
      five sections (Commit Summary, Claims, Gaps, Evidence Units, Coverage
      Ledger), each with a named owner. Owns all diff/symbol-detail summarization
      deterministically, using only facts the Reasoning Layer already concluded
      (`change_shape`'s wide/homogeneous claims make a file a collapse
      *candidate*; any risk-bearing claim on it means never collapse). Makes
      every unit addressable (claims/gaps by their existing id+scope, diff hunks
      by a new file-path-plus-line-range address — the one genuinely new piece
      of identity this architecture requires) so that traceability is
      enforceable, not aspirational.
- [x] **ADR-012 (LLM Reasoning Contract)** — freezes the model's role as
      **triage, not review**: deciding what deserves attention, never rendering
      the actual verdict. Freezes the seven-stage reasoning sequence (receiving
      at Understand/Assess-risk, generating everywhere else), a four-tier
      evidence-precedence hierarchy (claims > diff > message > the model's own
      inference), a decline boundary (reasonable inference must be reconstructible
      from the Review Context alone; unsupported speculation is declined, not
      offered), a four-term non-numeric uncertainty vocabulary (Confirmed /
      Likely / Worth checking / Unknown), a forbidden-behaviors list, and one
      optimization objective — maximize the reviewer's justified trust per unit
      of their reading time.
- [x] **ADR-013 (Review Output Contract)** — freezes the human-facing review's
      shape: five sections (Verdict, What changed and why, What deserves
      attention (ranked), Open questions, Minor notes), ordered by cost of
      missing each point rather than file or claim order. Freezes what belongs
      in each section, what must never appear (internal deterministic vocabulary,
      anything ungrounded, fabricated certainty, repeated facts), three
      usefulness principles, how deterministic evidence and semantic reasoning
      are woven into single sentences rather than two separate dumps, tone, and
      the reviewing philosophy — a **prioritized reviewer assistant**,
      explicitly not a report or a checklist.
- [x] **ADR-014 (Prompt Builder Contract)** — freezes what any future Prompt
      Builder must guarantee, regardless of model family: a strict system/user
      separation (system = everything invariant across every review; user = the
      specific Review Context), which content is embedded verbatim versus
      referenced only, forbidden instruction categories, the minimum contract
      every implementation must satisfy, a one-test diagnostic for Prompt
      Builder bug versus model mistake ("was everything required present,
      correct, and complete in what was sent?"), forbidden assumptions about
      model capability, and two specific refinements: the Prompt Builder
      guarantees only faithful delivery of the Review Context and frozen system
      contract, never model compliance or output quality; and **Prompt
      Transparency** — no hidden, review-specific instructions may be injected
      outside the frozen system contract.

Research preceding these four ADRs lives in `docs/research/reviewer_reasoning_model.md`
(the human reviewer's seven-stage cognitive model, sourced from Google's,
Microsoft's, Meta's, Chromium's, Gerrit's, and Phabricator's own review guidance
plus the Linux kernel's maintainer process) and
`docs/research/milestone9_transition_research.md` (the full deterministic/semantic
boundary analysis, stage by stage, that these four ADRs consolidate and freeze).

**Not yet true, per `PROJECT.md` rule 4:** the Review Context Builder is now
implemented — see Milestone 10A below. No code exists yet for the LLM reasoning
layer (ADR-012), the output formatter (ADR-013), or the Prompt Builder (ADR-014).

## Milestone 10A — Review Context Builder (implementation)

Implements ADR-011 exactly, as its own new package, `src/review/`, sibling to
`src/fusion/` and `src/reasoning/`: `src/review/context_builder.py`, one public
function, `build_review_context(synthesized, metadata, change_set, diff_text,
commit_hash) -> dict`. Returns a plain dict — no new class — matching the project's
existing convention that Claims/Gaps/Fusion bundles/Synthesizer output are all
dicts, not objects.

Splits the raw unified diff into per-file Evidence Units, each with a new
file-path-plus-line-range address (new-side line numbers normally, old-side for
deleted files); relays Claims and Gaps from the Synthesizer as independent deep
copies (content unmodified, but never the same objects, so a downstream mutation
can't corrupt the Synthesizer's own output); collapses a file only when it is part
of a commit flagged `shape.wide_change` or `shape.homogeneous_categories` **and**
carries none of the risk-bearing claims ADR-011 names verbatim (any
`contract_stability` claim, any `reach` claim,
`verification.public_change_without_tests`, `history.first_author_touch`,
`history.hot_file`) — checked across both `file_claims` and `symbol_claims`, since
`contract_stability`'s claims are symbol-scoped, not file-scoped. A collapsed group
keeps one representative in full — the first file in `change_set["changed_files"]`'s
own order, the same order `evidence_units` itself uses — and records every file in
the group (`coverage_ledger[]["collapsed_group_files"]`, named to reflect that it
includes the representative, not just the files actually tagged `"collapsed"`), the
count, the representative, and the justifying commit-level claim(s). A lone eligible
file is never collapsed. Every changed file gets exactly one Evidence Unit, in
`change_set["changed_files"]`'s own order, even if no matching diff block exists —
no changed file is ever silently dropped. A minimal commit-identity reference
(`commit_hash`) travels alongside the five `ReviewContext` sections, per ADR-011,
for addressing purposes only, never as evidence.

Per-hunk splitting (ADR-011's "where warranted" refinement) is explicitly not
implemented — the ADR names it as conditional without defining the trigger; inventing
one would be adding architecture the ADR doesn't specify. Flagged in
`docs/modules/context_builder.md`'s Future Improvements, not built.

**A critical review against ADR-011's literal text (2026-07-25)** found and fixed
five confirmed defects: a missing commit-identity reference; `author`/`date`
present in Commit Summary when ADR-011 enumerates only the message and file-change
facts; two different canonical orderings in the same object (representative
selection and the coverage ledger were alphabetical, `evidence_units` was diff-order
— now unified on diff order everywhere); the ledger's `collapsed_files` field
misnamed (it includes the representative, which isn't itself tagged `"collapsed"`
— renamed to `collapsed_group_files`); and claims/gaps passed through by reference
rather than copied (now `copy.deepcopy`'d, preventing aliasing between the
`ReviewContext` and the Synthesizer's own output). Three further findings from that
review were deliberately left unfixed and documented instead as explicit decisions/
open questions in `docs/modules/context_builder.md`: the breadth of the
public-contract exemption (treats all of `contract_stability`, not just its two
visibility-gated claims), per-hunk Evidence Units (still not implemented, by
decision), and a dependency on the Synthesizer's `"module"` claim key, which is real
but not part of the documented Claim shape.

**Verified**: 22 unit tests (`tests/review/test_context_builder.py`, stdlib
`unittest` — this project's first real test suite) covering commit-identity
presence, commit-summary construction (including that `author`/`date` are absent),
verbatim claims/gaps relay plus non-aliasing, collapse candidacy (narrow vs. wide
vs. homogeneous, single-eligible-file non-collapse, diff-order representative
selection), risk-bearing exemption (both file-scoped and symbol-scoped sources,
plus confirming a non-named `historical_risk` claim does *not* exempt),
evidence-unit addressing (multi-hunk ranges, binary files, added files, deleted
files, a file absent from the diff, empty diff text), and stable ordering
(including that the coverage ledger and evidence units share one order).
Additionally run against two real `diff.patch` files already on disk
(`benchmark/fastapi/...`, `benchmark/tcx_nogrunt-1/...`) to confirm line-range
extraction against actual `git diff` output, not only hand-written fixtures — both
produced correct addresses, cross-checked by hand against the visible `@@` headers.

**Not wired into any pipeline entrypoint yet** — `synthesizer.synthesize`'s real
output has never been produced from a live `collect()` run either (Milestone 8 was
never wired in), so this Builder has not yet been exercised end-to-end against a
real Synthesizer output, only against hand-built fixtures shaped identically to it
plus two real diffs. Deliberately out of scope, per this milestone's explicit
instructions: PromptBuilder, LLMAdapter, and ReviewEngine (ADR-012–014) remain
unimplemented.

## Milestone 10B — Prompt Builder (complete, frozen)

Implements ADR-014 exactly: `src/prompt/prompt_builder.py` (new package, sibling to
`src/review/`), one public function, `build_prompt(review_context) -> {"system_prompt":
str, "user_prompt": str}` — plain dict, reusing ADR-014's own "system content"/"user
content" vocabulary rather than any model SDK's role naming. Direct pass-through
integration with `context_builder.build_review_context`'s output — no adapter layer.

`SYSTEM_PROMPT` is a fixed constant (never computed per call, never trimmed),
restating ADR-012's role/seven-stage sequence/precedence hierarchy/decline
boundary/four-term uncertainty vocabulary/forbidden behaviors/optimization
objective, plus ADR-013's five-section output format/content rules/tone/philosophy.
The per-commit user prompt renders the `ReviewContext`'s five sections as verbatim
`json.dumps` blocks, in one fixed order — a deliberate design choice over
hand-formatted prose, since a bespoke formatter is itself a place a field could be
silently dropped, exactly the "Prompt Builder bug" ADR-014's diagnostic test exists
to catch. This choice also satisfies "referenced only" for collapsed material for
free: `context_builder.py` already sets `diff_text: None` on every `"collapsed"`
evidence unit, so nothing is ever re-expanded — the Prompt Builder has no
collapse-awareness logic of its own.

Before implementation, a written plan and a self-critical review against ADR-014
(mapping every responsibility, checking for scope drift into another layer,
model-specific behavior, or weakened model-agnosticism) was presented and confirmed.
Three genuinely open implementation choices were resolved by explicit instruction,
not silently assumed: `commit_hash` (ADR-011's identity reference) is never included
in either prompt half; Claims/Gaps/Evidence Units/Coverage Ledger are embedded as
verbatim JSON, not hand-formatted prose; output keys are `system_prompt`/`user_prompt`.
Two further findings — no cross-referencing between evidence units and the coverage
ledger (left for the model to do itself, since it requires generation, not delivery)
and no truncation/context-window handling (flagged, not built, since no real
`ReviewContext` has been measured against any model's context window yet) — are
documented as explicit decisions in `docs/modules/prompt_builder.md`, not resolved by
building them.

**Verified**: 19 unit tests (`tests/prompt/test_prompt_builder.py`, stdlib
`unittest`) covering system-prompt content (all four uncertainty terms, all five
ADR-013 section names, precedence/decline/objective concepts present; numeric-
confidence phrasing, persona-inflation, and decisiveness-over-honesty pressure all
confirmed absent), exact round-tripping of every `ReviewContext` section through its
JSON block (including empty sections), fixed section order, `commit_hash` absence,
and determinism across repeated calls. One integration test builds a real
`ReviewContext` via `build_review_context` and feeds it directly into `build_prompt`
with no adapter. All 41 tests across `tests/review/` and `tests/prompt/` pass
together. Additionally run end-to-end against the same real on-disk commit used to
validate Milestone 10A (`benchmark/tcx_nogrunt-1/...`), confirming `commit_hash`
correctly absent from both prompt halves in a real, not synthetic, case.

**Not wired into any pipeline entrypoint yet** — same status as Milestone 10A.
Deliberately out of scope, per this milestone's explicit instructions: LLMAdapter
and ReviewEngine remain unimplemented; no code change was made to ADR-011/012/013,
consistent with the instruction to treat them as accepted architecture.

**Fidelity review and freeze (2026-07-26).** A clause-by-clause trace of
`SYSTEM_PROMPT` against ADR-012/013's literal text found six concrete deviations —
a directly-quoted ADR-013 example altered in paraphrase, Reasoning Step 4 wording
imported from `docs/research/reviewer_reasoning_model.md` rather than ADR-012 itself,
two omitted ADR-013 per-section content exclusions (Verdict's "not a claim
inventory, not style detail"; "What changed and why"'s "not line-by-line detail, not
raw diff text reproduced wholesale"), one omitted ADR-012 clause ("not something to
resolve silently in either direction" for message/diff disagreements), and one
omitted ADR-013 usefulness principle ("silence about the unknown is a defect, not a
virtue"). All six were fixed in place, each pinned by a new regression test (19 → 25
tests in `tests/prompt/test_prompt_builder.py`; 47 tests total across `tests/`). A
second trace after the fix confirmed no further fixable deviations remain — every
residual difference from the ADRs' exact wording (shortened rationale clauses, one
structurally-moot exclusion, an unlabeled receiving/generating distinction, one
unrestated rejected-role-alternative) is recorded in `docs/modules/prompt_builder.md`
as an **accepted editorial compression, not an architectural deviation**.

**Milestone 10B is frozen as complete.** ADR-014 is treated as fully implemented for
the Prompt Builder's scope. `SYSTEM_PROMPT` wording is not to be further refined on
the basis of close-reading against the ADRs — only if a future evaluation against
real model output demonstrates a measurable behavioral problem traceable to specific
wording. This does not close Milestone 9 as a whole: ADR-012/013 remain
architecture restated as instructions, not code that has reasoned over a real
commit, and no LLM Adapter or ReviewEngine exists yet to send this prompt anywhere.

## Milestone 10C — LLM Adapter (architecture frozen, no code yet)

Architecture frozen as ADR-015 (2026-07-26), reached through the same
question-by-question research methodology as Milestone 9 — responsibility
boundary, input/output contract, failure contract, state contract — each
answered from first principles with alternatives explicitly rejected, and each
followed by a dedicated critical or adversarial review before moving to the
next question. **No implementation exists** — this milestone describes decided
architecture only, per `PROJECT.md` rule 4, mirroring Milestone 9's own status
at the same stage.

ADR-015 freezes the boundary immediately downstream of the Prompt Builder's
`{"system_prompt", "user_prompt"}` output: the first component in this entire
project whose job requires an actual model to run, and therefore the first
deliberate exception to the full-pipeline determinism every ADR from ADR-006
through ADR-014 has held as an invariant — named explicitly as such, not left
to be inferred. Its responsibility is transport and *structural* normalization
only (a representation of whatever resulted, and an explicit presence/absence
distinction), never semantic normalization — the same structure-never-meaning
philosophy ADR-011 established for `ReviewContextBuilder`, carried across the
one boundary where "meaning" now belongs to something this project did not
itself produce. Presence and absence are defined structurally (an answer-shaped
result exists or it does not), never by judging content adequacy. A
two-kind failure taxonomy — *Adapter-boundary failure* (the crossing was never
validly attempted) versus *Execution-boundary failure* (attempted, concluded,
nothing resulted) — keeps "the Adapter itself couldn't proceed" distinguishable
from "the model was asked and produced nothing." A five-state contract
(Received, Attempting, and the three terminal states above plus Success)
expresses this taxonomy structurally, with only the three terminal states
externally observable. Four invariants are guaranteed regardless of provider —
Response Transparency, Content Preservation, Explicit Absence, No Fabrication —
producing provider independence as their consequence, inherited by reference
from the model-agnosticism ADR-012/014 already established rather than
re-derived.

**A dedicated adversarial audit was run against the full design before
freezing** — hunting explicitly for duplication across ADR-011–015, misplaced
ownership, unobservable distinctions, indistinguishable states, and invariants
that restate each other without adding a guarantee. It found and corrected real
issues, not merely confirmed the design: two candidate invariants (a
determinism guarantee scoped to the Adapter's own logic, and a guarantee
against losing already-obtained information) were found to be fully subsumed by
other statements already in the ADR once its state contract existed, and were
removed rather than kept for symmetry with other ADRs' invariant counts; a
genuine, previously unresolved ambiguity (whether minimal/empty content counts
as "present") was surfaced and resolved structurally; Provider Independence's
rationale was redirected to inherit from ADR-012/014 by reference rather than
being re-derived from scratch; and Adapter-boundary failure was reframed
explicitly as existing for contract completeness, not expected operation,
matching Evidence Fusion's `not_collected` precedent.

**A final cross-ADR consistency audit (ADR-011 through ADR-015) was run after
freezing** to confirm no contradictory responsibilities, duplicated ownership,
or broken references were introduced — see `docs/DECISIONS.md` and the audit
recorded in this milestone's changelog entry for its result.

**This completes the Milestone 10 architecture.** ADR-011 and ADR-014 are
implemented (Milestones 10A, 10B); ADR-012, ADR-013, and now ADR-015 are frozen
architecture with no code. Per explicit instruction, architectural work on this
line stops here — the next milestone begins implementation of the LLM Adapter
against ADR-015, not further ADR refinement.

## Milestone 11A — LLM Adapter (implementation)

Implements ADR-015 exactly: `src/adapter/llm_adapter.py` (new package, sibling
to `src/review/` and `src/prompt/`), one public function,
`run_adapter(prompt, execute) -> {"state": ..., "response": ...}`. Plain
function, no class — ADR-015 states the Adapter "holds no state across
calls." `prompt` is exactly `build_prompt(...)`'s output; `execute` is an
injected callable representing the actual model call, deliberately opaque
to this module and deferred in its own implementation, per ADR-015's
deferral of "which model or execution target a request is addressed to."

Before writing code, a full implementation plan (package layout, public API,
data flow, state transitions, testing strategy, integration points, and an
explicit list of decisions intentionally not revisited) was produced and
then put through the same adversarial audit process used to freeze ADR-015
itself. That audit found zero architectural violations and zero drift, but
surfaced one real internal inconsistency in the plan's own description of
`execute`'s contract, plus two genuine specification gaps — all corrected
before implementation began.

**A genuine ADR-015 conflict was found and resolved before writing any
code**, not silently designed around: an instruction to classify a non-`str`
return from `execute` (including `None`) as `adapter_boundary_failure`
directly conflicted with ADR-015's closed transition rule — "Attempting
resolves to either Execution-boundary failure or Success" — since `execute`
must already have been invoked (Attempting under way) for it to return
anything at all, malformed or not. Resolved by classifying every outcome of
an invoked `execute` — raising, or returning a non-`str` value — as
`execution_boundary_failure`, keeping ADR-015's frozen transition table
exactly as written, while preserving the specific reason for a malformed
return (`"execute must return a str, got NoneType"`, etc.) *internally only*,
via a dedicated, directly-tested helper function that never appears in the
public return value. See `docs/modules/llm_adapter.md`'s "The None/non-str
resolution" section for the full reasoning.

Prompt validation requires `prompt` be a dict with `system_prompt`/
`user_prompt` present and typed as `str`; additional keys are explicitly
allowed and ignored, never causing a validation failure or masking one.
Validation failure reasons are preserved the same way — internally, via a
directly-tested helper, never exposed in the public result.

**Verified**: 27 unit tests (`tests/adapter/test_llm_adapter.py`, stdlib
`unittest`), including both internal reason-computing helpers tested
directly (a deliberate exception to testing only the public function,
justified since the reason-preservation property is otherwise unverifiable).
All 74 tests across `tests/review/`, `tests/prompt/`, and `tests/adapter/`
pass together. Additionally validated end-to-end against a real
`build_prompt(...)` output, confirming no adapter shim is needed between the
Prompt Builder and the Adapter.

**A post-implementation architecture audit against ADR-015 was run** before
considering this milestone complete — see `docs/CHANGELOG.md` for its
result.

**Not wired into any pipeline entrypoint yet** — `execute`'s own
implementation (an actual model call) does not exist; this milestone builds
only the Adapter's own logic, exactly as ADR-015 scopes it. ReviewEngine
remains unimplemented and undesigned.

## Milestone 12 — Review Engine (implementation)

Implements ADR-016 exactly: `src/review_engine/review_engine.py` (new
package, sibling to `src/adapter/`), one public function,
`run_review_engine(adapter_result) -> dict`. Plain function, no class —
ADR-016's state contract presupposes a pure, stateless computation. Takes
exactly `run_adapter(...)`'s output, no second parameter — unlike the
Adapter, there is no external dependency to inject, since evaluation has no
"Attempting"-equivalent interval to anchor.

Two internal helpers: `_evaluate_response(response)`, the named seam where
ADR-012/013's category-1 checks will eventually apply — currently returning
`[]` unconditionally, since ADR-016 explicitly defers which specific
properties are checkable to a later derivation, not this milestone; and
`_build_result(...)`, constructing the one uniform output shape shared by
both outcomes.

An implementation plan was produced first (public interface, helpers, data
flow, observable branches, edge cases, testing plan, documentation, and a
plan-level adversarial audit) and then refined by explicit review: a
proposed `_is_artifact_present` helper was removed as unnecessary
abstraction (a single comparison with one call site, obscuring the branch
rather than clarifying it — inlined instead), and the plan's premature
freezing of concrete field names was corrected, deferring the exact result
shape to implementation itself, consistent with how ADR-015 left the
Adapter's own result shape open until Milestone 11A.

**Verified**: 11 unit tests (`tests/review_engine/test_review_engine.py`,
stdlib `unittest`), including a `unittest.mock.patch`-based test proving
`_evaluate_response` is never invoked for either of the Adapter's failure
kinds — the analogue of the Adapter's own `_never_called` stub, adapted
since this seam is internal rather than caller-injected. Both Adapter
failure kinds confirmed to produce `no_artifact` while remaining
distinguishable via preserved `adapter_state`; a success response, and
separately an empty-string success response, both confirmed `evaluated`
(the latter pinning the presence/absence boundary inherited from ADR-015).
Result-shape uniformity confirmed across all three reachable scenarios,
with no certifying field ever present (Bounded Authority). Determinism and
non-mutation of the caller's input both confirmed explicitly, the latter
noted as structurally guaranteed by Python's string immutability rather
than by defensive copying. All 85 tests across `tests/review/`,
`tests/prompt/`, `tests/adapter/`, and `tests/review_engine/` pass
together. Additionally validated end-to-end through the real
`build_prompt` → `run_adapter` → `run_review_engine` chain, on both a
successful and a failing model stub.

**Not wired into any pipeline entrypoint yet** — `_evaluate_response`'s
actual category-1 catalogue does not exist, by design (ADR-016 defers it);
no component consumes `run_review_engine`'s result yet, and none is
designed. No changes were made to any ADR.

## Milestone 13 — Real LLM Integration (first end-to-end execution)



**Status: Complete** (verified 2026-07-30)

Explicit instruction for this milestone: "implementation is the default... we are
no longer designing architecture unless implementation exposes a genuine
contradiction." Goal: connect every already-built layer — `GitClient` →
`DatasetCollector` → Evidence Fusion → Reasoning → `ReviewContextBuilder` →
`PromptBuilder` → `LLMAdapter` → a real model → `ReviewEngine` — and achieve one
successful execution against a real commit. Explicit "do NOT implement" list:
retries, caching, provider abstraction redesign, prompt optimization, model
comparison, frontend, authentication, GitHub API integration, databases,
analytics, telemetry, pricing, deployment, background workers.

- [x] **Evidence assembly wired for real use** — `run_full_pipeline.py` (new,
      root-level, sibling to `main.py`). `build_evidence()` calls
      `DatasetCollector`'s existing private builder methods in sequence
      (`_build_commit_metadata`, `_build_commit_change_set`,
      `_build_commit_observations`, `_build_commit_repository_signals`,
      `_build_commit_file_history`, `_build_commit_co_change`,
      `_build_commit_local_module_context`, `_build_commit_semantic_analysis`)
      to assemble the exact evidence shape Evidence Fusion requires. No
      `DatasetCollector` code was changed — `collect()` itself still does not
      call these methods; that gap is named as future work below, not fixed
      here (see "Not yet true").
- [x] **Full chain executed**: `fuse_evidence` → `run_reasoning`/`synthesize` →
      `build_review_context` → `build_prompt` → `run_adapter` → `run_review_engine`,
      each called exactly as its own milestone left it, with zero modification
      to any `src/` module.
- [x] **Real `execute` implementation** — `call_gemini(system_prompt,
      user_prompt)`, a plain function using stdlib `urllib.request` against
      Google's Generative Language API. Lives in the script, not `src/adapter/`,
      since a permanent provider home is explicitly future work, not this
      milestone's scope. Reads `GEMINI_API_KEY` from the environment only;
      the key is never written to any file, doc, or commit.
- [x] **One successful real execution**: `pallets/click` @
      `0f4738df88e3ea47c40a4a442103596a61cfee79` ("Fix docs and changelog," 11
      files — `CHANGES.md`, five `docs/*.md`, five `src/click/*.py`, all
      docstring/comment/annotation-only edits). System prompt 7,551 characters;
      user prompt 26,190 characters (4 commit-level claims, 11 files'
      `file_claims`, 0 `symbol_claims`, 0 commit-level gaps). Result:
      `adapter_result.state == "success"`; `review_result.outcome ==
      "evaluated"`, `adapter_state == "success"`, response preserved
      byte-for-byte, `findings: []` (the category-1 catalogue remains
      unimplemented, per ADR-016's own deferral — expected, not a defect).

**Two real environment obstacles found, neither a `src/` bug**: this Python
installation has no configured default SSL CA trust store
(`ssl.get_default_verify_paths()` returns `cafile=None`), fixed via a
script-local `_ssl_context()` helper falling back to `certifi` — deliberately
not added to `requirements.txt` or any `src/` module, preserving this project's
zero-third-party-dependency discipline for the actual codebase. The first
Gemini model tried, `gemini-2.0-flash`, returned `429 RESOURCE_EXHAUSTED` (`0`
free-tier quota under the supplied key); `gemini-flash-latest` was confirmed to
have quota and used instead.

**One real model-behavior finding, not a pipeline bug**: the real Gemini
response surfaced the raw internal claim id
`verification.no_test_files_changed` literally in its "What deserves attention"
section — exactly what ADR-013's "must never appear" rule (internal
deterministic vocabulary as visible jargon) forbids. Applying ADR-014's own
bug-vs-mistake diagnostic test against the real, verified prompt content
(everything required was present, correct, and complete in what was sent)
classifies this as a model mistake, not a Prompt Builder defect — the first
time that diagnostic test has been exercised against real rather than
hypothetical output.

**Verified**: all 85 existing tests (`tests/review/`, `tests/prompt/`,
`tests/adapter/`, `tests/review_engine/`) pass unchanged — no `src/` module was
modified by this milestone.

**No architectural contradiction was found.** The only stopping point along the
way was a missing credential in the environment (confirmed via `env | grep -iE
"anthropic|openai|api_key"` returning empty), resolved directly by the user
supplying a real Gemini API key in chat. No ADR was touched.

**Not yet true, per `PROJECT.md` rule 4**: `DatasetCollector.collect()` itself
still does not produce the full evidence dict — `run_full_pipeline.py` bypasses
this by calling the private builder methods directly from an external script,
not by fixing `collect()`. The Review Engine's category-1 validation catalogue
(`_evaluate_response`) still does not exist. No permanent, `src/`-resident
`execute` implementation exists — `call_gemini` lives in this one script only.
No delivery/presentation layer consumes `run_review_engine`'s result. Retries
and provider abstraction remain deliberately unbuilt, per ADR-015's own
deferral and this milestone's explicit scope. All four are named as future
milestone candidates, not implemented here.

## Milestone 14 — API Preparation (proposal, no code)

**Status: Complete** (delivered 2026-07-31) — a planning deliverable, not an
implementation milestone; see Milestone 14B below for the code.

Explicit scope: the minimum analysis and design required before the pipeline
could be wrapped behind a public API, with an explicit "do NOT introduce" list
(frontend, authentication, GitHub OAuth, databases, caching, retries,
analytics, deployment, provider abstraction redesign).

- [x] Reviewed the real Milestone 13 Gemini response against `SYSTEM_PROMPT`'s
      literal instructed text (not ADR-013's paraphrased summary). This
      corrected an earlier informal claim of section-header drift — there was
      none; all five headings, including the unusual "What deserves
      attention, ranked" phrasing, were reproduced exactly. Confirmed the one
      real defect already known (the leaked claim id
      `verification.no_test_files_changed`) remains the only genuine ADR-013
      violation in that response, and that the "Resolution:" line under Open
      Questions is compliant, not a violation.
- [x] Proposed exactly one revised `SYSTEM_PROMPT` edit (a concrete
      counter-example added to `WHAT MUST NEVER APPEAR`), responding
      specifically to the trigger condition Milestone 10B's freeze reserved
      for future changes — "a measurable behavioral problem from real model
      output." Presented as a proposal, not applied in this entry.
- [x] Determined the five-section format parses reliably at the
      section-heading level and not below it; recommended a lenient,
      best-effort splitter living outside the Review Engine.
- [x] Recommended the minimal REST surface (`POST /review`, `GET /health`)
      and clarified that the four requested failure categories
      (timeout/rate limit/provider error/malformed response) collapse to
      fewer HTTP-observable buckets than requested, since `run_adapter`
      erases which of them occurred by design (ADR-015's Explicit
      Absence/No Fabrication invariants) — not a gap, a boundary to respect.
- [x] Flagged one decision requiring explicit confirmation: taking on this
      project's first-ever runtime dependency (a micro-framework) versus a
      stdlib-only HTTP layer.

**No code was written in this milestone** — proposal only, per its own scope.

## Milestone 14B — Implement the MVP API

**Status: Complete** (verified 2026-07-31)

Implements Milestone 14's proposal exactly as agreed, with four decisions
fixed up front by explicit instruction: use FastAPI; expose exactly `POST
/review` and `GET /health`; keep the existing pipeline completely unchanged;
no authentication, databases, queues, retries, caching, provider abstraction,
or deployment concerns. No ADR was touched — the Adapter and Review Engine
were not redesigned; `run_adapter`/`run_review_engine` are called exactly as
Milestone 11A/12 left them, byte-for-byte unchanged.

- [x] **Refactored the orchestration.** `src/pipeline/orchestrator.py`:
      `run_pipeline_for_commit(repository_url, commit_hash, execute) -> dict`
      — a plain function, no class, matching this project's established
      data-contract convention. `execute` is required with no default,
      mirroring `run_adapter`'s own signature discipline — the orchestrator
      has no knowledge of any specific provider. Raises a new
      `CommitResolutionError` when the repository can't be cloned or the
      target commit can't be resolved, giving the API one clean exception to
      map to a 404. `run_full_pipeline.py` is now a thin CLI wrapper around
      it — the same thinness `main.py` already has around `DatasetCollector`.
      The real Gemini `execute` implementation (`call_gemini`/`_ssl_context`,
      logic unchanged from Milestone 13) moved to
      `src/pipeline/gemini_execute.py` so both the CLI and the API can import
      it without inverting this project's established dependency direction
      (`src/` never imports from a root-level script).
- [x] **Built `src/api/`** (new package):
      - `response_parser.py` — `parse_review_sections(text) -> dict | None`,
        matching the five literal section headings `SYSTEM_PROMPT` instructs,
        tolerant of heading order/case, returning `None` (never raising) if
        any of the five is missing. Deliberately does not parse anything
        below heading level — the model's own internal sub-structure
        (observed in the real Milestone 13 response) is unspecified by
        ADR-013 and not reliable. Lives outside the Review Engine entirely,
        per explicit instruction — ADR-016 is untouched.
      - `models.py` — the Pydantic request/response schema matching the
        Milestone 14 design exactly.
      - `app.py` — `GET /health` (trivial liveness only) and `POST /review`,
        which resolves a pipeline-runner via a `Depends()` seam (overridden
        in tests, never touching the network), wraps the call in a
        `concurrent.futures.ThreadPoolExecutor` with a 90-second bound for
        the 504 case, and maps outcomes: request validation errors → 422
        (FastAPI's default — reconciled with the 400 discussed informally in
        Milestone 14 as an acceptable convention, not a deviation);
        `CommitResolutionError` → 404; `adapter_boundary_failure` → 500;
        `execution_boundary_failure` → 502, one uniform response covering
        all of timeout/rate-limit/provider-error/malformed-response, since
        `run_adapter` collapses them indistinguishably by design; success
        with an unparseable response → 200, `parsed: false`, `raw` preserved
        exactly, not an error.
- [x] Added `fastapi`, `uvicorn`, `httpx` to `requirements.txt` — this
      project's first-ever runtime dependencies.

**A real, pre-existing bug was found, not fixed**: `DatasetCollector.
_build_commit_semantic_analysis` unconditionally indexes
`get_parent_hashes(...)[0]`, which is empty for a repository's root commit —
raises `IndexError`. Pinned by a new test rather than fixed, per this
milestone's explicit "keep the existing pipeline completely unchanged"
instruction. `run_pipeline_for_commit`'s own exception handling around
evidence assembly happens to catch it and surface it as
`CommitResolutionError` (a clean 404) rather than crashing unhandled — a side
effect, not a deliberate fix.

**One resource-leak bug fixed during the refactor**: Milestone 13's script
called `tempfile.mkdtemp()` once per run to satisfy `DatasetCollector`'s
constructor, creating a directory never written to or cleaned up. Fixed by
passing the already-existing clone directory instead — trivial,
non-architectural, applied directly rather than flagged.

**Verified**: 24 new tests — `tests/pipeline/test_orchestrator.py` (6,
including one real synthetic local git repo built via subprocess, mirroring
Milestone 4A's synthetic-repo precedent, with a stubbed `execute`, no
network), `tests/api/test_response_parser.py` (8, pure unit tests),
`tests/api/test_app.py` (10, using FastAPI's `TestClient` with
`app.dependency_overrides` to control every pipeline outcome — no real Gemini
call anywhere in the suite). All 109 tests across every `tests/` package pass
together, including all 85 pre-existing tests unchanged.

**Not yet true, per `PROJECT.md` rule 4**: no authentication, persistence,
retries, caching, deployment configuration, or provider abstraction exist, by
design. The Review Engine's category-1 catalogue is still empty. No component
outside this new API layer consumes `run_review_engine`'s result differently
than before — the API is the first, and only, consumer.

## Milestone 15 — Real-world Pipeline Evaluation (findings only, no code)

**Status: Complete** (delivered 2026-07-31) — a product evaluation, not an
implementation or architecture milestone; findings-only, matching the
20-commit qualitative evaluation's own precedent from Milestone 5A.

Ran the real pipeline (real Gemini calls, via `run_pipeline_for_commit`)
against 10 hand-selected real commits across 4 public repositories
(`pallets/click`, `pallets/flask`, `pytest-dev/pytest`, `psf/requests`),
deliberately covering 10 different commit categories (documentation-only, bug
fix, feature addition, refactor, dependency update, test-only,
rename/reorganization, large multi-file, small focused, mixed
documentation+code), evaluated purely as a real early user reading each
review — not by inspecting the implementation or comparing against the ADRs.

Every specific factual claim spot-checked against the real diffs was
accurate — zero hallucinations across the sample, including the two most
consequential findings (a real backward-compatibility break in Flask's
`RequestContext` alias in a 36-file refactor; independent changelog/behavior
contradictions caught in two unrelated Click commits). No internal
claim-id leaks recurred in this sample (Milestone 13's single leaked-id
example did not repeat).

Three confirmed, recurring product issues, prioritized by user impact: (1)
5 of 10 reviews padded "Open questions" with a near-identical, structurally-
always-true note about missing semantic analysis for non-Python files,
regardless of whether it mattered for that specific commit; (2) the one
weak review in the sample (a routine dependency-floor bump) elevated a real
but minor deterministic signal into a headline "what deserves attention"
item rather than saying nothing was needed; (3) trivial commits (a pure
rename, a one-line dependency bump) received comparable prose density to
the 36-file refactor, despite the five-section format being explicitly
"exactly five sections," not "five sections of proportional length."

**No code was written in this milestone** — a findings/prioritization
deliverable only. See Milestone 15B below for the resulting prompt change.

## Milestone 15B — Prompt Calibration

**Status: Complete** (verified 2026-07-31)

Implements the smallest possible fix for exactly the three issues Milestone
15 confirmed — explicit instruction: not a prompt redesign, no new ADR-013
sections, no Prompt Builder logic changes, no Review Engine changes, no new
deterministic modules, uncertainty vocabulary unchanged. All three issues
were judged solvable primarily through prompt wording alone (the underlying
Claims/Gaps data was never the problem — only the model's judgment about
what to surface from it); the one caveat is verbosity scaling, which wording
can strongly nudge but not mechanically enforce without Prompt Builder logic
that these constraints explicitly forbid.

Three additive edits to `SYSTEM_PROMPT`'s `OUTPUT FORMAT` section in
`src/prompt/prompt_builder.py`, each targeted at exactly one confirmed
issue, with **zero lines removed or reworded** — every existing exact phrase
this project's fidelity tests pin (the ADR-013 quoted example, the per-section
exclusions, the third usefulness principle, etc.) is untouched:

- **Verbosity** (issue 3): one new sentence at the top of `OUTPUT FORMAT`
  instructing section length to track "this commit's actual complexity and
  risk," reusing the existing `OBJECTIVE` paragraph's "cost" framing rather
  than introducing a new principle.
- **Over-warning** (issue 2): section 3 ("What deserves attention, ranked")
  gained two sentences explicitly legitimizing "nothing requires special
  attention" as a complete, valid answer, naming the exact failure mode
  observed ("inflating a minor, already-priced-in signal into a headline
  concern").
- **Semantic-analysis padding** (issue 1): section 4 ("Open questions")
  gained a relevance gate, using the exact observed pattern (no semantic
  analysis for a non-Python file) as its own counter-example, while
  preserving the existing anti-silence principle for gaps that remain
  genuinely relevant.

**Regressions explicitly named, not glossed over**: permitting "nothing
requires attention" could make the model less likely to surface a genuinely
subtle concern on a commit that only looks safe on the surface — in direct
tension with the Flask refactor finding Milestone 15 itself praised. The
relevance gate on Open Questions could cause the model to over-generalize
and dismiss a gap that pattern-matches a "usually boilerplate" category even
in a rare case where it specifically matters. The verbosity instruction
anchors on "complexity and risk," not diff size, specifically to avoid
under-writing a small-but-dangerous commit (the Milestone 15 `NoSuchOption`
case) — but wording cannot force the model to make that distinction
correctly every time.

**Verified**: all 109 existing tests pass unchanged — the edit is purely
additive, so every exact-substring fidelity test from Milestone 10B's
fidelity pass still holds.

**Not yet true, per `PROJECT.md` rule 4**: this change has not been
re-validated against real commits — the 10-commit sample from Milestone 15
was not re-run against the new prompt in this milestone. That is a natural
next validation step, not yet performed.

## Milestone 15C — Prompt Validation (findings only, no code)

**Status: Complete** (delivered 2026-07-31) — re-ran the identical 10
Milestone 15 commits against the Milestone 15B prompt and compared outputs
directly; no prompt or code changes made in this milestone.

Two of the three intended improvements validated cleanly: semantic-analysis
padding dropped from 5/10 to 1/10 occurrences, and review length shrank
44-55% on trivial/safe commits versus only 4-23% on complex/risky ones — a
clean proportional split. The third change regressed: permitting "nothing
requires special attention" caused three commits with genuinely legitimate,
moderate-value findings (Click bug fix, Requests test-only change, Flask
`stream_with_context` refactor) to collapse entirely to "nothing," and
softened the single most valuable, independently-verified finding from the
whole Milestone 15 sample (Flask's `RequestContext`/`AppContext` merge, a
real backward-compatibility break) into a materially weaker point.

Diagnosed the root cause precisely: the wording only distinguished between a
headline concern and nothing, giving no permission for legitimate modest
observations, and let "nothing requires special attention" become available
as a shortcut before the reasoning sequence's evidence-checking steps ran,
rather than a conclusion reached after them.

**Recommendation delivered: do not freeze yet** — a real, recurring
regression was confirmed across 3-4 of 10 commits.

## Milestone 15D — Final Prompt Calibration

**Status: Complete** (verified 2026-07-31)

One further additive edit to `SYSTEM_PROMPT` section 3 in
`src/prompt/prompt_builder.py`, replacing only the "nothing requires special
attention" clause: it now requires every point that would reasonably change
how the reviewer evaluates or follows up on the commit to be included, even
if modest, and gates "nothing requires special attention" on every concern
already being fully covered by the Verdict and What-changed-and-why
sections — closing the exact shortcut Milestone 15C diagnosed. No other
line changed; section 4's relevance gate and the length-proportionality
sentence (both validated as working in 15C) were left untouched. All 109
tests still pass.

**Re-validated against the identical 10 commits.** 8 of 10 fully recovered
or held clean; semantic-analysis padding improved further (0/10, down from
1/10); trivial commits stayed concise while only the commits needing
restored content grew back toward their original length. The Flask refactor
and the Flask large-multi-file commit both recovered strong, substantive
findings — not always in the exact original framing (the large-multi-file
commit's strongest finding resurfaced via a different valid angle,
`isinstance` identity checks, rather than the original constructor-signature
break), consistent with ordinary non-deterministic generation rather than a
new defect.

Two residual issues confirmed, both narrower than the original regression:
the dependency-update commit's manufactured co-change-partner nudge
partially reappeared (the exact pattern Milestone 15B fixed, recurring on
one specific low-stakes case); the Requests test-only commit's missing-test-
case finding remains permanently absent across both the pre- and post-15D
runs — a persistent gap, not something 15D caused or worsened.

**Recommendation delivered**: one more narrow wording adjustment could
plausibly close the dependency-update case, but the user chose not to
pursue it — see the freeze decision below.

## Milestone 15E — Freeze Prompt v1

**Status: Complete** (2026-07-31)

Closes the full Milestone 15/15B/15C/15D evaluate → calibrate → validate →
recalibrate → re-validate arc. Summary of the four-iteration sequence:
semantic-analysis padding reduced from 5/10 commits to 0/10; review length
now scales proportionally with commit complexity (44-55% shorter on
trivial/safe commits, 4-23% on complex/risky ones); the major "nothing
requires special attention" regression introduced in 15B was largely
recovered in 15D (8 of 10 commits fully recovered or held clean); the two
remaining differences (the dependency-update co-change nudge partially
reappearing; the Requests test-only missing-test-case gap staying absent)
are isolated, non-repeating edge cases rather than systematic failures. No
architecture changed at any point in the sequence; all 109 unit tests passed
throughout.

**Decision: `SYSTEM_PROMPT` (`src/prompt/prompt_builder.py`) is frozen as
Prompt v1.** This follows the exact same discipline this project has applied
to every ADR: frozen until evidence justifies revision, not refined further
on reasoning or isolated outputs alone. A future prompt revision may only be
considered when **all four** of the following hold:

1. The issue is observed in real usage or production evaluation — not a
   synthetic evaluation batch run for the purpose of finding more issues.
2. The issue is repeatable across multiple commits, not a single isolated
   output.
3. The issue represents a systematic behavioral failure, not expected model
   variance (the kind already accepted and closed out above).
4. The proposed wording demonstrably fixes the issue without introducing a
   larger regression than it resolves — verified by the same
   evaluate-then-re-validate discipline used throughout Milestones 15-15D,
   not assumed from the wording alone.

No further prompt calibration work is planned absent all four conditions
holding at once. Prompt Engineering, as a distinct workstream, is considered
finished as of this milestone.

## Milestone 16A — Minimal Review Playground

**Status: Complete** (verified 2026-07-31)

Explicit instruction: product validation before product polish — no
frameworks, no authentication, no persistence, no deployment, no additional
backend logic beyond what's strictly required to make the page reachable.

Built `playground/index.html` — a single, self-contained, dependency-free
static HTML/CSS/vanilla-JS file (no `src/` code, no build step, no new
Python package): a repository URL field, an optional commit hash field, an
Analyze button, a loading state, and formatted rendering of `POST
/review`'s existing response — labeled Verdict/What changed and
why/What deserves attention/Open questions/Minor notes sections when
`review.parsed` is true, falling back to `review.raw` when it is not (the
first real consumer of that field). Errors from the API's existing status
codes (404/422/500/502/504) are shown as plain text, not stack traces.

The one necessary backend touch: `src/api/app.py` gained FastAPI's
`CORSMiddleware` (`allow_origins=["*"]`) so a static file opened via a
`file://` origin can reach the API — a transport-level permission, not new
application logic; `POST /review` and `GET /health` remain the only two
endpoints, unchanged from Milestone 14B. Verified live: `GET /health`
responds, and a CORS preflight (`OPTIONS /review` with `Origin: null`,
matching a `file://` page) correctly returns `access-control-allow-origin:
*`. All 109 existing tests still pass unchanged.

**Not yet true, per `PROJECT.md` rule 4**: no history/persistence of past
reviews, no feedback/rating capture, no deployment/hosting — all explicitly
out of scope per this milestone's own instruction, not oversights.

## Milestone 16B — Structured Evaluation Workflow (design only, no code)

**Status: Complete** (delivered 2026-07-31) — a design deliverable, not an
implementation or evaluation-execution milestone; mirrors the precedent set
by Milestone 5A's design-only phase and Milestone 15's findings-only phase.

Delivered `docs/research/evaluation_workflow.md`: a repeatable methodology
for a future ~24-commit evaluation (12 categories — the original 10 from
Milestone 15 plus revert/rollback and security-sensitive-fix, 2 commits
each, across at least 7-8 distinct repositories rather than reusing the
same 4), a structured per-commit JSON recording schema (the same rubric
Milestones 15/15C/15D already validated, plus one new closed-vocabulary
`failure_tags` field enabling cross-round aggregation), and an explicit
aggregation rule directly operationalizing Milestone 15E's four-condition
freeze test: a failure tag must recur on 3+ commits spanning 2+
repositories before it counts as "systematic" rather than noise, and any
resulting wording change must be re-validated against the same frozen
corpus before/after, exactly as Milestones 15B→15C→15D did.

**No code was written and no evaluation was executed in this milestone** —
this is the workflow definition only. Running it against real commits is
explicitly named as a future milestone's work, not started here.

## Milestone 16B (execution) — Three-model benchmark + GPT-OSS prompt calibration

**Status: Complete** (2026-08-01)

Executed the Milestone 16B evaluation workflow's first 6-commit batch
(django, numpy, httpx, sqlalchemy, poetry — new repos, not reused from
Milestone 15) against three alternative models via Shakti Studio's
OpenAI-compatible API: Llama 3.3 70B Instruct, DeepSeek V3, and GPT-OSS-120B.
No pipeline, prompt, or evaluation-logic code was changed to run this — a
new, additive `execute` implementation (`src/pipeline/shakti_execute.py`,
Llama 3.3) plus two scratch-only equivalents (DeepSeek V3, GPT-OSS-120B,
deliberately kept outside `src/` per that round's "do not modify any
project code" instruction) were the only new artifacts.

Each model showed a genuinely different, non-dominant trade-off profile:
Llama 3.3 was the most structurally reliable (6/6 heading compliance) but
weakest on technical depth and never used the uncertainty vocabulary;
DeepSeek V3 partially used the vocabulary and had zero literal claim-id
leaks but broke heading parsing on 5/6 responses; GPT-OSS-120B produced the
deepest, most technically precise reviews (verified against real diffs
multiple times) but leaked internal terminology most often. No model won
cleanly across every axis.

Two prompt edits were then applied to `SYSTEM_PROMPT`, specifically
motivated by GPT-OSS-120B evidence and explicitly justified against
Milestone 15E's four-condition freeze test (real usage, repeatable,
systematic, verified not to regress):

- **Heading-format instruction** added to `OUTPUT FORMAT` — GPT-OSS-120B and
  DeepSeek V3 had never been told what heading syntax to use (a genuine
  specification gap, not a compliance failure); once told, GPT-OSS-120B
  produced correct `###` headings on **6/6 across two independent re-runs**,
  zero regression. A clean, fully deterministic fix.
- **Two additive counter-examples** added to `WHAT MUST NEVER APPEAR`, one
  for literal claim-id leaks, one for module-name/"the claims" style
  references — seeded directly from phrases observed leaking in real runs.
  Re-validation showed a **reduction, not elimination**: the identical
  prompt (unchanged between two consecutive re-runs) produced 0/6 literal
  leaks once and 1/6 the next time, with new jargon variants appearing
  after old ones were explicitly banned (e.g., "the symbol claim shows..."
  banned → model wrote "Symbol claims indicate..." instead).

**A root-cause investigation was then conducted** (no further prompt
changes) to determine whether the residual failures were deterministic
(fixable by more wording) or stochastic (a property of the model itself).
Conclusion, stated explicitly: the heading gap was genuinely deterministic
and is now closed; the terminology-leak family is stochastic — proven by
identical wording producing different outcomes across consecutive runs —
and **Prompt v1 has reached diminishing returns on this specific failure
family for GPT-OSS-120B**. Recommended engineering response: a deterministic
post-processing check (not more prompt iteration), architecturally
belonging in the category-1 seam ADR-016 already deferred. See Milestone 17.

**Not yet true, per `PROJECT.md` rule 4**: the remaining ~18 commits of the
designed 24-commit corpus have not been run. No decision has been made to
adopt any of the three alternative models for production use — Gemini
remains the only model exercised through the actual shipped
`run_full_pipeline.py`/`src/api/app.py` path.

## Milestone 17 — Response Validation Layer (design only, not implemented)

**Status: Complete** (design delivered 2026-08-01) — a design-review
milestone; no code, prompt, parser, or ADR changes were made.

Delivered `docs/research/response_validation_layer_design.md`, proposing a
new, deterministic, post-Review-Engine layer answering the engineering
recommendation from Milestone 16B's root-cause investigation. Full design
covers:

- **Placement**: outside the Review Engine (an elimination-test argument —
  these checks would matter even if the Review Engine didn't exist, since
  they're about presentation-contract compliance, not evidentiary content)
  and outside `response_parser.py` (a sibling, not an extension — the parser
  is deliberately lenient and order-tolerant; this layer is deliberately
  strict and diagnostic).
- **Inputs/outputs**: response text only, no evidence, no second LLM call —
  narrower access than the Review Engine's own, by design. Outputs an
  independent, additive report (`outcome`/`response`/`findings`), never a
  mutation of the Review Engine's result.
- **Validation catalogue**: Formatting (missing/duplicate/out-of-order/
  unknown sections), Internal terminology (literal claim-id leaks anchored
  on the real, closed reasoning-module prefix vocabulary; reserved
  confidence-tier self-tagging; module-name soft jargon as a lower-precision,
  best-effort check), Structural (empty sections, duplicated paragraphs,
  malformed markdown).
- **Severity model**: every rule assigned ERROR/WARNING and
  reject/sanitize/log-only, calibrated by how precisely bounded and how
  safely redactable each match is.
- **Minimal architecture**: one new package, `src/response_validation/`, one
  public function, no existing files modified. Natural future call site
  named (`src/api/app.py`, between `run_review_engine` and `ReviewResponse`)
  but not built.

**No code was written in this milestone.** Implementation is named as the
next milestone's work, not started here.

## Milestone 17A — Response Validation Layer (implementation)

**Status: Complete** (verified 2026-08-01)

Implements `docs/research/response_validation_layer_design.md` exactly, as
a standalone component only — not yet wired into `POST /review` or any
other caller (that is Milestone 17B). No prompt, parser, Review Engine,
Adapter, or reasoning-module code was touched.

Built `src/response_validation/response_validator.py` (new package, sibling
to `src/review_engine/`): one public function, `validate_response(response_text)
-> dict`, matching this project's established plain-function-no-class
convention. Deterministic, side-effect-free, and independent of any LLM —
inspects only the response string, never evidence/Claims/Gaps, never logs,
never prints, never raises, never mutates or sanitizes the input (those
responsibilities are explicitly deferred to a future milestone, per
instruction). Reuses `src/api/response_parser.py`'s already-public
`SECTION_KEYS` constant without any change to that module; implements its
own private heading-scan helper rather than importing the parser's private
`_HEADING_LINE`, keeping `response_parser.py` completely untouched.

All 11 rules from the approved design's catalogue are implemented, none
invented beyond it:

- **Formatting**: `missing_section` (ERROR), `duplicate_section_heading`
  (WARNING), `sections_out_of_order` (WARNING), `unknown_heading` (WARNING).
- **Internal terminology**: `literal_claim_id_leak` (ERROR) — anchored on
  the exact, closed set of 10 claim-id prefixes actually emitted by
  `src/reasoning/modules/*.py` (`shape`, `history`, `reach`, `verification`,
  `contract`, `interaction`, `error_handling`, `resource_management`,
  `documentation`, `structure`), verified against real code/prose references
  (`numpy.pad`, `self.band.id`) to confirm no false positives;
  `reserved_confidence_tier_self_tagging` (ERROR) — the four words
  `FORBIDDEN BEHAVIORS` reserves for the Claims themselves ("observed",
  "corroborated", "inferred", "conflicting"), carefully distinguished from
  the four *allowed* uncertainty-vocabulary terms (Confirmed/Likely/Worth
  checking/Unknown), which must never trigger this rule; `module_jargon_leak`
  (WARNING) — a maintained, growable phrase list seeded from terms actually
  observed leaking during the Milestone 16B benchmark.
- **Structural**: `empty_section_body` (WARNING), `duplicated_paragraph`
  (WARNING, exact/whitespace-normalized match only, length-filtered to avoid
  flagging trivial incidental repeats like "None."), `malformed_markdown`
  (WARNING, unbalanced `**` only — single-`*` italic detection was
  deliberately excluded as not deterministically distinguishable from
  bullet-list markers), `unclosed_code_fence` (ERROR) — implements the
  design's "heading-swallowing" concern directly: the heading scanner is
  fence-aware, so an unclosed fence correctly causes subsequent real
  headings to go undetected, which cascades into `missing_section` findings
  alongside the root-cause `unclosed_code_fence` finding — both reported,
  not just one.

Each finding is exactly `{"rule", "severity", "message", "location"}` —
`location` is a 0-indexed line number or `None` when not applicable.
`outcome` (`"clean"` / `"flagged"` / `"invalid"`) is derived mechanically:
`"invalid"` if any `ERROR` finding fired, `"flagged"` if only `WARNING`
findings fired, `"clean"` otherwise.

**Verified**: 75 new tests (`tests/response_validation/test_response_validator.py`,
stdlib `unittest`) — every rule covered individually (positive and negative
cases), all 10 claim-id prefixes tested individually plus two real-looking
non-claim-id references confirmed *not* flagged, all four reserved words
tested individually plus all four allowed uncertainty terms confirmed
*never* flagged by that rule, the unclosed-fence/heading-swallowing cascade
tested explicitly, combined multi-violation responses, determinism
(repeated calls on identical input produce identical output), non-mutation
of input, and defensive input handling (`None`, non-string, empty,
whitespace-only — never raises). All 184 tests across the whole repository
pass together (109 pre-existing + 75 new), zero regressions.

**Not yet true, per `PROJECT.md` rule 4**: not integrated into `POST
/review` or any other caller — a fully standalone, unused-in-production
component until Milestone 17B. No sanitization, logging, or rejection
behavior exists yet; those remain future-milestone responsibilities the
design deliberately deferred.

## Milestone 17B — Response Validation Layer (integration)

**Status: Complete** (verified 2026-08-01)

Wires the Milestone 17A validator into `POST /review`, the first real
caller. No prompt, parser, Review Engine, Adapter, or reasoning-module code
was touched; `response_validator.py` itself was not modified.

**Pipeline order**: `run_pipeline_for_commit` → `run_adapter` (unchanged) →
`run_review_engine` (unchanged) → `parse_review_sections` (unchanged) →
`validate_response` (new call) → API response construction. The validator
runs on `review_result["response"]` — the exact same string returned to the
client in `review.raw` — after parsing, before the response is built,
exactly as designed.

**A genuine architectural conflict was found during integration, not
before it — surfaced, not silently resolved.** Milestone 14B had already
made a deliberate decision: a response missing one or more of the five
sections is a *recoverable structural/presentation condition*, not an
error — `parsed: false`, still `200`, `raw` preserved. Milestone 17A's
`missing_section` rule is `ERROR` severity, and this milestone's original
instruction ("invalid → reject") would have silently reversed that
decision and broken an existing, already-passing test
(`test_review_success_with_unparseable_response_is_not_an_error`). Stopped
and presented the conflict with options rather than picking one
unilaterally.

**Resolution, chosen explicitly by the user on architectural grounds, not
merely to keep tests green**: findings are split into two categories with
different consequences —

- **Category A — parseability-related** (`missing_section`,
  `unclosed_code_fence`): these are exactly the condition `parsed: false`
  already represents. **Not rejected.** The response still returns `200`,
  `review.raw` and `review.parsed` behave exactly as Milestone 14B
  established, and the validator's findings are attached alongside.
- **Category B — contract violations** (`literal_claim_id_leak`,
  `reserved_confidence_tier_self_tagging`): genuine response-contract
  violations Milestone 14B never addressed or had an opinion about.
  **Rejected** with `502` — these are the first cases in this project
  where an internally-generated response is never returned to a client.

When both categories fire on the same response, Category B takes
precedence — a genuine contract violation is never suppressed by a
co-occurring parseability issue.

This preserves the layering Milestone 14B established (parsing answers
"can this be structurally interpreted," independent of whether the content
is trustworthy) while letting the validator enforce the genuinely new
guarantee it was built for (never return a response with a leaked internal
identifier) — the validator augments the existing contract; it does not
override it.

**API schema change** (smallest possible, additive only): `ReviewResponse`
gains one new optional field, `validation: ValidationResult | None`,
default `None`. `ValidationResult` is `{"outcome": str, "findings":
list[ValidationFinding]}`; `ValidationFinding` mirrors the validator's own
finding shape exactly (`rule`, `severity`, `message`, `location`). The
field is `None` whenever there are no findings at all (the `clean` case)
and populated whenever there are — whether the outcome is `flagged` or a
non-rejected Category A `invalid` — so existing clients that ignore
unknown fields see no behavioral difference at all.

**Verified**: 14 new integration tests
(`tests/api/test_app.py::ResponseValidationIntegrationTests`) covering a
clean response (field omitted/`null`), a flagged response (findings
attached, raw text unchanged), Category A responses (still `200`,
`parsed: false`, findings attached, for both `missing_section` and
`unclosed_code_fence`), Category B responses (both
`literal_claim_id_leak` and `reserved_confidence_tier_self_tagging`
rejected with `502`, no `review` body ever returned), Category B
precedence when both fire together, that the validator is invoked with
the exact raw response text (spied, not just inferred), that an exception
raised inside the validator propagates as an unhandled server error rather
than being silently swallowed, and that every pre-existing field's shape
and value is unchanged. **All 9 pre-existing API tests pass completely
unmodified** — none needed to change, confirming the conflict was resolved
without reversing Milestone 14B. All 198 tests across the repository pass
(184 pre-existing + 14 new), zero regressions.

**Not yet true, per `PROJECT.md` rule 4**: no sanitization, automatic
repair, or regeneration exists — a Category B rejection simply denies the
response; nothing attempts to fix it. The `module_jargon_leak` rule
remains `WARNING`-only (never rejects), consistent with its own
lower-precision, best-effort classification from Milestone 17A.

## Milestone 16B (full execution) — Production model swap + 24-commit evaluation

**Status: Complete** (2026-08-02)

**Production model swap** (a real, explicit production change, decided by
the user mid-milestone — not part of the original evaluation-only scope):
`src/pipeline/shakti_execute.py`'s `SHAKTI_MODEL` changed from `llama3_3`
to `openai/gpt-oss-120b`, and its request no longer sends the
deployment-specific `id` header (not required for this model). `src/api/app.py`'s
`get_pipeline_runner` now wires `execute=call_shakti` instead of
`execute=call_gemini`. **GPT-OSS-120B via Shakti Studio is now the real
production model** — Gemini is no longer called anywhere in the shipped
`/review` path. All 198 pre-existing tests pass unmodified (the dependency-injection
seam in `get_pipeline_runner` absorbed the change; no test imports
`call_gemini` directly).

**Evaluation executed**: the full frozen 24-commit corpus from Milestone
16B's design doc (12 categories × 2, 12 distinct repositories: click,
flask, pytest, requests, django, numpy, httpx, sqlalchemy, poetry, black,
fastapi, jinja), run fresh against the new GPT-OSS-120B production
pipeline. An earlier partial run of this same corpus (14 fresh + 10 reused
from Milestone 15D) was discarded before completion — the 10 reused
records were found, mid-milestone, to have been generated under an earlier
revision of Prompt v1 (missing the heading-format instruction), making
them invalid as "current production pipeline" evidence; the model swap to
GPT-OSS-120B made this moot by requiring a full fresh 24-commit run
regardless.

**Headline finding: internal-terminology leakage is systematic for
GPT-OSS-120B under Prompt v1**, per the workflow's own threshold (a
`failure_tag` recurring on 3+ commits spanning 2+ repositories). The
`terminology_leak` tag fired on **9 of 24 commits (37.5%), spanning 9 of
the 12 repositories evaluated** — several as literal, verbatim internal
claim-id strings (e.g. `` `contract.public_signature_changed` ``, `` `history.first_appearance` ``,
`` `verification.no_test_files_changed` ``), others as paraphrased internal
vocabulary ("hot file," "the verification claim," "the symbol claim
records..."). `over_warning` (8/24, 6 repos), `semantic_padding` (5/24, 5
repos), and `verbosity` (5/24, 3 repos) also independently cross the same
threshold. `missed_issue` (2/24, 2 repos) and `hallucination` (1/24, 1
repo) do not.

**Cross-checked against the already-deployed Response Validation Layer**
(Milestone 17B, live on the `/review` path this model now runs through):
of the 9 leaking responses, only 3 contain a literal `prefix.suffix`
claim-id string and would be rejected outright (`literal_claim_id_leak`,
502). 4 more match an existing `module_jargon_leak` pattern and are
flagged but still delivered to the client (`200`, warning attached,
`literal_claim_id_leak`, `warning` outcome). The remaining 2 (paraphrases
like "hot file" and "the verification claim," not covered by any current
jargon pattern) return `outcome: clean` — no validator signal at all. In
total, **6 of 9 real leaking responses (67%) would reach an actual
end user today**, either silently or behind a passive warning a client is
free to ignore.

This directly confirms the concern the earlier Milestone 16B benchmark
round raised speculatively ("GPT-OSS-120B leaked internal terminology most
often... Prompt v1 has reached diminishing returns on this specific
failure family") — now demonstrated at 4x the sample size, against the
model actually running in production, with the validator that was built
partly in response to that same benchmark round. Per this milestone's
explicit instruction, no fix is proposed here; this is evidence collection
only. Full per-commit records: `16b_full24_gptoss120b_evaluations/*.json`
(scratch, not committed to the repo).

**Not yet true, per `PROJECT.md` rule 4**: no prompt change, validator
change, or jargon-pattern expansion has been made in response to this
finding — Prompt v1 and the Response Validation Layer are both unchanged
from Milestone 17B. No ADR was touched.

## Milestone 18 — End-to-End Validation and Release Readiness (audit only, no code)

**Status: Complete** (2026-08-02)

A full release-readiness audit: read `ARCHITECTURE.md`/`CURRENT_STATE.md`/
`MILESTONES.md`/`CHANGELOG.md` in full, traced the real `POST /review`
request lifecycle stage-by-stage against the actual source, and ran a
dead-code sweep. No code or docs modified — findings only.

**Two verified release blockers found**, both reproducible and user-affecting:
(1) `response_validator.py`'s `_CLAIM_ID_PATTERN` matched ordinary filenames
(e.g. `documentation.md`) as literal claim-id leaks, rejecting factually
correct reviews with `502` — confirmed against real data from both the
Gemini and GPT-OSS-120B evaluation rounds. (2) `GitClient.get_file_history`'s
long-known missing `--follow` (flagged since Milestone 8) was confirmed to
have produced a misleading "new file" claim in real, delivered GPT-OSS-120B
review content for a renamed file.

Also found and explicitly labeled **not release blockers**: the CLI
(`run_full_pipeline.py`, still `call_gemini`) and API (`app.py`, now
`call_shakti`) using two different models with the divergence undocumented;
the API's 90s request timeout being shorter than Shakti's own 120s internal
HTTP timeout; the parser keeping the *last* duplicate section heading while
the validator's own message claims "only the first is used" (never observed
in ~48 real responses); the root-commit `IndexError` masked as a 404; the
Review Engine's permanently-empty `findings`; and the lack of prompt
truncation/context-window handling. Confirmed dead code: two unused
`DatasetCollector` builders (`_build_commit_identity`, `_build_commit_artifacts`)
and one unused constant (`_PARSEABILITY_RELATED_RULES` in `app.py`).

**Recommendation: NOT READY**, pending the two blockers above. See
Milestone 19 for their resolution.

## Milestone 19 — Release Blockers (fixed)

**Status: Complete** (2026-08-02)

Closed exactly the two release blockers Milestone 18 identified. No
architecture, cleanup, refactoring, or unrelated changes.

**Blocker 1 — validator false positive**: `src/response_validation/
response_validator.py`'s `_CLAIM_ID_PREFIXES` (10 prefixes + a generic
`[a-z][a-z_]*` suffix wildcard) replaced with `_CLAIM_IDS` — the complete,
exact enumeration of all 34 claim-id strings actually emitted by
`src/reasoning/modules/*.py` (re-confirmed via a direct codebase grep, not
assumed), matched by exact alternation instead of prefix-plus-wildcard.
Every existing legitimate detection is preserved (all 10 prior per-prefix
tests target real claim ids in the enumerated set); the false-positive
class is eliminated because the suffix is no longer "any lowercase word."

**Blocker 2 — rename history**: `src/git/git_client.py`'s `get_file_history`
now passes `--follow` to its single `git log` call. No-op for files that
were never renamed (verified by test); renamed files now have their
history correctly traced back through the rename instead of resetting at
it — and, as ADR-009/ADR-010 had already anticipated, every field derived
from the same call (`recent_commit_count`, `author_commit_count`,
`is_first_touch_by_author`) inherits the fix automatically.

**Tests**: 2 new in `tests/response_validation/test_response_validator.py`
(`documentation.md`, `structure.py` filename false-positives); a new file,
`tests/git/test_git_client.py` (3 tests — `GitClient` had no test suite
before this milestone; scoped narrowly to the `--follow` behavior only,
using a real hermetic temp repo rather than mocks, consistent with how
this layer has always been verified). **203 tests total** (198 pre-existing
+ 5 new), zero regressions.

**Regression cases confirmed directly against real data**: the real
`mixed_doc_and_code` (click) response containing `docs/documentation.md`
now validates as `outcome: clean` (was `invalid`); the real `rename_reorg`
(click) commit's renamed file now reports `is_first_appearance: false`,
`total_commit_count: 7` (was `true`/effectively 1).

**Not yet true, per `PROJECT.md` rule 4**: per this milestone's own explicit
scope, no documentation was updated as part of it — see Milestone 20/this
same documentation pass for the resulting doc staleness this created, and
its resolution.

## Milestone 20 — Final Release Audit (verification only, no code)

**Status: Complete** (2026-08-02)

A fresh, skeptical final audit before tagging Version 1 — re-traced the
execution path, re-read all core docs plus `DECISIONS.md`, reconfirmed both
Milestone 19 fixes intact (203/203 tests). No code or docs modified.

Findings, each backed by direct code citation: (1) **one reproducible bug**
meeting the full reproducible/user-visible/correctness/availability/
reliability bar — the root-commit `IndexError` in
`_build_commit_semantic_analysis`, masked as a misleading 404. (2) **three
hidden architectural inconsistencies** — the CLI/API model divergence: the
API/Shakti timeout mismatch; and the parser-vs-validator duplicate-heading
contradiction. (3) **two doc-vs-implementation disagreements**, both a
direct consequence of Milestone 19 being scoped to exclude documentation —
several docs still described the `--follow` gap and the "10 claim-id
prefixes" mechanism as current when they no longer were (resolved in this
documentation pass). (4) **one dead-in-effect function** —
`_evaluate_response(response)` ignores its own argument and always returns
`[]`, executed on every request. (5) **one production-critical test gap** —
`gemini_execute.py`/`shakti_execute.py`, the actual real-provider HTTP
integration code, have zero automated tests.

**Verdict: "I would tag this repository as Version 1."** None of the above
rises to the severity of the two blockers Milestone 19 already closed —
each fails safely, is narrowly scoped, or is a verification gap rather than
a live defect.

## Milestone 21 — Product Definition (no code)

**Status: Complete** (2026-08-02)

A findings-only product-definition pass over the repository as it exists
today (no code, prompt, architecture, or doc changes). Defined: the product
(a five-section, structured triage review of one git commit, delivered as
JSON or rendered prose, nothing persisted); the primary user (backend
engineers reviewing pull requests in Python codebases specifically — the
symbol-level semantic depth is Python-only); the problem solved (deciding
what in a diff deserves attention before/instead of reading it cold); the
first-time-user workflow end to end; the deliberate Version 1 non-goals
per `PROJECT.md` (no auth/multi-tenancy, no persistence, no PR/multi-commit
review, no automatic repair of rejected responses, no provider
configuration, no CI integration); the strongest technical differentiator
(deterministic evidence-gathering kept separate from the LLM's role, which
is narrowed to triage over fixed evidence rather than free generation from
a raw diff, backed by a deterministic leak validator); and a 25-word
GitHub-style description. No future work proposed.

## Milestone 22 — Final Backend Freeze Audit (verification only, no code)

**Status: Complete** (2026-08-02)

A brutally strict re-audit before backend freeze, applying a stricter
5-criteria test (reproducible; affects a real user; affects correctness,
reliability, availability, or data integrity; not already documented as an
accepted V1 limitation; would reasonably justify delaying release) to
every prior finding from Milestones 18/20. **All of them failed this
audit's Criterion 4** — each had already been explicitly examined and
labeled "not a release blocker" with reasoning on record — so none
resurfaced.

Re-verifying Milestone 19's own fix against its ground truth (a fresh grep
of `src/reasoning/modules/*.py`, diffed byte-for-byte against
`_CLAIM_IDS`) surfaced one genuinely new finding: `GitClient.
get_co_change_history` (`src/git/git_client.py`) has the identical missing-
`--follow` defect Milestone 19 fixed in the sibling function
`get_file_history`, but was never touched by that fix. Verified directly
against the real production reasoning pipeline on the same `rename_reorg`
(click) commit: `get_co_change_history` returned zero historical entries
for the renamed file (7 real entries exist when `--follow` is used
directly), and the reasoning layer emitted a false `reach.
no_historical_coupling` claim at **`confidence: "observed"`** — this
project's highest confidence tier, which the prompt's own Evidence
Precedence rules tell the model outranks its own inference.

**Verdict: NOT READY** — this one finding, meeting all five criteria, was
reported and not fixed in this milestone (audit-only scope). See
Milestone 22A for its resolution.

## Milestone 22A — Fix the Final Release Blocker

**Status: Complete** (2026-08-02)

Closed exactly the one blocker Milestone 22 identified, mirroring the
already-approved fix from Milestone 19. `GitClient.get_co_change_history`
now passes `--follow` to its single `git log` call — the same one-line
change already applied to `get_file_history`.

**Tests**: 2 new in `tests/git/test_git_client.py`
(`GetCoChangeHistoryFollowTests`) — a renamed file's co-change history now
includes its pre-rename co-committed sibling; a never-renamed file's
co-change history is unchanged. **205 tests total** (203 + 2 new), zero
regressions.

**Verified against the original reproduction**: re-ran `get_co_change_history`
on the real `rename_reorg` commit — now returns 6 historical entries (was
0), correctly surfacing the real pre-rename co-change partners. Re-ran the
actual production reasoning pipeline on the same commit: the `reach`
module no longer emits `reach.no_historical_coupling` at all.

**This completes the backend freeze** — no further release blockers are
open as of this milestone.

## Milestone 23 — Version 1 Product UI

**Status: Complete** (2026-08-02)

Replaced the Milestone 16A playground's dev-tool-styled single file with
the Version 1 shipping interface for `POST /review`, split into
`playground/index.html`, `playground/styles.css`, and `playground/app.js`
(still no framework, no build step, no dependency of its own). No backend
code was touched; the CORS policy and endpoint surface are unchanged from
Milestone 16A.

**Single workflow, exactly as scoped**: Repository URL, optional commit
hash, one Review Commit button, one output region cycling through exactly
four states (idle, loading, error, result) — nothing else. The five
review sections render in the backend's own exact order and labels
(`src/api/response_parser.py`'s `SECTION_KEYS`); an unparsed response is
shown honestly as raw text with a plain note, not hidden or treated as an
error (the API itself returns `200` for it). A quiet secondary note
appears only when the Response Validation Layer attaches a real,
non-rejecting finding (`validation.findings`) — genuine backend data, not
invented UI. The Review Engine's `findings` field is deliberately **not
displayed**: it is always `[]` by design (ADR-016's category-1 catalogue
doesn't exist), and rendering a counter that can only ever read zero would
misrepresent it as a working feature.

**Error handling**: the four real HTTP failure modes the API can return
(404 unresolvable commit, 500 invalid prompt, 502 no usable/contract-
violating response, 504 timeout) are each mapped to one calm, specific
sentence. The raw `detail` string and any stack trace are never shown to
the user.

**Verified end-to-end against the real, running API** (not mocked): a
successful parsed response with no validation findings (poetry commit); a
successful response with two attached `module_jargon_leak` validation
findings, confirming the secondary-note rendering; a real `502` contract-
violation rejection; and a real `404` for an unresolvable repository —
all four states confirmed rendering correctly against live responses. All
205 backend tests still pass (no backend code changed).

**Not part of Version 1, deliberately**: history/persistence of past
reviews, comparing commits, feedback capture, dark mode, or any workflow
beyond the one above — consistent with Milestone 21's defined non-goals.

## Milestone 24 — Version 1 Deployment Planning (no code)

**Status: Complete** (2026-08-02)

A findings-only deployment plan for Vercel (frontend, static) + Railway
(backend, single FastAPI service) for a 3-10-person trusted-tester
audience. Verified directly from the code, not assumed: no backend code
references `localhost`; the only local-execution assumption anywhere is
`playground/app.js`'s hardcoded API URL; the API path
(`run_pipeline_for_commit`) writes nothing to disk beyond an ephemeral
`tempfile.TemporaryDirectory()` per request; `GitClient` only ever shells
out to read-only `git` operations (clone/log/diff/show), never `commit`,
so no git identity configuration is needed; `requirements.txt` pulls in
`certifi` transitively via `httpx`. Identified two deploy-configuration
requirements that need no code change (start command must bind
`--host 0.0.0.0 --port $PORT`; `SHAKTI_API_KEY` must be set — `GEMINI_API_KEY`
is not needed, since only `run_full_pipeline.py`, not the deployed API,
uses it) and one expected small edit before deploying (the frontend's API
URL). No blockers requiring architecture changes were found.

## Milestone 24A — Version 1 Deployment Implementation

**Status: Complete** (2026-08-02)

Implemented the approved Milestone 24 plan with the smallest possible set
of changes — no backend functionality touched.

- **`playground/config.js`** (new) — the frontend's API base URL moved out
  of `app.js` into its own small file (`window.API_BASE_URL`, committed
  with a local-dev default), so pointing the frontend at a deployed
  backend is a one-line edit to a dedicated config file rather than a
  change buried in application logic, and no real deployment URL is
  hardcoded into the repository.
- **`playground/index.html`** — loads `config.js` before `app.js`.
- **`playground/app.js`** — reads `window.API_BASE_URL` instead of its own
  hardcoded constant. No other logic changed.
- **`Procfile`** (new, repo root) — `web: uvicorn src.api.app:app --host
  0.0.0.0 --port $PORT`, the minimal, standard file Railway needs to bind
  correctly; without it the previously-documented run command
  (`uvicorn src.api.app:app --reload`) would bind to `127.0.0.1` and be
  unreachable.
- **`.env.example`** (new, repo root) — documents `SHAKTI_API_KEY`
  (required) and `GEMINI_API_KEY` (not required for deployment), no real
  values.

**Verified**: all 205 backend tests still pass (no backend code changed).
The `config.js` → `app.js` wiring was verified directly (a Node harness
loading both files in the same scope and triggering a simulated form
submission confirmed the real fetch call uses the configured URL).
Re-confirmed against the real, running backend: a successful parsed
review, a response with real attached `module_jargon_leak` validation
findings, and a real `404` for an unresolvable repository. The `502`
contract-violation path was re-confirmed deterministically (the error-
handling code is unchanged from Milestone 23, where it was already
verified against a real `502`) rather than by chasing GPT-OSS-120B's
already-established stochastic leak behavior for a fresh one. `.env`
confirmed still gitignored; `.env.example` confirmed to contain no real
values.

## Milestone 25 — Version 1 Deployment (live)

**Status: Complete** (2026-08-03). **The backend is deployed to Render,
not Railway** — Railway was attempted first and abandoned after a real,
unresolved blocker; see below for exactly what was tried.

**Railway attempt**: the project built and started correctly (Nixpacks-
successor "Railpack" builder, `Procfile` correctly detected and used,
clean `Uvicorn running on http://0.0.0.0:$PORT` startup), and the
`SHAKTI_API_KEY` environment variable was set. Every real `POST /review`
request nonetheless failed with `404 could not clone repository` on a
plain, valid public repo URL that cloned instantly from a local machine.
Diagnosed methodically, not guessed: added `git` and then `ca-certificates`
via Railway's Custom Build Command (`apt-get install -y ...`) to test the
two most likely missing-system-package explanations — the build logs
showed **both were already present** (`git is already the newest version`,
`ca-certificates is already the newest version`), ruling out both
hypotheses with direct evidence. Railway provides no shell/exec access
into the actual running container (`railway shell`/`railway run` execute
*locally* with the project's environment variables injected, not inside
the deployed container — confirmed directly: a `git clone` run "inside"
one showed the local Mac's own git version and hostname, not the
container's), so the true root cause — most likely a difference between
build-time and runtime network access inside Railway's container, though
never conclusively confirmed — could not be isolated further without
either shell access Railway doesn't offer or a code change to log the
underlying exception, which this milestone's scope excluded. **Decision:
abandon Railway, deploy to Render instead**, rather than keep guessing
at an unreachable root cause.

**Render deployment**: built and started cleanly on the first attempt
(`pip install -r requirements.txt` via Render's dashboard-configured
Build Command; Start Command `uvicorn src.api.app:app --host 0.0.0.0
--port $PORT` set directly in Render's dashboard, same command the
`Procfile` already specified, not auto-read from it this time).
`SHAKTI_API_KEY` set as an environment variable. `GET /health` and a
real `POST /review` (repository cloned, full evidence pipeline run, real
model call, clean validation) both succeeded on the first real request —
confirming git/network access work correctly on Render where they did
not on Railway. Live at `https://intent-aware-self-healing.onrender.com`.

**Frontend deployed to Vercel** exactly as planned in Milestone 24:
Root Directory set to `playground/`, Framework Preset "Other" (no
build step), deployed successfully. Live at
`https://intent-aware-self-healing.vercel.app/`. `playground/config.js`'s
`API_BASE_URL` updated from its local-dev default to the Render URL
above (one-line change, confirmed with the user before committing,
committed and pushed separately from this milestone's other work).
Verified end-to-end through the actual deployed UI, browser to browser:
a real repository URL submitted through the live Vercel frontend
produced a complete, correctly rendered review from the live Render
backend.

**Not yet true, per `PROJECT.md` rule 4**: the `Procfile` added in
Milestone 24A is unused by the current deployment (Render's dashboard
commands are configured independently of it) but left in place — it's
harmless, and still correct if this project is ever redeployed to a
Procfile-respecting platform. The Railway project itself was left
running, not deleted, in case it's revisited.

## Milestone 25A — Review Presentation Polish

**Status: Complete** (2026-08-03)

Frontend-only visual and rendering polish, no backend changes. Two real
problems fixed, not decoration for its own sake:

**Markdown was never actually rendered.** The model's real output uses
`**bold**`, numbered/bulleted lists, and inline `` `code` `` — the UI was
showing all of it as literal asterisks and dashes, which was the specific,
concrete cause of the "looks like a raw .md file" complaint. `playground/
app.js` gained `renderMarkdownLite(rawText)`, a small, dependency-free
renderer for exactly this subset (bold, inline code, ordered/unordered
lists, paragraphs) — deliberately not a general markdown library, since
this is the only subset the model actually produces. **Security-critical
design, verified directly**: the raw text is HTML-escaped *first*
(`escapeHtml`, unchanged), and only the already-escaped output is then
wrapped in fixed, hardcoded tags (`<strong>`, `<code>`, `<ul>/<ol>/<li>`,
`<p>`) — the model's text can never inject an arbitrary tag. Verified
with a direct XSS test (`<script>alert(1)</script>` input) confirming it
renders as inert escaped text, not a live tag; a flaw in the first version
of that same test (a hand-written DOM stub that didn't replicate real
browser escaping) was caught and fixed before trusting the result. The raw/
unparsed-response fallback path is deliberately untouched — it still shows
exactly what came back, unprocessed, consistent with its own honesty
requirement.

**Visual redesign**: `playground/styles.css` moved from plain
hairline-separated sections to a light-blue-tinted, Google/Microsoft-
admin-console register — each of the five sections is now its own card
(pale blue background, soft elevation shadow, a blue left-accent border),
with the Verdict section given slightly more visual weight (thicker
accent, deeper shadow, slightly larger body text) since it's the
headline summary. Page background, form, and metadata strip all shifted
to the same cool-blue-tinted palette. Explicitly still within Milestone
23's original constraint — no gradients, glassmorphism, neon, or
animation beyond the existing loading spinner; the polish is elevation
and color-as-hierarchy, not decoration.

**Verified**: real saved API responses (a clean success, and a response
with two real attached validation findings) run through the actual
`renderResult` function via a Node harness — confirmed lists, bold, and
inline code all render as real HTML with correctly escaped content
(including literal `<`/`>` characters inside version specifiers in real
review text), the Verdict section gets its distinct class, and the
validation note still renders correctly. All 205 backend tests still
pass (frontend-only change).

## Milestone 26 — Review Context/Observations Exposure + Response Contract Softening

**Status: Complete** (2026-08-06)

Started from a real production incident, not a planned feature: the live
Render backend was returning `502 the model did not produce a usable
response` for almost all commits on `Saaransh27/60days-python`. Diagnosed
empirically — repeated identical requests produced different outcomes,
and direct reads of `app.py`/`response_validator.py`/`prompt_builder.py`
traced the rejection to Milestone 17B's Category B validation check
(`literal_claim_id_leak`/`reserved_confidence_tier_self_tagging`), firing
inconsistently because GPT-OSS-120B has no fixed seed. This is the same
terminology-leak tendency Milestone 16B's full-execution round already
measured (9/24 commits) and explicitly deferred fixing at the time.

A prompt-only fix was tried first, per the instruction to "check the
impact over 20 commits, keep it if it helps, remove it if it doesn't": a
before/after A/B test on 20 real commits showed 3 flip fail→pass and 2
flip pass→fail against the same baseline — statistically indistinguishable
from the model's own run-to-run variance, not a real improvement. Reverted
cleanly (confirmed via a zero-diff `git diff`), rather than kept on
optimism.

**The real fix has two parts, both deterministic:**

1. `response_validator.py` gained `sanitize_response(text)` — strips only
   the reserved-confidence-tier self-tagging pattern, a mechanically safe,
   narrowly-scoped artifact (not the literal-claim-id leaks, which are
   deliberately left in place for the validator to still detect and
   report — sanitization is not the same as content correctness).
2. `src/api/app.py`'s Category B hard-rejection path
   (`_PARSEABILITY_RELATED_RULES`, `_CONTRACT_VIOLATION_RULES`,
   `_has_contract_violation`) was removed entirely. `POST /review` now
   returns `502` only for a genuine `execution_boundary_failure` reported
   by the Adapter (ADR-015's own taxonomy) — never for a content/format
   finding. `ReviewResponse.validation` still reports every finding for
   transparency; it just no longer gates whether the response reaches the
   client. This reverses Milestone 17B's own design decision, on the
   evidence that "reject the whole response" was a worse trade than
   "sanitize the one safe artifact and let the reviewer see the rest."

Verified against the same 20 real commits used for the A/B test:
contract-violation rate dropped from **35% to 0%**, with the fix isolated
to these two changes and nothing else.

**Backend API contract expansion**, motivated directly by the next task
(building a data-driven frontend, not a prose-only one): `POST /review`
now additionally returns two already-computed, previously-internal
objects, verbatim.

- `review_context` — the exact Milestone 10A `ReviewContext` object
  (`commit_summary`, `commit_claims`, `file_claims`, `gaps`,
  `coverage_ledger`) that was already being built and fed to the Prompt
  Builder on every request; it simply wasn't returned to the caller
  before.
- `observations` — file classification, touched directories, change
  statistics/categories, and extraction confidence (already computed by
  `DatasetCollector._build_commit_observations`), plus one genuinely new
  field: `diff_stats`. `GitClient.get_diff_stats(repo_path, commit_hash)`
  runs `git diff --numstat` for real, objective per-file
  insertion/deletion counts. Git's own `-` marker for a binary file is
  mapped to `None`, never `0` — verified against a real binary file
  containing an actual null byte, after an initial test file using
  printable-but-fake "binary-looking" bytes was caught not triggering
  git's real binary detection at all. `DatasetCollector.
  _build_commit_diff_stats` and `orchestrator.run_pipeline_for_commit`
  wire this into `observations.diff_stats`.

New Pydantic models added to `src/api/models.py` mirror these two shapes
exactly (`ClaimScope`, `Claim`, `Gap`, `GapsBundle`, `RenamedFile`,
`CommitSummary`, `JustifyingClaim`, `CoverageLedgerEntry`, `ReviewContext`,
`ChangeStatistics`, `ChangeCategories`, `ExtractionConfidence`,
`TouchedDirectories`, `FileDiffStat`, `DiffStats`, `Observations`) — both
new top-level fields are optional on `ReviewResponse`, so no existing
consumer (including `playground/`) is affected.

**Verified**: 12 new tests (`sanitize_response` behavior, real
`git diff --numstat` text/binary cases, a hand-verified real-repo
assertion added to the existing end-to-end orchestrator test, and
`review_context`/`observations` exposure round-trips in
`tests/api/test_app.py`, including fixtures with genuinely non-trivial
shapes, not just empty/default values). The three old Category-B
contract-violation tests were rewritten to assert the new
never-reject/sanitize-instead behavior rather than deleted silently. All
217 tests pass (205 + 12 new), zero regressions.

**Not yet true, per `PROJECT.md` rule 4**: the live Render deployment
still runs the pre-Milestone-26 code — this fix has not been deployed.
The Review Engine's `findings` field is still always `[]` (unrelated,
pre-existing). No PR-level review exists yet (see Milestone 27 and
`docs/PR_REVIEW_MIGRATION.md`).

## Milestone 27 — React Frontend Rebuild ("Ink Ledger")

**Status: Complete, not deployed** (2026-08-09)

A new frontend, `frontend/` (React 19 + Vite), built entirely separately
from `playground/` — `playground/` was not touched by this milestone and
remains the live Vercel product. This was explicitly scoped as a
redesign, not a replacement: nothing about the backend or its deployment
changed.

The work went through several rounds, converging rather than following a
single upfront design:

1. A first visual pass, citing Material 3/Linear.app/Vercel/GitHub/Stripe
   Dashboard as reference points per explicit instruction, produced the
   "Ink Ledger" design system (hue-neutral ink palette, one indigo accent,
   `#5e6ad2`) via a multi-agent design workflow — three independent design
   directions, three independent judges, then synthesis.
2. A second round rebuilt the page around real backend data rather than
   prose alone, after the observation that `review_context`/`observations`
   (Milestone 26) contained far more structured signal than the model's
   five prose sections alone — per-file claims/gaps, a coverage ledger,
   real diff stats.
3. A third, explicitly prescriptive round consolidated an intermediate
   10-section layout down to exactly 7 — `ExecutiveSummary`, `CommitStats`,
   `FileOverview`, `ReviewFindings`, `OpenQuestions`, `ManualVerification`,
   `ReviewStrategy` — around one stated goal: let a senior engineer decide
   whether a commit is safe and what to inspect next in under 30 seconds.
   Repeated per-file boilerplate was replaced with aggregates throughout.

**The defining constraint of this milestone**, given verbatim after an
early draft of round 3 introduced invented risk scores/confidence
percentages/time estimates: every visible label must be traceable to a
concrete backend fact, or it should not exist. This was fully adopted,
not partially — `frontend/src/lib/reviewTiers.js` implements exactly
three file tiers and three finding tiers, each a deterministic rule over
real backend fields, with the rule itself rendered on screen next to the
labels it produces (`FILE_TIER_RULE`, `FINDING_TIER_RULE`):

- **File tiers** — `Requires Immediate Review` (the file carries a real
  risk-bearing claim — module `contract_stability`/`reach`, or one of
  three named claim ids); `Routine` (the backend's own coverage ledger
  already collapsed this file into a representative); `Standard Review`
  (everything else — changed, not collapsed, no risk-bearing claim).
- **Finding tiers** — `Critical` (names a file carrying a risk-bearing
  claim); `Medium` (names a changed file with no risk-bearing claim);
  `Low` (names no specific file) — derived by cross-referencing the
  finding's own text against `review_context`, never from the finding's
  rank position in the model's output.

`frontend/src/lib/reviewContext.js` and `claimVocabulary.js` supply every
other derived view: `filesWithContext` (per-file category/change-type/
line-stats/claims, replacing an earlier prose-mining heuristic entirely),
`gapsByReason` (aggregates repeated identical gaps — verified collapsing
12 individual gaps to 2 lines on a real `pallets/click` commit),
`reviewStrategyGroups` (reuses the backend's coverage ledger for the
routine/needs-attention split, rather than a second UI-side heuristic),
and a 34-entry claim-label / 9-entry gap-reason-label vocabulary mirrored
from `src/review/context_builder.py`'s own definitions. `textFormatting.jsx`
renders the model's markdown-lite prose as real React elements (bold,
inline code, lists) via React's own child escaping — no
`dangerouslySetInnerHTML`.

One implementation bug was caught before shipping: an early version of
`FileOverview.jsx` filtered a file's displayed claims by the *file's*
overall tier instead of each claim's own risk-bearing status
(`file.claims.filter((c) => fileTier(...) === REQUIRES_IMMEDIATE_REVIEW)`
instead of `file.claims.filter(isRiskBearingClaim)`) — fixed before
review.

Two direct user challenges during this milestone reinforced the
real-vs-fabricated-data discipline rather than weakening it: "are these
all fixed values?" and "why are you hardcoding dummy data" (about the
backend test suite, not the frontend) — answered by explaining the
plumbing-isolation rationale for existing fixed-value tests, then closing
a real gap by adding genuinely real-git-derived assertions alongside them
(the Milestone 26 test additions above), rather than just asserting the
existing tests were fine.

**Verified**: manually against the real, running local API (not mocked)
across multiple real public repositories and commits, including at least
one fetched live via the GitHub API specifically because it was "rich in
changes." All 217 backend tests unaffected — this was a frontend-only
milestone.

**Not yet true, per `PROJECT.md` rule 4**: `frontend/` is not deployed
anywhere; `frontend/.env.local` points at `http://localhost:8020`.
`frontend/README.md` was still the unmodified Vite scaffold template
until this documentation pass. This UI reviews exactly one commit per
request, same as the backend it consumes — no multi-commit or PR-level
workflow exists yet (see `docs/PR_REVIEW_MIGRATION.md`, the next body of
work).

## Milestone 28 — PR Review Migration, Milestone 1: Backend PR Review

**Status: Complete, not deployed** (2026-08-09)

First implementation milestone of the commit-reviewer → PR-reviewer
migration scoped in `docs/PR_REVIEW_MIGRATION.md` (that document's own
"Milestone 0" was documentation-only). This milestone is backend-only —
no OAuth, no repository/PR discovery, no frontend work — per explicit
scope.

**Architecture decision, made deliberately before writing code**: a PR is
reviewed as one synthetic diff — git's real three-dot (`base...head`)
semantics, i.e. the diff against the merge-base of the two refs — rather
than as several independent per-commit reviews. This is the smallest
change that lets everything from Evidence Fusion onward run completely
unmodified, since that entire chain only ever cared about "an evidence
dict shaped like the commit flow's," never about whether the evidence
came from one commit or a range.

**On whether the "optional base-ref override" was genuinely minimal**,
checked explicitly rather than assumed: of `DatasetCollector`'s 8
`_build_commit_*` builders, only 3 make a git call that derives "the old
side" from a commit's own first parent (`_build_commit_change_set`,
`_build_commit_diff_stats`, `_build_commit_semantic_analysis`) — and two
of those three already delegated to `GitClient` methods
(`get_changed_files`/`get_diff_stats`) that already accepted an explicit
`parent_hash` override; only the pass-through was missing. Each of the 3
gained one uniformly-named `parent_hash=None` parameter, defaulting to
exactly the prior behavior. The other 5 builders needed zero changes —
they either take no such ref, or already treat their `commit_hash`
argument as "as-of this point in time," which a PR's `head_sha` already
satisfies. `_build_commit_metadata` is deliberately **not** reused for
PRs at all: a PR's identity (title, body, author) is a GitHub API fact,
not a git commit fact, so a small new function (`_pr_metadata`) builds it
from the PR API response instead, converging into the same
`{author, date, message}` shape the rest of the pipeline already expects.

**New components, all additive:**

- `GitClient.get_merge_base`, `get_pr_diff` (literal `git diff
  base...head`), `fetch_ref` — three new methods; `get_commit_diff`,
  `get_changed_files`, `get_diff_stats` untouched.
- `src/github/pr_resolver.py` (new package): `resolve_pull_request(
  repository_url, pr_number)`, an unauthenticated call to GitHub's public
  REST API. Needed an explicit `certifi` CA bundle (added to
  `requirements.txt`) — this environment has no usable local CA trust
  store for a raw `urllib` HTTPS call, the same class of issue Milestone
  13 already hit and documented for the real Gemini call.
- `orchestrator.py`: `_pr_metadata`, `_build_pr_evidence`,
  `run_pipeline_for_pr(repository_url, pr_number, execute, resolve_pr)`.
  `resolve_pr` is injected exactly the way `execute` already is —
  production wiring passes the real resolver; tests pass a stub against a
  real local repo fixture. `run_pipeline_for_commit`/`_build_evidence`
  are byte-for-byte unchanged.
- `src/api/models.py`: `PRReviewRequest`, `PRReviewResponse(ReviewResponse)`
  adding only `pr_number`/`base_sha`/`head_sha` — every other field is
  the same `ReviewResponse` shape a commit review returns.
- `src/api/app.py`: `POST /review/pr`, a **separate** endpoint from
  `POST /review`. `review()`/`get_pipeline_runner()` are untouched;
  `review_pr()` duplicates the sanitize/parse/validate/response-
  construction block (~15 lines) rather than extracting a shared helper
  out of the existing endpoint, a deliberate trade favoring "don't modify
  the existing flow" over avoiding a small duplication.

**Known, deliberate limitation, documented rather than fixed**:
`_build_commit_file_history`/`_build_commit_co_change` treat their
`commit_hash` argument as "this one entry is current; everything before
it in the log is history." For a PR whose own commits touch the same
file more than once, only the head commit is excluded from "history" —
the PR's *other* commits are counted as historical churn instead of
current change, which could mildly inflate `history.rapid_iteration`/
`hot_file`-style claims. A correct fix needs those two methods to exclude
a *set* of commits, not one — judged out of scope for this milestone
rather than risking their tested single-commit behavior for a secondary
signal. Single-commit PRs (the common case) are unaffected; the real PR
tested below happened to be single-commit.

**Verified against a real, merged public PR**: `pallets/click#3704`
("Deprecate `isolated_filesystem` and document its limits," base
`333c28d7`, head `c2ed4149`, 1 commit, 10 files). Real GitHub API PR
resolution, real clone, real `fetch_ref`, real three-dot diff, real
evidence/fusion/reasoning — the final model call was stubbed only because
this environment has no `SHAKTI_API_KEY`, the same pre-existing local
limitation the commit flow has always had. The real `git diff --numstat`
totals (291 insertions / 165 deletions) matched GitHub's own reported PR
stats exactly, an independent cross-check computed by a completely
different system than this project's own diff logic.

**Verified**: 21 new tests — `GitClient` (three-dot semantics against a
fixture where the base branch advances *after* the PR forks, proving the
base's later commit is excluded; `fetch_ref` against a real second local
repo acting as a remote), `pr_resolver` (mocked HTTP layer — URL parsing,
field extraction, 404/network/malformed-response handling), orchestrator
(a real local repo with a two-commit PR touching the same file twice,
proving both three-dot exclusion and "complete PR diff, not just the
latest commit" together, plus real added/deleted/renamed-file handling),
and the API layer (PR identity fields, 404/502 mapping, confirming the
two endpoints' dependency overrides don't affect each other). All 238
tests pass (217 pre-existing + 21 new) — the existing `POST /review` test
class is completely unmodified, confirming its behavior wasn't touched.

**Not yet true, per `PROJECT.md` rule 4**: not deployed. No OAuth, no
repository/PR discovery, no frontend changes — all explicitly out of
scope for this milestone. GitHub API access is unauthenticated (60
req/hour/IP), fine for testing, not for production load. The multi-commit
historical-evidence limitation above is accepted, not fixed. Per the
user's explicit instruction, Milestone 2 (OAuth + repository/PR
discovery) has not been started.

## Milestone 29 — PR Review Migration, Milestone 2: GitHub Auth + Discovery

**Status: Complete, backend-only, not deployed** (2026-08-09)

Second implementation milestone of the commit-reviewer → PR-reviewer
migration. Adds real GitHub identity and discovery; explicitly does not
touch the frontend, and does not modify `POST /review` or `POST
/review/pr`'s review logic — both verified byte-for-byte unchanged.

**Architecture, decided before coding:**

- **Session state**: `src/api/session_store.py`, a new in-memory
  `dict[session_id → access_token]`. No database exists anywhere in this
  project, and the review pipeline is already stateless; this matches
  that, deliberately, rather than introducing the project's first
  persistence layer for Milestone 2 alone. **Named limitation, not an
  oversight**: sessions are lost on restart and don't survive multiple
  worker processes — acceptable for this milestone, a real constraint
  the moment this needs to survive a redeploy or scale past one process.
  A FastAPI dependency, `get_current_access_token`, is the one place a
  request's `session_id` cookie becomes a real token; it 401s on a
  missing or unknown session, with no fallback path.
- **GitHub integration**: two new modules, neither touching
  `src/github/pr_resolver.py` (Milestone 1, frozen) — `src/github/oauth.py`
  (`build_authorize_url`, `exchange_code_for_token`) and
  `src/github/client.py` (`get_authenticated_user`, `list_repositories`,
  `list_open_pull_requests`, `get_pull_request`), each attaching
  `Authorization: Bearer <token>` so every result genuinely reflects that
  user's real GitHub permissions — there is no separate authorization
  layer of this project's own. A repo the token can't see surfaces as a
  real GitHub `404` (GitHub's own semantics — it deliberately doesn't
  confirm a private repo's existence to someone without access), relayed
  as-is rather than re-derived.
- **Routes**: the 4 suggested (`GET /github/me`, `GET /github/repos`,
  `GET /github/repos/{owner}/{repo}/pulls`, `GET
  /github/repos/{owner}/{repo}/pulls/{number}`) plus 3 auth itself can't
  function without — `GET /github/login`, `GET /github/callback`, `POST
  /github/logout`.
- **One necessary shared-infrastructure change**: `CORSMiddleware`'s
  `allow_origins=["*"]` cannot legally combine with credentialed
  (cookie-bearing) requests — browsers reject it. Switched to an
  explicit allowlist (`FRONTEND_URL`, the deployed `playground/` Vercel
  URL, `"null"` for a `file://`-opened page) plus `allow_credentials=True`.
  `/review` and `/review/pr`'s route handlers are untouched; this is the
  one piece of shared config every route (old and new) sits behind.

**A real GitHub API quirk handled explicitly**: the OAuth token-exchange
endpoint returns HTTP 200 with `{"error": "..."}` in the body for a bad
or reused code, not a non-200 status — `exchange_code_for_token` checks
the body for an `error` key regardless of status code, not inferred from
status alone.

**Known, deliberate gap, flagged rather than silently left**:
`src/github/pr_resolver.py` and `run_pipeline_for_pr` are completely
untouched, per explicit scope. A user can now discover a *private*
repo's open PRs through the new endpoints, but `POST /review/pr` still
can't actually review one — both the unauthenticated GitHub API call
inside `resolve_pull_request` and the unauthenticated `git clone` itself
would fail for a private repository. This is real follow-up work, not
yet scheduled to a specific milestone.

**Verification, stated honestly**: this sandbox has no registered GitHub
OAuth App and no personal access token, so the full
login→callback→discovery chain could not be exercised against real
GitHub data end-to-end — the same class of limitation `SHAKTI_API_KEY`'s
absence already caused for the real LLM call in earlier milestones. What
*was* verified for real: `get_pull_request("obviously-invalid-token",
"pallets", "click", 3704)` against the actual GitHub API returned a
real, correctly-parsed `401` (`GitHubApiError(status_code=401)`) —
confirming the request construction, headers, and error-handling path
all work against the live API, not just a mock. Everything else (field
extraction, session isolation, OAuth state/error handling, 401/404
propagation) is covered by 46 new tests with the HTTP layer mocked,
consistent with this project's existing convention for external network
calls (`call_shakti`/`call_gemini`, Milestone 1's `pr_resolver` tests).

**Verified**: 46 new tests — `tests/api/test_session_store.py` (9),
`tests/github/test_oauth.py` (6), `tests/github/test_client.py` (9),
and 22 new tests across 9 classes in `tests/api/test_app.py` covering
login/callback/logout, an explicit auth-boundary class (every discovery
route returns 401 without a valid session, including a forged session
id), session isolation between two concurrent sessions, real GitHub
404-propagation, and the new CORS credentials behavior. All 284 tests
pass (238 pre-existing through Milestone 1 + 46 new), zero regressions —
`POST /review` and `POST /review/pr`'s own test classes are unmodified.

**Not yet true, per `PROJECT.md` rule 4**: not deployed. No frontend
changes — neither `playground/` nor `frontend/` can call any `/github/*`
route yet. `/github/repos` is not paginated past the first 100
repositories. The private-repo `/review/pr` gap above is accepted, not
fixed. Per the user's explicit instruction, Milestone 3 (the frontend
repository/PR navigation redesign) has not been started.

## Milestone 30 — PR Review Migration, Milestone 3A: Authenticated Private-Repo PR Review

**Status: Complete, backend-only, not deployed** (2026-08-09)

Closes the specific gap Milestone 29 named and deliberately deferred:
`POST /review/pr` was fully unauthenticated, so a user could discover a
private repo's PR through the new discovery endpoints but never actually
review it. This milestone makes authentication *additive* to
`/review/pr` — a request with no session behaves exactly as Milestone 1
left it (re-verified live against the same real PR, `pallets/click#3704`
— identical base/head SHAs, file count, and diff totals), and a request
with a valid session can now also reach a private repository.

**Architecture, decided before coding:**

- **Session reuse, not a new mechanism**: `src/api/session_store.py`
  gained `get_optional_access_token` — identical lookup to Milestone 2's
  `get_current_access_token`, except it never raises. A missing cookie
  and an unknown/expired `session_id` both resolve to `None`,
  deliberately identically: `/review/pr`'s authentication is an
  enhancement (enables a private repo), not a requirement (a public repo
  must keep working with none at all) — the exact reasoning that
  determined every other design choice in this milestone.
- **Two separate concrete needs for the token, not one**: (1) PR
  *metadata* resolution needs an authenticated GitHub API call to even
  see a private repo's PR at all — `src/github/client.py` gained
  `get_pull_request_refs(token, repository_url, pr_number)`, a drop-in
  for `src/github/pr_resolver.py`'s `resolve_pull_request` (**left
  completely untouched**) with the identical output shape. (2) the
  actual `git clone`/`fetch` need the SAME token again, separately —
  `src/git/git_client.py`'s `clone_repository`/`fetch_ref` each gained
  an optional `access_token=None` parameter for this.
- **Header-based git auth, not a token-embedded URL**: `-c
  http.extraHeader="Authorization: Bearer <token>"`, prepended before the
  `clone`/`fetch` subcommand. Chosen over `https://<token>@github.com/...`
  for two concrete reasons, not just convention: `repository_url` stays
  clean in every `CommitResolutionError` message this project already
  constructs (so a token can never leak into an API response via a
  string the code itself builds), and git's own failure text echoes the
  URL, never a header — a URL-embedded token would leak into git's own
  stderr on an auth failure in a way a header structurally cannot.
  **Residual risk, named rather than solved**: the header value is still
  a subprocess argument (visible via `ps`/`/proc/*/cmdline` for the
  life of the git process, and would appear in a raw traceback if the
  underlying `subprocess.CalledProcessError` — not this project's own
  wrapping `CommitResolutionError` — were ever logged with full args).
  Eliminating that needs `GIT_ASKPASS`-based credential injection,
  materially more machinery than this milestone's scope.
- **`run_pipeline_for_pr` gained one optional parameter**, threaded to
  exactly two call sites (`clone_repository`, `fetch_ref`) — confirmed,
  not assumed, that nothing else downstream needs it: `get_pr_diff`,
  `get_merge_base`, `get_changed_files`, symbol-content reads, and every
  history walk all operate on the already-fetched local object store,
  never touching the network again after the initial clone/fetch.
- **`get_pr_pipeline_runner` (app.py) picks the resolver at request
  time**: `resolve_pull_request` when `get_optional_access_token`
  returns `None`, an `get_pull_request_refs`-bound closure otherwise.
  `review_pr()`, `review()`, `get_pipeline_runner()`, and
  `run_pipeline_for_commit` are all byte-for-byte unchanged — verified
  by every one of their existing tests continuing to pass unmodified,
  not just by inspection.

**Verification, stated as precisely as the earlier milestones**: no real
private GitHub repository exists in this sandbox. "Authenticated private
PR review" is therefore proven at the mechanism level, not against real
private-repo data — a real local git remote (the same three-branch,
base-advances-after-fork fixture Milestone 1 built) with a spy on
`GitClient._auth_args` confirming a real token string reaches exactly
the 3 call sites that would matter for a genuine private repo (clone,
fetch-base, fetch-head) and nowhere else, and that omitting the token
reproduces Milestone 1's behavior exactly (all three calls see `None`).
Simulated git- and GitHub-API-level authentication failures (a rejected
token) were also tested, confirming both fail cleanly into
`CommitResolutionError` (mapped to `404`, same as every other PR
resolution failure) with the token itself never appearing in the
resulting exception message — checked with an explicit string-absence
assertion, not assumed safe.

**Verified**: 27 new tests — `tests/git/test_git_client.py` (`_auth_args`
construction, plus two real local clone/fetch calls proving the extra
`-c` flag doesn't corrupt a normal git invocation), `tests/api/
test_session_store.py` (`get_optional_access_token`), `tests/github/
test_client.py` (`get_pull_request_refs`, mocked HTTP, matching Milestone
1's exact output shape), `tests/pipeline/test_orchestrator.py`
(`RunPipelineForPRWithAuthTests` — the token-threading proof above, plus
both simulated auth-failure paths), `tests/api/test_app.py`
(`GetPrPipelineRunnerAuthTests` — resolver selection tested as a direct
function call; `PRReviewSessionBehaviorTests` — real cookie-parsing HTTP
tests, including the forged/expired-session-falls-back-gracefully case
and confirming `POST /review` is unaffected by a valid session cookie
riding along). All 311 tests pass (284 pre-existing + 27 new), zero
regressions.

**Not yet true, per `PROJECT.md` rule 4**: not deployed. No database,
Redis, or background workers were introduced, per explicit instruction —
sessions remain Milestone 29's in-memory store, same limitations as
before. No frontend changes — nothing can select a private repo's PR
through a UI yet; that remains Milestone 3's (the actual frontend
redesign's) work, still not started.

## Milestone 31 — PR Review Migration, Milestone 4: Product Frontend / PR Review Workspace

**Status: Complete, not deployed** (2026-08-11)

Replaces the frontend's primary flow. Before this milestone, the React
app's only workflow was "repository URL + optional commit hash" →
`POST /review`. Now it's GitHub login → accessible repositories → open
PRs → a persistent-sidebar PR review workspace with previous/next
navigation — the actual V1 product shape this migration has been
building toward since Milestone 0.

**Before coding**: the full existing frontend (all 8 components, all 5
`lib/` modules), the exact current backend routes/models, and the
relevant docs were read in full — not assumed from memory. Four
decisions were surfaced explicitly and confirmed before any code was
written: (1) extend `PullRequestDetail` with real
`additions`/`deletions`/`changed_files` rather than fabricate them or
fire an extra GitHub API call per PR-list row; (2) add
`react-router-dom` for real, shareable URLs rather than plain `useState`
view-switching; (3) add `vitest`/`@testing-library/react` — this
project's first frontend test infrastructure, since none existed; (4)
keep the old commit-URL flow's code fully intact but drop it from the
main navigation, rather than delete it.

**One small, additive backend touch — not review logic**: GitHub's
single-PR endpoint already returns `additions`/`deletions`/
`changed_files`; `src/github/client.py` simply wasn't extracting them.
Now it does (`.get()`, so absent-on-the-list-endpoint correctly yields
`None`, never a fabricated `0`). `PullRequestSummary`/`PullRequestDetail`
gained the matching optional fields. Nothing else in `src/` was
touched — Evidence Fusion, reasoning, `context_builder`,
`prompt_builder`, the Adapter, the Review Engine, and `POST /review`'s
own logic are all byte-for-byte unchanged, confirmed by every one of
their existing tests passing unmodified.

**Reuse over rewrite**: `FileOverview`, `ReviewFindings`,
`OpenQuestions`, `ManualVerification`, `ReviewStrategy`, and all of
`reviewContext.js`/`reviewTiers.js`/`claimVocabulary.js`/
`textFormatting.jsx` needed zero changes — they were already generic
over `review_context`/`observations`, never assuming "commit."
`ExecutiveSummary` and `FileOverview` each gained one small, optional,
backward-compatible prop (`showIdentity`, and `owner`/`repo`/`headSha`
respectively) rather than being forked into PR-specific copies.

**New architecture**: `App.jsx` is now a thin router root doing exactly
one thing beyond routing — the auth check (`GET /github/me`) that
decides between `LoginGate` and the authenticated shell
(`Sidebar` + routed main content). `RepoWorkspace` owns the open-PR
list fetch for one repository (once per owner/repo, not once per PR)
and a session-only review cache (a plain `Map`, reset on remount, no
persistence — this milestone's boundary explicitly excludes a database
or Redis) so sequential PR review doesn't re-run an already-completed
review. `PRDetail` fires two independent fetches — the fast single-PR
detail (real stats for the header) and the slow `/review/pr` call — so
the header never waits on the review to render.

**Data integrity — every visible field checked against a real API
response, none invented**: risk scores, confidence percentages,
severity values, estimated review time, and fabricated file/PR
statistics all remain absent from every new component, matching the
existing discipline in `reviewTiers.js` (Milestone 27) exactly.

**Known, deliberate limitation, named rather than hidden**: GitHub's PR
*list* endpoint never returns `additions`/`deletions`/`changed_files`
(only the single-PR endpoint does) — so `PRList` rows never show
change-size stats; they appear once a specific PR is opened, from the
endpoint that actually has them.

**Verified**: 41 new frontend tests (this project's first-ever) —
`EmptyState`, `RepositoryList`, `PRNavigation` (prev/next boundary
behavior including a PR absent from the list entirely), `PRHeader`
(real stats shown when present, never a fabricated `0` when absent),
`LoginGate`, `SupportingDetails` (per-section real emptiness checks,
collapsed by default), `PRList`, `PRDetail` (header not waiting on the
review; cache hit/miss; real error rendering), and `App` (the full auth
gate: loading → login gate → authenticated shell → logout). Two real
bugs were caught and fixed by the tests themselves before this milestone
was considered done: a duplicated visible heading inside each
`<details>` (fixed by adding `ProseSection`'s `showTitle` prop rather
than relying on CSS to hide the duplicate), and a mock-isolation gap in
the test file itself (`vi.clearAllMocks()` was missing, causing a
call-count assertion to see calls from earlier tests in the same file).
All 313 backend tests still pass; the frontend build and lint are both
clean.

**Verification is honestly partial, the same limitation class flagged
since Milestone 2**: no registered GitHub OAuth App or personal access
token exists in this sandbox, so the live login → repo list → PR list →
review flow could not be exercised end-to-end in a real browser against
real GitHub data. What was verified for real: the backend returns a
genuine `401` for `/github/me` when unauthenticated (confirmed via
`curl` against a locally running server, which is exactly what makes
`App` show `LoginGate`), and the dev server/build/lint are all clean.
Every authenticated state (repo list, PR list, PR review, navigation)
is verified by the 41 mocked-network tests above, not a live browser
session.

**Not yet true, per `PROJECT.md` rule 4**: not deployed. No GitHub
write actions, comments, webhooks, notifications, database, Redis,
billing, teams/roles, analytics, or CI/CD were added, per explicit
milestone boundary. The old commit-URL flow is preserved and functional
at `/legacy/commit` but is dead code from the product's perspective —
no decision has been made about deleting it outright. Per the user's
explicit instruction, no further milestone (V1 hardening or deployment)
has been started.

## Milestone 32 — V1 Hardening & Real-World Validation

**Status: Complete, not deployed** (2026-08-12). Full detail in the
dedicated `docs/MILESTONE_5_HARDENING.md` — this entry is a summary.

**Explicit objective**: not "do the tests pass" — whether the PR-review
workspace is actually useful and trustworthy against real PRs, and
whether its real security limitations need fixing now or can wait.
Before any code changed, the current implementation was inspected and a
plan was presented, per instruction.

**Real evaluation, not synthetic**: `.env` held real API keys this time
— the Shakti key was initially expired (a real `401`, diagnosed by
calling `call_shakti` directly), the user supplied a fresh one
mid-milestone, and 8 real, diverse PRs from `pallets/flask`,
`pallets/click`, and `fastapi/fastapi` (documentation-only, bug fix,
feature, multi-file refactor, test-only, dependency bump, multi-
subsystem, multi-commit) were run through the complete real pipeline —
real LLM output, critically read, not just checked for a 200.

**What that found and what was done, in order of impact:**

1. **File/finding prioritization was nearly useless**: the pre-existing
   `RISK_BEARING_MODULES` treated all of `reach` as risk-bearing;
   measured at 87% of real files tiered "Requires Immediate Review"
   across the sample, including a one-line documentation typo fix.
   Fixed frontend-only (`claimVocabulary.js`), narrowed to
   `contract_stability` plus specific claims; re-measured at 63%, with
   the typo fix now correctly clearing. The backend's `context_builder.py`
   coverage ledger has the identical issue (zero collapse entries across
   all 8 real PRs) and was deliberately left untouched — named as a
   separate finding for a future, dedicated ADR-011 review, not squeezed
   into this pass.
2. **CORS allowlisted `Origin: "null"`** (Milestone 2) — a real, concrete
   security gap (a sandboxed iframe sends the same origin value as the
   legacy `file://` case it was added for); removed.
3. **`PRHeader` had no real PR state** — defaulted to "Open" for a
   closed/merged PR; added the real field end to end.
4. **A 401 mid-session left the user stuck** — no re-check of auth
   status after mount, no way back to `LoginGate` short of a reload;
   fixed at the point the gap actually lived (`App.jsx`'s repos fetch),
   plus a real "Sign in again" action added to `EmptyState` for the
   deeper `PRList`/`PRDetail` cases.
5. **`llm_adapter.py` swallowed the real exception with zero trace** —
   this is what hid the expired-key diagnosis in the first place. Fixed
   with explicit confirmation given this file's protected history across
   every prior milestone: one `logging.exception()` call, no change to
   any return value or signature.
6. **`response_validator.py`'s bold-balance check had a real false
   positive** — `` `**kwargs` `` in real model output read as unbalanced
   bold. Fixed by excluding inline code spans before counting, the same
   discipline already applied to fenced code blocks for heading
   detection.
7. **React StrictMode double-fetches on mount** — confirmed real by code
   inspection, classified acceptable for V1 (dev-only, doesn't reproduce
   in production builds).

**Security limitations classified** (full table in the dedicated doc):
2 fixed this milestone (CORS null-origin, adapter logging); the rest
(no CSRF token, in-memory sessions, token-as-subprocess-argument,
GitHub rate limits) classified acceptable for V1 with a stated reason
each, not a default deferral. **No V1 blockers found.**

**A real strength recorded, not just defects**: the `multi_service`
PR's real review caught an actual syntax error in a new test file
purely from reading the raw diff — genuine value beyond the
deterministic claims layer, not fabricated confidence.

**Reviewed, not touched**: `pages/CommitReviewPage.jsx` (dead commit-
review code) — re-read in full, still functionally intact.

**Verified**: 313 → 316 backend tests, 41 → 58 frontend tests, all
passing; build and lint clean. No database/Redis/other new
infrastructure introduced — none of the real findings demonstrated a
need for one.

**Not yet true, per `PROJECT.md` rule 4**: not deployed. The backend
coverage-ledger risk-bearing definition (finding 1's backend half), the
CSRF-token gap, and the model's non-literal use of the 4 mandated
uncertainty terms (observed across all 8 real samples, not touched —
Prompt v1 remains frozen under its own 4-condition revision bar) all
remain open, named explicitly rather than silently dropped. No new
product features were added, per explicit instruction.

## Milestone 33 — V1 Product Validation & Release Readiness

**Status: Complete, not deployed** (2026-08-13). Full detail in the
dedicated `docs/MILESTONE_6_RELEASE_READINESS.md` — this entry is a
summary. Explicitly a release-readiness milestone, not feature
development: no architecture/reasoning-pipeline/prompt changes, no
speculative features, minimal changes overall.

**Phase A — the real 19-step user journey**, each step classified
honestly as actually verified / verified with local mocks / unable to
verify. Real, end-to-end verification achieved for the review-
generation core: a real `POST /review/pr` call against the locally
running backend (real clone, real Shakti LLM call) for
`pallets/click#2202`, its exact response captured and fed through a
real render of `PRDetail` (`PRDetail.realdata.test.jsx`, new) —
confirming the real verdict, real changed files, and no fabricated
risk/confidence language render correctly. GitHub OAuth login itself
(step 3) could not be exercised — no GitHub OAuth App is registered in
this environment, though the missing-config path was confirmed to fail
cleanly (`500` with a clear JSON error, not a crash) against the real
running server. Every other step already had local mocked-network test
coverage from Milestones 31/32, reused rather than re-verified from
scratch since the underlying behavior hadn't changed.

**Phase B — one real, demonstrated gap found and fixed**:
`frontend/` had no SPA-rewrite configuration for static hosting — a
production static host (Vercel) serves files as literally requested by
default, so a hard refresh on a nested client-side route (e.g. a PR
detail URL) would 404. Fixed with `frontend/vercel.json`'s catch-all
rewrite to `index.html`, the standard minimal fix — deploy
configuration only, no application code changed. No other real
workflow-blocking issue was found: malformed/unsupported real requests
(a nonexistent PR number, a malformed repository URL, a nonexistent
repository) against the real running backend all returned clean `404`s
with no leaked stack traces.

**Phase C — deployment readiness, documented, not executed.** The
single most significant finding of this milestone: the live deployed
Render backend returns genuine `404`s for `/github/me` and
`/github/login`, confirmed via `git log` to still be running
pre-Milestone-28 code — everything from Milestone 28 (PR review)
through Milestone 32 (hardening) had never been deployed, because it
had never been committed. A precise deployment checklist (env vars for
Render, a not-yet-created GitHub OAuth App, a not-yet-created Vercel
project for `frontend/`) is documented in
`docs/MILESTONE_6_RELEASE_READINESS.md` §7 — actual deployment could
not be performed this session (no Render/Vercel dashboard access, no
registered OAuth App).

**A critical mid-milestone git event**: one commit was made
(`864f5a7`, unrelated pre-existing Milestone 25A leftovers) before the
user explicitly stopped further commits, clarifying that all checking
should happen locally before deciding to push. Per that explicit
instruction, **no further `git add`/`commit`/`push` was performed for
the rest of this milestone** — the entire Milestone 28–32 backend/
frontend body of work remains staged-or-untracked, and nothing has been
pushed to `origin/main` or deployed. This is documented as a fact, not
worked around.

**Verified**: 316 backend tests (unchanged — no backend code modified
this milestone), 59 frontend tests (58 + 1 new real-fixture render
test); `npm run build` and `npm run lint` both clean.

**Not yet true, per `PROJECT.md` rule 4**: not deployed, and could not
be deployed this session regardless of git state (no dashboard access,
no OAuth App). Most of Milestones 28–32's code remains uncommitted, by
explicit instruction. See `docs/MILESTONE_6_RELEASE_READINESS.md` for
the complete per-step verification table and honest final V1 status.

**Update, same session**: a real GitHub OAuth App was registered and
its Client ID/Secret added to the local `.env`; a real end-to-end login
was then completed through the actual browser against the locally
running backend/frontend, confirmed via the backend's real request log
(`/github/callback`, `/github/me`, `/github/repos`, and PR listing for
a real repository all returning genuine `200`s) — closing, for the
local environment at least, the one gap Milestone 33 could not verify
(step 3 of the 19-step journey).

## Milestone 34 — Selective Repository Workspace

**Status: Complete, not deployed** (2026-08-14). A product improvement,
not a QA pass: `GET /github/repos` returns every repository a user has
real GitHub access to, with no way to narrow the sidebar to a working
subset — unusable for anyone with many accessible repositories.

New, frontend-only: `frontend/src/lib/repoSelection.js` (pure
localStorage-backed persistence plus reconciliation — a saved selection
survives a refresh, drops any repository no longer returned by
`GET /github/repos`, and never auto-selects a newly-accessible one);
`frontend/src/components/RepositorySelector.jsx` (a modal — search,
per-repo checkbox, select-all-visible, clear-all, cancel/save, nothing
persisted until Save). `Sidebar.jsx` now renders only the selected
subset, with a "Manage repositories" action always available once
there's at least one accessible repository, a first-time onboarding
prompt when no selection has ever been confirmed, and a distinct
"nothing selected" state when one has been confirmed empty.
`EmptyState.jsx` gained a small, backward-compatible `action.onClick`
button variant alongside its existing `action.href` link.

**Identifier choice, per the milestone's own instruction**: prefer
GitHub's repository id if the existing API model exposes it, else
owner/name. `RepositorySummary` (`src/api/models.py`) has no numeric id
field, so `full_name` (owner/name) is the stable identifier — no
backend change was needed or made.

**Explicitly unchanged, per instruction**: `GET /github/repos`'s
response shape and semantics; GitHub OAuth flow; session/token
handling; `/review/pr`; the review pipeline; backend reasoning; the
existing PR review UI; the existing visual design system (the new
modal reuses existing CSS tokens/button classes, no new palette). Repo
→ PR list → PR detail → prev/next navigation is unaffected — selection
only changes what the sidebar *shows*, never what a direct route can
reach.

**Verified**: 21 new frontend tests — `repoSelection.test.js` (8, pure
logic: never-selected vs. saved-empty, corrupt-storage fallback,
round-trip persistence, reconciliation keeping/dropping/never-adding),
`RepositorySelector.test.jsx` (7: initial checked state, select,
deselect, select-all-visible respecting the filter, clear-all, search
filtering, cancel discarding changes), and 6 new `App.test.jsx`
integration cases (onboarding state, selected-only rendering,
reconciliation removing an inaccessible repo and re-persisting,
opening the selector and having the sidebar update after Save,
reopening the selector once a selection exists, and a selected
repository correctly navigating to its own PR list). One pre-existing
`App.test.jsx` case was updated (not left failing) since it asserted
the exact superseded "all repositories shown by default" behavior. 316
backend tests unchanged (no backend code touched); 80 frontend tests
total, all passing; build and lint clean.

**Not yet true, per `PROJECT.md` rule 4**: not committed, not deployed
— this milestone's own scope was implementation and local verification
only.

## Milestone 35 — V1 Functional QA (real, credentialed, browser-driven)

**Status: Complete, verification-only, no code changed** (2026-08-14).
The first pass through the full PR-review workflow with a real,
registered GitHub OAuth App and a real browser session — every prior
milestone's "verification is honestly partial" caveat about live
OAuth login is now closed for the local environment.

All 12 requested flows (login/logout, repository discovery, repository
selection, open PR listing, PR selection, review generation, review
rendering, file/finding navigation, prev/next navigation, refresh,
expired/invalid session, empty/error/loading states) were verified for
real — see `docs/CHANGELOG.md` for the exact evidence per flow,
including 5 real, differently-typed PRs run through `POST /review/pr`
(refactor, feature, dependency bump, translation, bugfix — all `200`,
`adapter_state: success`) and a real logout → re-login cycle confirmed
via the backend's own request log.

**No functional bug required a fix.** One real, reproducible issue was
found and deliberately left unfixed, named explicitly rather than
dropped: a literal internal claim-id leak in real model output for
`fastapi/fastapi#16171` (`shape.narrow_change`,
`shape.touches_documentation`), confirmed via a real render check to
reach the actual DOM since the frontend never reads the backend's own
`validation` field. This is the same stochastic Prompt v1 behavior
Milestone 16B already measured and declined to patch — fixing it safely
would require either a prompt change (explicitly out of this
milestone's scope) or content-aware sentence repair (larger and riskier
than "the smallest possible thing"). Zero errors across 165 real
backend requests during the session.

**Not yet true, per `PROJECT.md` rule 4**: not committed, not deployed.
The claim-id-leak finding remains open, same status it's had since
Milestone 16B.

## Milestone 36 — Milestone 7: Review Intelligence

**Status: Complete** (2026-08-15). A refinement milestone, not feature
development: no architecture, reasoning pipeline, or existing working
component was rewritten. Full detail:
`docs/MILESTONE_7_REVIEW_INTELLIGENCE.md`.

New `frontend/src/lib/reviewIntelligence.js` turns the model's existing
prose plus the existing deterministic `review_context`/`observations`
into a verdict (`SAFE TO REVIEW`/`REVIEWER ATTENTION`/`HIGH RISK`,
deliberately never "SAFE TO MERGE"), per-finding severity/confidence/
category/evidence, intent-vs-implementation consistency, evidence-based
blind spots, and honest test-coverage signal. Confidence classification's
primary signal is Prompt v1's own frozen four-term uncertainty vocabulary
(Confirmed/Likely/Worth checking/Unknown, present in `SYSTEM_PROMPT`
since Milestone 10B but never previously surfaced in the UI), with a
disclosed hedge-language fallback for its already-documented non-literal
use — discovered necessary only after confirming, against two real
captured API responses, that neither evaluation PR's files are Python,
so the deterministic reasoning layer contributes zero claims to either
(ADR-005's Python-only semantic analysis).

One additive backend field, `PullRequestSummary.head_sha` (present on
both GitHub's list and single-PR endpoints, previously unextracted),
enables real "PR changed since last review" detection. New components:
`ReviewVerdict`, `IntentVsImplementation`, `BlindSpots`, `TestSignal`,
`StaleReviewBanner`. Restructured: `ReviewFindings` (grouped by
confidence, not the old file-risk tier), `FileOverview` (relabeled
columns only), `PRList` (real per-row risk status, `Not reviewed` never
fabricated for a PR with no cached review), `PRDetail` (new information
architecture in the specified order, a real client-stamped review
timestamp, "Review again" on a real `head_sha` mismatch).

**Verified against two real, deliberately-paired PRs** (identical
claimed change/title/file set — one correct, ground truth 9/9 tests
pass; one with two real, verified defects: a typo that fails a real
test, plus an untested logic regression): they render meaningfully
differently. PR #2 → `SAFE TO REVIEW`, 0 confirmed findings, no
fabricated blind spot, Intent vs Implementation PASS. PR #3 →
`HIGH RISK`, 3 confirmed findings (the rule-description update
correctly kept informational, not presented as a defect), the
tier-ordering bug surfaced as a behavioral blind spot, Intent vs
Implementation MISMATCH quoting the real conflicting identifiers
verbatim.

104 frontend tests (was 80; +24 — 17 in a new `reviewIntelligence.test.js`
run against the exact real captured text from both PRs, 3 rendering both
real captured full API responses through `PRDetail` end to end, plus
PRList/PRDetail regression coverage), 318 backend tests (was 317; +1);
build and lint clean.

**Explicitly out of scope, verified not needed**: repository selection
(Part 16) already satisfies "which repo am I reviewing" via `PRHeader`;
no change made. No comments system, chat agent, AI fix generation,
dashboards, or deployment work added.

**Known limitation, stated plainly**: severity/confidence/category
classification is a disclosed heuristic over the model's real text, not
a certainty — validated against exactly two deliberately-paired real
PRs, not yet evaluated against a larger, more diverse sample the way
Milestone 32's hardening pass was.

## Milestone 38 — Milestone 7 precision fix pass

**Status: Complete** (2026-08-15, same day as Milestone 36). Triggered
by a direct challenge to re-verify rather than trust the first pass's own
claims — re-reading actual rendered output against real data found 7 of
the 25 parts were shallower than reported. Full itemized detail:
`docs/MILESTONE_7_REVIEW_INTELLIGENCE.md`'s "Precision re-review" section.

Genuinely fixed, each re-verified against the real captured PR #2/#3
data: Evidence made a real, separately-labeled per-finding field (was
folded into prose); a real bug in the test-coverage signal fixed (the
plain "tests changed?" fact was silently dropped whenever any other line
existed — exactly the case for a PR with a real test mismatch); a real
bug in Intent vs Implementation fixed (both conflicting identifiers from
a mismatch finding landed under "Implementation," "Test" always empty —
now correctly split via real text-proximity extraction); the Behavioral
Change Before/After/Impact/Evidence/Tests card actually built for the
first time (previously only a boolean flag existed, despite the spec
calling this "a core differentiator"); the information architecture
actually cleaned up (`ExecutiveSummary` removed from `PRDetail` — its
content was fully duplicated by the new verdict banner, the fixed File
Overview, and the existing Supporting Details accordion); File Overview's
Risk column properly fixed rather than cosmetically relabeled (values
were still the old claims-only tier system, silent for both real
evaluation PRs since neither has deterministic claims — now
cross-referenced against `what_changed_and_why`'s real per-file
breakdown, verified to correctly show `reviewTiers.js` at High/Critical
risk).

One item confirmed as a deliberate non-implementation, stated more
plainly than before: Part 15 (reducing generic AI hedge language)
requires a `SYSTEM_PROMPT` change and was not attempted, consistent with
this milestone's own scope constraints.

125 frontend tests (was 104; +21 — new dedicated test files for
`BlindSpots`, `TestSignal`, `ReviewFindings`, and `FileOverview` that
didn't exist before this pass, plus 12 new cases in
`reviewIntelligence.test.js`), 318 backend tests (unchanged, no backend
code touched in this fix pass); build and lint clean.

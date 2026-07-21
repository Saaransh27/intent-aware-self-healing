# Changelog

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

# DatasetCollector

`src/collector/dataset_collector.py`

## Purpose

Implements Milestone 2, the first step of Milestone 3, and (in progress) Milestones 4A,
4B, and 5A: produce a configurable number of benchmark samples plus repository-level
metadata, from a given GitHub repository, on disk, in the layout the benchmark expects.

## Responsibilities

- Clone the target repository into a temporary directory (cleaned up automatically) —
  once per `collect()` call, regardless of how many commits are requested.
- Fetch repository-level metadata (default branch, commit count, first/last commit date,
  contributors, primary/detected languages, package manager, directory layout,
  repository signals) via `GitClient`, `language_detector`, `build_system_detector`,
  `layout_detector`, and `signal_detector`, and write it once per `collect()` call.
- Ask `GitClient` for up to `commit_count` non-merge commits — holds no opinion on what
  makes a commit a merge commit or what order commit history comes in (see ADR-002).
- For each commit returned, fetch its raw metadata and diff via `GitClient` and write them
  under `commits/<commit_hash>/artifacts/{metadata.json, diff.patch}` (see ADR-003 — this
  moved out of `commits/<commit_hash>/` directly to make room for a structured
  `commit.json` alongside it).
- **In progress (Milestone 4A):** build the sections of a structured `commit.json` —
  `identity` (hash/parent_hashes/repository), `metadata` (author/date/message, reshaped
  from `GitClient.get_commit_metadata`), `change_set` (changed/added/deleted/renamed/
  modified files, via `GitClient.get_changed_files`), and `artifacts` (relative paths to
  the two files above). **Not yet true per PROJECT.md rule 4:** these four builder
  methods exist and are verified individually, but nothing assembles them into an actual
  `commit.json` file yet — the fifth section, `collection`, hasn't been specified, and
  `collect()` doesn't call any of the four builders today.
- **In progress (Milestone 4B):** deterministic Change Understanding, a 6th `commit.json`
  section (`observations`), built only from git artifacts already collected — no AI, no
  subjective heuristics, no language-specific parsing. Contains: `touched_directories`
  (cross-references `change_set` against `layout_detector`'s existing categories);
  `file_classification` (every changed file classified via the new `file_classifier`
  module — Source/Test/Documentation/Configuration/Dependency/CI-CD/Infrastructure/
  Binary/Unknown); `change_statistics` (files added/deleted/modified/renamed counts —
  lines added/deleted deliberately deferred until a downstream consumer needs them);
  `change_categories` (booleans: touches_tests/documentation/dependencies/build_files/
  ci/config); `extraction_confidence` (unknown file count, the specific unrecognized
  extensions, skipped binary file count — surfaces how complete these observations are).
- **In progress (Milestone 5A — Context):** four independent "evidence extractors,"
  scoped down from a broader research phase (see `docs/context_design.md`). All four
  built:
  - `_build_commit_file_history` — per changed file, its own historical commit
    count/first-touched date/previous-touched date/whether this is its first-ever
    appearance, via the new `GitClient.get_file_history`.
  - `_build_commit_co_change` — per changed file, its top historical co-change partners
    (files that empirically changed alongside it before), via the new
    `GitClient.get_co_change_history` (raw git mechanics — bounded history walk) plus
    `co_change_detector.rank_co_changed_files` (pure counting/ranking, no git).
  - `_build_commit_local_module_context(repo_path, commit_hash, change_set)` — per
    changed file, the other tracked files sharing its immediate directory, via the new
    `module_context_detector.get_local_module_files` (pure path logic, no git at all —
    the cheapest of the four, zero new git calls, reuses `GitClient.get_tracked_files`).
    Takes `commit_hash` (see ADR-004): `get_tracked_files` must be scoped to the target
    commit's tree, not the current checkout, or a directory that existed at that commit
    but has since been removed silently returns nothing.
  - `_build_commit_repository_signals` — reuses `signal_detector.detect_repository_signals`
    unmodified, scoped to the commit's changed files instead of the whole repo's tracked
    files. No new code needed in `signal_detector.py` at all — it was already generic
    over its input. Distinct from `observations.change_categories` (Milestone 4B): that's
    `file_classifier` categorizing *any* file anywhere, this is specifically "did the
    commit touch one of the repo's own well-known root-level marker files."

  All four orchestration methods contain no extraction logic themselves, only a loop
  (or, for repository signals, a direct pass-through) delegating to `GitClient`/`src/utils`
  — per the user's explicit architecture rule for these four extractors (independent,
  orchestrated not embedded, swappable without affecting the others).
- **In progress (Milestone 6 — Symbol-Level Semantic Evidence, ADR-005):**
  `_build_commit_semantic_analysis(repo_path, commit_hash, change_set)` — the fifth
  evidence-extractor orchestration method, destined for a new `commit.json` section,
  `semantic_analysis`, alongside `context`. Filters `change_set`'s added/deleted/
  modified/renamed files to Python only (`Path(file_path).suffix.lower() == ".py"`),
  resolves old/new source per file via `GitClient.get_file_content_at_commit` (parent
  hash for "old," `commit_hash` for "new"; only whichever side actually exists for
  added/deleted files), and delegates all AST work to
  `src.semantic.python.symbol_extractor.extract_symbol_semantics` — this method
  contains no AST logic itself, same discipline as the four Milestone 5A extractors.
  Renames are the one case this method must resolve itself, deliberately: the pure
  extractor has no access to git identity, so after calling it with `old_path`'s source
  (at the parent commit) and the new path's source (at `commit_hash`), this method
  overwrites the result's `change_type` to `"renamed"` and sets `old_path` — the only
  place in the whole call chain that knows about the rename.

## Public API

- `DatasetCollector(repository_url, output_directory, commit_count)`
- `collect() -> list[str]` — runs the flow above, returns the collected commit hashes
  (newest-first). If the repository has fewer than `commit_count` non-merge commits,
  returns however many exist rather than erroring; raises `ValueError` only if there are
  none at all.

## Internal Workflow

`collect()` opens a `tempfile.TemporaryDirectory`, clones into it via `GitClient` once,
fetches and saves repository-level metadata, resolves up to `commit_count` non-merge
commit hashes, then loops over them fetching metadata/diff and writing both files into
each commit's `artifacts/` subfolder — all before the temporary clone is deleted on
context exit. Private helpers (`_repository_name`, `_fetch_repository_metadata`,
`_save_repository_metadata`, `_commit_directory`, `_artifacts_directory`,
`_save_metadata`, `_save_diff`) handle naming and I/O; none of them know anything about
git themselves — they only call `GitClient` and persist what it returns.

Separately, ten more private methods build the pieces of a future `commit.json` but
aren't called from `collect()` yet: `_build_commit_identity`, `_build_commit_metadata`,
`_build_commit_change_set`, `_build_commit_observations`, `_build_commit_file_history`,
`_build_commit_co_change`, `_build_commit_local_module_context`,
`_build_commit_repository_signals`, `_build_commit_semantic_analysis`,
`_build_commit_artifacts`. Each has been verified
standalone against real repos (including a synthetic repo built specifically to
exercise the rename branch of `_build_commit_change_set`, since no real commit tested so
far happened to contain one; multiple real commits from `tcx_nogrunt-1`'s actual history
to exercise `_build_commit_observations`'s file classification against real Dependency/
CI/Infrastructure/Binary/Unknown files — including finding and fixing a real gap,
`.gitignore` classifying as `Unknown`, before it shipped; a real first-appearance file
found in `fastapi/fastapi`'s live history to confirm `_build_commit_file_history`'s
`is_first_appearance`/`previous_commit_date: null` behavior; a real commit touching
`fastapi/routing.py` to confirm `_build_commit_co_change` surfaces genuinely plausible
FastAPI internals as top co-change partners, not noise — in under a second; the same
commit to confirm `_build_commit_local_module_context` correctly scopes siblings to a
file's own immediate directory, not top-level like `layout_detector` —
`fastapi/routing.py`'s siblings came only from `fastapi/`, not `fastapi/dependencies/`
or other subdirectories; and a scan of real commits confirming `_build_commit_repository_signals`
correctly fires `documentation`/`build`/`ci` for `README.md`/`pyproject.toml`/
`.github/workflows/*.yml` respectively, including one release-prep commit that fired
both `build` and `ci` at once). `_build_commit_observations`, `_build_commit_file_history`,
`_build_commit_co_change`, `_build_commit_local_module_context`, and
`_build_commit_repository_signals` all take the already-built `change_set` dict as
input rather than re-deriving it — pure re-slicing of data already fetched.

**Real bug found and fixed via end-to-end validation against a fresh repo
(`pallets/flask`, not previously tested):** `_build_commit_local_module_context`
originally called `get_tracked_files(repo_path)` with no `commit_hash`, which lists the
*current* checkout, not the target commit's tree. Flask's `requirements/` directory had
12 files as of the commit under test but has since been deleted entirely from current
HEAD — the bug silently returned 0 siblings where the correct answer was 10. Fixed by
threading `commit_hash` through to `get_tracked_files` (see ADR-004). This is exactly why
periodically validating against a repository other than the ones already exercised
repeatedly matters — this bug was invisible against `fastapi`/`tcx_nogrunt-1` because
neither had a directory that later disappeared from HEAD.

**`_build_commit_semantic_analysis` verified against a real commit in `pallets/flask`**
(`06ea505c`, "separate copy per call" — chosen for a real multi-file, mixed-language
mix: `pyproject.toml`/`uv.lock` alongside two `.py` files). Confirmed directly, not
assumed: the two non-Python files were correctly excluded from the section entirely;
`src/flask/ctx.py` (logic-only edit, no signature/decorator/docstring change) correctly
produced zero symbol entries — an honest demonstration of this layer's real limit, not
a bug, the same "can't see inside a function body" ceiling named in ADR-005;
`tests/test_reqctx.py` (a real test-file rewrite) correctly produced both `removed` and
`added` symbol entries, including a genuine four-level-deep nested function
(`TestGreenletContextCopying.test_greenlet_context_copying.index.g`) with the correct
dotted qualified name and correct decorator/signature facts.

**Non-trivial rename validated against real data (`tcx_nogrunt-1`, commit `d99f6cb`,
Stage 6):** `impact_lens/step_visualizer/backend/main.py` → `.../router.py`, git
similarity R084 (84% match — real content change, not a pure move). A FastAPI `app`
being converted into an `APIRouter`. All 15 functions correctly matched across the
rename as `change_type: "modified"` with `signature_changed: false` and
`decorators_changed: true` (e.g. `get_page`'s decorator changed from
`app.get('/api/pages/{filename:path}')` to `router.get(...)`, its signature
`filename: str` untouched) — direct evidence the content-diff-across-paths rename
design is correct: treating this as delete-then-create (the alternative ADR-005
rejected) would have wrongly reported 15 removed + 15 added functions instead of 15
matched modifications. The same commit's ~30 other renamed files (mostly identical-
content `R100` moves, one binary, one markdown file) confirmed non-Python renames are
correctly excluded and pure-content renames correctly produce empty diffs. This also
exercised `_build_commit_change_set`'s rename branch against real data for the first
time (previously only synthetic-repo-tested, per Milestone 4A).

Searched `pallets/flask`, `fastapi/fastapi`, and `tcx_nogrunt-1`'s full/sampled history
for a naturally-occurring unparseable Python snapshot (every `.py` blob at every
non-merge commit in `tcx_nogrunt-1`, 394 snapshots; a sample of `flask`'s oldest
commits; a search across all three for committed merge-conflict markers). None found —
`_build_commit_semantic_analysis`'s degradation path is verified via hand-constructed
cases only (see `docs/modules/symbol_extractor.md`).

## Dependencies

`GitClient` (`src/git/git_client.py`), `detect_languages` (`src/utils/language_detector.py`),
`detect_build_system` (`src/utils/build_system_detector.py`), `detect_layout`
(`src/utils/layout_detector.py`), `detect_repository_signals`
(`src/utils/signal_detector.py`), `classify_file`/`is_build_file`
(`src/utils/file_classifier.py`), `GitClient.get_file_history`/`get_co_change_history`,
`rank_co_changed_files` (`src/utils/co_change_detector.py`), `get_local_module_files`
(`src/utils/module_context_detector.py`), `extract_symbol_semantics`
(`src/semantic/python/symbol_extractor.py`). Python stdlib: `json`, `tempfile`, `pathlib`.

## Future Improvements

- No handling yet for clone failures beyond letting `subprocess.CalledProcessError`
  propagate.
- No commit-quality filtering yet (bot authors, vague messages, diff size) — every
  non-merge commit qualifies today. Deliberately deferred; see the "what makes a commit
  valuable" discussion, not yet turned into a milestone.
- `GitClient` is still constructed internally rather than injected — considered and
  deliberately deferred (no second implementation exists yet to justify it).
- `commit.json` assembly is incomplete: `commit.json` now has 6 planned sections
  (`identity`, `metadata`, `change_set`, `observations`, `artifacts`, `collection`);
  `collection` hasn't been specified, so `collect()` doesn't yet write a `commit.json` at
  all. Once it does, `artifacts/metadata.json`'s raw fields (`hash`, `parents`,
  `author_name`, etc.) will overlap with `commit.json`'s `identity`/`metadata` sections —
  worth deciding then whether to keep both or trim the duplication.
- Line-level diff stats (lines added/removed) deliberately not built — deferred until a
  downstream consumer actually needs them, per the user's explicit instruction.
- `file_classifier`'s known limitations (no fuzzy name matching, top-level-directory-only
  test/doc detection) are documented in `docs/modules/file_classifier.md`, not repeated
  here.
- `_build_commit_co_change`'s history bound (`max_history=50`) and top-N cutoff (10) are
  both unvalidated defaults — see `docs/modules/co_change_detector.md`'s Future
  Improvements, not repeated here.
- `_build_commit_local_module_context` now caps at 20 siblings (`max_results` in
  `module_context_detector`) and `_fetch_repository_metadata`'s `contributors` now caps
  at 20 (`GitClient.get_contributors(repo_path, max_count=20)`) — both added 2026-07-15
  after an efficiency review found them dominating file size (932 contributors for
  `fastapi/fastapi`; `local_module_context` alone was 71.9% of a full `commit.json`
  preview). Both are stopgap caps (first-N, not most-relevant-N) — flagged as needing a
  proper design later, not treated as solved. See `docs/modules/module_context_detector.md`
  and `docs/modules/git_client.md` Future Improvements.

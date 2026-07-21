# Architecture

## Current flow (Milestone 2 + Milestone 3 step 1 + Milestones 4A/4B/5A/6 in progress)

```
main.py <repository_url> <commit_count>
  -> DatasetCollector.collect()
       -> GitClient.clone_repository()             (once, into a temp dir)
       -> GitClient.get_default_branch/get_commit_count/
          get_first_commit_date/get_last_commit_date/get_contributors/get_tracked_files()
       -> language_detector.detect_languages()      (classifies tracked file paths)
       -> build_system_detector.detect_build_system()  (lock files / pyproject.toml / configs)
       -> layout_detector.detect_layout()            (classifies top-level directories)
       -> signal_detector.detect_repository_signals()  (doc/build/container/CI marker files)
       -> writes benchmark/<repo>/repository.json
       -> GitClient.get_non_merge_commit_hashes()   (up to commit_count, newest-first)
       -> for each commit hash:
            -> GitClient.get_commit_metadata()
            -> GitClient.get_commit_diff()
            -> writes benchmark/<repo>/commits/<hash>/artifacts/{metadata.json, diff.patch}
```

Not shown above (not wired into `collect()` yet): nine private builder methods —
`_build_commit_identity`, `_build_commit_metadata`, `_build_commit_change_set`,
`_build_commit_observations`, `_build_commit_file_history`, `_build_commit_co_change`,
`_build_commit_local_module_context`, `_build_commit_repository_signals`,
`_build_commit_artifacts` — each verified standalone, in preparation for a structured
`commit.json` once its sixth section (`collection`) is specified. See
`docs/modules/dataset_collector.md` and `MILESTONES.md` (Milestones 4A/4B/5A).

## Layering

Three layers, one strict rule between them:

- **`GitClient`** (`src/git/`) — the only place that knows how git works. Owns command
  construction, output parsing, and git-domain semantics (e.g. "a merge commit has more
  than one parent"). Nothing above it should ever reason about git internals directly.
- **`src/utils/`** — small, self-contained, git-agnostic helpers. `language_detector.py`
  classifies file paths by extension; `build_system_detector.py` classifies package
  manager from marker files (reading `pyproject.toml`'s content directly off the already
  checked-out clone when needed); `layout_detector.py` classifies top-level directories;
  `signal_detector.py` flags well-known files/dirs that could influence future patch
  reasoning (docs, build config, containerization, CI) — generic enough to reuse
  unmodified for both repo-wide and single-commit scoping; `file_classifier.py`
  classifies a single changed file by path/extension into 9 categories (Source/Test/
  Documentation/Configuration/Dependency/CI-CD/Infrastructure/Binary/Unknown);
  `co_change_detector.py` ranks a file's historical co-change partners from raw
  historical file-lists (pure counting, no git access itself — the history walk that
  produces its input lives in `GitClient`); `module_context_detector.py` lists a file's
  siblings in its own immediate directory. None of them know anything about git or the
  benchmark format — they take paths/strings/lists in, return a dict or list out.
  `file_classifier.py` imports `language_detector.EXTENSION_LANGUAGES` to avoid
  duplicating the extension list — the first (and so far only) cross-import between two
  `src/utils` modules; still no dependency on git or `DatasetCollector`.
- **`src/semantic/`** — a new layer added in Milestone 6 (ADR-005), sibling to
  `src/utils/` and `src/git/`. Deliberately kept separate from `src/utils/`:
  everything under `utils/` is structural/historical and language-agnostic, while this
  layer extracts symbol-level facts directly from source code and is necessarily
  language-coupled. Each language gets its own subpackage —
  `src/semantic/python/symbol_extractor.py` is the first and, so far, only one. Its
  public function, `extract_symbol_semantics`, is called from
  `DatasetCollector._build_commit_semantic_analysis` — all 6 ADR-005 stages complete,
  verified against real commits in `pallets/flask` and `tcx_nogrunt-1` (including a
  non-trivial, content-changing rename), but not yet wired into `collect()`, same
  status as every other evidence-extractor orchestration method. See
  `docs/modules/symbol_extractor.md` and `MILESTONES.md` (Milestone 6).
- **`DatasetCollector`** (`src/collector/`) — orchestration and I/O only. It asks
  `GitClient`/`src/utils` for things ("give me the tracked files," "classify these paths")
  and treats the answers as opaque values to persist. It owns the benchmark output layout
  (`benchmark/<repo>/commits/<hash>/...`) and repo-name parsing, since that's
  benchmark-format knowledge, not git knowledge.

This split was deliberate, not accidental — see ADR-002 for the specific refactor that
enforced it (moving merge-commit detection out of `DatasetCollector` and into
`GitClient`).

## Dependency direction

`main.py` → `DatasetCollector` → `GitClient` → `git` (subprocess). Strictly one
direction; `GitClient` has zero knowledge of `DatasetCollector` or the benchmark output
format.

## Not yet built

Everything past Milestone 1: no AI, no embeddings, no context graphs, no evaluation
pipeline. See `MILESTONES.md` and `PROJECT.md` for what's intentionally deferred.

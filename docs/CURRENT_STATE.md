# Current State

_Last synced: 2026-07-15._

## What works

Milestones 1-2 and step 1 of Milestone 3 are implemented and verified end-to-end. Running
`python3 main.py <repository_url> <commit_count>`:

1. Clones the repository once, into a temporary directory.
2. Fetches and writes `benchmark/<repo>/repository.json` — default branch, commit count,
   first/last commit date, contributors, primary/detected languages, package manager
   (`build_system` is a `null` placeholder, no detection rule defined yet), directory
   layout (source/tests/documentation/examples/scripts), and repository signals
   (documentation/build/containerization/ci marker files).
3. Resolves up to `commit_count` non-merge commits (fewer if the repo doesn't have that
   many; errors only if there are none at all).
4. For each, writes `benchmark/<repo>/commits/<commit_hash>/artifacts/metadata.json` and
   `artifacts/diff.patch` (relocated from directly under `commits/<commit_hash>/` — see
   ADR-003 — to make room for a structured `commit.json` at that level instead).

Verified live: `fastapi/fastapi` with `commit_count=3`; a throwaway repo requesting more
commits than it had (correctly returned all available instead of erroring); and
`Nogrunt-Collaborations-Private-limited/tcx_nogrunt-1` (real private-org repo, produced
`repository.json` with 352 commits / 12 contributors / `package_manager: "Pip"`, plus
commit samples). Poetry/Hatch/PDM/Java/Node detection branches unit-tested directly.

## In progress — Milestones 4A/4B/5A (structured `commit.json`)

Five of six planned `commit.json` sections have builder methods on `DatasetCollector`,
each verified standalone against real repos: `_build_commit_identity`,
`_build_commit_metadata`, `_build_commit_change_set`, `_build_commit_observations`
(Milestone 4B — file classification, change statistics/categories, extraction
confidence — see `docs/modules/file_classifier.md`), `_build_commit_artifacts` — see
`docs/modules/dataset_collector.md` for exact shapes.

Additionally, all four Milestone 5A "Context" evidence extractors are built and
verified: `_build_commit_file_history`, `_build_commit_co_change`,
`_build_commit_local_module_context`, `_build_commit_repository_signals` — see
`docs/context_design.md` for the research behind them and `docs/MILESTONES.md` for exact
verification details. Where exactly these four attach to `commit.json`'s schema is still
an open question (proposed: a 7th section, `context`), not yet decided.

Validated end-to-end against `pallets/flask` (a repo not previously tested), which
surfaced and led to fixing a real bug: `GitClient.get_tracked_files` now accepts an
optional `commit_hash` to scope its listing to that commit's tree rather than always the
current checkout (ADR-004) — the previous behavior silently returned wrong results for
`_build_commit_local_module_context` whenever a directory existed at commit time but had
since been removed from HEAD.

**None of the above is wired into `collect()` yet** — no `commit.json` is written today.
The sixth section, `collection`, hasn't been specified either. Per `PROJECT.md` rule 4,
do not treat any of this as complete until it is.

## What exists

- `src/git/git_client.py` — `GitClient`, full git-plumbing layer. See
  `docs/modules/git_client.md`.
- `src/collector/dataset_collector.py` — `DatasetCollector`, takes
  `(repository_url, output_directory, commit_count)`. See `docs/modules/dataset_collector.md`.
- `main.py` — CLI entrypoint: `python3 main.py <repository_url> <commit_count>`. Output
  directory is still fixed to `./benchmark` (not a CLI arg).
- `src/git/exceptions.py` — present, empty. No custom exception types defined yet.
- `src/utils/language_detector.py` — `detect_languages(file_paths)`, extension-based
  language classification. See `docs/modules/language_detector.md`.
- `src/utils/build_system_detector.py` — `detect_build_system(repo_path, file_paths)`,
  package-manager detection. See `docs/modules/build_system_detector.md`.
- `src/utils/layout_detector.py` — `detect_layout(file_paths)`, top-level directory
  classification. See `docs/modules/layout_detector.md`.
- `src/utils/signal_detector.py` — `detect_repository_signals(file_paths)`, marker-file
  detection (documentation/build/containerization/ci). See `docs/modules/signal_detector.md`.
- `src/utils/file_classifier.py` — `classify_file(file_path)`/`is_build_file(file_path)`,
  per-file classification into 9 categories. See `docs/modules/file_classifier.md`.
- `src/utils/co_change_detector.py` — `rank_co_changed_files(...)`, pure ranking of
  historical co-change partners (no git access itself). See
  `docs/modules/co_change_detector.md`.
- `src/utils/module_context_detector.py` — `get_local_module_files(...)`, a file's
  siblings in its own immediate directory. See `docs/modules/module_context_detector.md`.
- `requirements.txt` — present, empty. No third-party dependencies; everything used so
  far is Python stdlib plus the `git` binary.

## What does not exist yet

No AI, no embeddings, no context graphs, no evaluation — all explicitly out of scope per
`PROJECT.md`. No tests yet. No commit-quality filtering (bot authors, vague messages, diff
size) — every non-merge commit currently qualifies. `GitClient` is still constructed
internally by `DatasetCollector`, not injected. No GitHub API metadata (stars,
description, license) — only git-derived fields exist so far. `build_system` field exists
in the schema but has no detection logic — always `null`.

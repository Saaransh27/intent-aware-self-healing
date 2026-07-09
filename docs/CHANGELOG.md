# Changelog

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

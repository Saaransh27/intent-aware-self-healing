# GitClient

`src/git/git_client.py`

## Purpose

Thin wrapper around the native `git` CLI. Gives the rest of the codebase a way to read
data out of a local git clone without any caller shelling out to `git` itself.

## Responsibilities

- Run arbitrary git commands against a given repository path.
- Clone a repository.
- List and inspect commit history: hashes, metadata, parent hashes, non-merge commits,
  diffs, changed files.
- Read a file's content as of a specific commit, without touching the working tree.
- Check out a specific commit (mutates the working tree — used only when a caller
  genuinely needs files on disk, e.g. to run something in that tree).
- Report repository-level metadata: default branch, total commit count, first/last
  commit date, contributors.

## Public API

- `run_git_command(args, cwd=None) -> str` — runs `git <args>` in `cwd`, returns raw
  stdout, raises `subprocess.CalledProcessError` on a non-zero exit.
- `clone_repository(repo_url, destination, shallow=False) -> None`
- `get_commit_hashes(repo_path, max_count=None) -> list[str]` — newest-first.
- `get_non_merge_commit_hashes(repo_path, max_count=None) -> list[str]` — newest-first;
  returns fewer than `max_count` if the repository doesn't have that many, empty list if
  there are none at all. One `git log --no-merges` call regardless of `max_count`.
- `get_commit_metadata(repo_path, commit_hash) -> dict` — keys: `hash`, `author_name`,
  `author_email`, `date`, `parents`, `subject`, `body`.
- `get_parent_hashes(repo_path, commit_hash) -> list[str]` — empty for a root commit,
  length 2+ for a merge commit.
- `get_commit_diff(repo_path, commit_hash) -> str` — diff against the first parent, or
  against git's empty-tree hash for a root commit.
- `get_changed_files(repo_path, commit_hash, parent_hash=None) -> list[dict]`
- `get_file_content_at_commit(repo_path, commit_hash, file_path) -> str`
- `checkout_commit(repo_path, commit_hash) -> None`
- `get_default_branch(repo_path) -> str`
- `get_commit_count(repo_path) -> int`
- `get_first_commit_date(repo_path) -> str` — walks full history with `--reverse`; note
  `--reverse` combined with `-1`/`--max-count` does NOT give the oldest commit (the count
  limit applies before the reverse), so this deliberately takes the first line of the
  full (unlimited) reversed output instead.
- `get_last_commit_date(repo_path) -> str`
- `get_contributors(repo_path, max_count=None) -> list[dict]` — keys: `name`, `email`,
  `commit_count`, via `git shortlog -sne` (already sorted by commit count descending).
  `max_count` slices the already-sorted list — `DatasetCollector` passes `20` for
  `repository.json`, since the unbounded list was found to have 932 entries for
  `fastapi/fastapi` and dominate that file's size (~97% of it). A stopgap cap, not a
  final design — flagged as needing a closer look later.
- `get_tracked_files(repo_path, commit_hash=None) -> list[str]` — relative paths of
  everything tracked. Without `commit_hash`, uses `git ls-files` (current checkout —
  correct for repo-level callers like `repository.json`, which describes the repo's
  present state). With `commit_hash`, uses `git ls-tree -r --name-only <commit_hash>`
  instead, returning the tree exactly as it existed at that commit — required for any
  per-commit caller (see ADR-004; found via a real bug where a directory that existed at
  a 2023 commit had since been deleted from current HEAD, silently returning nothing).
  Deliberately just a listing either way — classifying files by language is not git
  knowledge, that lives in `src/utils/language_detector.py`.
- `get_file_history(repo_path, commit_hash, file_path) -> dict` — keys:
  `total_commit_count`, `first_commit_date`, `previous_commit_date` (`None` if this is
  the file's first-ever appearance), `is_first_appearance`. Scoped to `commit_hash`
  itself (its ancestors), never `HEAD` — the same discipline every other method here
  follows — so a historical sample can never "see" commits from its own future. One git
  call, no follow-up lookups.
- `get_co_change_history(repo_path, commit_hash, file_path, max_history=50) -> list[list[str]]`
  — the up-to-`max_history` most recent commits touching `file_path` before `commit_hash`
  (excluding `commit_hash` itself), each represented as its full changed-file list. Raw
  data only — counting/ranking co-change partners is `co_change_detector`'s job, not
  this method's. One log call plus one `get_changed_files` call per historical commit
  (bounded by `max_history`, not unbounded).

## Internal Workflow

Every public method builds a git argv list and delegates to `run_git_command`, which
shells out via `subprocess.run(check=True)` and returns raw stdout. Each method parses
that stdout itself: `splitlines()` for hash lists, a `\x1f`-delimited format string for
metadata, tab-splitting for `--name-status` output. There is no shared parsing layer —
each method's output shape is tailored to what its caller needs.

## Dependencies

Python stdlib only (`subprocess`). Requires a `git` binary on `PATH`. No dependency on
`src/collector` or any other project module — this is the bottom of the dependency graph.

## Future Improvements

- `run_git_command` has no callers outside this class; should become `_run_git_command`.
- `get_file_content_at_commit` currently has no caller anywhere in the codebase — added
  ahead of need, revisit if it stays unused. (`get_changed_files` now has one:
  `DatasetCollector._build_commit_change_set`.)
- `clone_repository`'s `shallow` option isn't used by any current caller.
- No custom exception types yet (`src/git/exceptions.py` exists but is empty) — errors
  currently surface as raw `subprocess.CalledProcessError`.
- `get_file_history` doesn't follow renames (`--follow`) — for a renamed file, history is
  only counted from the point of the rename onward, under-counting its real age. Not yet
  addressed.

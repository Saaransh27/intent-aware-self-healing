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
- `get_changed_files` and `get_file_content_at_commit` currently have no callers anywhere
  in the codebase — added ahead of need, revisit if they stay unused.
- `clone_repository`'s `shallow` option isn't used by any current caller.
- No custom exception types yet (`src/git/exceptions.py` exists but is empty) — errors
  currently surface as raw `subprocess.CalledProcessError`.

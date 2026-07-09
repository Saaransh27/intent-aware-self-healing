# DatasetCollector

`src/collector/dataset_collector.py`

## Purpose

Implements Milestone 2: produce a configurable number of benchmark samples (each a
commit's metadata + diff) from a given GitHub repository, on disk, in the layout the
benchmark expects.

## Responsibilities

- Clone the target repository into a temporary directory (cleaned up automatically) —
  once per `collect()` call, regardless of how many commits are requested.
- Ask `GitClient` for up to `commit_count` non-merge commits — holds no opinion on what
  makes a commit a merge commit or what order commit history comes in (see ADR-002).
- For each commit returned, fetch its metadata and diff via `GitClient`, treating both as
  opaque values.
- Write `benchmark/<repository_name>/commits/<commit_hash>/metadata.json` (formatted
  JSON) and `.../diff.patch` (git's diff output, unmodified) for each commit.

## Public API

- `DatasetCollector(repository_url, output_directory, commit_count)`
- `collect() -> list[str]` — runs the flow above, returns the collected commit hashes
  (newest-first). If the repository has fewer than `commit_count` non-merge commits,
  returns however many exist rather than erroring; raises `ValueError` only if there are
  none at all.

## Internal Workflow

`collect()` opens a `tempfile.TemporaryDirectory`, clones into it via `GitClient` once,
resolves up to `commit_count` non-merge commit hashes, then loops over them fetching
metadata/diff and writing both files per commit — all before the temporary clone is
deleted on context exit. Private helpers (`_repository_name`, `_commit_directory`,
`_save_metadata`, `_save_diff`) handle naming and I/O per commit; none of them know
anything about git.

## Dependencies

`GitClient` (`src/git/git_client.py`). Python stdlib: `json`, `tempfile`, `pathlib`.

## Future Improvements

- No handling yet for clone failures beyond letting `subprocess.CalledProcessError`
  propagate.
- No commit-quality filtering yet (bot authors, vague messages, diff size) — every
  non-merge commit qualifies today. Deliberately deferred; see the "what makes a commit
  valuable" discussion, not yet turned into a milestone.
- `GitClient` is still constructed internally rather than injected — considered and
  deliberately deferred (no second implementation exists yet to justify it).

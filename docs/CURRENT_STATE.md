# Current State

_Last synced: 2026-07-09._

## What works

Milestones 1 and 2 are implemented and verified end-to-end. Running
`python3 main.py <repository_url> <commit_count>`:

1. Clones the repository once, into a temporary directory.
2. Resolves up to `commit_count` non-merge commits (fewer if the repo doesn't have that
   many; errors only if there are none at all).
3. For each, writes `benchmark/<repo>/commits/<commit_hash>/metadata.json` and `diff.patch`.

Verified live: `fastapi/fastapi` with `commit_count=3` produced 3 real samples; a
throwaway repo with only 3 non-merge commits, requested with `commit_count=10`, correctly
returned all 3 instead of erroring.

## What exists

- `src/git/git_client.py` — `GitClient`, full git-plumbing layer. See
  `docs/modules/git_client.md`.
- `src/collector/dataset_collector.py` — `DatasetCollector`, takes
  `(repository_url, output_directory, commit_count)`. See `docs/modules/dataset_collector.md`.
- `main.py` — CLI entrypoint: `python3 main.py <repository_url> <commit_count>`. Output
  directory is still fixed to `./benchmark` (not a CLI arg).
- `src/git/exceptions.py` — present, empty. No custom exception types defined yet.
- `src/utils/` — present, empty. No shared utilities needed yet.
- `requirements.txt` — present, empty. No third-party dependencies; everything used so
  far is Python stdlib plus the `git` binary.

## What does not exist yet

No AI, no embeddings, no context graphs, no evaluation — all explicitly out of scope per
`PROJECT.md`. No tests yet. No commit-quality filtering (bot authors, vague messages, diff
size) — every non-merge commit currently qualifies. `GitClient` is still constructed
internally by `DatasetCollector`, not injected.

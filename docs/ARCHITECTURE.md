# Architecture

## Current flow (Milestone 2)

```
main.py <repository_url> <commit_count>
  -> DatasetCollector.collect()
       -> GitClient.clone_repository()             (once, into a temp dir)
       -> GitClient.get_non_merge_commit_hashes()   (up to commit_count, newest-first)
       -> for each commit hash:
            -> GitClient.get_commit_metadata()
            -> GitClient.get_commit_diff()
            -> writes benchmark/<repo>/commits/<hash>/{metadata.json, diff.patch}
```

## Layering

Two layers, one strict rule between them:

- **`GitClient`** (`src/git/`) — the only place that knows how git works. Owns command
  construction, output parsing, and git-domain semantics (e.g. "a merge commit has more
  than one parent"). Nothing above it should ever reason about git internals directly.
- **`DatasetCollector`** (`src/collector/`) — orchestration and I/O only. It asks
  `GitClient` questions ("give me the latest non-merge commit") and treats the answers
  (metadata dict, diff string) as opaque values to persist. It owns the benchmark output
  layout (`benchmark/<repo>/commits/<hash>/...`) and repo-name parsing, since that's
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

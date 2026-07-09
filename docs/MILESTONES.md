# Milestones

## Milestone 1 — Generate one benchmark sample from a GitHub repository

**Status: Complete** (verified 2026-07-09)

Deliverables (per `PROJECT.md`):

- [x] Clone repository
- [x] Fetch latest non-merge commit
- [x] Save `metadata.json`
- [x] Save `diff.patch`

Verified by running `python3 main.py` against `fastapi/fastapi`, producing
`benchmark/fastapi/commits/7cb06f360dd44efac059848df1a9beee7643b018/{metadata.json, diff.patch}`.

Explicitly out of scope, per `PROJECT.md`, and not present: AI, embeddings, context
graphs, evaluation.

## Milestone 2 — Configurable multi-commit dataset generator

**Status: Complete** (verified 2026-07-09)

Goal: turn the one-commit prototype into a reproducible generator — input is just a
repository URL and `n`, output is up to `n` non-merge commit samples.

Deliverables:

- [x] `main.py <repository_url> <commit_count>` CLI
- [x] Clone once, collect up to `commit_count` non-merge commits from that single clone
- [x] If the repo has fewer non-merge commits than requested, collect what exists (no error)
- [x] Same per-commit output layout as Milestone 1, for each collected commit

Verified by running `python3 main.py https://github.com/fastapi/fastapi 3` (produced 3
samples) and against a throwaway local repo requesting more commits than it had (correctly
returned all available commits instead of erroring).

Explicitly deferred, not in this milestone: commit-quality filtering (bot authors, vague
messages, diff size), injecting `GitClient` instead of constructing it internally — both
considered, deliberately not built since no concrete need for either exists yet.

## Milestone 3

Not yet defined.

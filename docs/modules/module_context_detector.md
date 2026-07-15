# module_context_detector

`src/utils/module_context_detector.py`

## Purpose

For a single changed file, list the other tracked files sharing its immediate directory
— the cheapest of Milestone 5A's four evidence extractors, since it needs zero new git
calls. Built as an independent component per the user's architecture rule.

## Responsibilities

- `get_local_module_files(file_path, tracked_files, changed_files, max_results=20) -> list[str]`
  — other tracked files in the same immediate directory as `file_path`, excluding
  anything in `changed_files` (no point repeating what's already visible in this
  commit's own diff), capped to the first `max_results` found.

## Internal Workflow

Pure function, no I/O. Unlike `layout_detector` (which only classifies *top-level*
directories for repo-wide categorization), this uses a file's own immediate parent
directory — which can be arbitrarily nested (e.g. `fastapi/routing.py`'s directory is
`fastapi/`, not further split; `docs/en/docs/tutorial/frontend.md`'s directory is
`docs/en/docs/tutorial/`). Root-level files (no `/` in the path) all share directory `""`
and are treated as siblings of each other.

## Dependencies

Python stdlib only, no imports beyond built-ins. No dependency on `GitClient` or any
other detector — takes plain lists of path strings, returns a plain list.

## Future Improvements

- Only considers the *immediate* directory, not the broader package/module boundary a
  file might conceptually belong to (e.g. a nested `fastapi/security/` file isn't
  considered a "local module" sibling of `fastapi/routing.py`, even though both belong to
  the same top-level package).
- **Update:** capped to `max_results=20` (2026-07-15), after a full-pipeline efficiency
  review found this field alone accounted for 71.9% of a full `commit.json` preview's
  size, almost entirely low-signal filename dumps (208 siblings for one file in a flat
  `tests/` directory). This is a stopgap — the cap just takes the first `max_results`
  found (effectively alphabetical, since that's tracked-file order), not the most
  relevant `max_results`. The user explicitly flagged this needs a closer look later,
  not a finished design.
- Ranking/selecting *which* siblings matter most (vs. just truncating) is unsolved —
  candidates for later: co-change frequency with the siblings (reusing
  `co_change_detector`'s data), or recency of the sibling's own last edit.

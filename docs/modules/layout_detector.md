# layout_detector

`src/utils/layout_detector.py`

## Purpose

Classify a repository's top-level (depth-1) directories into broad categories: tests,
documentation, examples, scripts, source. Same rationale as the other detectors: not git
knowledge, doesn't belong in `GitClient`.

## Responsibilities

- Extract the set of top-level directories from tracked file paths.
- Classify each by name against fixed keyword sets (`tests`, `test`, `spec`, `specs` →
  tests; `docs`, `doc`, `documentation` → documentation; `examples`, `example`, `samples`,
  `sample`, `demo`, `demos` → examples; `scripts`, `script`, `bin`, `tools` → scripts).
- Everything else — anything not matching a keyword set and not hidden (starting with
  `.`, e.g. `.github`) — is classified as `source`. `source` is a catch-all, not a
  keyword match; that's deliberate, since a repo's actual source directory is usually
  named after the project itself (e.g. `fastapi/` in `fastapi/fastapi`), not a fixed word.

## Public API

- `detect_layout(file_paths) -> dict` — key: `directories`, a dict with keys `source`,
  `tests`, `documentation`, `examples`, `scripts`, always all five present (empty list if
  no match), each a list of directory names with a trailing `/`.

## Internal Workflow

Pure function. Derives each file's top-level directory (the text before the first `/`;
files with no `/` belong to no directory and are ignored). Hidden top-level directories
are dropped entirely rather than forced into `source`. Each remaining directory name is
lowercased and checked against the keyword sets in order (tests, documentation, examples,
scripts); anything left over becomes `source`.

## Dependencies

Python stdlib only, no imports beyond built-ins. No dependency on `GitClient` or any other
detector — takes a list of path strings, returns a dict.

## Future Improvements

- Only classifies depth-1 directories — a repo organized as `src/backend/` and
  `src/frontend/` reports just `src/` under `source`, not the nested split.
- Keyword sets are fixed and English-only; unconventional or non-English directory names
  (e.g. `código/`) fall into `source` by default rather than being recognized.
- Verified live against `fastapi/fastapi` (correctly matched `tests/`, `docs/`,
  `scripts/`, and put `fastapi/` + `docs_src/` under `source`) — not yet tested against a
  repo that actually has an `examples/` directory.

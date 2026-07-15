# language_detector

`src/utils/language_detector.py`

## Purpose

Classify a repository's tracked files by programming language, purely from file
extensions. Deliberately not part of `GitClient` — this is file-type classification, not
git knowledge.

## Responsibilities

- Map file extensions to language names via a fixed lookup table.
- Count files per language and rank them.

## Public API

- `detect_languages(file_paths) -> dict` — keys: `primary_language` (most common language
  by file count, or `None` if nothing recognized), `detected_languages` (list of unique
  languages found, ordered most-common-first).

## Internal Workflow

Pure function: takes a list of file path strings (as returned by
`GitClient.get_tracked_files`), looks up each file's suffix (`pathlib.Path(...).suffix`)
in `EXTENSION_LANGUAGES`, counts matches, and sorts by count descending. Files with an
unrecognized or missing extension (e.g. `Dockerfile`, `.gitignore`) are silently skipped —
not classified as any language.

## Dependencies

Python stdlib only (`pathlib`). No dependency on `GitClient` or `DatasetCollector` — takes
plain strings in, returns a plain dict out.

## Future Improvements

- Extension list is a fixed table of common languages, not exhaustive (no GitHub
  Linguist-level coverage, no handling of vendored/generated file exclusion).
- Ranks by file count, not by lines of code or bytes — a repo with one huge file and many
  tiny ones could rank misleadingly.

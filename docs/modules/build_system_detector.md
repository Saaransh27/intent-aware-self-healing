# build_system_detector

`src/utils/build_system_detector.py`

## Purpose

Classify a repository's package manager from marker files at repo root (lock files,
`pyproject.toml` contents, language-specific config files). Same rationale as
`language_detector`: not git knowledge, doesn't belong in `GitClient`.

## Responsibilities

- Detect `package_manager` from root-level files: `poetry.lock`/`pdm.lock` (unambiguous),
  `pyproject.toml` content (`[tool.poetry]`/`[tool.hatch]`/`[tool.pdm]`),
  `requirements.txt`/`setup.py`/`setup.cfg` (Pip), `pom.xml` (Maven),
  `build.gradle`/`build.gradle.kts` (Gradle), `package-lock.json`/`pnpm-lock.yaml`/
  `yarn.lock`/bare `package.json` (npm/pnpm/yarn).
- `build_system` is a deliberate placeholder — always `None` today. No concrete
  detection rule has been defined for it yet (considered generic build orchestration
  tools like Make/CMake/Bazel, and Python's PEP 517 build-backend, deferred both).

## Public API

- `detect_build_system(repo_path, file_paths) -> dict` — keys: `package_manager`
  (string or `None`), `build_system` (always `None` currently).

## Internal Workflow

Filters `file_paths` down to root-level files only (no `/` in the path) to avoid
matching nested/vendored config files. Checks lock files first (unambiguous), then reads
`pyproject.toml`'s content directly off disk (the repo is already checked out at
`repo_path`, so this is a plain file read, not a git operation) to disambiguate
Poetry/Hatch/PDM when no lock file settled it, then falls back to weaker single-file
signals. Returns on the first match; a monorepo with multiple ecosystems only reports one.

## Dependencies

Python stdlib only (`pathlib`). No dependency on `GitClient` — takes a repo path and a
file list, reads at most one file (`pyproject.toml`) directly.

## Future Improvements

- `build_system` detection undefined — revisit once there's a concrete rule to implement.
- Only reports one `package_manager` even if a repo has multiple ecosystems (e.g. Python
  backend + Node frontend) — whichever check matches first wins.
- Bare `package.json` with no lock file defaults to `"npm"` — a guess, not a certainty.

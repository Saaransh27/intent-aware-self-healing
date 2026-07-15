# signal_detector

`src/utils/signal_detector.py`

## Purpose

Detect well-known repository-root files/directories that could plausibly influence
reasoning about a future patch — the selection test is "can this file influence how we
reason about a future patch? if yes, keep it; if no, don't."

## Responsibilities

- `documentation`: `README`/`CONTRIBUTING` (common extensions/casing).
- `build`: `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, `Makefile`,
  `requirements.txt`, `Pipfile`/`Pipfile.lock`.
- `containerization`: `Dockerfile`, `docker-compose.yml`/`.yaml`.
- `ci`: presence of `.github/workflows/` (recorded as the directory itself, not
  individual workflow files within it).
- Deliberately excluded (per the user's own criteria): `LICENSE`, `CHANGELOG.md`,
  `.gitignore` — don't influence patch reasoning today. `CODEOWNERS`, `SECURITY.md` —
  deferred, useful later once ownership/security reasoning exists.

## Public API

- `detect_repository_signals(file_paths) -> dict` — key: `repository_signals`, a dict
  with keys `documentation`, `build`, `containerization`, `ci`, always all four present
  (empty list if no match). Generic over `file_paths` — takes any list of paths, so it
  works equally for repo-wide tracked files (Milestone 3, `repository.json`) and for a
  single commit's changed files (Milestone 5A, `DatasetCollector._build_commit_repository_signals`)
  without any change to this module itself.

## Internal Workflow

Root-level files (no `/`) are matched case-insensitively against fixed marker sets per
category; the matched entry is recorded with its real casing as found in the repo (e.g.
`README.txt`, not a canonicalized `README.md`). `.github/workflows/` is checked separately
since it's inherently nested — any tracked file path starting with that prefix counts.

## Dependencies

Python stdlib only, no imports beyond built-ins. Pure function — no dependency on
`GitClient` or the other detectors.

## Future Improvements

- `CODEOWNERS` and `SECURITY.md` intentionally not detected yet — revisit once
  ownership/security reasoning is in scope (per the user's own "later" categorization).
- Only checks root-level files — a `docs/CONTRIBUTING.md` or nested Dockerfile
  (`backend/Dockerfile`) isn't detected.
- Verified live: `fastapi/fastapi` (`README.md`, `pyproject.toml`, `.github/workflows/`)
  and `tcx_nogrunt-1` (`README.txt` — non-`.md` extension — `requirements.txt`,
  `.github/workflows/`).
- Reused unmodified for Milestone 5A's per-commit scoping: verified against real
  `fastapi/fastapi` commits touching `README.md` (→ `documentation`), `pyproject.toml`
  (→ `build`), and `.github/workflows/*.yml` (→ `ci`), including one release-prep commit
  that correctly fired both `build` and `ci` at once.

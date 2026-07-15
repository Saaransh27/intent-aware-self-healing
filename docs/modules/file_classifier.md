# file_classifier

`src/utils/file_classifier.py`

## Purpose

Classify a single changed file into one of 9 categories, deterministically, from its path
alone — no file content is read, no language-specific parsing, no subjective judgement.
Built for Milestone 4B's Change Understanding.

## Responsibilities

- `classify_file(file_path) -> str` — one of `Binary`, `CI/CD`, `Infrastructure`,
  `Dependency`, `Test`, `Documentation`, `Configuration`, `Source`, `Unknown`.
- `is_build_file(file_path) -> bool` — narrower check than `Configuration`: specifically
  build-orchestration tools (Makefile, build.gradle, setup.py, CMakeLists.txt,
  webpack/vite/rollup config), used by `DatasetCollector` for the `touches_build_files`
  change category without conflating it with generic config files.

## Classification rules (checked in this order — first match wins)

1. **Binary** — known binary/non-text extension (images, archives, compiled artifacts,
   fonts, media, Office documents).
2. **CI/CD** — path under `.github/workflows/`/`.circleci/`, or a known CI root file
   (Jenkinsfile, `.gitlab-ci.yml`, `.travis.yml`, `azure-pipelines.yml`, `appspec.yml`,
   `buildspec.yaml` — the latter two are AWS CodeDeploy/CodeBuild pipeline configs).
3. **Infrastructure** — Dockerfile, docker-compose, Terraform (`.tf`).
4. **Dependency** — known manifest/lock filenames (pyproject.toml, package.json, go.mod,
   Cargo.toml, requirements.txt, Pipfile\[.lock\], poetry.lock, pdm.lock,
   package-lock.json, yarn.lock, pnpm-lock.yaml) — matched by filename anywhere in the
   tree, not just at repo root (unlike `build_system_detector`/`signal_detector`, which
   only care about root-level markers for repo-wide signals; here we're classifying an
   individual changed file wherever it lives).
5. **Test** — top-level directory is a test-ish name (test/tests/spec/specs), or the
   filename matches `test`/`tests` bounded by `_`/`.`/start/end (deliberately word-bounded
   — `Test Studio.html` does NOT match, since "test" there isn't `_`/`.`-delimited；
   avoids misclassifying ordinary files that merely contain the word "test").
6. **Documentation** — top-level directory is docs-ish, or `.md`/`.rst` extension, or a
   known doc root file (README/CONTRIBUTING/CHANGELOG variants).
7. **Configuration** — build files (`is_build_file`), known config root files
   (`.editorconfig`, `.flake8`, `.gitignore`, `.gitattributes`, `.dockerignore`, etc.), or
   a generic config extension (`.yml`/`.yaml`/`.toml`/`.ini`/`.cfg`/`.conf`/`.json`).
8. **Source** — recognized source-code extension, reusing
   `language_detector.EXTENSION_LANGUAGES`'s keys (the only cross-detector import in
   `src/utils/` so far — avoids duplicating the extension list).
9. **Unknown** — none of the above matched.

Precedence matters: e.g. `.github/dependabot.yml` must hit the CI/CD path-prefix check
before the generic `.yml` Configuration check, or `docker-compose.yml` would be
misclassified as Configuration instead of Infrastructure.

## Internal Workflow

Pure, stateless functions — no I/O, no git access. Each rule is a plain set/prefix/regex
check against the file's basename, top-level directory, or extension.

## Dependencies

Python stdlib (`re`, `pathlib`). `language_detector.EXTENSION_LANGUAGES` (reused, not
duplicated).

## Future Improvements

- No fuzzy/partial-name matching by design (e.g. `requirements_nover.txt` doesn't match
  `requirements.txt` and correctly falls to `Unknown`) — verified live against
  `tcx_nogrunt-1`'s real history. Extending this would require a heuristic, which
  Milestone 4B's charter explicitly disallows.
- `.sqlite3`/`.db` files aren't in `BINARY_EXTENSIONS` (they're unusual to see committed
  at all) — verified live: they correctly surface as `Unknown` with the extension named
  in `extraction_confidence.unsupported_extensions`, which is exactly what that field is
  for.
- Test/Documentation classification only checks the top-level directory, not any
  intermediate directory (e.g. `src/tests/foo.py` — top-level is `src`, so this would not
  be classified `Test` by the directory rule; the filename-pattern rule would still catch
  `src/tests/test_foo.py` but not a file merely living under a nested `tests/` folder with
  a non-test-pattern name).
- Real gap found validating against `pallets/flask`: `.in`/`.txt` files inside a
  `requirements/` folder using per-purpose names (e.g. `tests-pallets-min.txt`,
  `dev.in`) correctly fall to `Unknown` — `.in`/`.txt` aren't recognized extensions, and
  `Dependency`'s filename check only matches the literal name `requirements.txt`, not
  this common pip-tools convention (a `requirements/` directory with multiple
  `<purpose>.in`/`.txt` pairs). Caught by `extraction_confidence.unsupported_extensions`
  as designed, not silently missed — but flagging as a real, not hypothetical, coverage
  gap rather than fixing it unprompted, since extending `Dependency` matching to a
  directory-name convention plus arbitrary basenames edges toward the kind of
  broader-matching heuristic Milestone 4B has been cautious about elsewhere.

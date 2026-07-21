ADR-001

Title:
Use native Git CLI as the primary Git interface.

Status:
Accepted

Context:
The project relies heavily on Git operations for building benchmark datasets.

Decision:
Use native Git commands wrapped inside a GitClient abstraction.

Rationale:
- Full feature parity with Git.
- Easier to reproduce manually.
- Better long-term flexibility.
- No dependency on wrapper limitations.
- Developers can directly map code to Git documentation.

Trade-offs:
- Need to parse command output.
- Slightly more implementation effort.

Revisit When:
If Git command parsing becomes complex or error-prone enough to outweigh these benefits.

---

ADR-002

Title:
Git commit-graph semantics (e.g. merge detection) live in GitClient, never in callers.

Status:
Accepted

Context:
DatasetCollector originally found the latest non-merge commit itself: it walked
GitClient.get_commit_hashes() and checked len(get_parent_hashes(...)) <= 1 for each one,
relying on get_commit_hashes returning newest-first order and on knowing that a merge
commit is defined as "more than one parent." That put Git domain knowledge inside the
collector and required one subprocess call per commit inspected.

Decision:
Add GitClient.get_latest_non_merge_commit_hash(repo_path), backed by a single
`git log --no-merges -1` call. DatasetCollector now only asks for the commit it wants;
it holds no knowledge of what makes a commit a merge commit or what order history comes in.

Rationale:
- Keeps GitClient as the sole owner of Git semantics; callers stay Git-agnostic.
- One subprocess call instead of one per commit walked — avoids an O(n)-subprocess
  bottleneck if this is ever run against a repository with many merge commits at HEAD.
- Makes DatasetCollector easier to point at a different git-access implementation later,
  since its contract with GitClient is now "give me a commit hash," not "give me commit
  data I then reason about."

Trade-offs:
- One more method on GitClient's public surface.

Revisit When:
If DatasetCollector needs commit-selection logic that isn't a single git-native filter
(e.g. "latest commit touching path X that isn't a merge") — at that point, decide whether
GitClient grows more specialized finder methods or exposes a more general query primitive.

---

ADR-003

Title:
Raw per-commit artifacts (metadata.json, diff.patch) live under an artifacts/ subfolder,
not directly in the commit directory.

Status:
Accepted

Context:
Milestone 4A introduces a structured commit.json per commit, made of five sections
(identity, metadata, change_set, artifacts, collection). Until now, metadata.json and
diff.patch were written directly at commits/<hash>/. Writing commit.json into that same
directory alongside them would leave two different kinds of file (one structured index,
two raw git outputs) flatly mixed together with no visual/structural distinction.

Decision:
metadata.json and diff.patch move to commits/<hash>/artifacts/metadata.json and
commits/<hash>/artifacts/diff.patch. commit.json's own artifacts section records their
location as relative paths ("artifacts/diff.patch", "artifacts/metadata.json") rather
than duplicating their content inline.

Rationale:
- commit.json becomes the single entry point for a commit; raw git outputs are reachable
  from it by reference, not duplicated.
- Keeps commits/<hash>/ readable at a glance: one JSON index file, one artifacts/ folder.
- Confirmed with the user before moving physical file locations (an actual behavior
  change, not just new data) rather than assuming this was in scope.

Trade-offs:
- One more level of directory nesting for every commit.
- Any external tooling or manual scripts already pointed at
  commits/<hash>/metadata.json directly (outside this codebase) would break silently —
  there are none known today.

Revisit When:
If commit.json ends up needing to duplicate the raw metadata/diff content inline instead
of referencing it (e.g. for tooling that can't resolve relative paths), or if more
artifact types are added and warrant their own subfolder structure within artifacts/.

---

ADR-004

Title:
Per-commit evidence extractors must scope file-tree queries to the target commit itself,
never the current checkout.

Status:
Accepted

Context:
While validating the full pipeline against a real, previously-untested repository
(pallets/flask), `_build_commit_local_module_context` was found to return 0 siblings for
two files that actually had 10 real siblings at the time of the commit. The cause:
`GitClient.get_tracked_files(repo_path)` runs `git ls-files`, which lists whatever is
currently checked out — the repo's present-day HEAD, not the target commit's point in
time. Flask's `requirements/` directory (12 files as of the 2023 commit under test) has
since been removed entirely from current HEAD, so the query silently returned nothing
for those files. This is the same class of bug the `--reverse -1` and "future leakage"
issues caught earlier belong to: an operation implicitly scoped to the wrong point in
git history, discovered only by testing against a repository whose history has visibly
moved since Milestone 3's fastapi-only testing.

Decision:
`GitClient.get_tracked_files` now takes an optional `commit_hash` — when given, it uses
`git ls-tree -r --name-only <commit_hash>` instead of `git ls-files`, returning the tree
exactly as it existed at that commit. `_build_commit_local_module_context` now passes
`commit_hash` through. The repository-level caller (`_fetch_repository_metadata`, for
`repository.json`) intentionally omits it, since that file is meant to describe the
repo's current state, not any single commit's.

Rationale:
- Every per-commit extractor operates on "the repository as of this commit," not "the
  repository as it is today" — this was already true by construction for
  `get_file_history` and `get_co_change_history` (both take `commit_hash` directly), but
  `get_tracked_files` was the one place that broke the pattern, because its original
  caller (`repository.json`) genuinely wanted current-HEAD semantics and nobody
  re-examined that assumption when it gained a second caller.
- Backward compatible: `commit_hash` defaults to `None`, so the existing
  repository-level call needed no changes.
- Found through testing against a *different* real repository, not the ones already
  exercised repeatedly (fastapi, tcx_nogrunt-1) — a concrete argument for periodically
  validating against fresh repos rather than only ever re-testing the same ones.

Trade-offs:
- One more conditional branch inside `get_tracked_files` rather than two separate
  methods — chosen to keep the method count small; revisit if the two code paths
  diverge further.

Revisit When:
If another `GitClient` method is added that lists something tree-wide (not commit- or
path-specific) — check up front whether it needs the same optional `commit_hash` scoping
rather than discovering the gap through a real bug again.

---

ADR-005

Title:
Milestone 6 adds a symbol-level semantic evidence layer, with its first implementation
targeting Python at `src/semantic/python/symbol_extractor.py`, architecturally parallel
to — not a replacement for — Milestone 5A's structural/historical context layer.

Status:
Accepted

Context:
The 20-commit evaluation (docs/research/observations.md) and the follow-up first-
principles critique both converged on the same conclusion: the git-only evidence layer
has a real ceiling, and the highest-value gap is code semantics — what actually changed
inside a file, not just which file changed and how often. Commit 4 (fastapi) was the
concrete case: a 300-line refactor and a two-line typo fix produced structurally similar
evidence because nothing in the pipeline looks inside a file's contents. This ADR
freezes the design for closing that specific gap, scoped deliberately narrowly: symbol-
level facts only, Python only, no reasoning.

Decision:

Guiding principle for every stage below: prefer emitting fewer facts with high
confidence over more facts with uncertain interpretation. Where a case is genuinely
ambiguous (e.g. a redefinition pattern the symbol table can't cleanly resolve), the
correct behavior is to omit or flag it, never to guess.

Module structure:
- New top-level package `src/semantic/`, sibling to `src/utils/` and `src/git/`, not
  folded into `src/utils/`. Everything under `utils/` today is structural/historical and
  language-agnostic; this layer is symbolic and language-coupled. Keeping them visually
  separate is a permanent signal to future readers, not cosmetic.
- Within it, a language-named subpackage: `src/semantic/python/symbol_extractor.py`, not
  a bare `symbol_extractor.py` at the `semantic/` root. Language-specific extraction is
  not a detail to bolt on later — it's the actual shape of the problem, so the directory
  structure says so now. A second language gets a sibling package
  (`src/semantic/javascript/`, etc.) with no rename of existing code required.
- Single file within `python/` for now, mirroring every existing detector: one file, one
  public entry point, private helpers underneath. No further splitting yet — the scope
  (8 questions, Python only) does not justify it.

Responsibilities:
- `symbol_extractor.py` owns exactly one thing: given two source strings (or `None`),
  produce symbol- and import-level facts. It knows nothing about Git, commits, or file
  paths beyond the one path string it's told (used only for the `file_path` field in its
  output, never to read a file itself).
- `DatasetCollector` gains one new orchestration method,
  `_build_commit_semantic_analysis(repo_path, commit_hash, change_set)`. It decides which
  changed files are in scope (`.py` only), fetches old/new source via
  `GitClient.get_file_content_at_commit`, and calls the extractor once per file. It
  contains no AST logic, exactly like every other `_build_commit_*` method contains no
  git logic.
- `GitClient` is untouched. `get_file_content_at_commit(repo_path, commit_hash,
  file_path)` already fetches a file at any commit; calling it once with the commit's
  single parent hash and once with the commit hash itself is sufficient. No new method
  is needed — a good sign the Milestone 4A/5A abstraction boundary was drawn correctly.

Data flow (per commit, per changed file):
1. `_build_commit_semantic_analysis` reads `change_set`'s `added_files`, `deleted_files`,
   `modified_files`, `renamed_files` and filters to files where the relevant path (new
   path for added/modified, old path for deleted, either path for renamed) ends in
   `.py`. Non-Python changed files are simply not included in this section's output —
   there is no other evidence section they'd need to also appear in.
2. For each in-scope file, resolve `old_source`/`new_source`:
   - added: `old_source = None`, `new_source` fetched at `commit_hash`.
   - deleted: `old_source` fetched at the parent hash, `new_source = None`.
   - modified: both fetched, same path.
   - renamed: `old_source` fetched at the parent hash using `old_path`, `new_source`
     fetched at `commit_hash` using `path`. This is a plain content diff across the two
     known paths, not symbol-rename tracking — the file's identity is already resolved
     by Git; the extractor just needs the right two strings.
   - The parent hash is read once via `GitClient.get_parent_hashes(repo_path,
     commit_hash)[0]` — safe because `DatasetCollector` only ever processes non-merge
     commits, which have exactly one parent.
3. `extract_symbol_semantics(old_source, new_source, file_path)` parses whichever
   sources are present into an AST each, builds a symbol table per source keyed by
   qualified name, diffs the two tables, and diffs the modules' import statements.
4. Results are collected into a single `semantic_analysis` block for the commit.

Output schema (new top-level section in `commit.json`, alongside `context`):

    "semantic_analysis": {
      "files": [
        {
          "file_path": "src/foo.py",
          "old_path": null,
          "change_type": "added" | "deleted" | "modified" | "renamed",
          "parseable": true,
          "imports": { "added": ["os.path"], "removed": ["sys"] },
          "symbols": [
            {
              "qualified_name": "Foo.bar",
              "symbol_type": "function" | "async_function" | "method" |
                              "async_method" | "class",
              "change_type": "added" | "removed" | "modified",
              "enclosing_scope": "Foo",
              "visibility": "public" | "private",
              "signature_changed": true,
              "signature": { "old": "(self, x)", "new": "(self, x, y=None)" },
              "decorators_changed": false,
              "decorators": { "added": [], "removed": [] },
              "docstring_status": "added" | "removed" | "changed" | "unchanged"
            }
          ]
        }
      ]
    }

`old_path` is non-null only for renamed files. When `parseable` is `false` (a syntax
error at either revision), `imports` and `symbols` are both `null` — the same honest-
failure shape `extraction_confidence` already established elsewhere; this section never
fabricates partial results for a file it couldn't fully parse. `semantic_analysis` is
wrapped in a `{"files": [...]}` object rather than a bare list so a future summary field
can be added without changing the section's shape.

Interfaces:
- Public: `extract_symbol_semantics(old_source: str | None, new_source: str | None,
  file_path: str) -> dict`, in `src/semantic/python/symbol_extractor.py`. Pure function, no I/O.
- Symbol identity across the diff is the **qualified name**: dotted path from module
  root through enclosing class to the symbol (`Foo.bar` for a method, `baz` for a
  top-level function). This is the only identity scheme used — deterministic from AST
  structure alone, no similarity heuristics.
- `DatasetCollector._build_commit_semantic_analysis(self, repo_path, commit_hash,
  change_set) -> dict`, following the exact calling convention of every existing
  `_build_commit_*` method.

Limitations (decided, not open):
- Python only. Any other changed file is absent from this section, full stop — no
  language-agnostic fallback is attempted, because a shallow one would reintroduce the
  imprecision this layer exists to remove.
- No symbol rename detection. A function renamed `foo` -> `bar` within an unrenamed file
  reports as "removed foo" + "added bar." Solving this would require similarity
  heuristics, which this project has avoided everywhere else; not revisited here.
- No cross-file reference resolution, no call graph, no impact analysis. A
  `signature_changed: true` fact describes the symbol itself only — never who calls it.
  That is explicitly reserved for a future, separate concern, if ever built at all.
- No cross-commit symbol history. Scope is strictly this commit's before/after diff,
  matching `change_set`'s own single-commit scoping.
- No `__all__` awareness. Visibility is leading-underscore convention only.
- No type-compatibility judgment. `signature_changed` and the raw old/new signature text
  are facts; whether a change is compatible is reasoning, out of scope by the milestone's
  own charter.

Rationale:
- A new package rather than reusing `utils/` makes the language-coupling trade-off
  visible in the directory structure itself, not just in a doc — the one place this
  project's language-agnostic property is deliberately given up.
- Reusing `GitClient.get_file_content_at_commit` unmodified is a direct validation that
  ADR-001/ADR-004's abstraction boundary (all git mechanics behind GitClient, called with
  explicit commit scoping) generalizes to a new kind of consumer without changes.
- Qualified-name identity was chosen over line-position or hash-based identity because
  it survives surrounding-code reordering and is the same notion of "identity" a reader
  already uses when they say "the `bar` method changed" — no invented concept.
- Renamed files are handled as a content diff across two known paths, not as remove+add
  of every symbol, because Git already resolved the file's identity; discarding that and
  treating a rename as a full delete-then-create would manufacture false churn in the
  evidence for the common case of a file move with a small in-place edit.

Trade-offs:
- This is the first evidence extractor whose coverage depends on the target repository's
  language mix — a Rust or Java-heavy repo gets an empty `semantic_analysis` section, which
  is honest but is a real, permanent asymmetry against every other section in
  `commit.json`.
- Symbol-table diffing by qualified name will misattribute changes in the (rare)
  legitimate case of same-named symbols redefined conditionally in the same scope (e.g.
  a function defined differently per `if`/`else` branch at module level). Left
  unhandled; flagged here rather than silently accepted.

Implementation stages (built one at a time, gated by explicit confirmation before each):
1. AST + Symbol Extraction: parse one source string into an AST, then walk it into a
   qualified-name-keyed symbol table of functions/async functions/methods/classes,
   capturing signature text, decorators, docstring, enclosing scope, and visibility. No
   diffing yet.
2. Semantic Diff: compare two symbol tables, classify added/removed/modified, and for
   matched symbols compute `signature_changed`, `decorators_changed`, `docstring_status`.
3. Import Analysis: added/removed import statements between two sources.
4. Public Semantic Extractor API: `extract_symbol_semantics` assembles stages 1-3 behind
   one public interface, plus the `parseable: false` degradation path for syntax errors.
5. DatasetCollector Integration: `_build_commit_semantic_analysis` — file-scope filtering
   from `change_set`, source-fetching via `GitClient`, calling the extractor, assembling
   the `semantic_analysis` block.
6. Real-World Validation: against real commits (including at least one non-trivial
   rename and one syntax-error/degradation case), followed by module doc,
   `ARCHITECTURE.md`, `MILESTONES.md`, and `CHANGELOG.md` updates.

Revisit When:
If a second language is added, it gets its own sibling package under `src/semantic/`
(e.g. `src/semantic/javascript/`), feeding the same `semantic_analysis` output shape —
that structural decision is already made by this ADR. What remains open at that point is
narrower: whether per-language results are merged into one `files` list or kept in
per-language sections, decided against real cross-language repository data when it
exists, not speculatively now.
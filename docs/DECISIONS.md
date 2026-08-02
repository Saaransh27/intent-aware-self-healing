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

---

ADR-006

Title:
Evidence Fusion is a lossless, entity-centric adapter — `{status, evidence}` bundles
that copy values out of the extraction sections, never rename concepts, never persist,
and never reason.

Status:
Accepted

Context:
Milestone 6 completed the evidence-extraction phase (`change_set`, `observations`,
`file_history`, `co_change`, `local_module_context`, `repository_signals`,
`semantic_analysis`). Before designing a Reasoning Engine, the user asked for a
separate layer in between: something that organizes and normalizes already-extracted
evidence into a form a reasoning engine can consume, without itself reasoning, scoring,
classifying, or inferring. Three design iterations were needed to land on the right
shape:

1. First proposal relabeled sections into reviewer-workflow vocabulary
   (`co_change` -> "reach", `file_history` -> "lineage") and invented a new top-level
   `commit_context`/`files` schema with copied values. Rejected: renaming implies
   interpretation the raw data doesn't necessarily support, and the new schema
   duplicated `commit.json` instead of adapting it.
2. Second proposal kept original names, dropped the invented schema, but returned
   `{status, reference}` — a `{section, key, locator}` pointer into the original
   evidence instead of a copied value, so nothing would be duplicated. Rejected: a
   pointer doesn't actually hide the extraction layer's structure — whatever
   dereferences it still has to know `semantic_analysis.files` is list-shaped while
   `context`'s fields are dict-shaped. The coupling moved, it didn't disappear.
3. Final design (this ADR): return the resolved value directly, so Fusion is the only
   code in the project that ever needs to know a section's internal shape.

Decision:

**Contract.** `fuse_evidence(evidence: dict) -> dict` returns one bundle for the commit
and one bundle per changed file. Every field in every bundle is the same envelope:

    {"status": "ok" | "not_applicable" | "not_collected", "evidence": <value> | None}

`evidence`, when `status` is `"ok"`, is the exact value already produced upstream,
copied out — never restructured, renamed, or summarized. Bundle keys are the
extraction layer's own names (`file_history`, `co_change`, `semantic_analysis`,
`file_classification`, etc.) — not a new vocabulary.

**Status is presence-only.** `not_collected` means the whole section is absent from
the input; `not_applicable` means the section exists but this entity has no entry in
it (a non-Python file has no `semantic_analysis` entry); `ok` means real data, however
thin. No status is ever derived by inspecting or judging a value — only by checking
whether it exists.

**Lossless, not lossy-by-convenience.** Fusion may normalize, reshape, group, and copy.
It must never summarize, filter, merge, rank, infer, or discard information. The one
apparent exception — a file's `change_set` bundle entry is a derived `file_status`
(`added`/`deleted`/`modified`/`renamed`), not a verbatim copy — is resolved by also
passing the complete, untouched `change_set` object through in the commit bundle, so
the full original remains reachable regardless.

**No `"context"` wrapper.** The four Milestone 5A sections are treated as flat,
independently-named, independently-optional top-level keys, because that nesting
(`docs/context_design.md`'s open question) was proposed but never decided or built.
Fusion adapts to what `DatasetCollector`'s builder methods actually produce today, not
to a schema that doesn't exist.

**Not persisted.** `fuse_evidence` is a pure function of its input, called on demand,
regenerable at any time — no `evidence.json` or equivalent artifact is written. Since
nothing is ever discarded from the original evidence and the transform is
deterministic, there is no drift risk requiring pointer-based traceability — the
original evidence is the only source of truth, and Fusion's output is a disposable view
over it.

**Scope boundary.** `identity`, `artifacts`, and `collection` are out of scope —
commit/file bookkeeping, not evidence about the change itself, the same boundary
`context_design.md` drew for `artifacts`.

Module: new sibling package `src/fusion/evidence_fusion.py`, no dependency on
`GitClient` or `DatasetCollector` — the second module in the project (after
`src/semantic/`) whose input is structured data rather than repo/git state, and the
first with zero coupling to either.

Rationale:
- Returning copied values rather than references is the only way to make Fusion the
  sole layer coupled to the extraction schema — a reference still requires the
  consumer to understand each section's shape to dereference it, which defeats an
  adapter's purpose.
- Keeping original names (no `"reach"`/`"lineage"` relabeling) avoids asserting
  interpretive meaning the raw evidence doesn't carry, and avoids foreclosing a future
  possibility that a single reasoning-facing concept might need to combine multiple raw
  sections — a renaming now would have prejudged that combination.
- The three-state status vocabulary generalizes a distinction already implicit in
  `extraction_confidence` (know vs. don't know) one level further: know-and-applies,
  know-and-doesn't-apply, don't-know-at-all — collapsing any two of these into one
  would silently reintroduce exactly the kind of ambiguity this project has repeatedly
  found and fixed (`.gitignore` classification, `get_tracked_files` scoping).

Trade-offs:
- Copying values means Fusion's output can grow as large as the underlying evidence it
  covers (no size reduction) — acceptable, since it's never persisted and exists only
  as a transient, regenerable view.
- `not_applicable` is currently only exercised by `semantic_analysis`; the other
  per-file sections are computed unconditionally today, so the three-state machinery is
  partly future-proofing rather than fully exercised yet — verified honestly as such,
  not overstated.

Revisit When:
If `commit.json`'s assembly question (open since Milestone 4A) is ever decided and
introduces a `"context"` nesting, update only Fusion's four affected resolvers — the
bundle contract does not need to change. If a genuine cross-source reasoning-facing
concept (e.g. something that legitimately combines `co_change` and `file_history`)
becomes necessary, that belongs in the Reasoning Engine, not as a rename inside Fusion.

---

ADR-007

Title:
The deterministic reasoning layer (Milestone 8) is a flat registry of independent
modules, each with an explicit, enforced input contract, producing namespaced Claims
and Gaps; a non-reasoning Synthesizer only collects, groups, and aggregates.

Status:
Accepted

Context:
With extraction (Milestones 4A-6) and Evidence Fusion (Milestone 7) complete, the user
asked for the architecture of a deterministic reasoning layer, explicitly excluding
LLMs, prompts, fixes, and implementation from the first pass. An initial proposal was
revised five times before implementation began:

1. Modules receiving the entire Fusion output were replaced with modules declaring an
   explicit `consumes` list, enforced by the registry filtering evidence before each
   module runs — not just each module's own self-discipline about what it reads.
2. A per-evidence-category static reliability ranking (treating `semantic_analysis` as
   inherently more trustworthy than `co_change`, etc.) was removed. Confidence is
   computed per-claim, from what that specific claim's basis actually contains, never
   from a pre-declared ranking of evidence types.
3. Claims gained a stable, dotted, machine-addressable ID (`contract.
   public_signature_changed`, `history.first_appearance`) in addition to their
   structural fields, for future consumption by search, analytics, or an LLM.
4. The Synthesizer's proposed cross-module conflict detection was removed entirely —
   detecting whether two different modules' claims "contradict" each other requires
   interpreting their meaning against each other, which is reasoning, not aggregation.
   Any conflict a module wants to surface must come from within that module's own
   claims, using its own declared evidence.
5. Every module must declare `NAME`, `CONSUMES`, `PRODUCES`, and `LIMITATIONS` as
   plain, inspectable metadata — not just a docstring — matching this project's
   standing discipline of making limitations explicit, not implicit.

Decision:

**Layering.** `src/reasoning/` is a new sibling package to `src/fusion/`,
`src/semantic/`, `src/utils/`, `src/git/`. Its only input is `fuse_evidence`'s output;
it has no dependency on `GitClient`, `DatasetCollector`, or the raw extraction
sections.

**Registry, not a DAG.** Because every module's only possible input is the same
Evidence Fusion output — never another module's output — there is no dependency graph
to resolve. `src/reasoning/registry.py` holds a fixed, flat list of modules and runs
each one, in any order, against a per-module filtered view of the evidence.

**Enforced consumes contract.** `src/reasoning/contracts.filter_evidence(fused_evidence,
consumes)` builds a reduced evidence dict containing only the bundle keys a module
declared — at both the commit level and per file. A module physically cannot read a
Fusion bundle field it didn't declare, because the registry never gives it that field.

**Claim contract.**

    {"claim": "<namespace>.<specific_id>", "scope": {"level": "commit"|"file"|"symbol",
     "file_path": ..., "qualified_name": ...}, "confidence": "observed"|"corroborated"|
     "inferred"|"conflicting", "basis": [<evidence category names actually used>]}

`claim` is a stable, dotted, machine-addressable identifier, not just a human label —
one namespace per module (`shape`, `history`, `reach`, `verification`, `contract`).
`scope` supports three granularities because a claim about a symbol's signature is not
the same thing as a claim about its file, and collapsing that would lose real
precision. `basis` names exactly which of the module's *own declared* evidence
categories produced this specific claim.

**Confidence, computed per claim, not pre-ranked.**
- `observed` — a claim that directly restates a fact already present in one consumed
  evidence category (a boolean or enum already computed upstream), no threshold or
  interpretation involved.
- `inferred` — a claim that required a threshold or a derived computation over a
  single evidence category (or a computation combining two categories into one new
  derived value, e.g. a date gap) — a single line of reasoning, not independent
  agreement.
- `corroborated` — two or more of the module's *own* independent evidence categories
  each separately support the same higher-level claim (e.g. `reach.
  corroborated_wide_reach` requires both high `co_change` count and a large
  `local_module_context` list, independently).
- `conflicting` — two or more of a module's own evidence categories disagree; the
  module surfaces this itself, since only it has both pieces of evidence in view.

No evidence category is pre-declared "more trustworthy" than another anywhere in the
system. A module's confidence ceiling is a direct, mechanical consequence of how many
independent categories it declared in `consumes` — a module consuming exactly one
category (`contract_stability`, `semantic_analysis` only) can never produce
`corroborated` or `conflicting`, not because of a ranking, but because corroboration
structurally requires two.

**Gap contract.** `{"reason": ..., "scope": {...}, "missing": [<categories>]}` —
emitted whenever a module cannot evaluate something because a consumed category's
status (from Fusion) was `not_collected`/`not_applicable` for that scope. Never
silently skipped.

**Module metadata.** Every module file exports `NAME`, `CONSUMES`, `PRODUCES` (the
claim IDs it can emit), and `LIMITATIONS` (plain-language caveats) as plain top-level
constants — inspectable without reading the reasoning function's body.

**Synthesizer does not reason.** `src/reasoning/synthesizer.synthesize(module_outputs)`
only: collects every module's claims and gaps, groups them by scope
(`commit_claims`/`file_claims`/`symbol_claims`, and the equivalent gap groupings),
tags each with its originating module, and returns the aggregate. It does not detect
conflicts between modules, does not rank or filter claims, and does not decide which
claim matters more. Any conflict the user sees is one a single module already declared
about its own evidence, never one the Synthesizer inferred by comparing modules.

**Initial module registry (five modules, provisional):** `change_shape` (`change_set`
+ the `observations`-derived Fusion keys), `historical_risk` (`file_history`,
`metadata`), `reach` (`co_change`, `local_module_context`), `verification_coverage`
(`file_classification`, `semantic_analysis`), `contract_stability`
(`semantic_analysis`). `change_shape`'s `consumes` list expands the user's shorthand
"`observations`" into Fusion's actual constituent bundle keys (`touched_directories`,
`change_statistics`, `change_categories`, `extraction_confidence`, `file_classification`)
since Fusion never nested them under one `"context"`/`"observations"` key (ADR-006).

Rationale:
- Enforcing `consumes` at the registry level (not just documenting it) prevents the
  exact kind of hidden coupling this project has repeatedly found and fixed elsewhere
  — a module cannot accidentally depend on evidence it didn't declare, because it never
  receives it.
- Removing the static reliability ranking keeps confidence honest to this specific
  claim's actual evidence, rather than asserting a general truth about a whole
  evidence category that may not hold in every instance.
- Dropping cross-module conflict detection from the Synthesizer preserves the same
  line Evidence Fusion already drew: aggregation must never require interpreting
  meaning. Two modules' claims can only be compared by something that understands both
  domains — that is reasoning, and belongs, if anywhere, inside a module.

Trade-offs:
- Without cross-module conflict detection, two modules can produce claims that read as
  tension to a human (e.g. `reach.corroborated_wide_reach` alongside
  `verification.no_test_files_changed`) with nothing in this layer pointing that out —
  by design; surfacing that relationship is future work for whatever consumes these
  claims, not this layer's job.
- The five modules' thresholds (wide change >10 files, hot file >=50 commits, high
  coupling >=10, large neighborhood >15, dormant >=180 days) are fixed defaults, not
  validated tuning — same honesty already applied to `co_change_detector`'s `top_n=10`
  and `max_history=50`.

Revisit When:
If a genuine need arises for one module's claim to depend on another's output (not
just shared input), the flat registry stops being sufficient and the earlier
DAG-resolved registry idea should be revisited — not assumed necessary now. If real
validation surfaces a threshold that's clearly wrong (not just untuned), fix it the
same way `co_change_detector`'s bound was flagged rather than silently guessed at.

ADR-008

Title:
Function-body evidence (Milestone 8.5A) is extracted as five reviewer-facing categories
— interaction, error-handling, resource-management, documentation, and structure
changes — not as exposed Python AST node types; a new `body_evidence` reasoning
module consumes them alongside `contract_stability`.

Status:
Accepted

Context:
The 10-batch reasoning-layer evaluation (`docs/research/reasoning_experiments.md`/
`reasoning_observations.md`) named "Function Body Blindness" as the single most
consistently-evidenced cross-batch gap: `contract_stability` (and
`_diff_symbol_tables` beneath it) cannot see any change confined to a function or
method body when its signature, decorators, and docstring are unchanged — the symbol
is silently skipped, producing no diff entry at all, not merely a weak one.

An initial proposal (~7 candidate events keyed by AST node type — raised/caught
exception types, a bespoke `warnings.warn` detector, a deprecation-marker docstring
check, generic docstring change, new nested symbol, with-block count) was revised
once before implementation:

1. The organizing axis changed from "which AST node produced this" to "which
   reviewer question does this answer" — five categories: interaction changes
   (callee/API calls made), error-handling changes (exceptions raised/caught),
   resource-management changes (context managers entered), documentation/deprecation
   changes (a docstring deprecation marker), and internal-structure changes (a new
   private symbol appearing). AST node types remain the extraction mechanism, never
   the schema's vocabulary.
2. The standalone `warnings.warn` detector was dropped. It is subsumed by a single,
   more general fact — the set of names this body calls, added/removed — of which a
   newly-added call to `warnings.warn` is just one instance. This same general fact,
   for free, also explains two other real batch findings (Requests gaining a
   `hasattr` check, Django's `_non_atomic_requests` gaining a `functools.wraps` call)
   that would otherwise have needed their own bespoke detectors.
3. Resource-management changes reuse the same extraction primitive as interaction
   changes (`ast.unparse` on a call's target), scoped to `with`/`async with` headers
   instead of general call sites, rather than introducing a second mechanism.
4. Internal-structure changes required no new extraction at all — `_diff_symbol_tables`
   already detects newly-added symbols at any nesting depth; this category is a
   reasoning-layer claim surfacing that existing fact for `visibility == "private"`
   additions specifically, resolving (for the added case only) the "private-symbol
   changes are computed but excluded from claims" gap standing since Batch 4. This
   claim's exact firing condition was a second, separate decision, made after an
   initial unscoped version (fire on any new private symbol) was flagged as
   implicitly resolving that still-open Batch 4 policy question without sign-off:
   the condition is now "a new private symbol appears AND at least one pre-existing
   symbol in the same file was also modified" — reading as "something was
   restructured," not merely "something private was added."

Decision:
`src/semantic/python/symbol_extractor.py`'s `_record_function` extracts four new raw
per-symbol facts by walking each function's own body (never descending into nested
function/class defs, matching the existing scope-management discipline): `callees`
(every `Call` node's target, via `ast.unparse(call.func)`, excluding calls used as a
`with`-item's expression), `exceptions_raised` (the target of every `raise`, unparsed;
bare re-raises contribute nothing), `exceptions_caught` (every `except` clause's
type(s), tuples split into individual names so each caught type is independently
diffable), and `context_managers` (every `with`/`async with` item's expression,
unparsed). `_diff_symbol_tables` set-diffs each of these old vs. new (identical
`{"added": [...], "removed": [...]}` shape already used for imports/decorators) and
nests them under a new per-symbol `body_evidence` key, grouped by the five reviewer
categories rather than flattened:

```
"body_evidence": {
  "interaction_changes": {"callees": {"added": [...], "removed": [...]}},
  "error_handling_changes": {
    "exceptions_raised": {"added": [...], "removed": [...]},
    "exceptions_caught": {"added": [...], "removed": [...]}
  },
  "resource_management_changes": {"context_managers": {"added": [...], "removed": [...]}},
  "documentation_changes": {"deprecation_marker_added": true|false}
}
```

`deprecation_marker_added` is true when the new docstring contains a fixed marker
(`.. deprecated::`, `DeprecationWarning`, `PendingDeprecationWarning`) that the old
docstring didn't. Critically, a symbol whose *only* change is one of these four facts
now correctly produces a `change_type: "modified"` diff entry — `body_evidence`
changes were added to `_diff_symbol_tables`'s existing modified-check alongside
signature/decorators/docstring, which is the actual fix for Function Body Blindness;
extracting the facts without this would have left them computed but still unreachable.

A new reasoning module, `src/reasoning/modules/body_evidence.py` (`CONSUMES =
["semantic_analysis"]`, same single-source ceiling as `contract_stability`), emits one
claim per non-empty category per symbol (`interaction.callees_changed`,
`error_handling.exceptions_raised_changed`, `error_handling.exceptions_caught_changed`,
`resource_management.context_managers_changed`, `documentation.deprecation_marker_added`,
`structure.internal_symbol_added`), registered in `registry.MODULES` alongside the
existing five. It is a sibling to `contract_stability`, not a merge into it —
`contract_stability` reasons about the external contract (signature/decorators/
removal); this module reasons about internal body facts, a different reviewer
question with different confidence semantics. `structure.internal_symbol_added`
specifically requires both: the new symbol is `visibility == "private"` and
`change_type == "added"`, *and* some other symbol in the same file has
`change_type == "modified"` — a standalone new private symbol in an otherwise
untouched file produces no claim.

Rationale:
- Reviewer-facing categories keep the schema meaningful to a consumer who has never
  read `symbol_extractor.py` — "resource management changed" is legible on its own;
  "a `With` node's `context_expr` changed" is not. AST node types stay entirely inside
  the extraction mechanism, never leak into the contract, matching how `signature`
  and `decorators` were already named for what they mean, not for the AST types that
  produce them.
- Generalizing `warnings.warn` into callee-tracking is a strict improvement: one
  mechanism now explains three independent batch findings instead of needing three
  detectors, and it stays exactly as deterministic (exact-string set-diff, no
  resolution of what a name refers to) as the special case would have been.
- Fixing the modified-check, not just adding the fields, is what actually closes the
  gap the evaluation named. A field that's computed but never changes `change_type`
  would still be invisible to every downstream consumer, reproducing the exact defect
  under discussion.

Trade-offs:
- `callees`/`context_managers` are syntactic call-target text only — never resolved
  to a definition, an import, or a builtin. `self._exit_stack.__exit__` and a
  same-named but unrelated `__exit__` on a different object are indistinguishable by
  this fact alone. This is a deliberate ceiling (no call graph), not an oversight.
- A change confined entirely to a *callee's own* implementation (not this symbol's
  call sites, exception vocabulary, or resource usage) still produces no claim here —
  narrower than "any body change," by design; broadening further would require
  resolving call targets across symbols, which is explicitly out of scope.
- `structure.internal_symbol_added` covers only newly-*added* private symbols. It
  does not extend to signature/removal changes on existing private symbols — that
  remains the separate, still-open policy question from Batch 4, not resolved here.
- The same-file "some other symbol was modified" condition is a file-level check, not
  an `enclosing_scope`-level one — a private helper added anywhere in a file still
  fires the claim as long as *some* other symbol in that file was modified, even one
  structurally unrelated to the new helper. Deliberately simple over precise; revisit
  only if real data shows this reads as noisy.

Verified against two real, independently-selected commits: `pallets/click`'s
`c2ed414` (the exact commit that originally surfaced the `warnings.warn` question —
correctly produces `interaction.callees_changed` for the new `warnings.warn` call and
`documentation.deprecation_marker_added` for the docstring marker, with zero bespoke
handling of either) and `pallets/click`'s `555fa9b` (`Context.__exit__`/`Context.close`
change their callee from `self.close`/`self._exit_stack.close` to the new
`self._close_with_exception_info`, signature/decorators/docstring all unchanged on
both — previously silently invisible, now correctly surfaced as `modified` with
`interaction.callees_changed`; the new method itself correctly fires
`structure.internal_symbol_added`, since both `close` and `__exit__` in the same file
were independently modified). A hand-constructed pair confirmed the negative case: the
same new private helper added to a file where nothing else changed produces no
`structure.internal_symbol_added` claim.

Revisit When:
If a real commit shows a body-only change that doesn't fit any of the five
categories, add a sixth rather than force-fitting it. If `structure.internal_symbol_added`'s
file-level "some other symbol modified" condition proves too loose in practice (fires
alongside an unrelated modification elsewhere in the same file), tighten it to
`enclosing_scope` matching a specific modified symbol — not assumed necessary now, no
real data suggests it yet.

ADR-009

Title:
Milestone 8.5B (Historical Evidence Depth) adds three claims — one to `reach`, two to
`historical_risk` — chosen from a first-principles reviewer-workflow ceiling review,
not from a batch-evaluation finding; two require zero new extraction and one extends
`GitClient.get_file_history` to keep data it already computes but previously discarded.

Status:
Accepted

Context:
Unlike Milestone 8.5A (driven by the #1 named finding across 10 evaluation batches),
this milestone came from a different process the user explicitly requested: reason
from first principles about the deterministic ceiling for *historical* evidence,
starting from the established reviewer-workflow ordering and the batch evaluation,
before proposing anything to build. That review produced six candidates, evaluated
against the existing pipeline's actual fields (`file_history`'s three date/count
facts, `co_change`'s ranked partner list, `historical_risk`'s three existing claims,
`reach`'s two existing claims) rather than assumed ones. Two candidates (author
familiarity, ownership concentration) were judged high-value but requiring genuinely
new extraction (per-file author history, not currently captured anywhere) and were
deferred, not built here. Four were flagged and explicitly declined: broad fix/bug
keyword density (heuristic-adjacent, unlike an exact `git revert`-subject match),
historical diff-size statistics (new extraction for a low-confidence signal),
time-of-day/weekend authorship patterns (low relevance), and cross-file author
overlap across a co-change neighborhood (compound/derived, low marginal value).

The user selected three of the six for this milestone:

1. **Expected co-change partner missing** — `reach` only ever checks a file's
   *strongest* historical co-change partner's count to decide `high_historical_coupling`;
   it never checks whether that partner is actually present in the current commit.
2. **Rapid iteration detection** — the exact structural counterpart to the existing
   `long_dormant_reactivated` claim (same two fields, opposite threshold direction),
   never built.
3. **Recency-weighted churn** — `get_file_history`'s own git call already produces a
   full list of historical commit dates; the function discarded all but the first and
   immediately-previous entries. `hot_file`'s own `LIMITATIONS` already admitted its
   lifetime-count threshold isn't validated tuning; a recency-scoped count is a
   sharper, still-cheap refinement of the same idea.

Decision:
`GitClient.get_file_history` gains a `recent_window_days=30` parameter and a new
returned field, `recent_commit_count` — the number of a file's historical commits
(excluding the current one) within `recent_window_days` of the current commit's own
date, computed from the same date list the function already fetches. No new git
subprocess call.

`src/reasoning/modules/historical_risk.py` gains two claims:
`history.rapid_iteration` (`_hours_between(commit_date, previous_commit_date) <=
RAPID_ITERATION_HOURS`, default 1 hour) and `history.high_recent_churn`
(`recent_commit_count >= RECENT_CHURN_THRESHOLD`, default 5) — both `inferred`,
both using fields already available to the module (`file_history` + `metadata` for
the first, `file_history` alone for the second).

`src/reasoning/modules/reach.py` gains `reach.expected_co_change_partner_missing`:
for a file's `co_change` list, if any partner's `co_change_count >=
HIGH_COUPLING_THRESHOLD` (the same threshold `high_historical_coupling` already
uses) and that partner's path is not among the current commit's own changed files,
the claim fires. Needs no new extraction — `co_change` already carries everything
required, and the reasoning layer already has the full set of changed files in
`evidence["files"]`; this is a cross-reference `reach` simply never performed before,
the same shape of finding as `structure.internal_symbol_added` in Milestone 8.5A (a
new claim over already-available data, not new extraction).

Rationale:
- Two of three claims need zero new extraction — matching this project's preference
  for cheap wins over already-collected data before reaching for new git calls,
  same discipline as `structure.internal_symbol_added`.
- `recent_commit_count`'s cost is genuinely free: the underlying `git log` call was
  already being made and its full output already parsed; only the return value was
  incomplete before.
- Both new `historical_risk` claims reuse `_days_between`'s sibling pattern rather
  than inventing a new mechanism — `rapid_iteration` is structurally
  `long_dormant_reactivated` with the threshold direction and magnitude flipped.
- `expected_co_change_partner_missing` checks *any* strong partner, not just index 0
  (`co_change[0]`, which existing `high_historical_coupling` alone checks) — a
  commit can have multiple historically-strong partners, and checking only the
  single strongest would under-report.

Trade-offs:
- All four thresholds introduced here (`RAPID_ITERATION_HOURS=1`,
  `RECENT_CHURN_THRESHOLD=5`, and reuse of `HIGH_COUPLING_THRESHOLD=10`/
  `recent_window_days=30`) are fixed defaults, not validated tuning — the same
  honesty already applied to every threshold in this reasoning layer.
- `expected_co_change_partner_missing` cannot know *why* a partner is absent — a
  deliberate, correct decision to leave one file out is indistinguishable from a
  genuine oversight. The claim states only that the historical pattern didn't hold,
  never that something is wrong.
- `recent_commit_count` (and therefore `high_recent_churn`) inherits
  `get_file_history`'s existing, already-documented `--follow` gap: a renamed file's
  recent history resets to zero at the rename boundary, same as `total_commit_count`
  already does.
- Author familiarity and ownership concentration — judged the two highest-value
  remaining candidates in the first-principles review — are deliberately deferred,
  not built here; they require new per-file author extraction this milestone does
  not add.

Verified against real data in `pallets/click`: `history.rapid_iteration` and
`history.high_recent_churn` both fired correctly on `src/click/core.py` at a real
commit (`c040135a`) sitting inside a genuine ~28-minute-apart commit cluster with 15
touches in the preceding 30 days; `reach.expected_co_change_partner_missing` fired
correctly on a real commit (`3495fba1`) that changed `core.py` without its
27-historical-count partner `CHANGES.rst`, and correctly did **not** fire on a
different real commit (`82f377c`) that changed `core.py` alongside all of its strong
historical partners (`CHANGES.rst`, `tests/test_options.py`) together — confirming
both the positive and negative case on real, not hand-constructed, data.

Revisit When:
If real data shows `expected_co_change_partner_missing` firing so often that it's
noise rather than signal (e.g., in repos where co-change patterns are weak or
inconsistent), consider raising its threshold independently of
`HIGH_COUPLING_THRESHOLD` rather than continuing to share it. If author familiarity
or ownership concentration are prioritized next, they will need a new `GitClient`
extraction (per-file author history) not present in this ADR.

ADR-010

Title:
Milestone 8.5C (Author Familiarity) — the final deterministic capability before
Milestone 9 — extends `GitClient.get_file_history`'s existing single git call with
an author-scoped enrichment, adds one fact-not-interpretation claim to
`historical_risk`, requires zero Evidence Fusion changes, and closes the one
candidate ADR-009's first-principles review named as highest-value but left unbuilt.

Status:
Accepted

Context:
ADR-009 named author familiarity — "has this specific author touched this file
before?" — as one of two candidates judged highest-value in its first-principles
review, deliberately left unbuilt pending real justification rather than built on
priors alone. A later architectural-ceiling review, run independently against a
strict five-condition test (asked by senior reviewers, deterministic, unanswerable
from existing evidence, materially improves review quality, requires no new
architectural concept), confirmed author familiarity is the one remaining candidate
that clears all five — the only question in the entire reviewer-workflow review with
a "who," not "what," axis. This ADR builds exactly that one question, framed
narrowly: "has the author of this commit worked on this file before?" — not
ownership concentration, not repo-wide contributor standing, not recency-of-last-
touch, not anything requiring similarity or identity-normalization judgment.

Decision:
`GitClient.get_file_history`'s existing git log call gains one more `\x1f`-delimited
format field (`%ae`, the commit author's email, alongside the existing `%ad`) — the
same call already being made, still exactly one subprocess call. The method gains an
optional `author_email=None` parameter: omitted, every existing field and caller is
byte-for-byte unaffected; provided, the returned dict gains two more keys —
`author_commit_count` (commits to this file, strictly before this one, whose author
email exactly equals `author_email`) and `is_first_touch_by_author`
(`author_commit_count == 0`) — mirroring the existing `total_commit_count`/
`is_first_appearance` relationship exactly. Matching is plain Python string
equality on git's raw output, deliberately not git's own `--author=<pattern>` flag,
which matches by regex — email addresses routinely contain regex metacharacters
(`.`, `+`) that would silently produce false matches under that flag.

`DatasetCollector._build_commit_file_history` gains a `metadata` parameter and
passes `metadata["author"]["email"]` through as `author_email` — the project's
first builder method depending on two upstream builders' output (`change_set` and
`metadata`) rather than one, named explicitly here rather than left implicit.

Evidence Fusion requires no code change. `_resolve_per_file_section(evidence,
"file_history", file_path)` already returns the entire per-file `file_history` value
verbatim, with no knowledge of which keys it contains — the two new fields ride
through automatically the moment `GitClient` starts producing them.

`historical_risk.py` gains one claim: `history.first_author_touch`, firing when
`is_first_touch_by_author == True` and `is_first_appearance == False` — the file
has real prior history, just not from this author; a brand-new file's trivially-true
first-touch-by-everyone is deliberately excluded by the second condition. No new
`CONSUMES` (the module already declares `file_history`; the author comparison
happened during extraction, not reasoning, so this claim doesn't even need
`metadata`, unlike the module's existing dormancy/rapid-iteration claims). No new
gap type — the existing `cannot_assess_history` gap already covers a missing
`file_history` entry; a present-but-author-less entry (a caller that didn't pass
`author_email`) is silently skipped, not gapped, since that's a different situation
from evidence being unavailable.

The claim is named `first_author_touch`, not `unfamiliar_author`, deliberately.
"First touch" is the objective fact this layer can actually observe. "Unfamiliar"
is an interpretation of that fact — it presumes a first touch implies risk, which
is a judgment this deterministic layer has no basis to make on its own (a first
touch could be entirely routine). That interpretation belongs to Milestone 9.

Rationale:
- Extending one existing call is strictly cheaper and more consistent than either
  a new sibling `GitClient` method or a new evidence section — the exact same
  playbook ADR-009 already used for `recent_commit_count`, reused here rather than
  reinvented.
- Folding the two new fields into the *same* `file_history` dict (not a new
  `author_familiarity` section) is what makes the Evidence Fusion change genuinely
  zero, not just small — Fusion's per-file passthrough was already fully generic
  over whatever a section's dict contains.
- Naming the claim after the fact rather than the interpretation keeps this layer's
  discipline intact all the way to the finish line — the same distinction ADR-008
  drew between AST mechanism and reviewer-facing category applies here between
  observable fact and interpretive judgment.

Trade-offs:
- `author_commit_count`/`is_first_touch_by_author` inherit `get_file_history`'s
  existing `--follow` gap exactly: a renamed file's author-specific count resets to
  zero at the rename boundary, same as `total_commit_count`/`recent_commit_count`
  already do.
- Identity is exact-email-match, not person-match. The same real author committing
  as `bob@gmail.com` and `bob@company.com` is read as two unrelated identities, by
  design — no normalization, no case-folding, no judgment call about which emails
  "really" belong to the same person.
- Merge commits and deleted files need no special handling — both already behave
  correctly under the exact same mechanism `total_commit_count` already uses for
  them; this addition doesn't add or remove any merge/deletion handling of its own.
- `_build_commit_file_history` needing two upstream builders' output, not one, is a
  genuine first for this codebase's builder-method shape — small, but real, and
  worth someone noticing next time a builder's dependency graph gets touched.

Verified against four real cases in `pallets/flask`, matching every case this ADR
required: (1) a genuine first-time touch —
`philip.graham.jones@googlemail.com`'s first-ever commit to
`src/flask/templating.py` (`77237093da`) — claim fires. (2) A frequent maintainer —
`davidism@gmail.com`'s 15th touch to the same file (`daca74d93a`, 14 prior commits)
— claim stays silent. (3) A brand-new file — `src/flask/debughelpers.py`'s addition
commit (`ca278a8694`) — `is_first_touch_by_author` computes `true`, but the claim
correctly does not fire, gated by `is_first_appearance`. (4) Alternating-author
exclusion — a real, naturally-occurring history on `src/flask/templating.py`
alternating between `davidism@gmail.com` and `philip.graham.jones@googlemail.com`
confirmed `author_commit_count` computes to exactly the independently hand-counted
value (3, verified directly against raw `git log --format=%ae` output) — no
off-by-one from including the current commit itself.

Revisit When:
If ownership concentration (repo-wide distinct-author counting per file) is ever
prioritized, it needs its own extraction — a different-shaped, cross-file question
from this single-file, single-commit fact, not an extension of this ADR. If
`get_file_history`'s `--follow` gap is ever fixed, `author_commit_count` inherits
the fix automatically, same as every other field derived from the same call.

Final reassessment — is the deterministic layer complete?

Yes. This closes the last architecturally-justified deterministic capability gap.
Every other candidate raised across the full body of evaluation work behind this
ADR and ADR-009 fails at least one of five conditions (asked by a senior reviewer,
deterministic, unanswerable from existing evidence, materially improves review
quality, needs no new architectural concept) — not because the questions aren't
real, but because each one either needs semantic/behavioral judgment (severity of a
fix, cross-file rename/move correlation, "does this look similar"), needs
correspondence/similarity matching this project has declined everywhere it's come
up (site-specific body-event tracking), or is already recoverable from data already
collected without new deterministic machinery (return-type annotations, change
locality — both directly visible in the raw diff patch already on disk).

**Milestone 8.5 is complete. The deterministic layer (Milestones 5A through 8.5C) is
frozen.** Milestone 9 is semantic/LLM reasoning — every remaining reviewer question
this project has identified and not built belongs there, not here.

ADR-011

Title:
Milestone 9 begins with a deterministic Review Context Builder — a new component,
sibling to Evidence Fusion and the Reasoning Layer, that separates raw Input
Sources from a constructed Review Context, owns all summarization decisions
deterministically, and makes traceability enforceable through addressable units
rather than aspirational.

Status:
Accepted (architecture only — not yet implemented, per `PROJECT.md` rule 4)

Context:
With the deterministic layer frozen (ADR-001 through ADR-010), a multi-pass research
effort (`docs/research/milestone9_transition_research.md`, and separately
`docs/research/reviewer_reasoning_model.md` on how human reviewers actually think)
examined where deterministic evidence ends and semantic reasoning must begin, stage
by stage. That research established what should cross the boundary into Milestone 9
— the Reasoning Layer's own Claims and Gaps, plus exactly two raw materials the
deterministic layer has always deliberately left uninterpreted, the commit message
and the diff text — and separately identified two problems that would pass straight
through that boundary unchanged if left unaddressed: `contract_stability` and
`body_evidence` still produce identical claim shapes for a brand-new symbol and a
real change to an existing one (confirmed in 12 of 20 real commits in the last full
evaluation), and the Synthesizer performs zero grouping or deduplication across a
large commit (confirmed producing 335 claims for one real 20-file commit). Neither
is fixed in the deterministic layer itself — both are real, present-tense
properties of the evidence Milestone 9 would otherwise receive unchanged. This ADR
freezes the component responsible for addressing both, without reopening or
expanding the frozen deterministic layer itself.

Decision:
**Input Sources** and **Review Context** are two distinct things, not one object
described two ways. Input Sources are raw and complete: the Reasoning Layer's own
output (`commit_claims`/`file_claims`/`symbol_claims`/`gaps`, exactly as the
Synthesizer produces them, each claim carrying `claim`/`scope`/`confidence`/`basis`,
each gap carrying `reason`/`scope`/`missing`), the commit message
(`metadata.message`), and the diff text (`artifacts/diff.patch`). The Review
Context is the constructed artifact a new component, the **Review Context
Builder**, produces from those Input Sources — the only thing anything downstream
of this ADR ever receives directly.

The `ReviewContext` object has five sections, each with a distinct owner:

1. **Commit Summary** — the commit message, verbatim, plus basic commit-level
   orientation facts (which files changed, added/deleted/modified/renamed).
   Owned by Input Sources; the Builder relays this section unmodified.
2. **Claims** — the Synthesizer's claims, verbatim, already individually
   addressable by their existing `claim` id and `scope`. Owned by the Reasoning
   Layer; the Builder never edits, paraphrases, or drops a claim.
3. **Gaps** — the Synthesizer's gaps, verbatim, addressable by their existing
   `reason` and `scope`. Owned by the Reasoning Layer, same no-edit treatment.
4. **Evidence Units** — the raw diff, split into addressable per-file (and where
   warranted, per-hunk) units, each given a new address (file path plus line
   range — the one genuinely new piece of identity this architecture requires,
   since diff hunks carry none today) and a tag of `full` or `collapsed`. Owned
   by the Builder — the first genuinely new content in the pipeline since the
   Reasoning Layer itself.
5. **Coverage Ledger** — an explicit record of exactly which files were
   collapsed, into what count, and which specific deterministic fact (a
   `change_shape` claim) justified it. Owned by the Builder, and not optional:
   without it, a collapsed file and a file no claim happened to touch would be
   indistinguishable, silently reintroducing the "absence is not evidence of
   absence" failure this project has guarded against at every layer beneath
   this one.

A minimal commit-identity reference travels alongside these five sections for
addressing purposes only — not as evidence. This is consistent with, not a
reopening of, ADR-006's decision to exclude `identity`/`artifacts` from Evidence
Fusion's scope as "bookkeeping, not evidence"; the same exclusion holds here.

**Responsibilities, separated across four layers, precisely so this ADR does not
blur into the ones on either side of it:**
- *Evidence Fusion* (ADR-006, unchanged): expose raw extraction sections as
  `{status, evidence}` envelopes, per commit and per file. No claims, no
  interpretation.
- *Reasoning* (ADR-007, unchanged): consume Fusion's output under an enforced
  `CONSUMES` contract, produce Claims and Gaps, group by scope. No ranking, no
  cross-module weighing, no summarization.
- *Review Context Builder* (this ADR): consume the Reasoning Layer's Claims/Gaps
  plus the two Input Sources. Split the diff into addressable units. Decide,
  using only already-computed claims, which units are shown in full versus
  collapsed. Attach addresses to whatever doesn't already have one. Guarantee
  completeness and reproducibility. Nothing more.
- *Prompt Builder* (ADR-014): consume the finished `ReviewContext` and decide how
  to structure an actual model-facing request. A different layer, frozen
  separately, not designed by this ADR.

**Transformations the Builder is allowed to perform, precisely bounded:**
- *Collapse* — narrowly: only on diff/symbol-level detail, only for a file that
  is both (a) part of a `change_shape.wide_change`/`homogeneous_categories`
  -flagged group and (b) untouched by any risk-bearing claim at all (a public
  contract change, a missing-test claim, `history.first_author_touch`,
  `history.hot_file`, anything from `reach`). Collapsing means one representative
  example plus a count; the representative keeps its own address — collapsing
  reduces volume, never addressability.
- *Reorder* — allowed only for stable, deterministic presentation (a fixed
  canonical sequence, e.g. scope, then path, then claim id), never for
  importance. Reordering by attention-worthiness is triage, and triage belongs to
  the LLM (ADR-012), not this component.
- *Summarize* — the same operation as collapse, under a different name; no other
  form of summarization exists in this component.
- *Annotate* — attaching addresses to material that doesn't have one (diff
  units), tagging each unit full-or-collapsed, and building the Coverage Ledger.
  Metadata about presentation, never about meaning.
- *Enrich* — only as cross-referencing already-existing addressable units to each
  other (e.g., recording which claims touch which diff unit, as a computed
  index) — linking true facts together, never adding a new one. The moment
  "enrichment" would mean inferring something not already stated by a claim, it
  is semantic reasoning and has left this component's authority.

**Must remain untouched, under all circumstances**: claim and gap content in
full; the commit message text (splittable into addressable spans for citation,
never paraphrased); the actual bytes of any diff unit shown in full.

**Prohibited inside the Builder, without exception**: semantic reasoning about
what code does; prioritization or ranking of claims by importance (the collapse
rule is mechanical volume management against fixed criteria, never a judgment
about what matters); generation of any new factual content not already present in
Reasoning's output; interpretation of ambiguous evidence; any responsibility
belonging to Evidence Fusion (re-deriving envelope/status resolution, reaching
into raw extraction beyond the two designated Input Sources); any responsibility
belonging to the Prompt Builder (phrasing, call structuring, model-specific
formatting); modification of any claim's or gap's confidence, scope, or content;
silent dropping of any changed file.

**Invariants guaranteed before handoff to the Prompt Builder**: Traceability
(every claim, gap, and evidence unit carries a stable, unique address);
Completeness (every file in `change_set.changed_files` is accounted for, in full
or in the Coverage Ledger — nothing vanishes silently); Deterministic
reproducibility (identical Synthesizer output, message, and diff always produce a
byte-identical `ReviewContext`, with no randomness and no dependence on wall-clock
or external state); Preservation of evidence (claims and gaps pass through
exactly as Reasoning produced them; only the raw-material half of the object is
ever subject to collapse); Stable ordering (one fixed canonical sequence, applied
consistently, independent of any notion of importance); No duplication (a
collapsed unit's full, discarded material never also appears alongside its
summary); Justified collapse only (every Coverage Ledger entry cites the specific
deterministic fact that justified it).

Rationale:
- Naming this boundary as its own component, rather than leaving "collapse a
  wide/homogeneous file's diff" as an implicit rule with no owner, is what makes
  both summarization and traceability actually enforceable rather than
  aspirational — exactly the same reason Evidence Fusion and the Reasoning Layer
  were each given their own explicit contract rather than left as conventions.
- Requiring the Builder's own summarization logic to stay deterministic — no LLM
  call, no heuristic, no similarity matching — avoids quietly inserting a second,
  unaccountable semantic layer *before* the one Milestone 9 is actually trying to
  design. A summarizing model call would itself need everything Milestone 9
  needs; deferring the judgment to claims the Reasoning Layer already computed,
  rather than a new model call, is not simpler as a matter of taste, it is the
  only version that doesn't need to invent a second boundary problem to solve
  the first one.
- Making every unit addressable is what turns "the LLM may interpret a claim,
  never contradict it" from a hoped-for behavior into something a downstream
  process could actually check — for any conclusion, "which of the four sources
  justifies this" becomes an answerable question, not a matter of trust.

Trade-offs:
- This ADR introduces a new component immediately after a session spent
  explicitly declaring the deterministic layer frozen. It is not a reopening of
  that freeze: the Builder adds no new extraction, no new claim type, no new
  `CONSUMES`/`PRODUCES` on any existing module, and does not touch `GitClient`,
  `DatasetCollector`, or Evidence Fusion's envelope contract. Its entire job is
  preparing the already-frozen layer's existing output for Milestone 9 — the
  doorway to the next milestone, built with the same discipline as the layer
  behind it, not an expansion of that layer's own scope.
- Collapsing a file's diff to one representative example plus a count is lossy
  by construction. The design deliberately never collapses anything a
  risk-bearing claim touches, but a file with no fired claim is not the same as
  a file with nothing worth seeing — it may simply mean no deterministic signal
  happened to fire. This is the same honest limitation named for the
  deterministic layer throughout its own evaluation history, now inherited one
  layer further downstream, which is exactly why the Coverage Ledger is not
  optional.
- Splitting a unified diff into per-file, per-hunk addressable units is real,
  non-trivial work, not designed here — a mechanical, syntactic operation (diff
  format already delimits files and hunks explicitly), but not a free one.
- This ADR freezes the traceability *contract* — that every unit must be
  addressable — not the mechanism that would later check a citation against it.
  That checking mechanism remains undesigned, for whenever implementation of the
  Prompt Builder or beyond makes it necessary.

Revisit When:
If real Milestone 9 output shows the collapse-vs-full-detail rule is too coarse
(a genuinely interesting change hiding inside a commit `change_shape` labeled
homogeneous), tighten the rule using more of the Reasoning Layer's already-computed
claims — not a new heuristic, and not a model call to judge importance. If the
addressable-unit scheme proves insufficient once an actual citation-checking
mechanism is designed, extend it — but keep claims and gaps addressable by what
they already carry, since inventing a second identity scheme for facts that
already have one would be the wrong fix.

---

ADR-012

Title:
Milestone 9's model plays one defended role — triage, not review — governed by a
strict evidence-precedence hierarchy, an explicit decline boundary, a four-term
non-numeric uncertainty vocabulary, a forbidden-behaviors list, and a single
optimization objective: maximize the reviewer's justified trust per unit of their
reading time.

Status:
Accepted (architecture only — not yet implemented, per `PROJECT.md` rule 4)

Context:
With the Review Context frozen (ADR-011), this ADR freezes what the model itself
is responsible for once it receives that object, and how it must behave with
respect to the deterministic evidence inside it — the semantic reasoning layer's
own contract, decided before any prompt engineering begins. It consolidates
research conducted in two passes: a stage-by-stage analysis of where deterministic
evidence supports each of the seven reviewer-cognition stages from
`docs/research/reviewer_reasoning_model.md` versus where semantic reasoning is
irreplaceable, and a second pass defining the model's role, an evidence-precedence
ordering, forbidden behaviors, a decline boundary, an uncertainty vocabulary, and
an optimization objective. Where that research considered alternatives before
converging, this ADR records only the final, agreed position — not the
alternatives along the way.

Decision:
**Role.** The model performs triage: it decides what deserves the reviewer's
attention and in what order. It does not render the review's actual verdict, does
not carry independent authority, and is not modeled as a second, co-equal
reviewer. This is a deliberately narrower role than the alternatives considered
and rejected: not "a second reviewer" (that would imply an accountability and
independent authority the model cannot actually bear, and would invite exactly
the overclaiming the rest of this ADR exists to prevent); not "an evidence
synthesizer" alone (pure synthesis relays facts without ranking them, failing the
one thing established as both most valuable and permanently absent from the
deterministic layer by ADR-007's own design); not "an auditor" or "verifier"
(verifying correctness is closer to formal verification than review, and
overclaims an authority this project has never asserted for itself).

**Reasoning sequence.** The model performs the same seven stages the human
reviewer model describes, in the same order, distinguished by whether the model
is *receiving* already-computed material or *generating* new judgment:

1. Understand — receiving; absorbing the Review Context's structural
   representation, generating nothing.
2. Infer intent — generating; the first real judgment, reconciling the commit
   message against the absorbed structure, flagging any divergence between them.
3. Assess risk — receiving; absorbing the deterministic risk-bearing claims and
   recalibrating attention, without inventing new risk facts. Kept distinct from
   step 1, not merged into it, specifically so that risk signals do not color
   what "understanding the change" means before it has been neutrally read.
4. Generate hypotheses — generating, held strictly apart from step 5.
5. Seek/resolve evidence — generating, but a distinct act from step 4: checking
   each hypothesis against the Review Context's addressable units, marking it
   resolved or unresolved.
6. Form conclusions — generating, held strictly apart from step 7: the verdict is
   reached on resolved evidence alone, before any consideration of tone.
7. Produce review — generating: translating the verdict into calibrated,
   citation-bearing output, per the Review Output Contract (ADR-013).

Steps 4/5 and steps 6/7 are held more rigidly separate here than the human
reviewer model itself observes humans doing — a deliberate, defended divergence,
not an oversight. Human reviewers interleave hypothesis-generation and
evidence-seeking because their internal verification is cheap, fast, and
reliable. A model's verification is a categorically riskier act: checking a
generated hypothesis against actual evidence is precisely the mechanism that
prevents a plausible-sounding but unverified theory from being reported as
settled fact, and fusing the two steps removes that checkpoint. The same logic
applies in mirror to 6/7: collapsing verdict-formation and phrasing risks a real
concern being softened by tone pressure at the moment it is formed, rather than
after.

**Precedence hierarchy**, applied whenever sources appear to disagree, ordered by
one principle — trust in inverse proportion to how much interpretation was
required to produce it:
1. Deterministic claims and gaps, highest, sub-ordered by their own confidence
   tier (`observed`/`corroborated` outrank `inferred`); a `conflicting` claim
   must be surfaced as a conflict, never resolved toward one side by the model.
2. The raw diff/code text, authoritative only for what claims and gaps do not
   cover. If the model believes it sees something in the diff that contradicts a
   claim, the claim wins — the claim was computed mechanically over the same
   underlying data the model is now re-reading fallibly by eye.
3. The commit message, authoritative only as a record of what the author
   believes or claims, never as a statement of fact about what the code does. If
   message and diff disagree, the diff wins for "what happened," and the
   disagreement itself becomes reportable evidence, not something to resolve
   silently in either direction.
4. The model's own inference, lowest, always subordinate to the three above. It
   may synthesize and interpret them; it may never overrule them.

**Decline boundary.** A conclusion is reasonable inference if it can be
reconstructed by pointing only at what is inside the Review Context. It becomes
unsupported speculation the moment it requires assuming something not present —
about the rest of the codebase, the team's practices, the runtime, or "what
usually happens" in situations that merely resemble this one. If a deterministic
Gap already exists for the exact thing being reasoned about, the model must
decline outright, not substitute its own guess for a gap the deterministic layer
already, explicitly, named as unknown.

**Uncertainty vocabulary.** Four terms, each mapping to a distinct epistemic
state and a distinct reviewer action; no numeric scores, ever:
- *Confirmed* — directly grounded in a deterministic claim, or a plain
  restatement of what the diff or message literally says.
- *Likely* — the model's own inference, grounded in cited evidence, but not
  something the deterministic layer itself verified.
- *Worth checking* — a hypothesis that has not been resolved either way; tells
  the reviewer what to go look at, rather than asserting an answer.
- *Unknown* — cannot be determined from the Review Context at all, whether
  because a deterministic gap exists or the question falls outside scope.

Numeric confidence scores are rejected deliberately: a number implies a
calibration guarantee that cannot actually be validated, and gives the reviewer
nothing to *do* with it, where a named term maps directly onto an action — trust
it, weigh it, go check it, or expect no answer.

**Forbidden behaviors**: never assert a fact about what changed that is not
grounded in a claim, a gap, the diff, or the message; never contradict a
deterministic claim's factual content; never present the model's own conclusions
in the reserved `observed`/`corroborated`/`inferred`/`conflicting` vocabulary;
never silently drop a gap or treat an unresolved question as settled; never widen
a claim's scope beyond what it actually covers; never treat the absence of a
claim, or a file the Review Context Builder collapsed, as proof of safety; never
reason about anything outside the given Review Context.

**Optimization objective.** Maximize the reviewer's justified trust per unit of
their reading time. "Justified" carries the calibration and traceability
requirements above — trust that is not checkable, or that overclaims what the
evidence supports, does not count no matter how confident it sounds. "Per unit of
reading time" carries the prioritization requirement — content that does not
build justified trust efficiently is a cost, whether it is noise, redundancy, or
excessive hedging. This single objective is deliberately chosen over the
alternatives considered: not "estimate risk" (already the deterministic layer's
best-covered ground since Milestones 8, 8.5B, and 8.5C — making it the model's
primary job would duplicate existing, validated work); not "assess correctness"
(overclaims exactly the authority this ADR's own invariants exist to prevent, and
verifying code is correct is closer to formal verification than to review); not
"infer intent" (a means to the objective, not the objective itself — it matters
only insofar as it helps decide what deserves scrutiny). Optimizing for justified
trust per unit of reading time is also what ADR-007's own permanent refusal to
rank or resolve cross-module conflicts was always pointing toward: turning many
independently-true, unranked facts into "here is what to look at first, and why"
is exactly the act that refusal was drawn in front of.

Rationale:
- Triage is the only role of the four considered that matches both what the
  deterministic layer already does well (produce many independently-true facts)
  and what it explicitly, permanently refuses to do (rank them) — the model's
  role is defined by exactly the gap the deterministic layer leaves open, not by
  ambition beyond it.
- The precedence hierarchy is not a matter of preference: it is the same
  discipline every prior ADR has already applied to itself, generalized —
  mechanically-computed facts outrank raw text, raw text outranks a human's
  self-report, and a self-report outranks a live, ungrounded guess.
- A four-term, human-readable vocabulary was chosen over a numeric one because
  this project has consistently rejected false precision everywhere it has come
  up (fixed thresholds documented as unvalidated defaults, confidence tiers
  reserved for genuine source-agreement) — a number here would be the same
  mistake in a new location.

Trade-offs:
- The decline boundary means some genuinely useful hunches will be withheld
  rather than offered, whenever they cannot be reconstructed from the Review
  Context alone. This is a deliberate cost, accepted in favor of never asserting
  what cannot be verified.
- Holding steps 4/5 and 6/7 more rigidly separate than the human model itself
  observes is a deliberate divergence from how experienced human reviewers
  actually work, not an oversight — defended precisely because a model's
  failure modes (hallucinated hypotheses reported as fact, verdicts softened by
  tone pressure) differ from a human's, where the equivalent shortcuts are safe.
- This ADR fixes the *contract* the model must satisfy; it does not fix how any
  particular model will be instructed to satisfy it, or verified to have done
  so. That is the Prompt Builder's concern (ADR-014), not this one's.

Revisit When:
If real Milestone 9 output shows the decline boundary is calibrated too
conservatively (declining things a reviewer would consider obvious) or too
permissively (speculating past what the evidence actually supports), recalibrate
against real transcripts, matching this project's whole practice of validating
against real data before adjusting a threshold — never against intuition alone.

---

ADR-013

Title:
Every Milestone 9 review follows one five-section format, ordered by cost of
missing each point rather than by file or claim order, read as a prioritized
reviewer assistant rather than an analytical report or a checklist.

Status:
Accepted (architecture only — not yet implemented, per `PROJECT.md` rule 4)

Context:
With the model's reasoning contract frozen (ADR-012), this ADR freezes the
structure of what is actually presented to the human reviewer once that
reasoning is complete — the Review Output Contract, decided before any prompt
engineering or presentation work begins.

Decision:
**Section order.** Five sections, ordered so that priority — the optimization
objective from ADR-012 — is embodied by position, not only by content:
1. **Verdict** — a short, calibrated headline of overall attention-worthiness and
   the one-line reason for it.
2. **What changed and why** — a compressed synthesis of structure and inferred
   intent, including any divergence between the two.
3. **What deserves attention, ranked** — the substantive core, ordered by cost of
   missing it, never by file order or claim order.
4. **Open questions** — unresolved hypotheses and relevant gaps, named
   explicitly rather than omitted.
5. **Minor notes** — nits and style points, clearly separated from anything
   blocking.

Verdict-first serves a time-constrained reader directly, but carries a named
risk: presenting a verdict before the reasoning can anchor a reviewer into
premature agreement. The resolution is not to move the verdict later — that
trades away the efficiency it exists to provide — but that the verdict must
never be phrased with more finality than a first-pass triage warrants. It is a
prioritization signal, not an adjudication.

**Content per section.** *Verdict*: attention-worthiness and why, in one or two
sentences — not a claim inventory, not certainty beyond what is grounded, not
style detail. *What changed and why*: structural summary plus inferred intent and
any divergence flag — not line-by-line detail, not raw diff text reproduced
wholesale. *What deserves attention*: each point self-contained — the concern,
what it traces to, why it matters — ordered by priority; not anything ungrounded,
and not the same underlying pattern restated across many symbols when it is
really one thing happening many times (recognizing that and saying so once is a
legitimate act of the model's own judgment, distinct from the Review Context
Builder's purely mechanical collapsing in ADR-011, since it requires judging that
the instances are the *same concern*, not merely structurally similar). *Open
questions*: each named as "this is unresolved, and here is what would resolve
it" — never manufactured uncertainty about things that are actually settled.
*Minor notes*: genuinely non-blocking only — never where a real concern quietly
gets downgraded.

**What must never appear, even if available**: the deterministic layer's internal
vocabulary (claim ids, confidence-tier names, module names, thresholds) surfaced
as visible jargon — it is the citation underneath a sentence, never the sentence
itself; anything without a traceability anchor, excluded outright rather than
softened with a hedge; fabricated certainty about anything not actually verified;
the same fact repeated across sections; and anything already excluded from the
model's input under ADR-011/ADR-012 (raw AST, fusion envelopes, thresholds) —
that exclusion is not re-decided at the output end of the pipeline.

**What makes a review genuinely useful — three principles, not a checklist:**
- *Ordered by cost of missing it, not by where it occurs.* The load-bearing
  principle; the others largely follow from it — a correctly-ordered review is
  skimmable within a fixed time budget by construction, since a reviewer who
  stops early still caught what mattered most.
- *Every point of importance is checkable, not just asserted.* A reviewer trusts,
  and can act on, a claim verifiable in ten seconds against its citation far more
  than one requiring independent re-derivation.
- *Silence about the unknown is a defect, not a virtue.* A review that hides what
  it could not determine looks more complete and is actually more dangerous.

**Presenting deterministic evidence alongside semantic reasoning.** Woven into
single sentences, never as two separate dumps — the factual clause carries the
deterministic grounding, the interpretive clause carries what it means (for
example: "this function's public signature changed with no accompanying test
update — since it's a public API, callers may break silently if they're not
updated too"). The distinction survives in phrasing, not markup:
deterministic-grounded statements are stated plainly, since they are already
verified; the model's own judgment carries the hedging language from ADR-012's
uncertainty vocabulary, since it should. The degree of hedging becomes the
implicit signal of what is citable ground truth versus the model's own read,
without breaking every sentence into two registers a reader has to
context-switch between.

**Tone.** Collaborative and calibrated — informational phrasing, explaining why
and not only what, per the human-reviewer conventions researched in
`docs/research/reviewer_reasoning_model.md` — but pitched at a distinctly lower
register of authority than a senior human reviewer would use: a well-prepared
peer presenting findings for someone else's judgment, not an authority handing
down a verdict. This follows directly from the role and objective fixed in
ADR-012, not from generic politeness — the model's actual epistemic position is
narrower than a senior human's, and the tone must reflect that honestly. Tone
must not overcorrect into uniform hedging either: qualifying every line adds
reviewer effort extracting the actual point, so hedging is reserved for what is
genuinely uncertain, never applied as a defensive tic throughout.

**Philosophy.** The review reads as a **prioritized reviewer assistant** —
explicitly not an analytical report, and not a checklist. A report optimizes for
the completeness and defensibility of the document itself, exactly the failure
mode this project has measured as harmful (335 claims for one real commit,
presented flat); an assistant optimizes for the reader's next action. A
checklist implies uniform, undifferentiated items to tick off, with no natural
place for the single most important principle above — ordering by cost of
missing it, which would put a public-API break and a style nit on equal footing.
"Reviewer assistant" is not a tone preference; it is the structural consequence
of the role (ADR-012), the section order above, and the tone above all pointing
at the same shape.

Rationale:
- Verdict-first, cost-ordered substance, and reserved hedging are not three
  independent stylistic choices; they are the same optimization objective from
  ADR-012 — justified trust per unit of reading time — applied to the specific
  problem of laying out a document.
- Weaving deterministic evidence into semantic prose rather than presenting two
  separate blocks is what keeps the Review Output Contract compatible with the
  traceability invariant from ADR-011/ADR-012 without needing visible citation
  markup on every sentence — the hedging register itself carries that signal.

Trade-offs:
- Collapsing a repeated pattern into "this happens N times" at the model's own
  discretion (as opposed to the Review Context Builder's mechanical collapsing)
  reintroduces a small amount of judgment into what is otherwise a mechanically
  defined format — accepted because the alternative (repeating the same
  point verbatim per instance) actively works against the cost-ordering
  principle this ADR treats as load-bearing.
- A tone calibrated to underclaim authority risks reading as less confident than
  a senior human reviewer's own comments would, in cases where the model's
  conclusion happens to be well-supported. This is accepted as the correct
  default given this project's consistent preference for honest calibration
  over persuasive confidence.

Revisit When:
If real Milestone 9 output shows the five-section format itself needs
adjustment — a section proves consistently empty, or a genuinely important kind
of content has nowhere to go — revise the format itself rather than stretching
an existing section to hold content it was not designed for.

---

ADR-014

Title:
The Prompt Builder guarantees only that a model receives the complete Review
Context and the frozen system contract faithfully — never model compliance or
output quality — under a strict system/user separation and an explicit prompt
transparency invariant.

Status:
Accepted (architecture only — not yet implemented, per `PROJECT.md` rule 4)

Context:
With the Review Context (ADR-011), the model's reasoning contract (ADR-012), and
the Review Output Contract (ADR-013) all frozen, this ADR freezes the last piece
of architecture before implementation begins: what any future Prompt Builder,
regardless of which model family it addresses, must guarantee. It deliberately
stops short of prompt wording, API design, or any specific provider — those
remain implementation, not architecture.

Decision:
**Prompt Content** (what information must appear) and **Prompt Builder
Responsibilities** (what the Builder does with it) are treated as distinct
sections, since conflating "what must be said" with "who is responsible for
saying it correctly" is exactly the kind of blur this project's layering has
avoided everywhere else.

**Prompt Content.**
- *System content* — everything invariant across every review, regardless of
  which commit is under review: the model's role (ADR-012), the precedence
  hierarchy, the forbidden-behaviors list, the decline boundary, the uncertainty
  vocabulary, the optimization objective, and the five-section output structure
  (ADR-013). None of this varies by commit; anything that does not vary belongs
  here on that basis alone.
- *User content* — the specific `ReviewContext` (ADR-011) for the commit
  actually under review: Commit Summary, Claims, Gaps, Evidence Units, Coverage
  Ledger. Different every time, and carrying nothing that also belongs in
  system content.
- *Embedded verbatim*: Claims and Gaps in full, exactly as Reasoning produced
  them; the commit message, verbatim; every Evidence Unit tagged `full`, at its
  actual bytes.
- *Referenced only*: the Coverage Ledger's collapsed entries — citing the fact
  ("N files matched this shape, see claim X") rather than re-expanding
  collapsed material back into full detail, which would silently undo ADR-011's
  entire reason for collapsing it.
- *Forbidden instruction categories*, because each manufactures false confidence
  or reopens something already ruled out upstream: thoroughness demanded
  without a grounding constraint attached; any request for a numeric confidence
  figure, which would silently override ADR-012's frozen uncertainty vocabulary;
  persona-inflation ("you are a senior engineer with decades of experience"),
  which measurably pushes toward more confident-sounding assertions than the
  underlying grounding supports; any instruction to assume something not present
  in the Review Context; any instruction pressuring decisiveness over honesty
  ("always give a clear answer"); and "be concise" issued without also
  preserving the requirement that every point still carry its citation.

**Prompt Builder Responsibilities.**
- Structure what is presented: the system/user split, and the mapping of
  `ReviewContext` sections into the request. Decide nothing about what is true;
  reason about nothing.
- **The Prompt Builder guarantees only that the model receives the complete
  Review Context and the frozen system contract faithfully. It does not
  guarantee model compliance or output quality.** This is a deliberate,
  load-bearing boundary, not an omission: whether a model, once correctly and
  completely given everything above, actually behaves as instructed is a
  separate question this ADR does not and cannot answer on the Prompt Builder's
  behalf.
- **Prompt Transparency.** The Prompt Builder must never inject hidden,
  review-specific instructions or logic outside the frozen system contract.
  Everything a model receives is either the standing system content defined
  above, known and auditable in advance, or the `ReviewContext` data itself —
  nothing else, and no per-commit steering slipped in beyond those two.
  Model-agnosticism (below) guarantees the *same* rules apply to every model;
  this invariant separately guarantees there are no *other* rules beyond what is
  frozen and declared — a hidden per-commit instruction could apply uniformly
  across every model and still violate a fixed, auditable contract, which is why
  it needs its own invariant rather than being treated as covered by
  model-agnosticism alone.

**Minimum contract every Prompt Builder implementation must satisfy**: faithful
transmission of the full `ReviewContext`, with an accurate reference for anything
ADR-011 collapsed; preservation of the system/user separation; no alteration of
any claim's or gap's content; inclusion of the complete set of ADR-012's frozen
constraints, every time, never trimmed to save space; a request structured so
that, if followed, the output satisfies ADR-013's five-section contract; and
deterministic construction — the same `ReviewContext` always produces the same
prompt structure, mirroring ADR-011's own reproducibility invariant one layer
further along.

**Responsibility split.** The Prompt Builder structures what is presented; the
model reasons over what is presented. A Prompt Builder failure is about whether
the right information arrived correctly; a model's failure is about what it did
with information that arrived correctly.

**Invariants that must hold regardless of model family**: the precedence order
must be reflected in structure, not left to a given model's own tendency to
weigh recency or position; traceability must remain achievable for any compliant
model, independent of that model's particular citation habits; the four-term
uncertainty vocabulary is the same for every model, never adapted or replaced
with a numeric variant for any provider; the forbidden-behaviors list applies
uniformly, with no relaxed version for any model; the five-section output target
is the same for every model, never restructured per provider.

**Prompt Builder bug versus model mistake — one diagnostic test**: was
everything required present, correct, and complete in what was actually sent? If
no — a claim was dropped, an address was missing, the system/user split was
violated, a frozen constraint was left out, content was altered in transmission
— that is a **Prompt Builder bug**, regardless of what the model then produced.
If yes — everything required was faithfully and completely delivered — and the
model still contradicts a claim it was correctly given, cites an address that
does not exist, expresses more certainty than the uncertainty vocabulary allows,
or reasons about something outside the `ReviewContext` it received, that is a
**model mistake**.

**Assumptions the Prompt Builder must never make about model capability**:
unlimited context (truncation, if unavoidable, must be an explicit,
Coverage-Ledger-style record, never a silent drop); that instruction alone
guarantees compliance (a correctly constructed prompt can still be followed
incorrectly — that risk is exactly what the bug-versus-mistake test exists to
diagnose, not eliminate in advance); that the model has any knowledge of the
codebase, language, or team conventions beyond what the `ReviewContext` itself
contains; that a specific structured-output or citation mechanism is available
(the contract must be achievable in plain, model-agnostic terms); that a model's
self-reported certainty is calibrated or meaningful beyond the four terms this
project has already defined; and that the model's *output* is deterministic,
even though the Prompt Builder's own *construction* must be.

Rationale:
- Separating Prompt Content from Prompt Builder Responsibilities as distinct
  sections, per explicit design instruction, keeps "what must be said" auditable
  independent of "who said it correctly" — the same kind of separation ADR-011
  already draws between Input Sources and the Review Context, applied one layer
  further along.
- The "guarantees only delivery" refinement makes explicit and permanent what
  the bug-versus-mistake test already implies: stating it as a hard boundary
  prevents a future implementation from quietly assuming it is also responsible
  for the model's actual behavior, which would blur the clean split this ADR and
  ADR-012 both depend on.
- Prompt Transparency closes a gap model-agnosticism does not fully cover on its
  own: model-agnosticism guarantees the same rules for every model; nothing
  about that guarantee rules out a hidden instruction applied identically across
  every model. Only an explicit transparency invariant closes that gap.

Trade-offs:
- Refusing to guarantee model compliance or output quality means this ADR
  cannot, by itself, promise a good review — only a faithfully delivered one.
  This is accepted deliberately: promising more would require asserting
  authority over model behavior this project has never claimed and cannot
  verify.
- The bug-versus-mistake test requires being able to inspect exactly what was
  sent to a model at the moment it was sent — a real operational requirement
  this ADR assumes will exist, without designing it here.

Revisit When:
If a real model family's behavior reveals an invariant above is insufficient —
for instance, a model that cannot represent the four-term uncertainty vocabulary
faithfully under any phrasing — revisit that specific invariant against evidence
from that real behavior, not preemptively; do not weaken model-agnosticism to
accommodate one provider's limitation without a documented, real case forcing
the question.

---

ADR-015

Title:
The LLM Adapter is the sole, model-agnostic boundary between a deterministically
constructed request and the one nondeterministic act in this entire pipeline —
transporting and structurally normalizing whatever results, never interpreting
it, under an explicit three-outcome contract that distinguishes a crossing that
was never validly attempted from one that was attempted and yielded nothing
from one that succeeded.

Status:
Accepted (architecture only — not yet implemented, per `PROJECT.md` rule 4)

Context:
With the Review Context (ADR-011) and the Prompt Builder Contract (ADR-014)
frozen and implemented (Milestones 10A, 10B), and the LLM Reasoning Contract
(ADR-012) and Review Output Contract (ADR-013) frozen as architecture — restated
as fixed instructions inside the Prompt Builder's own system prompt, but not
independently implemented by any component of their own — this ADR freezes the
next boundary in the pipeline: the component that receives the Prompt Builder's
exact output —
`{"system_prompt", "user_prompt"}` — and is the first thing in this entire
project whose job requires an actual model to run. Reached through the same
methodology as every prior Milestone 9/10 decision: one question at a time
(responsibility boundary, input/output contract, failure contract, state
contract), each answered from first principles with alternatives explicitly
rejected, followed by a dedicated adversarial audit before freezing. This ADR
records the final, corrected position — not the intermediate answers or
rejected framings along the way.

Decision:

**Responsibility.** The Adapter's sole responsibility is to carry a
deterministically constructed, model-agnostic request across the one point in
this pipeline where a real, nondeterministic external process must act on it,
and to carry back whatever that process produced — completely, in a stable
representation — without adding to, interpreting, or passing judgment on what
it means. It owns nothing about *why* the request says what it says, and
nothing about *what should be done* with the result once obtained.

It knows nothing of Evidence Fusion, Reasoning, Claims, Gaps, or `ReviewContext`
construction — not by discipline, but structurally: its only input is the
Prompt Builder's output, and it cannot reason about what it was never given.

**The first nondeterministic boundary.** Every layer before the Adapter —
Fusion, Reasoning, `ReviewContextBuilder`, the Prompt Builder — is a pure
function of its declared input: identical input, byte-identical output, always,
by explicit invariant in each of their own ADRs. The Adapter cannot be this,
and is not required to be: its entire reason for existing is to have a real
side effect whose result is not guaranteed reproducible, because it depends on
an external process this project does not control. This is named here
explicitly, not left to be inferred, for the same reason `GitClient` and
`DatasetCollector`'s exception to this project's stateless-module convention is
named rather than left implicit — an unexplained exception to an established
pattern reads as a defect waiting to be "corrected" by someone who does not
know it is deliberate. The exception is precisely bounded: *what* a given
execution produces is outside this project's control; *how* the Adapter
recognizes and represents whatever it produced is not, and remains a
deterministic function of what was actually received, exactly like every other
transformation in this pipeline.

**How it differs from the Prompt Builder.** The Prompt Builder's work ends
before any model is ever involved; it only ever produces text. The Adapter's
entire existence is the act of crossing that exact line.

**How it differs from a future ReviewEngine.** The Adapter has no awareness
that it is part of a larger review workflow. Given an arbitrary
`{"system_prompt", "user_prompt"}` pair unrelated to this project, it would
behave identically — generic and content-agnostic by construction. Whatever
orchestrates the full per-commit flow, and whatever eventually interprets the
model's response against ADR-012/ADR-013, is a different, downstream concern.
This ADR does not name or scope that component; doing so is deferred, not
decided here.

**Input.** Exactly the Prompt Builder's output, `{"system_prompt",
"user_prompt"}` — nothing added: no commit identity, no `ReviewContext`, no
knowledge of which claims or gaps produced this content. Which model or
execution target a given request is addressed to is a configuration concern,
not part of this content contract, and is not decided by this ADR.

**Output.** The model's response content, when one exists, plus an explicit,
structural distinction between a response being present and a response being
absent — represented in one stable, provider-independent form rather than
whatever shape a given execution happens to produce. "Representation" here
means only that a defined, consistent way exists to know what happened and to
retrieve the content if any exists — it does not prescribe a data structure,
API, or format; that remains implementation.

**Response Transparency — the normalization boundary.** The Adapter may
normalize only the representation a response arrives in; it may never
interpret, restructure, or pass judgment on what that response says. This is
ReviewContextBuilder's own philosophy — guarantee structure, never touch
meaning — carried across the one boundary past which structure is all that is
knowable about something this project did not itself produce. The operative
test: a responsibility belongs to the Adapter only if it can be performed by
something that cannot understand a single word of the content in question —
whether that content is the request or the response. Checking a response
against ADR-013's five-section format, extracting a verdict, judging whether an
answer is complete or adequate, deciding a response "violates" any content
rule — all fail this test, because each requires either reading content for
meaning or possessing a content rule as first-class knowledge, neither of which
the Adapter has or is permitted to acquire. This test is deliberately general,
not scoped to any one example, so that no future proposal can move semantic
validation into the Adapter by increments.

Note that this test bounds *interpretive* operations, not all forms of content
alteration: a meaning-blind transformation (truncating, re-encoding lossily,
stripping content) could satisfy "does not require understanding" while still
corrupting what the response actually said. That failure mode is closed by a
separate, independently necessary guarantee below (Content Preservation), not
by Response Transparency alone.

**Presence and absence, defined structurally.** A response is present if an
answer-shaped result exists at all, regardless of its content's substance —
including if that content is minimal. A response is absent if no such result
exists. This distinction must never be influenced by judging the content's
adequacy, completeness, or correctness; doing so would require exactly the
semantic reading Response Transparency forbids. Presence and absence are a
structural fact about whether a result exists, never a verdict on whether it is
good.

**What must always be preserved:** response content, once obtained, exactly
and completely — no summarization, no truncation, no reformatting of the
actual words, the same discipline every earlier layer has held over claims,
gaps, and diff text, now applied to something this project did not itself
produce.

**What may be normalized:** only the representation the response is delivered
in — never the content inside it.

**What must never be invented:** response content standing in for one that was
not actually obtained; explanations, causes, or diagnoses for an absence that
were not actually known; any content shaped by judging what the model
"probably would have said."

**Failure, as an architectural concept, not an implementation mechanism.**
There are two categorically distinct kinds, distinguished by whether the
crossing was ever validly attempted at all — a distinction the contract itself
must express, not only the frequency with which either occurs:
- *Adapter-boundary failure* — the crossing was never validly attempted: the
  Adapter's own input contract was not satisfied, or it could not proceed for
  reasons unrelated to the external process. This exists in the contract for
  completeness, not because it is expected to occur under correct operation —
  the same way Evidence Fusion's `not_collected` envelope state exists without
  implying it fires often in a correctly functioning pipeline. It says nothing
  about the external process, because the external process was never reached.
- *Execution-boundary failure* — a genuine attempt occurred and concluded, but
  no response resulted.
*Success* is the third and only non-failure outcome: a genuine attempt
occurred, concluded, and a response — however it reads — resulted and was
preserved exactly.

Reasons *why* an execution-boundary failure occurred, and whether a given
failure could in principle be resolved by attempting again, are not
architectural distinctions this ADR makes — both require knowledge of
mechanism this ADR deliberately stays above. Whether retries exist at all, and
under what conditions, is a separate, later concern; this contract must be
fully meaningful independent of whether retries are ever added.

**What must survive a failure:** the fact of the failure itself, stated
explicitly. Neither the original request nor a request-identifying reference
needs to be echoed back — the caller already possesses the request it gave the
Adapter, and the Adapter holds no state across calls that would require
re-identifying which request a failure belongs to.

**The state contract.** Five states describe the complete lifecycle of one
exchange crossing this boundary:
1. *Received* — a request satisfying the input contract exists and is now the
   Adapter's responsibility; nothing has been attempted yet.
2. *Attempting* — a genuine attempt to cross into the external process is
   underway; the outcome is not yet known. Not externally observable, but
   structurally necessary: it is what anchors exactly where nondeterminism
   enters, and what allows Adapter-boundary failure to branch *before* this
   point is ever reached, rather than being indistinguishable from a failure
   that occurred after engagement began.
3. *Adapter-boundary failure* (terminal).
4. *Execution-boundary failure* (terminal).
5. *Success* (terminal).

Only the three terminal states are externally observable; *Received* and
*Attempting* are internal to the Adapter's own lifecycle.

Guaranteed transitions: *Received* resolves to either *Adapter-boundary
failure* or *Attempting*; *Attempting* resolves to either *Execution-boundary
failure* or *Success*. Every exchange terminates in exactly one of the three
terminal states — there is no valid path in which none is ever reported.

Forbidden transitions: *Success* to any failure state — the sole, sufficient
expression of "information already obtained must never later be lost or
replaced with an absence," stated once, as a transition rule, not duplicated
as a separate invariant. *Execution-boundary failure* to *Success* — a
response cannot be retroactively discovered once execution has already
concluded as absent; a later response belongs to a new exchange, not a revised
version of this one. *Adapter-boundary failure* to *Attempting* — a crossing
that was never validly attempted cannot retroactively be treated as having
been attempted. *Attempting* to *Received* — an attempt cannot be un-started.

**Invariants guaranteed regardless of provider:**
- *Response Transparency* — the Adapter may normalize the representation a
  response arrives in; it may never interpret, restructure, or judge what the
  response says.
- *Content Preservation* — response content, once obtained, is preserved
  exactly and completely; a guarantee independent of Response Transparency,
  since a meaning-blind operation could satisfy "requires no understanding"
  while still corrupting what was actually said.
- *Explicit Absence* — the state of no response existing must always be
  distinguishable, never silently conflated with any other state.
- *No Fabrication* — absence is never filled with invented content, and no
  invented explanation stands in for an unknown cause.

These four invariants jointly produce provider independence as their
consequence, in service of the model-agnosticism ADR-012 and ADR-014 already
established as a cross-cutting project value — this ADR inherits that
rationale by reference rather than re-deriving it, and does not name provider
independence as a fifth, separately enforced invariant.

**Architectural drift for this component, explicitly named:** the Adapter
inspecting or branching on the content of `system_prompt`/`user_prompt`;
validating or judging a response against any content rule from any ADR;
augmenting a request with instructions beyond what it was given; accumulating
domain state across calls; requiring a commit identity or any other identifying
context beyond the request itself; fabricating a response or an explanation
for its absence; treating an unusual but genuinely obtained response as a
failure; treating a genuine non-occurrence as an empty-but-valid response;
deciding what should happen next as a consequence of success or failure; and a
"partial" or "degraded" terminal state, which would require exactly the
content-adequacy judgment Response Transparency forbids, dressed as a state
rather than a validation rule.

**Explicitly deferred by this ADR, not partially solved:** which model or
execution target a request is addressed to, and how that is configured;
retries, backoff, or any resilience mechanism, and whether execution-boundary
failures are ever distinguished by whether a retry might change the outcome;
the technical means by which absence or presence is actually detected; any
mechanism for inspecting or logging what was actually sent or received;
operational metadata (timing, cost, provider identity) beyond the minimal
presence/absence distinction; and the responsibilities, states, or interface of
whatever succeeds the Adapter.

Rationale:
- Naming the Adapter as the first deliberate exception to this project's
  unbroken determinism discipline is what prevents that exception from being
  mistaken for an oversight, or "corrected" by forcing artificial determinism
  onto an external process this project cannot control.
- Response Transparency is the same structure-not-meaning discipline this
  project has applied at every layer since Evidence Fusion, extended across
  the one boundary where "meaning" now belongs to something else's output
  rather than this project's own reasoning — the same principle, not a new one
  invented for this boundary.
- The two-kind failure taxonomy (Adapter-boundary vs. execution-boundary) is
  what allows "the Adapter itself could not proceed" and "the model was asked
  and produced nothing" to remain distinguishable facts, rather than collapsing
  into one undifferentiated failure that erases information a downstream
  consumer would need.
- The state contract's five states are the minimum that expresses this
  taxonomy structurally: fewer states cannot distinguish a failure that
  preceded engagement from one that followed it; more states (a retry count, a
  partial-success state, cross-call memory) would anticipate milestones this
  ADR deliberately does not solve.
- A dedicated adversarial audit was run against this design before freezing,
  specifically hunting for duplication across ADR-011–015, misplaced
  ownership, unobservable distinctions, indistinguishable states, and
  invariants that restate each other without adding a guarantee. Two
  candidate invariants (a determinism guarantee scoped to the Adapter's own
  logic, and a guarantee against losing already-obtained information) were
  found to be fully subsumed by statements already made elsewhere in this ADR
  once the state contract existed, and were removed rather than kept for
  symmetry with other ADRs' invariant lists.

Trade-offs:
- Refusing to validate a response's content means a response that fails
  ADR-013's format, or contradicts ADR-012's uncertainty vocabulary, still
  counts as a successful Adapter call. This is accepted deliberately: the
  Adapter cannot correctly judge conformance to rules it was never given as
  first-class knowledge, and a wrong judgment would be worse than no judgment
  at all. That responsibility is left entirely to whatever is built with the
  domain knowledge to bear it.
- Adapter-boundary failure may rarely or never be observed in a correctly
  functioning system. This is accepted: the contract must have a defined
  answer for the case regardless of its expected frequency, the same
  reasoning that justifies Evidence Fusion's `not_collected` state existing
  independent of how often it actually fires.
- No operational metadata (timing, cost, provider identity) is part of this
  contract. A real need for observability at this boundary is plausible, but
  designing it now, ahead of any stated requirement, would be exactly the
  feature-maximization this project avoids at every layer.

Revisit When:
If a future ReviewEngine's real requirements show the presence/absence
distinction needs finer granularity than this ADR provides, or that the
deferred metadata this ADR excludes is genuinely necessary, revisit against
that real, demonstrated need — not in anticipation of it. Do not reintroduce a
determinism invariant or a no-regression invariant as independent, named
guarantees if a future reviewer rediscovers them; both are already fully
expressed by this ADR's boundary-scoping statement and its forbidden state
transition, respectively, and restating them separately would reintroduce the
exact redundancy this ADR's own adversarial review removed.

---

ADR-016

Title:
The Review Engine evaluates only what is directly observable in the model's
response artifact — never reconstructing the Review Context, never replaying
the model's reasoning, never certifying correctness — producing independent,
additive findings alongside the unaltered response under a two-outcome
contract (No Artifact / Evaluated), and trusts the Adapter's frozen contract
unconditionally, on architectural grounds independent of any implementation.

Status:
Accepted (architecture only — not yet implemented, per `PROJECT.md` rule 4)

Context:
With the Review Context (ADR-011), the LLM Reasoning Contract (ADR-012), the
Review Output Contract (ADR-013), the Prompt Builder Contract (ADR-014), and
the LLM Adapter Contract (ADR-015) all frozen — and ADR-011, ADR-014, and
ADR-015 implemented (Milestones 10A, 10B, 11A) — this ADR freezes the next
boundary: the component that receives the Adapter's terminal result and
determines what, if anything, can honestly be said about whether the model's
response satisfies ADR-012's reasoning contract and ADR-013's output contract.
Reached through the same one-question-at-a-time methodology as ADR-015,
across eleven questions — responsibility; the information contract, corrected
once to remove a validation-catalogue abstraction leak; the fundamental
outcome, corrected once to demote a true-but-non-owned consequence out of the
invariant list; the state model, corrected twice by elimination-testing every
candidate state rather than assuming symmetry with ADR-015's shape; the unit
of evaluation; the nature and relationships of findings; the composition of
the result; the surviving invariants; a full adversarial audit; and, finally,
the boundary of architectural trust in the Adapter's output, re-derived a
second time after an initial justification was found to depend on today's
implementation rather than on architecture. This ADR records only the final,
corrected position.

Decision:

**Responsibility.** The Review Engine's responsibility is bounded to exactly
one thing: determining, from the response artifact alone, whether it exhibits
properties that are directly observable without comparison data and without
inferring how the model produced it. It owns nothing about *why* the response
says what it says, and nothing about what should ultimately be done with its
own finding.

**The category-1/category-2/3 boundary — the load-bearing distinction.**
ADR-012's obligations on the model split into three kinds. Some are
structurally observable from the response text alone — verifiable with no
comparison data and no inference about how the model produced it — and these
the Review Engine may check; which specific properties of ADR-012/013's
current wording satisfy this test is not part of this contract, and is left
to whatever later derivation applies the test to that text. Some require
inferring the model's internal reasoning process from symptoms in the text
alone — these are not verifiable from the artifact and are not part of this
component's responsibility. Some cannot be verified at all without
re-deriving the model's own conclusions from the original claims, gaps,
diff, and message, and enforcing them would require the Review Engine to
reconstruct the Review Context and replay reasoning, becoming exactly the
independent second reasoner ADR-012 already considered and rejected for the
model itself, relocated rather than avoided. The second and third categories
are **permanent, model-facing-only obligations** — not deferred to some
future component, because no artifact-reading component, now or ever, can
verify them without ceasing to be an artifact reader. This is the single
architectural fact everything else in this ADR is built on top of.

**How it differs from the Prompt Builder.** The Prompt Builder's work is
entirely a construction act, complete before any model is involved, and
never reads anything for compliance. The Review Engine's entire existence is
the reverse-direction judgment act: given what a model produced, checking it
against the very rules the Prompt Builder only ever relayed as instructions.

**How it differs from the LLM Adapter.** The Adapter is content-blind by
design and is this pipeline's one deliberate exception to full determinism,
because it depends on a real external process. The Review Engine is the
deliberate opposite — its reason for existing is to be content-aware,
specifically of ADR-012/013 — and it receives an already-terminal,
immutable fact from the Adapter, so determinism resumes here rather than
extending the Adapter's exception.

**How it differs from whatever eventually consumes the review.** The Review
Engine's output is an interpreted artifact, not a delivered one. Presenting
it to a human — a PR comment, a file, a UI — requires knowledge of a
specific delivery mechanism, a separate, swappable, technology-specific
concern this ADR does not name, scope, or design, for the same reason ADR-015
left model selection to configuration rather than architecture.

**Input.** Exactly the Adapter's terminal result — its `state` and, when
present, its `response` — and nothing else: no `ReviewContext`, no claims,
no gaps, no diff, no commit message, no commit identity. This is enforced
structurally, not by discipline: the Review Engine cannot reconstruct the
Review Context to judge correctness because it is never given the means to,
the same reasoning ADR-015 already applied to the Adapter's own ignorance of
Evidence Fusion, Reasoning, and Claims.

**Output.** The Adapter's own result, preserved completely and without
alteration — including which of its two failure kinds occurred, never
collapsed into one generic "no review" — plus, only when a response existed,
a set of independent findings. Nothing about the concrete representation of
either the outcome or a finding is fixed here; that remains implementation.

**The object of evaluation.** The thing being evaluated is the response —
the text the Adapter delivered — never "the review" (a term that would
presuppose the very status evaluation exists to determine) and never
"compliance" (a category error, since compliance is the *result* of
evaluating something, not a thing evaluated). It is identical to the
Adapter's response, never a new or reconstructed object. Evaluation checks
only observable properties of it, never the object as a whole, and never
consumes or diminishes it — it remains available afterward, complete and
unaltered, for whatever eventually needs it.

**Findings.** A finding is a bounded assertion that one specific, observable
property of the response held or did not hold. Findings are the fundamental
unit this ADR's invariants are stated in terms of, not merely a
descriptive convenience. They are permanently independent of one another:
they may not depend on, invalidate, modify, merge with, or stand hierarchical
to one another, and none may disappear or evolve once established — not as
separate rules, but as the single fact that any such relationship would
either be retroactive alteration (forbidden below) or cross-property
synthesis into something more than a bounded property-check (also forbidden
below), appearing under a different name. The absence of any findings, once
evaluation has occurred, is itself a meaningful, positive fact — that
whatever was checked was not violated — and is never ambiguous with nothing
having been checked at all, since that case is a structurally distinct
outcome (below), not a variant of this one.

**The outcome — additive, never certifying.** Evaluating the response
changes nothing about the world — not the response, not the commit, not the
model's actual reasoning, not the Adapter's own classification. What comes
to exist is a new, bounded piece of knowledge that did not exist before:
whether the response exhibits the properties actually checked. This
knowledge is discovered, not created by fiat, and it is always additive —
it may reveal a violation, but revealing is not weakening; nothing
established before the Review Engine ran is ever altered, retracted, or
downgraded by anything the Review Engine concludes. Passing every check the
Review Engine can perform never becomes a certification that the response
is correct, sound, or trustworthy as a whole — only that it was not
disqualified by anything actually observable. No downstream component may
treat the absence of a flagged violation as evidence that the response's
reasoning is reliable, for the same reason ADR-012 already forbids treating
the absence of a claim as proof that nothing is wrong.

**The state contract.** Exactly two states, both terminal, both reached
directly from the Adapter's result with no intervening state:
1. *No Artifact* — the Adapter reported either of its two failure kinds; no
   response exists; no evaluation is attempted; the Adapter's own failure
   kind is preserved, not collapsed.
2. *Evaluated* — the Adapter reported success; the response is checked
   against whatever properties are actually checkable, producing zero or
   more findings.

There is no state analogous to the Adapter's own *Attempting*: the
evaluation is a deterministic computation over data already fully possessed,
with no external dependency and no genuine interval during which the
outcome is unknown, so no state is needed to anchor where nondeterminism
enters, because none does. There is also no state anchoring "received but
not yet resolved": the totality guarantee — every reception resolves to
exactly one of the two outcomes — is a property of a total function, and
stating it does not require a state-machine node to hang it on, only a
starting point for explanation, which is not the same thing. Both outcomes
are absorbing; neither transitions to the other, and the impossibility is
structural (a single classification reached exactly once, from exactly one
of two mutually exclusive conditions), not merely a rule to be obeyed.

**Architectural trust in the Adapter's contract.** The Review Engine
consumes the Adapter's result without re-validating that it satisfies
ADR-015, and this is an architectural conclusion, not a convenience earned
by any specific implementation. ADR-015 does not describe what some code
happens to do; it defines what it *means* to occupy the Adapter's position
in this architecture. Anything that violates ADR-015 is not a flawed
instance of the Adapter — it is simply not the Adapter, in this
architecture's sense, the way something without three sides is not a
defective triangle. Separation of concerns exists precisely so that each
side of a boundary can treat the other side's frozen contract as the edge
of what it needs to think about; requiring the Review Engine to
re-establish what ADR-015 already guarantees would erase the reason the
boundary exists at all. This must hold independent of whether any
implementation of the Adapter exists yet, the same way ADR-011 was frozen
before `ReviewContextBuilder` existed and ADR-015 was frozen before any
Adapter code existed — architecture has to be decidable before
implementation, or the ordering this entire project follows would be
incoherent. Verifying that a specific piece of code actually satisfies
ADR-015 is a real and necessary activity, but it answers a different
question — whether a given artifact earns the right to occupy the Adapter's
position — not the question this ADR answers, which is what the next layer
is entitled to assume once something legitimately occupies it. Should a
result ever violate ADR-015, that is either an implementation-fidelity
failure belonging entirely to whoever owns the Adapter's correctness, or a
sign that ADR-015 itself requires revision through its own revisit process
— never a condition the Review Engine's own architecture is built to detect
or accommodate.

**Invariants.**
- *Outcome Additivity* — the Review Engine's result, including every
  individual finding, never alters, erases, or retroactively reclassifies
  anything that existed before it ran: not the response text, not the
  Adapter's classification, not an earlier finding.
- *Bounded Authority* — whatever the Review Engine concludes, as a whole or
  as any single finding, carries only the narrow authority that one
  specific observable property held or did not hold — never a holistic,
  aggregated, or certifying claim about the response's overall correctness.

These two are the complete list. Several true statements considered during
this ADR's derivation do not appear here because they either survive the
Review Engine's own removal (meaning they belong to the pipeline's design or
to general properties of deterministic computation, not to this component)
or reduce fully to Outcome Additivity or Bounded Authority restated at finer
grain, adding no independent content — see Rationale.

**Architectural drift, explicitly named:** reconstructing the Review Context
or replaying the model's reasoning to check anything beyond what the
response artifact itself shows; certifying a response as correct, sound, or
trustworthy as a whole; treating passing checks as license to stop
scrutinizing a response further; synthesizing, merging, or ranking findings
into a single verdict; rewriting, replacing, or producing a "corrected"
version of the response; silently discarding a response that was actually
obtained; taking on a specific delivery mechanism as though it were
inherent to this component's own responsibility; validating the Adapter's
result against its own contract before trusting it.

**Explicitly deferred by this ADR, not partially solved:** the concrete
representation of the outcome or of a finding; which specific properties of
ADR-012/013's current text are checkable and how; the responsibilities,
states, or interface of whatever consumes the Review Engine's result.

Rationale:
- The category-1/category-2/3 boundary is the foundation everything else
  rests on: without it, "the Review Engine validates ADR-012" would silently
  expand into full reasoning verification the first time a reasonable-looking
  check was proposed. Naming the boundary as a mechanical test — verifiable
  without comparison data or process inference — rather than a list of
  approved checks is what keeps it from eroding by increments.
- Permanent Incompleteness — that no artifact-reading component can ever
  verify category-2/3 properties — is true and worth stating, but it
  survives the Review Engine's own disappearance: it follows from ADR-012/013
  never requiring an exposed reasoning trace, combined with the
  no-reconstruction principle this pipeline already applies. It is recorded
  here as inherited rationale, not as a Review Engine invariant, the same
  treatment ADR-015 gave Provider Independence relative to its own four
  invariants.
- Evaluation Portability — that two independent evaluators checking the same
  response against the same rules would agree — was considered and dropped
  entirely, not merely demoted. It reduces to nothing beyond "the evaluation
  is deterministic," already stated; naming it separately would restate a
  definition rather than add content.
- Finding Independence was considered as a candidate third invariant and
  found to be fully derivable from Bounded Authority (no cross-property
  synthesis) and Outcome Additivity (no retroactive change) applied one
  level of granularity down. It does not appear as its own invariant for the
  same reason a determinism invariant and a no-regression invariant were
  removed from ADR-015 during its own adversarial review: restating an
  existing guarantee under a new name is not a new guarantee.
- The two-state model was reached by elimination, not assumption. An
  initial proposal modeled four terminal outcomes, splitting both the
  no-artifact case and the evaluated case by sub-reason; both splits
  collapsed once it was clear the sub-reasons were data carried through a
  single process, not evidence of a second, distinct process occurring. A
  `Received` state, carried over from ADR-015's shape by habit, was then
  independently tested and also removed: unlike ADR-015's `Attempting`, it
  anchored no real-world, externally consequential action, and the totality
  guarantee it seemed to require turned out to need only a starting point
  for explanation, not a genuine state.
- Trusting the Adapter's output without re-validation was first justified
  by appeal to Milestone 11A's own verified implementation — a justification
  this ADR deliberately does not keep, because it would make ADR-016 true
  only contingent on today's code. Re-derived on the definition of what a
  frozen contract is and what separation of concerns means, the conclusion
  is unchanged but no longer depends on any implementation existing at all.

Trade-offs:
- Bounding the Review Engine to category-1 properties means a response can
  pass every check this component performs while still failing to actually
  reason soundly about the commit. This is accepted deliberately: the
  alternative is a second reasoner duplicating and second-guessing the
  model's own role, which ADR-012 already rejected once and this ADR
  declines to reintroduce one layer downstream.
- Unconditional trust in the Adapter's contract means a hypothetical
  ADR-015 violation would propagate through the Review Engine unnoticed by
  it. This is accepted because no amount of downstream re-validation
  compensates for an upstream contract or its verification actually being
  wrong, and building for that possibility would duplicate a guarantee that
  already exists elsewhere rather than adding real coverage.
- Findings carry no ordering, merging, or hierarchy, which means whatever
  consumes them receives an unranked set rather than a prioritized list.
  This is accepted as the direct consequence of triage being the model's
  role, not this component's, per ADR-012.

Revisit When:
If a future consumer of the Review Engine's result demonstrates a genuine
need this ADR's deferred scope excludes — a concrete representation
requirement, or evidence that unconditional trust in the Adapter's contract
has produced a real, observed problem — revisit against that demonstrated
need, not in anticipation of it. Do not reintroduce Permanent Incompleteness,
Evaluation Portability, or Finding Independence as separately named
invariants if a future reviewer rediscovers them; each is already fully
accounted for, either as inherited rationale or as a restatement of Outcome
Additivity or Bounded Authority, and naming them again would reintroduce the
exact redundancy this ADR's own derivation removed.

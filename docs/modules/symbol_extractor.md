# symbol_extractor

`src/semantic/python/symbol_extractor.py`

**Status: all 6 stages complete (Milestone 6, ADR-005).** Called from
`DatasetCollector._build_commit_semantic_analysis` and validated against real commits
in `pallets/flask` and `tcx_nogrunt-1` (see `docs/modules/dataset_collector.md` and
`docs/MILESTONES.md` for the real-world validation detail, including a non-trivial
rename). Not yet wired into `collect()` — see those docs for what remains.

## Purpose

Extract deterministic, symbol-level semantic facts from Python source — which
functions/classes/methods changed, whether their signature/decorators/docstring
changed — without any reasoning, scoring, or impact prediction. Built for Milestone 6,
architecturally parallel to (not a replacement for) Milestone 5A's git-only `context`
evidence. Deliberately Python-only; language-specific by design, unlike everything
under `src/utils/`.

## Public API

- `extract_symbol_semantics(old_source, new_source, file_path) -> dict` — the module's
  only public function. Assembles the symbol-table diff and import diff behind one
  call, plus honest degradation when a source fails to parse:

  ```
  {
    "file_path": ...,
    "old_path": None,               # always None from this function — see note below
    "change_type": "added" | "deleted" | "modified",
    "parseable": true | false,
    "imports": {"added": [...], "removed": [...]} | None,
    "symbols": [...] | None,
  }
  ```

  `change_type` is inferred purely from which of `old_source`/`new_source` is `None` —
  `added` (no old), `deleted` (no new), otherwise `modified`. **This function cannot
  detect a rename** — it has no access to git identity, only two source strings. A
  renamed file, diffed here, looks exactly like a `modified` file. Recognizing a rename
  and setting `old_path` is `DatasetCollector`'s job (Stage 5): it knows the old and new
  paths from `change_set.renamed_files` and must override `change_type` to `"renamed"`
  and set `old_path` on the returned dict itself — this module deliberately does not
  guess at git-level facts it can't see.

  If either present source fails to parse (`SyntaxError`), `parseable` is `false` and
  `imports`/`symbols` are both `null` — `change_type` is still reported, since that much
  is knowable regardless of whether the content parses.

## Responsibilities

- `_build_symbol_table(source)` — parses one Python source string into an AST and
  walks it into a flat table keyed by qualified name (`"Foo.bar"` for a method,
  `"baz"` for a top-level function, `"Foo.bar.helper"` for a function nested inside a
  method). For each symbol, records:
  - `symbol_type`: `function` / `async_function` / `method` / `async_method` / `class`
  - `enclosing_scope`: the dotted parent scope, or `None` at module level
  - `visibility`: `public` / `private` (leading-underscore convention; dunder methods
    like `__init__` are treated as `public`, not `private`)
  - `signature`: the parameter list as source text (via `ast.unparse(node.args)`), or
    `None` for classes
  - `decorators`: list of decorator source text
  - `docstring`: via `ast.get_docstring`, or `None`

- `_diff_symbol_tables(old_table, new_table) -> list[dict]` — compares two symbol
  tables by qualified name. Emits one entry per symbol that is `added`, `removed`, or
  genuinely `modified` (differs in signature, decorators, or docstring); a symbol
  present and identical on both sides is omitted entirely, matching `change_set`'s own
  discipline of only reporting what changed.
- `_diff_imports(old_source, new_source) -> dict` — diffs `import`/`from ... import`
  statements at per-imported-name granularity (not whole-statement text), so reordering
  names within one `from X import a, b` line is correctly not flagged as a change.
  Walks the entire tree (`ast.walk`), not just module-level statements, so imports
  nested inside functions are still found.

Never this module's job, per ADR-005: fetching source from git or calling this from
`DatasetCollector` (Stage 5), symbol rename detection, call-graph resolution,
cross-commit history, or `__all__`-based visibility.

## Internal Workflow

Recursion (`_walk`) is generic over `ast.iter_child_nodes`, not a fixed list of
statement types — it recurses into every child node, and reacts only when it meets a
`ClassDef`/`FunctionDef`/`AsyncFunctionDef`. This means functions or classes nested
inside `if`/`try`/`for`/`with` blocks are still found; the recursion never has to be
taught about a new compound-statement type. Whether a `FunctionDef`/`AsyncFunctionDef`
is classified `method` vs `function` depends only on whether its *immediate* enclosing
scope (top of the current scope stack) is a class — a nested function defined inside a
method is `function`, not `method`.

Two same-named symbols defined in mutually exclusive branches (e.g. an `if`/`else`
both defining `def conditional()`) collapse into a single table entry — whichever is
walked last wins. This is a known, accepted trade-off (see ADR-005's Trade-offs), not a
bug: solving it would require tracking branch-conditional identity, which edges toward
the kind of fuzzy/heuristic resolution this project avoids elsewhere.

`_build_symbol_table` does not catch `SyntaxError` — a genuinely malformed source
string propagates the exception to its caller. Deciding what "unparseable" means for a
whole file (and reporting it as an honest `parseable: false` fact, matching
`extraction_confidence`'s established pattern) is Stage 4's job, not this one's.

## Dependencies

Python stdlib only (`ast`). No dependency on `GitClient`, `DatasetCollector`, or any
`src/utils/` detector — takes a source string in, returns a plain dict out.

## Future Improvements

- No symbol rename tracking — `foo` renamed to `bar` reports as remove+add. Deferred
  by design (ADR-005), since detecting it would require similarity heuristics.
- No `__all__` awareness for visibility. Deferred by design.
- Verified with hand-constructed source samples (nested scopes, dunder methods,
  positional-only/keyword-only parameters, conditional redefinition) and against real
  repository history (`pallets/flask`, `tcx_nogrunt-1` — see
  `docs/modules/dataset_collector.md`). A real, naturally-occurring `parseable: false`
  case was searched for across three repos' full/sampled history and not found; that
  path remains verified via the hand-constructed cases only.

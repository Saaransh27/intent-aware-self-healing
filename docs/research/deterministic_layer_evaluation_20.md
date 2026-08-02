# Deterministic Layer Evaluation: 20 real commits, 2 per category

Evaluator role, not designer. The full pipeline (`extract_symbol_semantics` →
`fuse_evidence` → all six reasoning modules: `change_shape`, `historical_risk`,
`reach`, `verification_coverage`, `contract_stability`, `body_evidence`) was run
against 20 real commits, 2 per category, across 10 categories. For every commit: the
actual diff, the raw extracted evidence, the fused evidence, and every claim/gap
produced were read directly (not sampled or summarized by another agent). Judgment
is confined to what an experienced reviewer would still want that the deterministic
layer failed to surface — no LLM-quality assessment, no hypothetical future
capabilities, no invented issues.

## Executive summary

**Headline finding**: the single most consistently observed issue is not a missing
fact — it's noise burying real facts. Of the 13 commits that produced any
`contract_stability` claims at all, 12 have ≥87% of those claims attributable to
brand-new symbols (mostly new test functions), not real changes to existing
contracts. This is measured precisely, not estimated, and it's fixable now with
data already collected (`change_type`).

**Two free wins** (zero new extraction, already-computed data): `docstring_status`
is computed on every symbol but consumed by no claim (mattered directly in 2/20
commits); `verification.no_test_files_changed` fires as pure, guaranteed noise on
documentation-only commits (2/2 in that category).

**Two new, previously undocumented gaps**: return-type annotations
(`-> None` → `-> bool | None`) are entirely untracked — `signature` only unparses
function *arguments*, never the return annotation (observed once, click). Module-
and class-level plain assignments (`__slots__` tuples, a reassigned global) are
invisible to the whole pipeline — independently confirmed in two unrelated repos
(attrs, Django), both genuine breaking/behavioral changes with zero signal.

**Confirms two previously-known findings, in fresh commits**: the "set-aggregation
blind spot" (a call/exception site changes but the same name exists elsewhere in
the function, so the aggregate set shows no delta) recurred once here (requests),
after first appearing in an unrelated repo (langchain) during an earlier pass.
Non-Python language coverage (2/20 — one JS, one Java commit) remains a large,
already-known, standing gap.

**Correctly out of scope, not a defect**: pure control-flow/data-flow changes
(2/20) and judging the severity or behavioral nature of a fix (2/20 directly,
implicitly true of nearly every bug-fix commit) both require semantic/behavioral
reasoning this project has repeatedly and deliberately excluded from its
deterministic ceiling.

**Full detail**: all 20 per-commit write-ups follow, then per-cluster analysis,
then the two requested ROI tables at the end.

---

## 1. `django/django` `bdbda29c3` — Large mature OSS

**Summary of change**: `_non_atomic_requests` stopped mutating the passed-in view's
`_non_atomic_requests` attribute in place; now builds a `databases` set and returns a
new `functools.wraps`-decorated `wrapper` instead, so applying the decorator twice
to the same view no longer aliases/corrupts the first wrapper's state.

**Claims produced**: `shape.narrow_change`, `shape.heterogeneous_categories`,
`shape.touches_tests`; `history.hot_file` ×2; `reach.high_historical_coupling` ×2,
`reach.expected_co_change_partner_missing` ×2; `verification.test_files_changed`;
`contract.public_signature_changed`/`decorator_changed` on the new `wrapper` symbol
and the new test method; `interaction.callees_changed` on `_non_atomic_requests`,
`wrapper`, and the two test symbols.

**Important reviewer observations missing**:
- The actual nature of the fix — a shared-mutable-state aliasing bug turned into an
  isolated-object return — is never stated. Every claim is technically true but none
  of them say "this used to mutate shared state; now it doesn't." A reviewer reading
  only the claims would not know this was a correctness fix rather than a stylistic
  refactor.

**Root cause**: [x] Already impossible under deterministic analysis (requires
understanding mutation/aliasing semantics, not just AST shape)

**Confidence**: High

---

## 2. `pandas-dev/pandas` `76bac9e3` — Large mature OSS

**Summary of change**: `maybe_downcast_numeric` gained a new private helper
(`_floats_fit_integer_dtype`) and an `OverflowError`/`ValueError` guard, fixing
silent, platform-dependent data corruption when casting an out-of-range float/object
value to an integer dtype.

**Claims produced**: `structure.internal_symbol_added` + `interaction.callees_changed`
on the new helper; `interaction.callees_changed` + `error_handling.exceptions_caught_changed`
on `maybe_downcast_numeric` itself — this is a genuinely good result, correctly
surfacing the real fix. Also 14 `contract_stability` claims, all of them new-symbol
artifacts from 7 new test functions across 3 test files.

**Important reviewer observations missing**:
- Severity is invisible — nothing distinguishes "fixes silent data corruption" from
  a cosmetic change.
- The one real signal (the two claims above) is diluted by 14 near-identical
  "new symbol" claims from test functions, with no distinction in the claim shape
  between "a symbol that already existed just changed" and "this symbol is brand new."

**Root cause**: severity — [x] Already impossible under deterministic analysis;
noise dilution — [x] Possible using existing evidence only (`file_classification`
already tags these files `Test`)

**Confidence**: High

---

## 3. `python-attrs/attrs` `48b8611` — Small OSS

**Summary of change**: `attrs.fields()` now accepts *instances*, not just classes
(recursing to the class via `type(cls)`), with a new error message and an updated
`.pyi` type stub (`type[AttrsInstance] | AttrsInstance`).

**Claims produced**: `history`/`reach` claims on all 5 files; `contract_stability`
produces **zero** claims on `fields()` itself (a `cannot_assess_contract` gap on the
`.pyi` file instead) and one new-symbol-artifact claim on a test method;
`body_evidence` correctly catches `fields`'s new recursive self-call via
`interaction.callees_changed` — the one real, useful signal here.

**Important reviewer observations missing**:
- The `.pyi` stub — which carries the actual, deliberate type-contract change
  (`type[AttrsInstance]` → `type[AttrsInstance] | AttrsInstance`) — is entirely
  invisible; `semantic_analysis` only accepts `.py` files.
- `fields()`'s docstring changed (new `.. versionchanged:: 26.1.0` line,
  updated `Args`/`Raises` text) — `docstring_status` is computed as `"changed"` but
  no claim anywhere consumes it, so this update produces no signal beyond the
  callee-change body_evidence already caught independently.

**Root cause**: `.pyi` — [x] Requires additional deterministic extraction (same
Python grammar, just a file-extension gate); docstring — [x] Possible using
existing evidence only (already computed, never consumed)

**Confidence**: High

---

## 4. `python-attrs/attrs` `0f758fe` — Small OSS

**Summary of change**: `_CountingAttr`'s public `converter` **attribute** (declared
in `__slots__`, set via `self.converter = converter`) is renamed to a private
`_converter`, and a **new method** named `converter()` (usable as
`@x.converter def _convert_x(...)`) takes its place — a genuine, breaking
attribute-to-method kind change on the same public name.

**Claims produced**: `contract.public_signature_changed` on the new `converter()`
method (new-symbol artifact); `interaction.callees_changed` on it and 4 test
symbols. Nothing else.

**Important reviewer observations missing**:
- The actual breaking change — a previously public **attribute** access
  (`some_field.converter`) now raises `AttributeError` (renamed to `_converter`) and
  is shadowed by an unrelated-usage **method** of the same name — is not surfaced at
  all. Only the new method registers, as an ordinary new-symbol artifact; the
  `__slots__` tuple change and the attribute rename are both invisible, because
  `symbol_extractor` only ever walks `ClassDef`/`FunctionDef`/`AsyncFunctionDef` —
  plain `Assign` nodes at class or module scope are never inspected.

**Root cause**: [x] Requires additional deterministic extraction (diffing
`__slots__` tuples and/or class-body/`__init__` attribute assignments)

**Confidence**: High

---

## 5. `fastapi/fastapi` `749cefde` — Framework/library

**Summary of change**: `get_request_handler` (in `fastapi/routing.py`) gains support
for streaming JSON-Lines/binary responses via 5 new helper functions
(`_build_response_args`, `_async_stream_jsonl`, `_async_stream_raw`, `_serialize_item`,
`_sync_stream_jsonl`) plus a new public helper in `fastapi/dependencies/utils.py`
(`get_stream_item_type`) and a change in `fastapi/openapi/utils.py`.

**Claims produced**: All 5 new private helpers correctly fire
`structure.internal_symbol_added` + `interaction.callees_changed`;
`get_request_handler` and `get_stream_item_type` both show
`contract.public_signature_changed`; `get_fields_from_routes` shows
`interaction.callees_changed`. 72 total `contract_stability` claims, 71 of them
new-symbol artifacts from the accompanying test/doc files.

**Important reviewer observations missing**: None major — running the full,
correct commit (all 3 production files together, not a narrower slice) resolves
what an earlier, narrower check of this same commit had left inconclusive. The only
recurring nitpick is claim-volume dilution (71/72 new-symbol artifacts), same
pattern as commit 2.

**Root cause**: [x] Possible using existing evidence only (noise dilution, minor)

**Confidence**: Medium (the core fix is well covered; nothing important is missing)

---

## 6. `pallets/click` `555fa9b` — Framework/library

**Summary of change**: `Context.__exit__`'s return type changes from `-> None` to
`-> bool | None`, now forwarding `ExitStack.__exit__`'s return value — a real
contract change (this context manager can now suppress exceptions) — via a new
`_close_with_exception_info` helper.

**Claims produced**: `interaction.callees_changed` on `__exit__` and `close`;
`structure.internal_symbol_added` + `interaction.callees_changed` on the new
`_close_with_exception_info`; `verification.no_test_files_changed` (correctly notes
no test file was touched for this behavior-relevant change).

**Important reviewer observations missing**:
- The return-type annotation change (`-> None` → `-> bool | None`) is completely
  invisible. `signature` is `ast.unparse(node.args)` only — it never includes
  `node.returns`. This is a real, meaningful API-contract change (whether a context
  manager's `__exit__` can suppress exceptions is exactly the kind of thing a
  reviewer checks) that the pipeline has no mechanism to see at all, even though the
  call-level changes underneath it are well covered.

**Root cause**: [x] Requires additional deterministic extraction (unparse
`node.returns` alongside `node.args` — small, same mechanism already in use)

**Confidence**: High

---

## 7. `~/Projects/Triple` `3f2615e` — Personal project

**Summary of change**: Deletes a duplicate-analysis subsystem (3 functions),
reorders `infer_page_context`'s body, and applies an identical regex fix to
`parse_excel` in two files.

**Claims produced**: `contract.public_signature_changed` + `public_symbol_removed`
on the 3 deleted functions (correct); `interaction.callees_changed` on
`normalize_triple`, `run_duplicate_analysis`, `triple_signature`, and both
`parse_excel` copies (new, previously-invisible signal).

**Important reviewer observations missing**:
- `infer_page_context`'s real body reorder produces no claim. Its
  `docstring_status` is `"changed"` (a coincidental, unrelated docstring diff) but
  nothing consumes that field, and the reorder itself changes no callee/exception/
  context-manager set, so it stays invisible for two independent, stacked reasons.

**Root cause**: The reorder itself — [x] Already impossible under deterministic
analysis (statement-order change, no new names); docstring non-consumption —
[x] Possible using existing evidence only

**Confidence**: High

---

## 8. `tcx_nogrunt-1` `6a38e90` — Personal project

**Summary of change**: `_run_batch_job` now increments a shared `cc` counter on
every step outcome (not just success) and stores HTTP response bodies/error detail
in several dict keys on failure paths.

**Claims produced**: `shape.narrow_change`, `shape.homogeneous_categories`,
`history.high_recent_churn`, `verification.no_test_files_changed`. **Zero** claims
from `contract_stability` or `body_evidence` — nothing to report at all.

**Important reviewer observations missing**:
- The entire fix is invisible. Every change is a dict-key assignment or a counter
  relocation (`cc += 1` moved outside an `if`) — no new call, exception, context
  manager, or docstring exists anywhere in the diff for this deterministic layer to
  attach to.

**Root cause**: [x] Already impossible under deterministic analysis (pure
control-flow/data-flow change)

**Confidence**: High

---

## 9. `react-app` (private) `8c9f2df1` — Enterprise/company

**Summary of change**: A React Query hook disables auto-retry (`retry: false,
retryOnMount: false`) after a failed analyze-report call.

**Claims produced**: `shape.narrow_change`, `reach.large_neighborhood`,
`verification.no_test_files_changed`. `contract_stability`/`body_evidence` both
produce only a `cannot_assess_*` gap.

**Important reviewer observations missing**:
- The entire behavioral change (retry logic disabled) is invisible beyond the raw
  diff — this is a `.js` file, and `semantic_analysis` is Python-only.

**Root cause**: [x] Requires additional deterministic extraction (a JS/TS semantic
extractor — a large, already-known, standing gap, not new to this evaluation)

**Confidence**: High

---

## 10. `api_nogrunt-1` (private) `8790717` — Enterprise/company

**Summary of change**: Adds a new `@Lob`/`LONGTEXT` DB column to `Endpoint.java` (a
live schema change) and substantially rewrites `CollectionGeneratorFlat.java`
(removes swagger/OpenAPI-parser imports, adds `StringUtils`).

**Claims produced**: `history`/`reach` claims only; `contract_stability`/
`body_evidence` both produce only `cannot_assess_*` gaps for all 3 files.

**Important reviewer observations missing**:
- A real, live schema change (new DB column) and a large service-class rewrite are
  both entirely invisible — same root cause as commit 9, different language.

**Root cause**: [x] Requires additional deterministic extraction (a Java semantic
extractor)

**Confidence**: High

---

## 11. `pallets/flask` `9822a035` — Refactoring-heavy

**Summary of change**: `stream_with_context` reworked internally (71 lines) to
support async-generator views, signature unaffected.

**Claims produced**: `interaction.callees_changed` +
`resource_management.context_managers_changed` on both `stream_with_context` and its
nested `generator` — correctly surfaces a refactor that changes internals while
preserving its signature, exactly the case this project's evaluation once rated its
weakest (3.4/10 average, Batch 7).

**Important reviewer observations missing**: None significant found in this commit.

**Root cause**: N/A — well covered

**Confidence**: Medium

---

## 12. `django/django` `3f912ee4` — Refactoring-heavy

**Summary of change**: `set_choices()` extracted from `FilePathField.__init__()` as
a new, deliberate public API.

**Claims produced**: `contract.public_signature_changed` on the new `set_choices`;
`interaction.callees_changed` + `resource_management.context_managers_changed` on
**both** `__init__` (whose callee set shrank after the extraction) and `set_choices`
— correctly surfaces both sides of an extraction refactor, not just the new method.

**Important reviewer observations missing**: None significant found in this commit.

**Root cause**: N/A — well covered

**Confidence**: Medium

---

## 13. `django/django` `a2348c85` — Bug-fix

**Summary of change**: Fixes an inlines crash on `db_default` primary keys by adding
a new private nested helper `_is_set(value)` inside `Model._is_pk_set`.

**Claims produced**: `structure.internal_symbol_added` + `interaction.callees_changed`
on the new `_is_set`; `interaction.callees_changed` on `_is_pk_set` itself — this is
the exact real-world case that originally motivated `structure.internal_symbol_added`,
and it fires correctly.

**Important reviewer observations missing**: None significant found in this commit.

**Root cause**: N/A — well covered

**Confidence**: Medium

---

## 14. `psf/requests` `2d551768` — Bug-fix

**Summary of change**: `Response.json()` now consistently raises
`RequestsJSONDecodeError` from **both** its internal `try` branches (previously only
one branch had the `except JSONDecodeError: raise RequestsJSONDecodeError(...)`
handling; the other silently let a bare `ValueError` through).

**Claims produced**: **Zero** claims from `contract_stability` or `body_evidence` on
`requests/models.py` — the one file that contains the actual fix.

**Important reviewer observations missing**:
- Directly verified at the raw-fact level: `Response.json()`'s `exceptions_caught`
  set is `{UnicodeDecodeError, JSONDecodeError}` and `exceptions_raised` is
  `{RequestsJSONDecodeError}` on **both** the old and new side, identically — because
  the *same* exception types were already present at the function's other,
  pre-existing `except`/`raise` site. The aggregate per-function set has no delta
  even though the function unambiguously changed behavior at a specific site.

**Root cause**: [x] Requires additional deterministic extraction (the current
representation tracks an aggregate name-set per function, not per call/raise/except
*site* — capturing site identity is a genuinely different fact than what's stored
today, not a new claim over existing data)

**Confidence**: High

---

## 15. `django/django` `3af5cb17` — Feature

**Summary of change**: Adds nested-field support to the XML deserializer by
introducing `getChildrenByTagName` (direct-children-only) to replace
`.getElementsByTagName` (all-descendants) calls at 3 call sites.

**Claims produced**: `contract.public_signature_changed` on the new
`getChildrenByTagName`; `interaction.callees_changed` on all 3 callers;
`verification.public_change_without_tests` correctly fires (public change, no test
file touched).

**Important reviewer observations missing**: None significant — this is one of the
best-covered commits in the sample. The only gap is why `getChildrenByTagName`
differs from `.getElementsByTagName` (direct children vs. all descendants), which
requires reading the new function's own body/semantics, not a structural gap.

**Root cause**: [x] Already impossible under deterministic analysis (minor,
semantic-understanding-of-a-new-helper case)

**Confidence**: Medium

---

## 16. `crewAIInc/crewAI` `53c22844` — Feature

**Summary of change**: ZIP deployment fallback + JSON crew project env runs, across
9 non-test production files, 20 files total, 2447 lines — the largest commit in this
sample.

**Claims produced**: 119 `contract_stability` claims + 216 `body_evidence` claims =
**335 total claims** for one commit. Individually, every claim checked is accurate
(new private helpers correctly gated by `structure.internal_symbol_added`'s
same-file-modified condition — verified it correctly stays silent for the brand-new
`archive.py`, where every symbol is `added`, and correctly fires for `run_crew.py`/
`main.py`/`git.py`, which mix new and modified symbols).

**Important reviewer observations missing**:
- Correctness isn't the problem here — volume is. 335 claims (103/119, 87%, of the
  contract claims are new-symbol artifacts) is not something a reviewer could
  usefully scan. There is no grouping, ranking, or de-duplication of near-identical
  claims across files.

**Root cause**: [x] Possible using existing evidence only (a synthesis/aggregation
feature over already-correct per-symbol facts — not new extraction)

**Confidence**: High

---

## 17. `fastapi/fastapi` `704fbe14` — Documentation-heavy

**Summary of change**: One-line release-notes append.

**Claims produced**: `shape.touches_documentation`, `history.hot_file`/
`high_recent_churn`, `reach.large_neighborhood`, `verification.no_test_files_changed`.
`contract_stability`/`body_evidence` correctly gap out (non-Python-relevant content,
though the file is markdown — no semantic_analysis for `.md`).

**Important reviewer observations missing**:
- `verification.no_test_files_changed` fires, but for a pure-docs commit this is
  guaranteed and uninformative — the claim doesn't distinguish "no tests, and some
  probably should exist" from "no tests, because none could possibly apply here."

**Root cause**: [x] Possible using existing evidence only
(`change_categories.touches_documentation` is already computed and could gate this)

**Confidence**: Medium

---

## 18. `pandas-dev/pandas` `82a712a52a` — Documentation-heavy

**Summary of change**: Adds a new whatsnew release-notes file, updates its index.

**Claims produced**: Same shape as commit 17 — `history.first_appearance`,
`reach.no_historical_coupling`/`large_neighborhood`,
`verification.no_test_files_changed`.

**Important reviewer observations missing**:
- Identical finding to commit 17 — `no_test_files_changed` fires as noise on a
  pure-docs commit. Confirms this is a recurring pattern within this category (2/2),
  not a one-off.

**Root cause**: [x] Possible using existing evidence only

**Confidence**: Medium

---

## 19. `django/django` `cceb6969d` — Test-heavy

**Summary of change**: Fixes test pollution in `tests/admin_filters/tests.py` by
replacing an imported shared global `site` (Django's real admin registry) with a
fresh, test-local `AdminSite(name="test_adminfilters")` instance.

**Claims produced**: `history.hot_file`, `reach.high_historical_coupling` +
`expected_co_change_partner_missing`, `verification.test_files_changed`. **Zero**
claims from `contract_stability`/`body_evidence`, and no gap either — the file
parses fine, but the change is a **module-level assignment**
(`site = AdminSite(...)`), which is not a function or class definition, so
`_diff_symbol_tables` has nothing to report.

**Important reviewer observations missing**:
- A real, meaningful test-isolation fix (removing shared-mutable-global-state
  pollution between tests) is entirely invisible — the second independent
  confirmation in this sample (after commit 4's `__slots__` case) that
  module/class-level non-function assignments are outside `symbol_extractor`'s
  reach entirely.

**Root cause**: [x] Requires additional deterministic extraction (module/class-level
assignment diffing)

**Confidence**: High

---

## 20. `psf/requests` `8f6cda99` — Test-heavy

**Summary of change**: Adds 3 new test methods (`test_hasattr`, `test_getattr`,
`test_getattr_default`) to `TestLookupDict`.

**Claims produced**: `contract.public_signature_changed` ×3 (new-symbol artifacts, as
expected for new tests), `interaction.callees_changed` on all 3.

**Important reviewer observations missing**: None — this is a clean, correctly
classified test-only commit with nothing behaviorally significant to miss.

**Root cause**: N/A

**Confidence**: Low (nothing to find, and that's the correct, honest result for a
commit this simple)

---

# Clusters

## Cluster: New-symbol-artifact noise dilutes real contract signal

**Frequency**: 12/20 commits (measured precisely, not estimated: of the 13 commits
with any `contract_stability` output, 12 have ≥87% of their claims attributable to
a symbol with `change_type: "added"` — i.e., a brand-new function/method, not a
change to an existing one). Commits: 1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 20.

**Root cause**: `contract_stability` (and `body_evidence`) produce the identical
claim shape whether a symbol's contract *changed* or the symbol is *brand new* —
`public_signature_changed`/`decorator_changed` fire either way, with nothing
distinguishing the two cases in the claim itself.

**Worth solving?** Yes.

**Reason**: The single most consistently observed pattern in the entire sample,
and it actively buries real signal — commit 2's one meaningful fix sits alongside
14 near-identical test-artifact claims; commit 16's real facts are individually
correct but drown in 335 total claims. `change_type` is already on every symbol; no
new extraction is needed to distinguish these.

## Cluster: Non-Python language coverage

**Frequency**: 2/20 (commits 9, 10 — JS and Java respectively). Both entirely
invisible beyond the raw diff and generic historical/reach signals.

**Root cause**: `symbol_extractor` is Python-only; no equivalent extractor exists
for any other language.

**Worth solving?** Conditionally yes — a large, already-known, standing gap (not
new to this evaluation). In this specific 20-commit sample it accounts for exactly
the 2 enterprise/company-category commits, both non-Python by the nature of that
codebase; whether it's worth solving depends on how much of this project's real
target population is non-Python, which this sample alone can't answer.

## Cluster: Pure control-flow/data-flow changes are invisible

**Frequency**: 2/20 (commit 8, total silence across every module except generic
churn/no-test signals; commit 7, a softer case — `infer_page_context`'s reorder
produces a docstring-status change that's never consumed, but the reorder itself
still shows no callee/exception/context-manager delta).

**Root cause**: `body_evidence` tracks names (calls, exceptions, context managers),
never statement order, branch structure, or plain variable/dict assignments.

**Worth solving?** No. This is precisely the boundary this project has repeatedly
and deliberately drawn (ADR-008, ADR-009): solving it requires control-flow
analysis or behavior modeling, explicitly out of the deterministic ceiling.

## Cluster: Return-type annotations are untracked

**Frequency**: 1/20 (commit 6). Observed once in this sample; stated as such, not
extrapolated.

**Root cause**: `signature` is `ast.unparse(node.args)` only; `node.returns` (the
return-type annotation) is never captured anywhere in the pipeline.

**Worth solving?** Yes. Cheap — the same `ast.unparse` mechanism already used for
`args` — and the one instance observed was a genuine, meaningful contract change
(a context manager gaining the ability to suppress exceptions).

## Cluster: Module/class-level non-function assignments are invisible

**Frequency**: 2/20 (commit 4 — `__slots__`/attribute-to-method rename; commit 19 —
a module-level `site = AdminSite(...)` replacing a shared global), independently
confirmed in two unrelated repositories.

**Root cause**: `symbol_extractor`'s walk only reacts to `ClassDef`/`FunctionDef`/
`AsyncFunctionDef` nodes; a plain `Assign` at class or module body level is never
inspected, regardless of what it does.

**Worth solving?** Yes, cautiously. Commit 4 in particular is a genuine breaking
public-API change with zero signal today. Any fix must stay narrowly scoped to
specific, named assignment targets (e.g. `__slots__`, module-level names) to avoid
drifting toward general data-flow tracking.

## Cluster: `.pyi` type-stub files are unsupported

**Frequency**: 1/20 directly in this sample (commit 3). Previously documented (not
new) in the original 10-batch evaluation as a recurring pattern specific to
well-typed libraries.

**Root cause**: `_build_commit_semantic_analysis` filters to `.py` files only.

**Worth solving?** Yes, if this project's real population includes typed libraries
that lean on `.pyi` stubs for their public contract (as `attrs` does) — cheap, since
`.pyi` files use the same Python grammar `symbol_extractor` already parses.

## Cluster: `docstring_status` is computed but never consumed

**Frequency**: 2/20 where it mattered directly (commits 3, 7) — a real update's
*only* signal, in both cases, ended up being a docstring change that no claim reads.

**Root cause**: No reasoning module consumes `docstring_status` at all — a gap
named in the original evaluation and still unaddressed.

**Worth solving?** Yes. Zero new extraction — the field already exists on every
symbol; this is purely an unwritten claim.

## Cluster: No aggregation/summarization for large or wide commits

**Frequency**: 1/20 directly and starkly (commit 16, 335 total claims), but this is
the claims-layer reappearance of a finding the original 20-commit evaluation already
named at the evidence layer (its #1 recommendation, for wide/homogeneous commits).

**Root cause**: The registry/synthesizer emits one claim per qualifying
symbol/file with no grouping, ranking, or de-duplication across a large commit.

**Worth solving?** Yes. Every individual fact checked in commit 16 was correct;
the problem is purely presentation/aggregation at scale, over data that's already
right.

## Cluster: Severity/behavioral nature of a fix is never surfaced

**Frequency**: Directly named in 2/20 (commits 1, 2), and implicitly true of every
bug-fix commit in the sample to some degree.

**Root cause**: No reasoning module models what code actually *does* at runtime —
this is a structural, not incidental, limit.

**Worth solving?** No. Squarely semantic/behavioral-reasoning territory, correctly
left alone under this project's own standing, repeatedly-reaffirmed deterministic
ceiling.

## Cluster: `expected_co_change_partner_missing` fires very frequently

**Frequency**: 27 occurrences across 14/20 commits (70%) — noted here for
completeness, though this is a calibration observation about an *existing* claim's
threshold, not a missing capability, so it does not get its own row in the tables
below. Worth a look at whether `HIGH_COUPLING_THRESHOLD` (shared with
`high_historical_coupling`) is too permissive for this specific claim, given how
often a real commit legitimately touches only a subset of its historically-coupled
files.

## Cluster: Set-aggregation blind spot (same name elsewhere in function masks a real change)

**Frequency**: 1/20 in this sample (commit 14). Also independently observed once
before, in a different evaluation exercise (a `langchain` commit, outside this
20-commit set) — two independent confirmations total, in two unrelated repos,
across two separate evaluation passes.

**Root cause**: `body_evidence` tracks an aggregate per-function name-set
(`{added, removed}`), never per-call/raise/except-*site* identity — a documented
trade-off from ADR-008, not an oversight.

**Worth solving?** Yes, cautiously. Real and recurring, but the fix requires
capturing site identity (a different fact than what's stored today), not just a new
claim over existing data — a genuine representation change, not a cheap addition.

---

# Table 1

| Missing capability | Frequency | Existing evidence sufficient? | New extraction needed? | Needs LLM? | Worth solving? |
|---|---|---|---|---|---|
| New-symbol-artifact noise dilutes signal | 12/20 | Yes | No | No | Yes |
| Non-Python language coverage (JS/Java/etc.) | 2/20 | No | Yes | No | Conditional |
| Pure control-flow/data-flow changes invisible | 2/20 | No | No (out of scope) | Yes | No |
| Return-type annotations untracked | 1/20 | No | Yes (small) | No | Yes |
| Module/class-level assignments invisible | 2/20 | No | Yes | No | Yes |
| `.pyi` type stubs unsupported | 1/20 | No | Yes | No | Yes (conditional) |
| `docstring_status` computed but unconsumed | 2/20 | Yes | No | No | Yes |
| No aggregation for wide/large commits | 1/20 | Yes | No | No | Yes |
| Severity/behavior of a fix not surfaced | 2/20 (pervasive) | No | No | Yes | No |
| Set-aggregation blind spot (site identity lost) | 1/20 | No | Yes | No | Yes (cautiously) |

# Table 2

| Issue | Impact | Implementation effort | Deterministic feasibility | Recommendation |
|---|---|---|---|---|
| New-symbol-artifact noise dilutes signal | High | Low | High | Implement now |
| `docstring_status` computed but unconsumed | Medium | Very low | High | Implement now |
| `verification.no_test_files_changed` noise on docs-only commits (see commits 17/18) | Low-Medium | Very low | High | Implement now |
| No aggregation for wide/large commits | High | Medium | High | Implement later |
| Return-type annotations untracked | Medium | Low | High | Implement later |
| Module/class-level assignments invisible | Medium-High | Medium | Medium-High | Implement later |
| `.pyi` type stubs unsupported | Medium | Low | High | Implement later |
| Set-aggregation blind spot (site identity) | Medium | Medium-High | Medium | Implement later |
| Non-Python language coverage | High (where applicable) | Very high | High per-language | Implement later (own initiative) |
| Pure control-flow/data-flow changes invisible | Real but out of scope | N/A | Low (needs behavior modeling) | Leave for LLM |
| Severity/behavior of a fix not surfaced | High in principle | N/A | None (needs semantic reasoning) | Leave for LLM |

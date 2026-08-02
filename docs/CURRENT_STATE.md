# Current State

_Last synced: 2026-08-01._

## What works

Milestones 1-2 and step 1 of Milestone 3 are implemented and verified end-to-end. Running
`python3 main.py <repository_url> <commit_count>`:

1. Clones the repository once, into a temporary directory.
2. Fetches and writes `benchmark/<repo>/repository.json` — default branch, commit count,
   first/last commit date, contributors, primary/detected languages, package manager
   (`build_system` is a `null` placeholder, no detection rule defined yet), directory
   layout (source/tests/documentation/examples/scripts), and repository signals
   (documentation/build/containerization/ci marker files).
3. Resolves up to `commit_count` non-merge commits (fewer if the repo doesn't have that
   many; errors only if there are none at all).
4. For each, writes `benchmark/<repo>/commits/<commit_hash>/artifacts/metadata.json` and
   `artifacts/diff.patch` (relocated from directly under `commits/<commit_hash>/` — see
   ADR-003 — to make room for a structured `commit.json` at that level instead).

Verified live: `fastapi/fastapi` with `commit_count=3`; a throwaway repo requesting more
commits than it had (correctly returned all available instead of erroring); and
`Nogrunt-Collaborations-Private-limited/tcx_nogrunt-1` (real private-org repo, produced
`repository.json` with 352 commits / 12 contributors / `package_manager: "Pip"`, plus
commit samples). Poetry/Hatch/PDM/Java/Node detection branches unit-tested directly.

## In progress — Milestones 4A/4B/5A (structured `commit.json`)

Five of six planned `commit.json` sections have builder methods on `DatasetCollector`,
each verified standalone against real repos: `_build_commit_identity`,
`_build_commit_metadata`, `_build_commit_change_set`, `_build_commit_observations`
(Milestone 4B — file classification, change statistics/categories, extraction
confidence — see `docs/modules/file_classifier.md`), `_build_commit_artifacts` — see
`docs/modules/dataset_collector.md` for exact shapes.

Additionally, all four Milestone 5A "Context" evidence extractors are built and
verified: `_build_commit_file_history`, `_build_commit_co_change`,
`_build_commit_local_module_context`, `_build_commit_repository_signals` — see
`docs/context_design.md` for the research behind them and `docs/MILESTONES.md` for exact
verification details. Where exactly these four attach to `commit.json`'s schema is still
an open question (proposed: a 7th section, `context`), not yet decided.

Validated end-to-end against `pallets/flask` (a repo not previously tested), which
surfaced and led to fixing a real bug: `GitClient.get_tracked_files` now accepts an
optional `commit_hash` to scope its listing to that commit's tree rather than always the
current checkout (ADR-004) — the previous behavior silently returned wrong results for
`_build_commit_local_module_context` whenever a directory existed at commit time but had
since been removed from HEAD.

**None of the above is wired into `collect()` yet** — no `commit.json` is written today.
The sixth section, `collection`, hasn't been specified either. Per `PROJECT.md` rule 4,
do not treat any of this as complete until it is.

A 20-commit qualitative evaluation of these four extractors plus `observations`
(2026-07-16) rated the pipeline's evidence sufficiency at 6.4/10 average across 4
repositories — see `docs/research/experiments.md`/`observations.md`. Findings-only; no
pipeline code changed as a result.

## In progress — Milestone 6 (symbol-level semantic evidence)

Architecture frozen as ADR-005 (2026-07-20): a new, independent, Python-only evidence
extractor answering what the 20-commit evaluation identified as the highest-value
remaining gap — code semantics, not more git-derived statistics. New package
`src/semantic/python/`, output destined for a new `commit.json` section,
`semantic_analysis`, alongside `context`.

All 6 stages are built and verified: `src/semantic/python/symbol_extractor.py` parses
Python source into a symbol table, diffs old/new tables and imports, and exposes one
public function, `extract_symbol_semantics`. `DatasetCollector.
_build_commit_semantic_analysis(repo_path, commit_hash, change_set)` calls it per
changed Python file and resolves renames (git identity the extractor itself can't see).

Verified against real commits in `pallets/flask` (`06ea505c` — non-Python files
excluded, a logic-only edit correctly produced zero symbol entries, a real test-file
rewrite produced both added and removed symbols including a four-level-deep nested
function) and `tcx_nogrunt-1` (`d99f6cb` — a real, content-changing rename of a FastAPI
`app` into an `APIRouter`; all 15 functions correctly matched across the rename as
`modified` with `decorators_changed: true`, not misreported as 15 removed + 15 added).
Searched three real repos for a naturally-occurring unparseable Python file and found
none; the `parseable: false` path is verified via hand-constructed cases only (Stages
1/4), same precedent as `_build_commit_change_set`'s rename branch in Milestone 4A. See
`docs/modules/symbol_extractor.md`, `docs/modules/dataset_collector.md`, and
`docs/MILESTONES.md` for full detail.

**Nothing from Milestone 6 is wired into `collect()` yet.** No `semantic_analysis`
section has ever been written to an actual `commit.json` (which itself still doesn't
exist). Per `PROJECT.md` rule 4, extraction being finished does not imply the milestone
is complete — assembly is a distinct next step, same distinction already drawn for
Milestone 5A.

## In progress — Milestone 7 (Evidence Fusion)

Architecture frozen as ADR-006 and built: `src/fusion/evidence_fusion.py`, one public
function `fuse_evidence(evidence) -> {"commit": {...}, "files": [...]}`. An adapter, not
a reasoning layer — every field is `{"status": "ok"|"not_applicable"|"not_collected",
"evidence": <verbatim value>|None}`, determined purely by presence. No section is
renamed; no `"context"` wrapper is assumed (that nesting was never decided). Verified
against real commits in `pallets/flask` and `tcx_nogrunt-1` — including a direct
byte-comparison confirming losslessness and the same non-trivial rename from Milestone
6 correctly reshaped. See `docs/modules/evidence_fusion.md` and `docs/MILESTONES.md`.

**Not wired into `DatasetCollector` or any pipeline entrypoint yet**, and not persisted
by design — `fuse_evidence` is meant to be called on demand, not written to disk.

## In progress — Milestone 8 (Deterministic Reasoning Layer)

Architecture frozen as ADR-007 and built: `src/reasoning/` — five independent modules
(`change_shape`, `historical_risk`, `reach`, `verification_coverage`,
`contract_stability`), each with an enforced `CONSUMES` contract (the registry filters
Evidence Fusion's output down to exactly what a module declared before calling it), a
flat registry (`run_reasoning`), and a non-reasoning `synthesizer` that only collects
and groups Claims/Gaps by scope. Confidence (`observed`/`corroborated`/`inferred`/
`conflicting`) is computed per claim from its own basis, never from a fixed ranking of
evidence categories. Verified against real commits in `pallets/flask` and
`tcx_nogrunt-1`, including a real corroborated-reach case and confirmed
`not_collected` propagation. See `docs/modules/reasoning.md` and `docs/MILESTONES.md`.

This validation also surfaced a real, previously-unknown gap in `GitClient.
get_file_history` (missing `--follow`, so renamed files incorrectly read as
first-appearance) — flagged at the time, **fixed in Milestone 19** (see below).

**Not wired into any pipeline entrypoint yet** — verified standalone. The five-module
registry is explicitly provisional.

## In progress — Milestone 8.5A (Function-Body Evidence)

Architecture frozen as ADR-008 (2026-07-23), closing the #1 finding from the 10-batch
reasoning evaluation (`docs/research/reasoning_experiments.md`/
`reasoning_observations.md`): "Function Body Blindness" — a symbol with unchanged
signature/decorators/docstring produced no diff entry at all, however much its body
changed. `src/semantic/python/symbol_extractor.py` now extracts four new per-symbol
facts (`callees`, `exceptions_raised`, `exceptions_caught`, `context_managers`),
set-diffed old vs. new and nested under a `body_evidence` key grouped into five
reviewer-facing categories (interaction, error-handling, resource-management,
documentation/deprecation, internal-structure) rather than by AST node type. Body-
evidence changes now also count toward `_diff_symbol_tables`'s modified-check — the
actual fix, not just added data. A new reasoning module, `src/reasoning/modules/
body_evidence.py`, consumes `semantic_analysis` and emits six claims.

Verified against two real commits in `pallets/click`: `c2ed414` (the exact commit that
originally surfaced the `warnings.warn` question — correctly produces
`interaction.callees_changed` and `documentation.deprecation_marker_added`, no bespoke
handling of either) and `555fa9b` (`Context.__exit__`/`Context.close` change their
callee target with signature/decorators/docstring unchanged — previously invisible,
now correctly surfaced as `modified`; the commit's new private method correctly fires
`structure.internal_symbol_added`).

**Not wired into any pipeline entrypoint yet** — verified standalone, same status
every prior milestone has had at this stage.

## In progress — Milestone 8.5B (Historical Evidence Depth)

Architecture frozen as ADR-009 (2026-07-23). Unlike 8.5A, this milestone started
from a first-principles review of the deterministic ceiling for historical evidence
(reviewer workflow + the existing batch evaluation), not a named finding. Three
claims added: `GitClient.get_file_history` gains `recent_commit_count` (free — reuses
the date list its git call already fetches, previously discarded past the first two
entries); `historical_risk.py` gains `history.rapid_iteration` (structural
counterpart to `long_dormant_reactivated`, same fields, opposite threshold) and
`history.high_recent_churn`; `reach.py` gains `reach.expected_co_change_partner_missing`
(zero new extraction — cross-references `co_change`'s existing partner list against
the commit's own changed-file set, something `reach` never did before).

Verified against real commits in `pallets/click`: `rapid_iteration`/`high_recent_churn`
both fired on `src/click/core.py` at `c040135a` (a real ~28-minute commit cluster,
15 touches in the preceding 30 days); `expected_co_change_partner_missing` fired
correctly on `3495fba1` (changed `core.py` without its strong historical partner
`CHANGES.rst`) and correctly did not fire on `82f377c` (changed `core.py` alongside
all of its strong partners) — both directions confirmed on real data.

Two higher-value candidates from the same first-principles review — author
familiarity and ownership concentration — were deliberately deferred, not built
here; they require new per-file author extraction this milestone does not add.

**Not wired into any pipeline entrypoint yet** — verified standalone, same status
every prior milestone has had at this stage.

## In progress — Milestone 8.5C (Author Familiarity) — final deterministic capability

Architecture frozen as ADR-010 (2026-07-24). Answers one reviewer question only:
"has this commit's author worked on this file before?" `GitClient.get_file_history`
gains an optional `author_email` parameter — the existing single git log call gains
one more `\x1f`-delimited format field (`%ae`, alongside the existing `%ad`), no new
subprocess call, and the returned dict gains `author_commit_count`/
`is_first_touch_by_author` only when `author_email` is provided; every existing
caller and field is unaffected. `_build_commit_file_history` now also takes
`metadata` and passes `metadata["author"]["email"]` through — the project's first
builder method depending on two upstream builders' output rather than one, named
explicitly rather than left implicit. Evidence Fusion needed zero changes: the
existing `file_history` per-file passthrough already exposes whatever keys the dict
carries, verbatim. `historical_risk.py` gains one new claim,
`history.first_author_touch` (deliberately named as a fact, not the interpretation
"unfamiliar author" — that judgment is left to future semantic reasoning), firing
only when `is_first_touch_by_author` is true **and** `is_first_appearance` is false
— a brand-new file's trivially-true first-touch-by-everyone doesn't fire it. No new
`CONSUMES`, no new gap type, no new module.

Verified against four real cases in `pallets/flask`: a genuine first-time author
touch (fires), a frequent maintainer's 15th touch (silent), a brand-new file (silent,
correctly gated by `is_first_appearance`), and a real, naturally-occurring
alternating-author history confirming `author_commit_count` excludes the current
commit with no off-by-one (computed value matched a hand-count via
`git log --format=%ae` exactly).

This closes the first-principles historical-evidence review begun in ADR-009: of
the two candidates flagged there as highest-value but unbuilt, author familiarity is
now built; ownership concentration (repo-wide distinct-author counting) remains
deliberately unbuilt, since it's a different-shaped, cross-file question, not a
single-file/single-commit fact like this one.

**Not wired into any pipeline entrypoint yet** — verified standalone, same status
every prior milestone has had at this stage. **This is the final deterministic
capability before Milestone 9** — see `docs/DECISIONS.md` (ADR-010) for the
reassessment concluding no further architecturally-justified deterministic gaps
remain.

## In progress — Milestone 9 (Semantic Reasoning) — architecture frozen, no code yet

Four ADRs recorded (2026-07-24), consolidating the full Milestone 9 research arc.
**No implementation exists for any of them** — this section describes decided
architecture only, per `PROJECT.md` rule 4.

- **ADR-011 (Review Context)** — a new component, the Review Context Builder,
  between the Reasoning Layer's Synthesizer and everything downstream. Separates
  raw Input Sources (Synthesizer Claims/Gaps, commit message, raw diff) from a
  constructed, five-section Review Context (Commit Summary, Claims, Gaps,
  Evidence Units, Coverage Ledger), each unit individually addressable. Owns
  diff/symbol-detail summarization deterministically, using only already-computed
  claims — never a heuristic, never a model call.
- **ADR-012 (LLM Reasoning Contract)** — the model's role is triage, not review:
  deciding what deserves attention, never rendering the verdict. Freezes the
  seven-stage reasoning sequence, a four-tier evidence-precedence hierarchy, a
  decline boundary, a four-term non-numeric uncertainty vocabulary (Confirmed /
  Likely / Worth checking / Unknown), forbidden behaviors, and one optimization
  objective — maximize the reviewer's justified trust per unit of reading time.
- **ADR-013 (Review Output Contract)** — the human-facing review's five-section
  shape (Verdict, What changed and why, What deserves attention (ranked), Open
  questions, Minor notes), ordered by cost of missing each point. A prioritized
  reviewer assistant, not a report or checklist.
- **ADR-014 (Prompt Builder Contract)** — what any future Prompt Builder must
  guarantee regardless of model family: strict system/user separation,
  verbatim-vs-referenced content rules, forbidden instruction categories, a
  Prompt-Builder-bug-vs-model-mistake diagnostic test, forbidden assumptions
  about model capability, and two refinements — the Builder guarantees only
  faithful delivery (never model compliance or output quality), and a Prompt
  Transparency invariant (no hidden per-commit instructions outside the frozen
  system contract).

Research behind these four: `docs/research/reviewer_reasoning_model.md` (the
human reviewer's seven-stage cognitive model) and
`docs/research/milestone9_transition_research.md` (the deterministic/semantic
boundary analysis these ADRs consolidate).

**Not yet true, per `PROJECT.md` rule 4:** the Review Context Builder, the
Prompt Builder, and now the LLM Adapter are implemented — see Milestones 10A,
10B, and 11A below. No code exists yet for the LLM reasoning layer or the
output formatter (ADR-012/013) beyond what the Prompt Builder's system prompt
restates as instructions; no ReviewEngine exists, and no real model call
exists — the Adapter's `execute` dependency is deliberately unimplemented,
per ADR-015's own deferral.

## In progress — Milestone 10A (Review Context Builder)

Implements ADR-011 exactly and built: `src/review/context_builder.py` (new package,
sibling to `src/fusion/` and `src/reasoning/`), one public function,
`build_review_context(synthesized, metadata, change_set, diff_text, commit_hash) ->
dict` — returns a plain dict, matching this project's existing convention (no new
class). Splits the raw diff into per-file Evidence Units with a file-path-plus-
line-range address; relays Claims/Gaps from the Synthesizer as independent deep
copies (content unmodified, never the same objects as the Synthesizer's own output);
collapses a file only when it belongs to a commit flagged
`shape.wide_change`/`shape.homogeneous_categories` **and** carries none of ADR-011's
named risk-bearing claims (checked across both `file_claims` and the symbol-scoped
`contract_stability` claims in `symbol_claims`); records every file in the collapse
group — including the representative — in `coverage_ledger[]["collapsed_group_files"]`
with its justifying claim(s). A `commit_hash` field travels alongside the five
`ReviewContext` sections as ADR-011's required minimal commit-identity reference.
See `docs/modules/context_builder.md` for the full design, edge-case list, and a new
"Explicit decisions and open questions" section.

**A critical review against ADR-011's literal text (2026-07-25)** found and fixed
five confirmed defects — missing commit-identity reference, `author`/`date`
present in Commit Summary (not in ADR-011's enumeration), two different canonical
orderings in one object (now unified on diff order everywhere, including
representative selection), a misnamed ledger field (`collapsed_files` →
`collapsed_group_files`, since it includes the non-collapsed representative), and
claim/gap aliasing (now prevented via `copy.deepcopy`) — while deliberately leaving
three other findings unchanged (public-contract exemption breadth, per-hunk
splitting, the Synthesizer's undocumented `"module"` claim key), documented as
explicit decisions/open questions rather than fixed.

Verified: 22 unit tests (`tests/review/test_context_builder.py`, stdlib `unittest`
— **this project's first real test suite**, superseding the "No tests yet" status
below). Additionally validated against two real `diff.patch` files already on disk
(`benchmark/fastapi/...`, `benchmark/tcx_nogrunt-1/...`) — correct line-range
extraction confirmed by hand against the visible `@@` hunk headers.

Per-hunk Evidence Unit splitting (ADR-011's own "where warranted" qualifier) is
explicitly not implemented — the ADR doesn't define the trigger, and inventing one
would be adding architecture the ADR doesn't specify. Flagged, not built.

**Not wired into any pipeline entrypoint yet** — has not been exercised against a
real `synthesizer.synthesize` output from a live `collect()` run (Milestone 8 itself
was never wired in), only against hand-built fixtures shaped identically to it plus
two real diffs. PromptBuilder, LLMAdapter, and ReviewEngine (ADR-012–014) remain
deliberately unbuilt, per this milestone's explicit scope.

## Milestone 10B (Prompt Builder) — complete, frozen

Implements ADR-014 exactly: `src/prompt/prompt_builder.py` (new package, sibling to
`src/review/`), one public function, `build_prompt(review_context) ->
{"system_prompt": str, "user_prompt": str}` — direct pass-through from
`build_review_context`'s output, no adapter. `SYSTEM_PROMPT` is a fixed constant
restating ADR-012's role/reasoning sequence/precedence hierarchy/decline
boundary/uncertainty vocabulary/forbidden behaviors/objective plus ADR-013's output
format/content rules/tone/philosophy — never trimmed, never computed per call. The
user prompt renders the `ReviewContext`'s five sections as verbatim `json.dumps`
blocks in fixed order, chosen specifically to eliminate any paraphrasing surface a
hand-written formatter would introduce; this also satisfies ADR-014's "referenced
only" rule for collapsed material for free, since `context_builder.py` already sets
`diff_text: None` on collapsed units.

A written implementation plan and a self-critical review against ADR-014 were
presented and confirmed before any code was written. Three open questions were
resolved by explicit instruction: `commit_hash` never appears in either prompt half;
Claims/Gaps/Evidence Units/Coverage Ledger are verbatim JSON, not hand-formatted
prose; output keys are `system_prompt`/`user_prompt`. Two further findings — no
model-facing cross-referencing between evidence units and the coverage ledger, and
no truncation/context-window handling — are documented as explicit decisions in
`docs/modules/prompt_builder.md`, not built.

Verified: 25 unit tests (`tests/prompt/test_prompt_builder.py`, stdlib `unittest`).
All 47 tests across `tests/review/` and `tests/prompt/` pass together. Validated
end-to-end against the same real on-disk commit used for Milestone 10A.

A clause-by-clause fidelity trace of `SYSTEM_PROMPT` against ADR-012/013's literal
text (2026-07-26) found and fixed six deviations (a paraphrased ADR-013 example
restored verbatim, Reasoning Step 4 wording traced back to ADR-012 alone and
research-sourced phrasing removed, two omitted ADR-013 per-section exclusions
restored, one omitted ADR-012 clause restored, one omitted ADR-013 usefulness
principle restored) — each pinned by a new regression test. A second trace
confirmed no further fixable deviations remain; the residual differences are
recorded in `docs/modules/prompt_builder.md` as **accepted editorial compressions,
not architectural deviations**.

**Milestone 10B is frozen as complete. ADR-014 is treated as fully implemented**
for the Prompt Builder's scope. `SYSTEM_PROMPT` wording is not to be further refined
against the ADRs' exact phrasing — only against a measurable behavioral problem
from real model output, if one is ever found.

**Not wired into any pipeline entrypoint yet** — same status as Milestone 10A.
LLMAdapter and ReviewEngine remain unimplemented — Milestone 9 as a whole is not
complete. No changes made to ADR-011/012/013/014.

## Milestone 10C (LLM Adapter) — architecture frozen, no code yet

ADR-015 recorded (2026-07-26): the boundary immediately downstream of the Prompt
Builder's `{"system_prompt", "user_prompt"}` output, and the first component in
this project whose job requires an actual model to run — the first deliberate
exception to the full-pipeline determinism every ADR from ADR-006 through
ADR-014 has held, named explicitly as such rather than left implicit. Reached
through the same one-question-at-a-time methodology as Milestone 9. **No code
exists for it** — this section describes decided architecture only.

Responsibility is transport plus *structural* normalization only — a
representation of whatever resulted, and an explicit presence/absence
distinction — never semantic normalization, the same structure-never-meaning
philosophy ADR-011 gave `ReviewContextBuilder`, carried one boundary further.
Presence/absence is defined structurally (an answer-shaped result exists or it
doesn't), never by judging content adequacy. A two-kind failure taxonomy —
Adapter-boundary failure (never validly attempted) vs. Execution-boundary
failure (attempted, concluded, nothing resulted) — plus a five-state contract
(Received, Attempting, and three terminal states) express this without
anticipating retries, providers, or any implementation technology, all
explicitly deferred. Four invariants — Response Transparency, Content
Preservation, Explicit Absence, No Fabrication — produce provider independence
as their consequence, inherited by reference from ADR-012/014 rather than
re-derived.

A dedicated adversarial audit, run before freezing, found and corrected real
issues rather than confirming the design as-is: two candidate invariants (a
determinism guarantee scoped to the Adapter's own logic; a guarantee against
losing already-obtained information) were found fully subsumed by other
statements in the ADR once its state contract existed, and removed rather than
kept for symmetry with other ADRs; a genuine ambiguity (does minimal/empty
content count as "present") was surfaced and resolved structurally; Provider
Independence's rationale was redirected to inherit from ADR-012/014 rather than
re-derived; Adapter-boundary failure was reframed as existing for contract
completeness, not expected operation. A final cross-ADR consistency audit
(ADR-011–015) was run after freezing — see `CHANGELOG.md` for its result.

**This completes the Milestone 10 architecture.** Per explicit instruction,
architectural work on this line stops here. The next milestone begins
implementation of the LLM Adapter against ADR-015, not further ADR refinement.

## Milestone 11A (LLM Adapter) — implemented

Implements ADR-015 exactly: `src/adapter/llm_adapter.py` (new package,
sibling to `src/review/` and `src/prompt/`), one public function,
`run_adapter(prompt, execute) -> {"state": ..., "response": ...}` — plain
function, no class, per ADR-015's "holds no state across calls." `prompt` is
`build_prompt(...)`'s exact output; `execute` is an injected, deliberately
opaque callable representing the actual model call — its own implementation
is out of scope here, per ADR-015's own deferral.

Before writing code, an implementation plan was audited the same way ADR-015
itself was audited before freezing. That audit surfaced one real conflict
between an instructed refinement and ADR-015's frozen text: classifying a
non-`str` return from `execute` (including `None`) as `adapter_boundary_failure`
would conflict with ADR-015's closed transition rule that Attempting can only
resolve to Execution-boundary failure or Success, since `execute` must
already be invoked (Attempting under way) to return anything at all. Resolved
by classifying any outcome of an invoked `execute` — raising, or returning a
non-`str` value — as `execution_boundary_failure`, keeping ADR-015's
transition table exactly as frozen, while preserving the specific reason for
a malformed return internally only (never in the public result), via a
dedicated, directly-tested helper function. See
`docs/modules/llm_adapter.md`'s "The None/non-str resolution" section.

Verified: 27 unit tests (`tests/adapter/test_llm_adapter.py`, stdlib
`unittest`), including the two internal reason-computing helpers tested
directly. All 74 tests across `tests/review/`, `tests/prompt/`, and
`tests/adapter/` pass together. Validated end-to-end against a real
`build_prompt(...)` output — no adapter shim needed between the two modules.

A post-implementation architecture audit against ADR-015 was run before this
milestone was considered complete — see `CHANGELOG.md` for its result.

**Not wired into any pipeline entrypoint yet** — `execute`'s own
implementation (an actual model call) does not exist; ReviewEngine remains
unimplemented and undesigned.

## Milestone 12 (Review Engine) — implemented

Implements ADR-016 exactly: `src/review_engine/review_engine.py` (new
package, sibling to `src/adapter/`), one public function,
`run_review_engine(adapter_result) -> dict` — plain function, no class,
taking exactly `run_adapter(...)`'s output with no second parameter, since
evaluation has no external dependency to inject. Two helpers:
`_evaluate_response(response)`, currently returning `[]` unconditionally
since ADR-016 explicitly defers which category-1 properties are checkable
to a later derivation; and `_build_result(...)`, the one uniform output
shape shared by both outcomes.

An implementation plan was produced and then corrected by explicit review
before any code was written: a proposed `_is_artifact_present` helper was
removed as unnecessary (a single comparison with one call site, inlined
instead of named), and the plan's premature freezing of concrete field
names was corrected, deferring the exact shape to implementation itself —
the same discipline ADR-015 applied to the Adapter's own result shape.

Verified: 11 unit tests (`tests/review_engine/test_review_engine.py`,
stdlib `unittest`), including a `unittest.mock.patch` test proving
`_evaluate_response` is never called for either Adapter failure kind. All
85 tests across `tests/review/`, `tests/prompt/`, `tests/adapter/`, and
`tests/review_engine/` pass together. Validated end-to-end through the real
`build_prompt` → `run_adapter` → `run_review_engine` chain.

**Not wired into any pipeline entrypoint yet** — `_evaluate_response`'s
actual category-1 catalogue does not exist, by design; no component
consumes this result yet, and none is designed. No changes made to any ADR.

## Milestone 13 (Real LLM Integration) — complete, first end-to-end execution

`run_full_pipeline.py` (new, root-level, sibling to `main.py`) is the first
script to run every layer from a cloned commit through a real model response
and back through the Review Engine, in one execution, with zero changes to
any `src/` module. Its `build_evidence()` calls `DatasetCollector`'s existing
private builder methods directly, in sequence, to assemble the full evidence
dict Evidence Fusion requires — `DatasetCollector.collect()` itself still does
not do this; the script works around the gap rather than fixing it.
`call_gemini(system_prompt, user_prompt)` is the first real `execute`
implementation for `run_adapter` — stdlib `urllib.request` against Google's
Generative Language API (`gemini-flash-latest`), reading `GEMINI_API_KEY` from
the environment only, never persisted anywhere.

Verified live against `pallets/click` @
`0f4738df88e3ea47c40a4a442103596a61cfee79`: the full chain (`fuse_evidence` →
`run_reasoning`/`synthesize` → `build_review_context` → `build_prompt` →
`run_adapter` → `run_review_engine`) produced `adapter_result.state ==
"success"` and `review_result.outcome == "evaluated"` with the real response
preserved byte-for-byte and `findings: []` (expected — the category-1
catalogue is still unimplemented). All 85 existing tests pass unchanged. See
`docs/MILESTONES.md` (Milestone 13) and `docs/CHANGELOG.md` for the two real
environment obstacles found (no local SSL CA trust store; the first Gemini
model tried had zero quota under the supplied key) and one real model-behavior
finding (Gemini's real response leaked the raw internal claim id
`verification.no_test_files_changed` into its prose — classified as a model
mistake via ADR-014's own diagnostic test, not a pipeline bug).

**No architectural contradiction was found** — per explicit instruction, this
milestone was implementation-only, and no ADR was touched.

**Not yet true, per `PROJECT.md` rule 4**: `DatasetCollector.collect()` is
still not wired to produce the full evidence dict on its own. The Review
Engine's category-1 catalogue still does not exist. No permanent `src/`-resident
`execute` implementation exists — `call_gemini` lives only in this one script.
No delivery/presentation layer consumes `run_review_engine`'s result. Retries
and provider abstraction remain deliberately unbuilt.

## Milestone 14 / 14B (API preparation + MVP API) — complete

Milestone 14 was a proposal-only deliverable (no code): reviewed the real
Gemini response against `SYSTEM_PROMPT`'s literal text, proposed one
`SYSTEM_PROMPT` counter-example edit (not yet applied), determined the
five-section format parses reliably at heading level only, and recommended
the minimal `POST /review` + `GET /health` surface with error-handling
collapsed to what `run_adapter`'s frozen contract actually preserves.

Milestone 14B implemented that proposal. `run_full_pipeline.py`'s orchestration
is now `src/pipeline/orchestrator.py`'s `run_pipeline_for_commit(
repository_url, commit_hash, execute)` — reusable by both the CLI and the new
API, `execute` required with no default (mirrors `run_adapter`'s own
discipline), raising `CommitResolutionError` when the repo/commit can't be
resolved. The real Gemini `execute` moved to `src/pipeline/gemini_execute.py`.
New package `src/api/`: `response_parser.py` (`parse_review_sections`, outside
the Review Engine, per explicit instruction), `models.py`, `app.py` (`GET
/health`, `POST /review`). `requirements.txt` now lists `fastapi`, `uvicorn`,
`httpx` — this project's first-ever runtime dependencies.

A real, pre-existing bug was found and left unfixed, per this milestone's
"keep the pipeline completely unchanged" instruction:
`DatasetCollector._build_commit_semantic_analysis` raises `IndexError` on a
repository's root commit (no parent to diff against) — `run_pipeline_for_commit`
happens to catch this and surface it as a clean `CommitResolutionError`
(404), not a crash, but the underlying bug is unfixed. One real resource-leak
bug from Milestone 13 (an unused `tempfile.mkdtemp()` per run) was fixed
directly, being trivial and non-architectural.

All 109 tests pass (85 pre-existing + 24 new, all with the LLM call mocked —
no real Gemini call anywhere in the test suite). No ADR was touched; the
Adapter and Review Engine are byte-for-byte unchanged.

**Not yet true, per `PROJECT.md` rule 4**: no auth/persistence/retries/
caching/deployment/provider-abstraction exist, by design. The Review Engine's
category-1 catalogue is still empty. The proposed `SYSTEM_PROMPT` edit from
Milestone 14 (the claim-id-leak counter-example) has still not been applied —
a separate, later fix was applied instead (Milestone 15B, below) for three
different issues found by real-commit evaluation.

## Milestone 15 / 15B / 15C / 15D — real-commit evaluation + prompt calibration — complete; Prompt v1 frozen

Milestone 15 ran the real pipeline against 10 hand-picked real commits
(4 public repos, 10 distinct categories) and evaluated each purely as a real
user reading the review — zero hallucinations found, but three recurring
product issues confirmed: generic semantic-analysis padding in Open
Questions, over-warning on safe commits, and verbosity not scaling with
commit complexity.

Milestone 15B fixed those three issues with three additive sentences in
`SYSTEM_PROMPT`'s `OUTPUT FORMAT`. Milestone 15C re-ran the identical 10
commits and found two of the three fixes validated cleanly, but the third
("nothing requires special attention") caused a real regression — three
commits with legitimate moderate-value findings collapsed to "nothing," and
the single most valuable finding in the whole sample (a real Flask
backward-compatibility break) was softened. Milestone 15D applied one more
narrow, additive fix to that specific clause, gating "nothing requires
special attention" on the reasoning sequence actually having run and found
nothing left uncovered by the Verdict/What-changed sections. Re-validation
showed 8 of 10 commits fully recovered or held clean, with two narrower
residual issues (a partial reappearance of the original over-warning
pattern on one commit; one persistent, pre-existing missing-finding gap on
another).

**Prompt v1 is now frozen (Milestone 15E)**, per explicit instruction, under
the same discipline this project has always applied to ADRs: frozen until
evidence justifies revision. A future revision requires **all four** of:
(1) observed in real usage/production evaluation, not synthetic testing;
(2) repeatable across multiple commits, not an isolated output; (3) a
systematic behavioral failure, not expected model variance; (4) a proposed
wording that demonstrably fixes it without a larger regression, verified the
same evaluate-then-re-validate way as Milestones 15-15D. **Prompt
Engineering is considered finished** as a workstream as of this milestone —
**with the exception of two later edits made under Milestone 16B**, below,
each of which satisfied all four conditions on real GPT-OSS-120B evidence.
`SYSTEM_PROMPT`'s current live text is therefore not byte-identical to what
this milestone froze; see Milestone 16B for exactly what changed and why.

## Milestone 16A / 16B — Review Playground + Evaluation Workflow design

Milestone 16A built `playground/index.html` — a single, dependency-free
static HTML/CSS/vanilla-JS page (no framework, no build step) replacing
curl/Postman for `POST /review`: a repository URL field, optional commit
hash field, Analyze button, loading state, and formatted rendering of the
five review sections (or the raw response, when unparsed). The only backend
change: `src/api/app.py` gained `CORSMiddleware` (`allow_origins=["*"]`) so
a `file://`-opened page can reach the API — transport permission, not new
logic; the endpoint surface is still exactly `POST /review` and `GET
/health`. Verified live (health check, CORS preflight) and all 109 tests
still pass. No history/persistence, no feedback capture, no deployment —
explicitly out of scope per this milestone's own instruction.

Milestone 16B delivered `docs/research/evaluation_workflow.md` (design), then
was executed against a first 6-commit batch (django, numpy, httpx,
sqlalchemy, poetry — via Shakti Studio's OpenAI-compatible API, `SHAKTI_API_KEY`
in `.env`) across three alternative models: Llama 3.3 70B Instruct, DeepSeek
V3, and GPT-OSS-120B. No pipeline/prompt/evaluation code was changed to run
this — only two new, additive `execute` implementations were added,
`src/pipeline/shakti_execute.py` (Llama 3.3) plus scratch-only equivalents
for the other two models (kept outside `src/` per that round's explicit
"do not modify any project code" instruction). Findings: each model showed
a genuinely different trade-off profile (heading-format compliance vs.
uncertainty-vocabulary use vs. internal-terminology leak rate vs. length-risk
scaling vs. technical depth) — no model won cleanly across every axis.

**`SYSTEM_PROMPT` was reopened and edited twice more after Milestone 15E's
freeze**, specifically motivated by GPT-OSS-120B evidence meeting the
freeze's own four-condition test (real, repeatable, systematic, verified
not to regress): (1) an explicit Markdown-heading instruction was added to
`OUTPUT FORMAT` (GPT-OSS-120B and DeepSeek V3 had been rendering bold-text
labels instead of headings, breaking `parse_review_sections`); (2) two
additive counter-examples were added to `WHAT MUST NEVER APPEAR` (one for
literal claim-id leaks, one for module-name/"the claims" style references),
seeded directly from observed leaked phrases. Re-validation after each edit
showed the heading fix fully and durably resolved (6/6 across two
independent re-runs) — a genuine, deterministic specification gap, closed
cleanly. The terminology fixes reduced but did not eliminate leaks: the
*identical* prompt produced 0/6 literal leaks on one re-run and 1/6 on the
next, with new jargon variants appearing after old ones were suppressed —
proving the residual behavior is stochastic (a property of the model's own
generation), not a fixable wording gap. **Conclusion, stated explicitly**:
Prompt v1 has reached diminishing returns on this specific failure family
for GPT-OSS-120B — further prompt iteration was deliberately stopped in
favor of a future deterministic post-processing check (see Milestone 17).

## Milestone 17 — Response Validation Layer (design only, not implemented)

Delivered `docs/research/response_validation_layer_design.md`: a proposal for
a new, deterministic, post-Review-Engine layer that inspects the raw response
text only (no evidence, no second LLM call) for formatting compliance
(missing/duplicate/out-of-order sections), internal-terminology leaks
(literal claim ids, reserved confidence-tier self-tagging, module-name soft
jargon), and structural well-formedness (empty sections, duplicated
paragraphs, malformed markdown) — directly targeting the residual failures
Milestone 16B's GPT-OSS-120B benchmark found and concluded were not further
fixable by prompt wording. Proposed as a new sibling package,
`src/response_validation/`, with one public function
(`validate_response(response_text) -> dict`), sitting after
`run_review_engine` and before the API layer's response construction —
never modifying the Review Engine, Adapter, Prompt Builder, or
`response_parser.py`. Each catalogued rule has an assigned severity
(ERROR/WARNING) and action (reject/sanitize/log only).

**No code was written in this milestone** — design only, per its own
explicit scope. Implementation is named as the next milestone's work.

## Milestone 17A — Response Validation Layer (implemented, standalone)

Built exactly per the approved design: `src/response_validation/response_validator.py`
— `validate_response(response_text) -> dict`, deterministic, side-effect-free,
independent of any LLM, response-text-only (no evidence/Claims/Gaps access).
Never logs, prints, raises, mutates, or sanitizes — those remain deferred to
a future milestone. Reuses `response_parser.py`'s already-public
`SECTION_KEYS` constant; that module is otherwise completely untouched, as
are the Review Engine, Adapter, Prompt Builder, and reasoning modules.

All 11 catalogued rules implemented (4 Formatting, 3 Internal terminology,
4 Structural — see `docs/MILESTONES.md` Milestone 17A for the full list),
each returning `{"rule", "severity", "message", "location"}`; overall
`outcome` (`clean`/`flagged`/`invalid`) derived mechanically from the worst
severity present. The `literal_claim_id_leak` check is anchored on the
exact 10 claim-id prefixes real reasoning modules emit, confirmed via a
dedicated codebase read, not guessed — **this was later tightened in
Milestone 19 to anchor on the full, exact set of 34 claim-id strings
rather than a prefix plus a generic suffix pattern; see Milestone 19
below.** The `unclosed_code_fence` check is
implemented via a fence-aware heading scanner, so an unclosed fence
naturally cascades into `missing_section` findings for whatever it hides,
alongside its own root-cause finding.

**Verified**: 75 new tests, all passing; 184 total across the repository
(109 pre-existing + 75 new), zero regressions.

**Not yet true, per `PROJECT.md` rule 4**: not wired into `POST /review` or
any other caller — a standalone, unused-in-production component until
Milestone 17B. No sanitization/logging/rejection behavior exists yet.

## Milestone 17B — Response Validation Layer (integrated into POST /review)

The validator now runs on every successful pipeline result:
`run_adapter` → `run_review_engine` → `parse_review_sections` →
`validate_response` → API response, on the exact `response` text returned
in `review.raw`. No prompt, parser, Review Engine, Adapter,
reasoning-module, or `response_validator.py` code was changed.

**A genuine conflict with Milestone 14B was found during integration and
resolved by explicit decision, not silently**: 14B already treats a
response missing sections as recoverable (`parsed: false`, still `200`);
17A's `missing_section` rule is `ERROR`-severity. Rejecting on that
condition would have silently reversed 14B's decision. Findings are now
split:

- **Category A** (`missing_section`, `unclosed_code_fence`) — exactly what
  `parsed: false` already represents. **Never rejected** — still `200`,
  `parsed`/`raw` behave exactly as 14B established, findings attached.
- **Category B** (`literal_claim_id_leak`,
  `reserved_confidence_tier_self_tagging`) — genuine contract violations
  14B never addressed. **Rejected with `502`** — the first case in this
  project where a generated response is never returned to a client.
  Takes precedence when both categories fire together.

**API schema** (additive only): `ReviewResponse` gains one optional field,
`validation: ValidationResult | None = None` — `null` when there are no
findings (including every `clean` response), populated with
`{"outcome", "findings"}` whenever there are, for both `flagged` and
non-rejected Category A responses. No existing field changed shape or
meaning.

**Verified**: 14 new tests covering clean/flagged/both Category A
rules/both Category B rules (rejected, no `review` body returned)/Category
B precedence/validator invocation with the exact raw text/validator-
exception propagation as an unhandled error/full backward compatibility.
**All 9 pre-existing API tests pass completely unmodified.** All 198 tests
across the repository pass (184 pre-existing + 14 new), zero regressions.

**Not yet true, per `PROJECT.md` rule 4**: no sanitization, automatic
repair, or regeneration — a Category B rejection only denies the response.
`module_jargon_leak` remains `WARNING`-only and never rejects.

## Milestone 16B (full execution) — Production model swap + 24-commit evaluation

**Gemini is no longer the production model.** `src/pipeline/shakti_execute.py`
now points at `openai/gpt-oss-120b` (was `llama3_3`; the deployment-specific
`id` header was also dropped, not required for this model), and
`src/api/app.py`'s `get_pipeline_runner` wires `execute=call_shakti` instead
of `execute=call_gemini`. This was an explicit, in-milestone user decision,
not part of the evaluation's original scope. `src/pipeline/gemini_execute.py`
still exists and is unmodified, but nothing in `src/` calls it anymore. All
198 tests pass unmodified (the dependency-injection seam absorbed the swap).

The full frozen 24-commit corpus (12 categories × 2, 12 repositories) was
then run fresh against this new production pipeline and fact-checked
commit-by-commit against real `git show` diffs. **Internal-terminology
leakage is systematic for GPT-OSS-120B under the current Prompt v1**: the
`terminology_leak` failure tag fired on 9/24 commits across 9/12
repositories — well past the workflow's 3-commit/2-repo systematic
threshold, several as verbatim internal claim-id strings. `over_warning`
(8/24, 6 repos), `semantic_padding` (5/24, 5 repos), and `verbosity` (5/24,
3 repos) also cross the threshold; `missed_issue` and `hallucination` do
not.

Cross-checked against the live Response Validation Layer on the same 9
leaking responses: only 3 contain a literal claim-id string and are hard-
rejected (`502`); 4 more match an existing `module_jargon_leak` pattern but
are still delivered (`200`, warning attached); the remaining 2 (paraphrases
like "hot file," not covered by any current jargon pattern) return
`outcome: clean` — invisible to the validator entirely. **6 of 9 real
leaks (67%) would reach an actual end user today.** This confirms, at 4x
the sample size and against the model now actually in production, what the
earlier Milestone 16B benchmark round raised speculatively about
GPT-OSS-120B's terminology-leak tendency.

Per this milestone's explicit "evidence collection only" instruction, no
prompt, validator, or jargon-pattern change was made in response to this
finding. No ADR was touched. Full per-commit records live in the scratch
evaluation directory, not committed to the repo.

## Milestone 18 — Release Readiness Audit (findings only)

A full release-readiness audit (docs read in full, the real `POST /review`
lifecycle traced stage-by-stage against actual source, a dead-code sweep
run) found exactly two genuine release blockers: the response validator
rejecting factually correct reviews that mention ordinary filenames like
`documentation.md`, and `GitClient.get_file_history` missing `--follow`,
letting renamed files be misreported as first appearances in real,
delivered review content. Several other real but lower-severity findings
were explicitly labeled non-blocking (CLI/API model divergence, an
API/execute timeout mismatch, a parser-vs-validator duplicate-heading
inconsistency, the root-commit `IndexError`, the always-empty Review
Engine findings, no prompt truncation handling) — see `MILESTONES.md`
(Milestone 18) for the full list. Recommendation was **NOT READY**
pending the two blockers.

## Milestone 19 — Release Blockers Fixed

Both blockers from Milestone 18 are resolved. `response_validator.py`'s
claim-id check now matches the exact, complete set of 34 real claim-id
strings (`_CLAIM_IDS`) instead of a prefix plus a generic suffix wildcard —
see the corrected description under Milestone 17A above.
`GitClient.get_file_history` now passes `--follow` — see the corrected
description under Milestone 8 above and `docs/modules/git_client.md`.
203 tests total (198 + 2 new validator tests + 3 new `GitClient` tests,
`GitClient`'s first-ever test file). Both fixes verified directly against
the real commits that originally exposed them (`mixed_doc_and_code`,
`rename_reorg`).

**Not yet true, per `PROJECT.md` rule 4**: this milestone's own scope
explicitly excluded documentation updates; the resulting staleness
(this document, `ARCHITECTURE.md`, and `docs/modules/git_client.md` all
still described the pre-fix behavior) was identified in Milestone 20 and
corrected in this documentation pass.

## Milestone 20 — Final Release Audit (verification only)

A fresh audit re-confirmed both Milestone 19 fixes intact and found: one
reproducible, user-affecting bug meeting the full correctness/availability/
reliability bar (the root-commit `IndexError`, already known from
Milestone 14B); three hidden architectural inconsistencies (the CLI/API
model divergence, the API/Shakti timeout mismatch, and the parser-vs-
validator duplicate-heading contradiction); two doc-vs-implementation
disagreements (both resolved in this documentation pass); one dead-in-
effect function (`_evaluate_response` ignores its argument, always
returns `[]`); and one production-critical test gap (`gemini_execute.py`/
`shakti_execute.py` have zero automated tests, despite one of them being
the real code every production request executes). None rises to
release-blocking severity. **Verdict: tag as Version 1.**

## Milestone 21 — Product Definition (no code)

A findings-only definition of the product as it exists today: a
five-section triage review of one git commit (Verdict, What changed and
why, What deserves attention ranked, Open questions, Minor notes),
delivered via `POST /review` JSON or the playground's rendered prose nothing
persisted between requests. Primary user: backend engineers reviewing
pull requests in Python codebases specifically, since the symbol-level
semantic evidence (`src/semantic/python/`) only exists for that language.
Deliberate Version 1 non-goals, per `PROJECT.md` and the repository's own
"not yet true" statements: no auth/multi-tenancy, no persistence/history,
no PR- or multi-commit-level review (exactly one commit per request), no
automatic repair of a rejected response, no provider configuration (one
model hardcoded), no CI/deployment integration.

## What exists

- `src/git/git_client.py` — `GitClient`, full git-plumbing layer. See
  `docs/modules/git_client.md`.
- `src/collector/dataset_collector.py` — `DatasetCollector`, takes
  `(repository_url, output_directory, commit_count)`. See `docs/modules/dataset_collector.md`.
- `main.py` — CLI entrypoint: `python3 main.py <repository_url> <commit_count>`. Output
  directory is still fixed to `./benchmark` (not a CLI arg).
- `run_full_pipeline.py` — thin CLI wrapper (Milestone 14B) around
  `src/pipeline/orchestrator.run_pipeline_for_commit`, printing a summary of
  the prompt/adapter/review-engine result for one commit.
- `src/pipeline/orchestrator.py` — `run_pipeline_for_commit(repository_url,
  commit_hash, execute) -> dict`, the reusable orchestration (Milestone 14B)
  shared by the CLI and the API: clone → evidence assembly →
  Fusion → Reasoning → ReviewContextBuilder → PromptBuilder → LLMAdapter →
  ReviewEngine. Raises `CommitResolutionError` if the repo/commit can't be
  resolved.
- `src/pipeline/gemini_execute.py` — `call_gemini(system_prompt, user_prompt)`,
  the real `execute` implementation first built in Milestone 13, relocated
  here in Milestone 14B. **No longer the production model** as of the
  Milestone 16B full-execution round — the file is unchanged and still
  callable, but nothing in `src/` imports it anymore.
- `src/pipeline/shakti_execute.py` — `call_shakti(system_prompt, user_prompt)`
  (Milestone 16B), calling Shakti Studio's OpenAI-compatible API, reading
  `SHAKTI_API_KEY` from the environment. Originally pointed at Llama 3.3 70B
  Instruct for benchmarking only; as of the Milestone 16B full-execution
  round its model constant is `openai/gpt-oss-120b` and it is **the real
  production `execute`**, wired into `src/api/app.py`'s default dependency.
- `src/api/app.py` — the FastAPI app (Milestone 14B): `GET /health`, `POST
  /review`, plus `CORSMiddleware` (Milestone 16A) so the playground can
  reach it, plus (Milestone 17B) `validate_response` wired in after
  `parse_review_sections` — Category A findings (`missing_section`,
  `unclosed_code_fence`) attached but never rejected; Category B findings
  (`literal_claim_id_leak`, `reserved_confidence_tier_self_tagging`)
  rejected with `502`. `src/api/response_parser.py` — `parse_review_sections`,
  splits a model response into ADR-013's five sections outside the Review
  Engine. `src/api/models.py` — the request/response Pydantic schema, now
  including `ValidationResult`/`ValidationFinding` and `ReviewResponse.validation`.
- `playground/index.html` (Milestone 16A) — a single, dependency-free
  static HTML/CSS/vanilla-JS page replacing curl/Postman for `POST
  /review`. Not part of `src/`; no Python code, no build step.
- No custom `GitClient` exception types exist — `run_git_command` failures still
  surface as raw `subprocess.CalledProcessError`. (An earlier version of this
  document described a placeholder `src/git/exceptions.py` file; no such file
  exists in the repository.)
- `src/utils/language_detector.py` — `detect_languages(file_paths)`, extension-based
  language classification. See `docs/modules/language_detector.md`.
- `src/utils/build_system_detector.py` — `detect_build_system(repo_path, file_paths)`,
  package-manager detection. See `docs/modules/build_system_detector.md`.
- `src/utils/layout_detector.py` — `detect_layout(file_paths)`, top-level directory
  classification. See `docs/modules/layout_detector.md`.
- `src/utils/signal_detector.py` — `detect_repository_signals(file_paths)`, marker-file
  detection (documentation/build/containerization/ci). See `docs/modules/signal_detector.md`.
- `src/utils/file_classifier.py` — `classify_file(file_path)`/`is_build_file(file_path)`,
  per-file classification into 9 categories. See `docs/modules/file_classifier.md`.
- `src/utils/co_change_detector.py` — `rank_co_changed_files(...)`, pure ranking of
  historical co-change partners (no git access itself). See
  `docs/modules/co_change_detector.md`.
- `src/utils/module_context_detector.py` — `get_local_module_files(...)`, a file's
  siblings in its own immediate directory. See `docs/modules/module_context_detector.md`.
- `src/semantic/python/symbol_extractor.py` — `extract_symbol_semantics(old_source,
  new_source, file_path)`, symbol-table diffing plus (Milestone 8.5A) per-symbol
  `body_evidence`. See `docs/modules/symbol_extractor.md`.
- `src/fusion/evidence_fusion.py` — `fuse_evidence(evidence)`, lossless adapter. See
  `docs/modules/evidence_fusion.md`.
- `src/reasoning/` — `run_reasoning`/`synthesize`, six modules (`change_shape`,
  `historical_risk`, `reach`, `verification_coverage`, `contract_stability`,
  `body_evidence`). See `docs/modules/reasoning.md`.
- `src/review/context_builder.py` — `build_review_context(synthesized, metadata,
  change_set, diff_text, commit_hash)`, the Milestone 10A Review Context Builder.
  See `docs/modules/context_builder.md`.
- `src/prompt/prompt_builder.py` — `build_prompt(review_context)`, the Milestone 10B
  Prompt Builder. See `docs/modules/prompt_builder.md`.
- `src/adapter/llm_adapter.py` — `run_adapter(prompt, execute)`, the Milestone 11A
  LLM Adapter. See `docs/modules/llm_adapter.md`.
- `src/review_engine/review_engine.py` — `run_review_engine(adapter_result)`, the
  Milestone 12 Review Engine. See `docs/modules/review_engine.md`.
- `src/response_validation/response_validator.py` — `validate_response(response_text)`,
  the Milestone 17A deterministic Response Validation Layer, wired into
  `POST /review` as of Milestone 17B (see above).
- `tests/review/test_context_builder.py` — 22 tests. `tests/prompt/test_prompt_builder.py`
  — 25 tests. `tests/adapter/test_llm_adapter.py` — 27 tests.
  `tests/review_engine/test_review_engine.py` — 11 tests.
  `tests/pipeline/test_orchestrator.py` — 6 tests. `tests/api/test_response_parser.py`
  — 8 tests. `tests/api/test_app.py` — 24 tests (10 from Milestone 14B/16A,
  unmodified, plus 14 new Milestone 17B integration tests).
  `tests/response_validation/test_response_validator.py` — 75 tests. All stdlib
  `unittest`; 198 tests total across the repository.
- `requirements.txt` — lists `fastapi`, `uvicorn`, `httpx` (Milestone 14B, this
  project's first-ever runtime dependencies, needed only for `src/api/`).
  Everything else remains Python stdlib plus the `git` binary.

## What does not exist yet

No AI, no embeddings, no context graphs, no evaluation — all explicitly out of scope per
`PROJECT.md`. `src/review/context_builder.py`, `src/prompt/prompt_builder.py`,
`src/adapter/llm_adapter.py`, `src/review_engine/review_engine.py`,
`src/pipeline/`, `src/api/`, and `src/response_validation/` all have tests —
no test suite exists yet for any earlier layer (`GitClient`, `src/utils/`,
`src/semantic/`, `src/fusion/`, `src/reasoning/`), all of which remain verified only
via ad hoc runs against real repositories, documented in `MILESTONES.md`. No
commit-quality filtering (bot authors, vague messages, diff size) — every non-merge
commit currently qualifies. `GitClient` is still constructed internally by
`DatasetCollector`, not injected. No GitHub API metadata (stars, description,
license) — only git-derived fields exist so far. `build_system` field exists in the
schema but has no detection logic — always `null`. A real `execute` implementation
now exists (`src/pipeline/shakti_execute.call_shakti`, calling GPT-OSS-120B as
of the Milestone 16B full-execution round) — still hardcoded to one
provider/model, no configuration surface, by design (provider abstraction is
explicitly out of scope).
`DatasetCollector.collect()` still does not wire together the evidence
assembly `run_pipeline_for_commit` performs itself. The Review Engine's
`_evaluate_response` category-1 catalogue does not exist yet either, by design
(ADR-016 defers it). `src/api/app.py`'s `POST /review` is now the first real
consumer of `run_review_engine`'s result. ADR-012/013 remain architecture
restated as instructions inside the Prompt Builder's system prompt, not
independently implemented by anything. No retries, caching, auth,
persistence, or provider abstraction exist, by design — this project's first
runtime dependencies (`fastapi`, `uvicorn`, `httpx`) exist solely to serve the
two endpoints above.

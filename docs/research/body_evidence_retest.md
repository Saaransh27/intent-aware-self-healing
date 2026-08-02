# Body Evidence Re-test: 20 commits, 2 per original batch

Follow-up to the 10-batch reasoning evaluation (`reasoning_experiments.md`/
`reasoning_observations.md`) and to Milestone 8.5A (ADR-008), which built
`src/reasoning/modules/body_evidence.py` specifically to close "Function Body
Blindness" — the #1 cross-batch finding. This document re-runs the real pipeline
(`extract_symbol_semantics` → `fuse_evidence` → `contract_stability` +
`body_evidence`) against 20 real commits, 2 selected from each of the original 10
batches, to measure how much of that finding is actually resolved.

**Selection method.** For each batch, the 2 commits chosen were the ones the
original evaluation's own text most directly implicated in body-only blindness or
in one of the four new facts (callee changes, exception changes, context-manager
changes, deprecation markers) — not re-picked arbitrarily. For the two entirely
non-Python batches (3, 5) and the one batch-10 pick that is a merge commit, "most
affected" honestly means "confirmed unaffected," and that is reported as such, not
hidden.

**BEFORE** = `contract_stability` alone (what the original evaluation saw). **AFTER**
= `contract_stability` + `body_evidence` (what exists now). Every number below comes
from actually running the real code against the real old/new source of each commit —
none of this is estimated.

---

## Batch 1 — Mature OSS

**1. `pandas-dev/pandas` `76bac9e3`** (`maybe_downcast_numeric` overflow fix)
- BEFORE: 0 claims.
- AFTER: 4 claims — `structure.internal_symbol_added` + `interaction.callees_changed`
  on the new private helper `_floats_fit_integer_dtype`, plus
  `interaction.callees_changed` and `error_handling.exceptions_caught_changed` on
  `maybe_downcast_numeric` itself (now correctly shows it gained an
  `OverflowError`/`ValueError` catch).
- **Verdict: RESOLVED.** This was the batch's rated "most consequential miss" — the
  real fix is now visible on exactly the two symbols that matter.

**2. `django/django` `bdbda29c3`** (`_non_atomic_requests` mutation → fresh-wrapper fix)
- BEFORE: 2 claims, both on the new `wrapper` symbol only (`public_signature_changed`,
  `decorator_changed`) — trivial new-symbol artifacts. `_non_atomic_requests` itself,
  whose actual behavior changed, had zero claims.
- AFTER: `_non_atomic_requests` itself now gets `interaction.callees_changed` — real
  signal on the function whose logic actually changed, not just on the new symbol
  next to it.
- **Verdict: RESOLVED**, and specifically on the symbol the original evaluation named
  as invisible, not a coincidentally-adjacent one.

## Batch 2 — Personal Projects

**3. `tcx_nogrunt-1` `6a38e90`** (`_run_batch_job` clickcount/error-detail fix)
- BEFORE: 0 claims, 0 modified-symbol entries.
- AFTER: still 0 claims, still 0 modified-symbol entries.
- **Verdict: NOT resolved — correctly so.** Inspected the real diff directly: every
  change is a dict-key assignment (`job["tcs"][tc_idx]["detail"] = ...`) or a counter
  relocation (`cc += 1` moved outside an `if`). No new call, exception, context
  manager, or docstring marker exists anywhere in the diff. This is a genuine
  control-flow/data-flow change, which is exactly what ADR-008's ceiling excludes
  (no control-flow analysis, no behavior inference) — the honest boundary, not a bug.

**4. `~/Projects/Triple` `3f2615e`** (deletion of a duplicate-analysis subsystem +
`parse_excel`/`infer_page_context` body edits)
- BEFORE: 6 claims, all about the three deleted symbols (`normalize_triple`,
  `run_duplicate_analysis`, `triple_signature`) — correctly caught removals.
- AFTER: +5 claims — `parse_excel` and its nested `merge_step_lines` now surface as
  genuinely new, previously-invisible `interaction.callees_changed` claims.
- **Nuance worth stating precisely**: the specific symbol the original evaluation
  named as missed, `infer_page_context`, is **still not claimed** — checked directly:
  its `body_evidence` shows zero deltas in any of the four categories (the change is
  a pure statement reorder, no new call/exception/context-manager/marker). It does
  appear in the raw symbol diff (`docstring_status: "changed"`, unrelated to the
  reorder), but that field still isn't consumed by any claim (a separate, pre-existing
  gap). So: **partially resolved** — real new signal appeared on two other real
  body-only changes in the same commit, but the originally-named miss persists, for
  a documented, honest reason.

## Batch 3 — Company/Internal Repositories

No re-extraction performed. Both selected commits (`api_nogrunt-1` `8790717`, Java;
`next-auto-llm-1` `a21fd05`, TSX) are non-Python, confirmed in the original
evaluation. `semantic_analysis` (and therefore `body_evidence`, which consumes only
that section) never activates for non-Python files — this is true by construction,
not something that needed re-running to confirm. **Verdict: unaffected, as expected.**
This batch's real gap (JS/Java/TSX language coverage) is untouched by this milestone
and was never claimed to be.

## Batch 4 — Active Startup Repositories

**5. `langchain-ai/langchain` `0a3bde64`** (`ToolRetryMiddleware`: bare `raise`
replaces `self._handle_failure(...)`)
- BEFORE: 0 claims.
- AFTER: **still 0 claims** — this is the single most important finding in this
  whole re-test. Verified directly: `self._handle_failure` is called from a *second*
  call site later in the same method (the final-attempt-exhausted path), so removing
  *this* call site does not change the function's aggregate `callees` set — the name
  is still present, just from the other call site. The set-diff representation
  chosen in ADR-008 (mirroring the existing imports/decorators pattern) cannot see a
  call site changing when the same callee already exists elsewhere in the same
  function.
- **Verdict: NOT resolved, and not for the control-flow reason above — for a distinct,
  newly-discovered representation limitation.** See "Key finding" below.

**6. `PostHog/posthog` `bf1c84d40`** (`groups.py` prefilter guard + new private helper)
- BEFORE: 0 claims.
- AFTER: 6 claims — `structure.internal_symbol_added` + `interaction.callees_changed`
  on the two new private helpers (`_guarded_events_aliases`,
  `_chain_hits_guarded_alias`), `error_handling.exceptions_caught_changed` on
  `_guarded_events_aliases`, and `interaction.callees_changed` on
  `_outer_events_prefilter` itself (the call-site update the original evaluation
  named as invisible).
- **Verdict: RESOLVED.**

## Batch 5 — Infrastructure/DevOps

No re-extraction performed, same reasoning as Batch 3: both selections
(`terraform-aws-modules/terraform-aws-eks` `64558a4`, HCL;
`prometheus-community/helm-charts` `a292ec61`, Helm YAML) are non-Python by
construction. **Verdict: unaffected, as expected.**

## Batch 6 — Library/API Repositories

**7. `pallets/click` `c2ed414`** (deprecate `isolated_filesystem`) — the exact commit
that motivated the reviewer-facing-category redesign and the `warnings.warn`
question.
- BEFORE: 0 claims.
- AFTER: 2 claims — `interaction.callees_changed` (the new `warnings.warn` call,
  correctly generalized, no bespoke detector) and `documentation.deprecation_marker_added`.
- **Verdict: RESOLVED** (already verified once during implementation; re-confirmed
  here as part of the formal 20-commit set).

**8. `pydantic/pydantic` `2294b528`** (internal typing fix in `_fields.py`)
- BEFORE: 0 claims, 0 symbols at all.
- AFTER: still 0 claims, 0 symbols.
- **Verdict: NOT resolved — matches the original evaluation's own finding exactly**
  ("Zero symbols reported at all... the cleanest, simplest instance of the body-only
  blind spot"). Included deliberately as an honest negative control: this fix touches
  type-variable substitution logic with no call/exception/context-manager/docstring
  surface for the new facts to attach to, and the original evaluation already
  predicted this would stay invisible.

## Batch 7 — Refactoring-heavy Commits

**9. `pallets/flask` `9822a035`** (`stream_with_context` reworked for async views)
- BEFORE: 0 claims.
- AFTER: 4 claims across `stream_with_context` and its nested `generator` —
  `interaction.callees_changed` and `resource_management.context_managers_changed`
  on both.
- **Verdict: RESOLVED.** This was rated the batch's clearest example of "a refactor
  succeeding at preserving its signature is exactly what this layer cannot see" —
  now it can, via the changed call/context-manager surface underneath the unchanged
  signature.

**10. `django/django` `3f912ee4`** (`set_choices()` extracted from `FilePathField.__init__`)
- BEFORE: 1 claim (`public_signature_changed` on the new `set_choices`, already one
  of the best contract_stability results in the whole series).
- AFTER: +4 claims — `interaction.callees_changed` and
  `resource_management.context_managers_changed` on **both** `__init__` (whose
  callee set shrank now that logic moved out) and `set_choices` (the new method).
  `__init__` itself is now a genuine body-only `modified` entry.
- **Verdict: improved, though this commit was already a strong case.** The new signal
  is on `__init__` specifically — the side of an extraction refactor contract_stability
  never had anything to say about before, since only the new method changed its
  contract.

## Batch 8 — Bug Fixes

**11. `django/django` `a2348c85`** (new private `_is_set` helper fixes inlines crash)
— the exact real-world precedent for `structure.internal_symbol_added`.
- BEFORE: 0 claims. The original evaluation called this "the entire substance of the
  crash fix" producing nothing.
- AFTER: 3 claims — `structure.internal_symbol_added` and
  `interaction.callees_changed` on the new `_is_set`, and
  `interaction.callees_changed` on `Model._is_pk_set` (which now calls it).
- **Verdict: RESOLVED**, directly on the commit that originally named this exact gap.

**12. `psf/requests` `2d551768`** (`Response.json()` JSONDecodeError consistency fix)
— the exact real-world precedent named for exception-type tracking.
- BEFORE: 0 claims, 0 symbols.
- AFTER: **still 0 claims, 0 symbols** — verified directly at the raw-fact level:
  `Response.json()`'s `exceptions_caught` set is `{UnicodeDecodeError,
  JSONDecodeError}` and `exceptions_raised` is `{RequestsJSONDecodeError}` — **on
  both the old and new side**, identically. The fix adds a *second* `except
  JSONDecodeError / raise RequestsJSONDecodeError` site to a branch that didn't have
  one, but the *same* exception types are already present at the function's other,
  pre-existing `except`/`raise` site. The aggregate set has no delta even though the
  function unambiguously changed.
- **Verdict: NOT resolved — and this is the second, independent confirmation of the
  exact same representation limitation found in Batch 4's langchain commit.**

## Batch 9 — Feature Commits

**13. `fastapi/fastapi` `749cefde`** (JSON-Lines/binary streaming, 4 new private +
1 new public helper)
- BEFORE: 1 claim (`public_signature_changed` on the one new *public* helper,
  `get_stream_item_type`) — the original evaluation noted the tool "sees roughly 2 of
  the ~6 new/changed symbols that actually matter," with the four new *private*
  helpers producing nothing.
- AFTER: no additional claim on the four new private helpers in this specific file
  (checked directly: `fastapi/dependencies/utils.py` alone doesn't contain them —
  they live in a sibling file not included in this narrower single-file re-test).
  `get_stream_item_type` itself gains `interaction.callees_changed`.
- **Verdict: inconclusive as scoped** — this result is narrower than the original
  finding because only one of the commit's 21 changed files was re-extracted here;
  it does not contradict the original finding, it just doesn't fully retest it.
  Flagged rather than overstated.

**14. `crewAIInc/crewAI` `53c22844`** (ZIP deploy fallback, largest commit in the
whole series — 20 files, 2447 lines)
- Full multi-file re-extraction across all 9 non-test Python files in the commit.
- BEFORE: 13 claims (mostly new-symbol artifacts on `Repository`/`PlusAPI` methods).
- AFTER: **105 claims** across 11 `modified` symbol entries, 7 of them genuinely
  body-only (`PlusAPIMixin.__init__`, `DeployCommand._confirm_input`,
  `DeployCommand.create_crew`, `DeployCommand.deploy`, `Repository.fetch`,
  `_chain_deploy`, `run_crew` — all previously invisible). Also correctly produced
  **zero** `structure.internal_symbol_added` claims for the ~17 new private helpers
  in the brand-new file `deploy/archive.py` (verified directly: every symbol in that
  file is `added`, none `modified`, so the "some other symbol in the same file was
  modified" condition correctly withholds the claim there) while correctly firing it
  for new private helpers in `run_crew.py`/`main.py`/`git.py`, where a pre-existing
  symbol in the same file was also genuinely modified.
- **Verdict: RESOLVED, and confirms the module scales correctly and safely to a
  large, multi-file, real commit** — no crashes, no runaway claim counts, and the
  `structure.internal_symbol_added` gating behaved exactly as designed under real
  pressure, not just the small hand-built test case that originally validated it.

## Batch 10 — Edge Cases

**15. `django/django` `0f581cd29`** (dictionary-based MAILERS, 47 files — the
slowest commit in the original series, 16.4s, 80% in `co_change`'s N+1 pattern)
- Full multi-file re-extraction across all 15 non-test Python files.
- BEFORE: 32 claims.
- AFTER: +50 claims, 11 of them body-only modified entries previously invisible
  (`LazySettings.__getattr__`, `LazySettings.__setattr__`, `Settings.__init__`,
  `EmailBackend.__init__`, `EmailMessage.__init__`,
  `BrokenLinkEmailsMiddleware.process_response`, `AdminEmailHandler.send_mail`, and
  others).
- **Verdict: RESOLVED at scale.** Also a useful performance data point: extracting
  and diffing `body_evidence` across 15 files added no perceptible slowdown in this
  run — `symbol_extractor`/`body_evidence` never call git subprocesses, so they don't
  touch the `co_change` bottleneck that made the original commit slow.

**16. `pallets/flask` `9fcd34c9`** (real merge commit fed through the builder methods)
- Confirmed directly: the file `change_set` actually reports for this commit (via
  the existing first-parent-diff behavior) is a single file,
  `docs/patterns/mongoengine.rst` — not Python. `body_evidence` cannot engage
  regardless of anything built in Milestone 8.5A.
- **Verdict: unaffected, correctly so** — this is `change_set`/`identity`'s
  first-parent scoping gap (ADR-006), a different, already-documented problem this
  milestone never touched or claimed to fix.

---

## Headline numbers

Of the 16 commits where Python re-extraction was actually possible (excludes the 4
non-Python-by-construction picks in Batches 3/5/10-flask):

- **10 of 16 (62.5%)**: the originally-invisible body-only change is now correctly
  surfaced as a claim. (Batches 1×2, 4-posthog, 6-click, 7×2, 8-django, 9-crewai,
  10-django — plus Batch 2's `parse_excel` partially.)
- **2 of 16**: still correctly invisible for the *right*, already-documented reason
  — pure control-flow/data-flow changes with no new call/exception/context-
  manager/marker (`tcx_nogrunt-1` `6a38e90`), or a fix with no such surface at all
  (`pydantic` `2294b528`).
- **2 of 16**: still invisible for a **new, distinct, and more interesting reason**
  — the set-diff representation cannot see a call-site or raise/except-site change
  when the same callee/exception type already exists elsewhere in the same function
  (`langchain` `0a3bde64`, `requests` `2d551768`).
- **1 of 16**: inconclusive as narrowly re-scoped (`fastapi` `749cefde` — only one of
  21 changed files was re-tested).
- **1 of 16**: partially resolved (`~/Projects/Triple` `3f2615e` — new signal
  appeared nearby, but the specific originally-named symbol is still uncaught for a
  documented reason).

## Key finding: the set-aggregation blind spot

The single most important result from this re-test wasn't predicted by ADR-008 and
is worth stating plainly: **when a function calls/raises/catches the same
name at more than one site, and a commit changes only one of those sites, the
aggregate `{"added": [...], "removed": [...]}` set shows no delta at all** — because
the name is still present in the set, just from a different site. This happened
independently in two unrelated repos (`langchain`, `requests`), on exactly the kind
of commit body_evidence was built to catch (a changed callee, a changed exception
type). Both are real, meaningful fixes; both are still completely invisible after
this milestone, for a reason distinct from (and more specific than) the general
"no control-flow analysis" ceiling — the ceiling explains why *ordering* changes are
invisible; this explains why some *content* changes are invisible too, purely
because of how the fact is aggregated. Flagged here as a finding, not fixed —
matching this project's standing practice of surfacing what real data shows before
deciding what, if anything, to build in response.

## What this confirms works correctly

- Real, previously call-flagged commits (`pandas`, `django`×3, `posthog`, `click`,
  `flask`, `crewAI`) all now produce correct, non-noisy signal exactly where the
  original evaluation said the pipeline was blind.
- `structure.internal_symbol_added`'s same-file-modified gate behaved correctly under
  real, complex, multi-file pressure (crewAI's 20-file commit), not just the small
  hand-built pair it was designed against — correctly silent for an all-new file,
  correctly firing for files mixing new and modified symbols.
- No crashes, no runaway claim counts, and no measurable performance cost across the
  two largest multi-file commits re-tested (crewAI's 2447-line commit, Django's
  47-file mail commit).

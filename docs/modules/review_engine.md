# review engine (Milestone 12)

`src/review_engine/review_engine.py`

## Purpose

Implements ADR-016 exactly: the component downstream of the LLM Adapter that
determines what, if anything, can honestly be said about the model's
response by checking only what is directly observable in the artifact
itself — never reconstructing the Review Context, never replaying the
model's reasoning, never certifying correctness. Produces independent,
additive findings alongside the unaltered response under a two-outcome
contract, and trusts the Adapter's frozen contract (ADR-015) unconditionally.

## Public API

- `src/review_engine/review_engine.run_review_engine(adapter_result) -> dict`
  — the only public function. Plain function, no class, matching this
  project's convention — ADR-016's state contract presupposes a pure,
  stateless computation, the same reasoning that made every earlier builder
  a plain function. Takes exactly `run_adapter(...)`'s return value, no
  second parameter: unlike the Adapter, there is no external dependency to
  inject, since ADR-016 establishes that no state anchors an
  "Attempting"-equivalent interval here — evaluation has none to anchor.

Returns a plain dict with four keys: `outcome` (`"no_artifact"` or
`"evaluated"`, exposed as `OUTCOME_NO_ARTIFACT`/`OUTCOME_EVALUATED`),
`adapter_state` (the Adapter's own state, preserved verbatim — which of its
two failure kinds occurred is never collapsed), `response` (preserved
exactly, or `None`), and `findings` (a list, empty when no catalogue check
fires). This concrete shape is an implementation choice, decided at this
step rather than pre-fixed during planning — ADR-016 explicitly leaves the
representation of the outcome and of a finding to implementation, the same
way ADR-015 left the Adapter's result shape open until Milestone 11A wrote
it.

## Internal helpers

- `_evaluate_response(response) -> list` — the named seam where category-1
  checks apply. Its body is currently `return []` unconditionally, because
  no specific properties of ADR-012/013's current text have been derived as
  checkable yet — ADR-016 explicitly defers that catalogue to "whatever
  later derivation applies the test to that text." The function exists now,
  empty, so a future milestone fills in its logic without needing to change
  `run_review_engine`'s own structure — the same role `execute` played for
  the Adapter, except not injected: category-1 checking has no external
  dependency requiring a caller-supplied seam, so it belongs inside this
  module, the way `registry.py`'s `MODULES` list belongs inside the
  Reasoning layer rather than being supplied by a caller.
- `_build_result(outcome, adapter_state, response, findings) -> dict` —
  constructs the one uniform output shape shared by both outcomes. A single
  builder, not two (unlike the Adapter's separate `_success`/`_failure`),
  because both Review Engine outcomes populate the identical four fields —
  only the values differ, not the shape.

There is deliberately no helper for the presence/absence branch itself. An
earlier draft of this plan proposed `_is_artifact_present`, but it wrapped a
single `state == STATE_SUCCESS` comparison with exactly one call site,
encapsulated no reusable logic, and obscured the branch more than it
clarified it — unlike `_invalid_prompt_reason`/`_invalid_execution_result_reason`
in the Adapter, which each isolated multiple substantive checks genuinely
worth testing independently. The comparison is inlined directly in
`run_review_engine`.

## Data flow

`run_review_engine` checks `adapter_result["state"]` against
`STATE_SUCCESS` (imported from `src.adapter.llm_adapter`, not duplicated as
a literal). If it does not match, a `no_artifact` result is built and
returned immediately, carrying the original `adapter_state` through
unchanged — `_evaluate_response` is never called, so evaluation is never
attempted, structurally, not merely skipped. If it matches, `_evaluate_response`
is called on the response, and an `evaluated` result is built carrying the
response, unaltered, alongside whatever findings resulted. One branch, one
return per path, no loop, no re-entry — the same structure that makes the
Adapter's forbidden transitions unrepresentable applies here: neither
outcome can transition to the other, because the function returns exactly
once.

## Integration points

**With the LLM Adapter:** direct pass-through — `run_review_engine`'s
argument is exactly `run_adapter(...)`'s return value, no translation layer.

**With whatever consumes the Review Engine's result:** not designed here.
ADR-016 explicitly defers the responsibilities, states, and interface of
whatever eventually delivers this result to a person; this module's output
is that component's input, and nothing more is assumed about it.

## Unit-testing strategy

`tests/review_engine/test_review_engine.py`, stdlib `unittest`, 11 tests.
`_evaluate_response` tested directly to confirm the empty catalogue is
deliberate and stable across ordinary, empty, and non-ASCII input. Both
Adapter failure kinds tested to produce `no_artifact` while preserving
which kind occurred, and confirmed distinguishable from each other via
`adapter_state`. A `unittest.mock.patch` test substitutes a spy for
`_evaluate_response` that raises if called, proving it is never invoked for
either failure kind — the direct analogue of the Adapter's `_never_called`
stub, adapted because this seam is internal rather than caller-injected.
Success with a non-empty response, and separately with an empty-string
response, both tested to produce `evaluated` — the empty-string case
specifically pins the boundary inherited from ADR-015's own structural
presence/absence resolution, which this module trusts unconditionally.
Response preservation tested with non-ASCII content. Result-shape
uniformity tested across all three reachable scenarios, confirming no
certifying field ever appears (Bounded Authority). Determinism tested via
repeated calls with identical input. Non-mutation of the caller's original
`adapter_result` tested explicitly, though — see Edge cases — this is
structurally guaranteed by Python's string immutability rather than by any
defensive copying in the code. Additionally validated end-to-end through
the real `build_prompt` → `run_adapter` → `run_review_engine` chain, on both
a successful and a failing model stub.

## Edge cases explicitly handled

- Both Adapter failure kinds independently produce `no_artifact`, each
  preserving its own `adapter_state` rather than being collapsed into one
  generic value.
- A success response that is an empty string is still `evaluated`, not
  `no_artifact` — inherited directly from the Adapter's own contract, which
  this module trusts without re-checking.
- No defensive copying (e.g. `copy.deepcopy`) is used, unlike
  `context_builder.py`'s handling of claims and gaps. That copying was
  necessary there because claims and gaps are mutable structures; here,
  `state` and `response` are a string and a string-or-`None`, both
  immutable in Python, so aliasing poses no actual risk. Adding
  `copy.deepcopy` here would defend against a problem that cannot occur for
  this input shape.

## Dependencies

Python stdlib only. Imports `STATE_SUCCESS` from `src.adapter.llm_adapter`
rather than duplicating the literal.

## Future Improvements

- `_evaluate_response`'s actual category-1 catalogue — which specific
  properties of ADR-012/013's current text are checkable and how — is not
  derived here. ADR-016 explicitly defers this; filling in this function's
  body is a separate, later piece of work, not a gap in this milestone.
- The responsibilities, states, and interface of whatever consumes this
  module's result are undesigned, per ADR-016's own deferral.

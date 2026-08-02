# llm adapter (Milestone 11A)

`src/adapter/llm_adapter.py`

## Purpose

Implements ADR-015 exactly: the first component in this project whose job
requires an actual model to run, and the first deliberate exception to the
pipeline's full determinism. Carries the Prompt Builder's exact output across
the one nondeterministic boundary in this system, and carries back whatever
resulted — completely, in a stable, uniform representation, distinguishing
whether a response is present or absent structurally, never by judging its
content.

## Public API

- `src/adapter/llm_adapter.run_adapter(prompt, execute) -> dict` — the only
  public function. Plain function, no class, matching this project's
  convention: `GitClient`/`DatasetCollector` are the only stateful classes in
  this codebase, and ADR-015 explicitly states the Adapter "holds no state
  across calls."
  - `prompt` — exactly `build_prompt(review_context)`'s return value,
    `{"system_prompt": str, "user_prompt": str}`. Additional keys are allowed
    and ignored (e.g. if a future caller happens to pass through
    `commit_hash` alongside the prompt for its own bookkeeping — the Adapter
    never reads it either way).
  - `execute` — an injected callable representing the act of actually causing
    a model to process the prompt. Contract: called as
    `execute(system_prompt, user_prompt)`; must return a `str` (any string,
    including empty) or raise. This callable is the seam where a real model
    call will eventually be plugged in; its own implementation is out of
    scope for this milestone, matching ADR-015's deferral of "which model or
    execution target a request is addressed to, and how that is configured."

Returns a plain dict, uniform across all three terminal states:
```
{"state": "adapter_boundary_failure" | "execution_boundary_failure" | "success",
 "response": str | None}
```
`response` is populated only for `"success"`, with the exact string `execute`
returned — never truncated, reformatted, or summarized. It is `None` for both
failure states.

## Internal helper functions

- `_invalid_prompt_reason(prompt) -> str | None` — returns a specific,
  human-readable reason if `prompt` doesn't satisfy the input contract (not a
  dict; `system_prompt`/`user_prompt` missing or not a `str`), or `None` if
  valid. Additional keys never produce a reason — only the two required keys
  are checked.
- `_invalid_execution_result_reason(result) -> str | None` — returns a
  specific reason (e.g. `"execute must return a str, got NoneType"`) if
  `execute`'s return value isn't a `str`, or `None` if it is.
- `_failure(state) -> dict` / `_success(response) -> dict` — build the
  uniform two-key result shape for the three terminal states.

**Why reasons exist as separate, named, directly-testable functions rather
than being threaded anywhere at runtime:** per explicit instruction, the
specific reason a failure occurred must be preserved *internally*, for
maintainability, without appearing anywhere in the public return value or
requiring any logging/inspection mechanism (which ADR-015 explicitly defers).
Living as dedicated functions with their own direct unit tests satisfies
both: a maintainer can read or test exactly why a given input was rejected,
while `run_adapter` itself only ever checks *whether* a reason exists
(`is not None`), never propagating the string itself into the result or into
any new runtime infrastructure.

## Data flow

1. `_invalid_prompt_reason(prompt)` is checked. If a reason exists,
   `execute` is **never called**, and the result is
   `adapter_boundary_failure` — this is the only path to this state, and it
   structurally precedes any engagement with `execute`.
2. `execute(system_prompt, user_prompt)` is called inside a single
   `try`/`except Exception` block (deliberately not `except BaseException`,
   so `KeyboardInterrupt`/`SystemExit` are not swallowed).
3. If `execute` raises anything, the result is `execution_boundary_failure` —
   undifferentiated by exception type, per ADR-015's own statement that
   reasons for execution-boundary failure "are not architectural
   distinctions this ADR makes."
4. If `execute` returns without raising, `_invalid_execution_result_reason`
   checks the return value is a `str`. If it is not — including `None` —
   the result is **also** `execution_boundary_failure`, not
   `adapter_boundary_failure` and not `success`. See "The None/non-str
   resolution" below for why.
5. If the return value is a `str` (including `""`), the result is `success`,
   with `response` set to that exact string.

## The None/non-str resolution — a deliberately settled ADR-015 boundary question

An earlier version of this plan considered classifying a non-`str` return
from `execute` (including `None`) as `adapter_boundary_failure`, on the
reasoning that it represents a contract violation rather than a real
execution outcome. This was identified as a genuine conflict with ADR-015,
not a free implementation choice: ADR-015's state contract is explicit that
"Attempting resolves to either Execution-boundary failure or Success" — a
closed list — and that Adapter-boundary failure is defined specifically as
preceding Attempting ("what allows Adapter-boundary failure to branch
*before* this point is ever reached"). Once `execute` has been invoked,
Attempting has begun; anything resulting from that invocation, including a
malformed return value, is deterministically classified as
`execution_boundary_failure`. This keeps ADR-015's frozen transition table
exactly as written. The distinction the caller actually cared about
preserving — *why* an execution-boundary failure occurred — is kept, but
internally only, via `_invalid_execution_result_reason`, never by adding a
new externally-visible state or transition.

## Integration point with the Prompt Builder

Direct pass-through, no translation: `run_adapter`'s `prompt` argument is
exactly `build_prompt(review_context)`'s return value. No changes were made
to `src/prompt/prompt_builder.py`.

## Integration point with the future ReviewEngine

`run_adapter`'s return dict is exactly what a future ReviewEngine will
consume, inspecting `state` to decide what to do for each of the three
outcomes. That decision logic, and ReviewEngine's own states or interface,
are not designed here — ADR-015 explicitly defers them, and this module does
the same.

## Unit-testing strategy

`tests/adapter/test_llm_adapter.py`, stdlib `unittest`, 27 tests. Both
internal reason-computing helpers are tested directly — a deliberate
exception to this project's usual practice of testing only the public
function, justified because the reason-preservation property has no other
way to be verified once it explicitly never surfaces in `run_adapter`'s
return value. Grouped by concern: prompt-validation reasons (valid prompt,
extra keys allowed, each of the four invalid cases individually); execution-
result reasons (valid `str`, and `None`/`int`/`list`/`dict` each producing a
distinct message); success (non-empty response, unicode preserved exactly,
empty-string response still success, extra prompt keys don't block success);
execution-boundary failure (`execute` raising, multiple exception types all
collapsing to the same state, `None` and non-`str` returns all classified
here rather than as success or adapter-boundary failure); adapter-boundary
failure (each invalid-prompt case, `execute` proven never called via an
assertion-raising stub, extra keys not masking a genuine validation
failure); uniform result shape across all three terminal states; no
fabricated response content on any failure; determinism across repeated
calls. Additionally validated against a real `build_prompt(...)` output
end-to-end, confirming no adapter shim is needed between the two modules.

## Edge cases explicitly handled

- `execute` returns `None` — classified as `execution_boundary_failure`, not
  success and not adapter-boundary failure (see resolution above).
- `execute` returns any other non-`str` type (`int`, `list`, `dict`, a bare
  `object()`) — same classification, same reasoning.
- `execute` returns `""` — still `success`; ADR-015 treats a minimal
  answer-shaped result as present, not absent.
- `execute` raises different exception types — all collapse to the same
  `execution_boundary_failure` state; the specific type is not surfaced.
- `prompt` has extra keys beyond `system_prompt`/`user_prompt` — allowed and
  ignored, whether the prompt is otherwise valid or not (extra keys never
  mask a genuine validation failure on the two required keys).
- `prompt` is not a dict at all, or is missing/mistyped on either required
  key — `adapter_boundary_failure`, `execute` never called.

## Dependencies

Python stdlib only.

## Future Improvements

- `execute`'s own implementation (an actual model call) is not built here —
  deliberately deferred, per ADR-015.
- No mechanism exists for inspecting or logging what was actually sent or
  received, or for retrying a failed attempt — both explicitly deferred by
  ADR-015, not solved here.
- The internal reason strings computed by `_invalid_prompt_reason` and
  `_invalid_execution_result_reason` are implementation detail only, verified
  by direct unit tests rather than any runtime logging — if an operational
  need for surfacing these at runtime is ever demonstrated, that is a
  separate, later design question, not a reason to expand this module's
  public contract now.

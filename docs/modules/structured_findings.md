# structured findings (Milestone 8, Part A5)

`src/response_validation/structured_findings.py`

## Purpose

Extracts and strictly validates the model's own structured findings from
section 3 of its response ("What deserves attention, ranked" — see
`docs/modules/prompt_builder.md`'s Milestone 8 update for the prompt
contract this parses). This is the enforcement half of Milestone 8's Part
A: the prompt asks the model for a schema-conformant JSON array, but an
LLM with no fixed seed is not guaranteed to comply, so this module treats
every model response as untrusted input and never lets a malformed or
out-of-contract value reach the frontend silently.

## Guiding rule

Repair only what is mechanically safe (whitespace, casing drift on a
controlled field, a bare string where an array was expected, a trailing
comma before a closing bracket). Never invent or reinterpret a field's
*meaning* — a value like `"Likely"` in the `confidence` field is left
exactly as the model wrote it and allowed to fail validation, since
silently mapping it onto one of the three allowed terms would be a
fabrication, not a repair. Anything that still doesn't fit the contract
after mechanical repair is rejected — the finding is dropped, not patched
with a guessed value.

## Public API

- `parse_structured_findings(section_text) -> dict` — the only public
  function. Returns a dict shaped like `api.models.StructuredFindingsResult`:
  - `state`: `"unavailable"` (no fenced JSON array could be extracted or
    parsed at all — nothing here can be trusted as structured data, and
    callers must not derive a verdict from it), `"reduced"` (the JSON
    parsed, but one or more individual findings had to be dropped for not
    matching the schema), or `"ok"` (every element the model reported
    validated cleanly, including the legitimate case of an empty array —
    "nothing requires special attention").
  - `findings`: the validated `StructuredFinding` Pydantic model list
    (never includes a rejected or repaired-past-recognition entry).
  - `total_reported`: how many elements the model's own array contained,
    before validation.
  - `rejected_count`: `total_reported - len(findings)`.
  - `parse_error`: set only when `state` is `"unavailable"`.

## Internal workflow

1. `_extract_json_array_text` finds the first ` ```json `-or-bare-fence
   code block in the section text via regex and returns its raw content,
   or `None` if no fence is present at all (→ `state: "unavailable"`).
2. `json.loads` is attempted directly; on failure, one mechanical repair
   pass strips a trailing comma before a closing bracket/brace
   (`_TRAILING_COMMA`) and retries. A second failure is `state:
   "unavailable"` with the parser's own error message in `parse_error`.
3. The parsed value must be a JSON array — anything else (a bare object, a
   string, a number) is `state: "unavailable"`.
4. Each element is validated independently via `_validate_one`:
   - `_repair_enum_case` fixes whitespace/casing drift against the exact
     literal each enum field expects (e.g. `"confirmed"` → `"Confirmed"`),
     using `typing.get_args` on `StructuredFinding`'s own field
     annotations as the source of truth for allowed values — never a
     second, hand-maintained list that could drift from the schema.
   - `_repair_list_fields` wraps a bare string in a single-element list
     for the four array fields (`evidence`/`affectedFiles`/
     `affectedSymbols`/`verificationNeeded`) — a harmless model slip with
     no ambiguity about intent.
   - The repaired dict is validated against `StructuredFinding.model_validate`
     (Pydantic, strict `Literal` types on every controlled field). A
     `ValidationError` means the finding is dropped, not fabricated into
     conformance.
5. `total_reported`/`rejected_count`/`state` are computed from how many
   elements survived step 4.

## Why this is a separate module from `response_validator.py`

`src/response_validation/response_validator.py`'s `validate_response`
checks ADR-013 presentation-contract compliance over the *entire response
text as prose* — heading structure, internal-vocabulary leaks, markdown
well-formedness. Its `_check_claim_id_leaks` check in particular scans the
whole response for the 34 literal backend claim-id strings and would
misfire on this module's own `evidence`/`affectedFiles`/`affectedSymbols`
arrays, which are *supposed* to contain literal identifiers and file paths
— that check's definition of "leak" only makes sense for prose, not for
these structured fields. Rather than teach the old prose-checker
exceptions for a JSON blob embedded inside one of its sections, this is a
new, independent module scoped only to that one section's JSON content,
with its own validation discipline (schema conformance, not prose-leak
detection). Both modules run on every review; neither is aware of the
other, and `app.py` calls both independently (see `_structured_findings_result_or_none`
and `_validation_result_or_none`).

**Known, disclosed, pre-existing interaction**: `response_validator.py`'s
claim-id-leak check can still fire a false positive on prose sections
(1/2/4/5) when a commit's own real code legitimately uses an identifier
that happens to collide with one of the 34 backend claim-id strings (e.g.
a frontend constant named identically to a real claim id) — observed
directly against a real regenerated PR #2 fixture this milestone. This is
unrelated to structured findings, not fixed here (out of scope — the
`validation.outcome`/`validation.findings` this produces are not
currently rendered anywhere in the frontend, so it has no live user-facing
effect today), and is not new: the same check would have misfired on
Milestone 7's prose-only findings too, for the same reason.

## Dependencies

- `src/api/models.StructuredFinding` — the schema itself (enum values,
  required fields). This module has no independent notion of what's
  valid; it defers entirely to that Pydantic model.
- Python stdlib only otherwise (`json`, `re`, `typing.get_args`).
- Consumed by: `src/api/app.py`'s `_structured_findings_result_or_none`,
  wired into both `POST /review` and `POST /review/pr`.
- No network access, no LLM call, no mutation of its input — a pure
  function over already-produced text.

## Unit-testing strategy

Verified directly against real, live model output captured this
milestone (not only hand-built fixtures): a real response containing the
invalid `confidence: "Likely"` value correctly produces `state: "reduced"`
with exactly one finding rejected and the other (validly `"Confirmed"`)
kept; a response with no fenced JSON at all correctly produces `state:
"unavailable"`; a response with a trailing-comma JSON syntax error is
mechanically repaired and parses. See `tests/response_validation/` for the
committed regression suite covering the same cases deterministically.

## Future improvements

- No cross-finding validation exists (e.g. detecting two findings that
  contradict each other) — each finding is validated independently, by
  design; cross-finding consistency is a judgment call left to the
  reviewer, not something this module asserts.
- `_repair_enum_case`'s case-insensitive matching means a genuinely
  different but similarly-cased term could theoretically slip through if
  it happened to case-fold to an allowed value — not observed in
  practice, and the allowed-value sets are chosen to make this unlikely,
  but not structurally impossible.

# prompt builder (Milestone 10B — frozen, complete)

`src/prompt/prompt_builder.py`

**Status: Milestone 10B is complete. ADR-014 is treated as fully implemented for
the Prompt Builder's scope** — the two-pass ADR-014 fidelity review (clause-by-clause
trace, fix pass, re-trace) is closed; see "Fidelity review outcome (frozen)" below.
This does not mark Milestone 9 as a whole complete — the LLM reasoning layer and
output formatter (ADR-012/013) exist only as instructions restated inside
`SYSTEM_PROMPT`, not as a component that has actually reasoned over a real commit;
no LLM Adapter or ReviewEngine exists to send this prompt to a model.

## Purpose

Implements ADR-014 exactly: turns a `ReviewContext` (ADR-011) into the two-part,
model-agnostic request a future LLM Adapter will send to any model — a fixed system
prompt (everything invariant across every review) and a per-commit user prompt (the
`ReviewContext` itself). Guarantees only faithful, complete, deterministic delivery —
never model compliance or output quality, per ADR-014's own load-bearing boundary.

## Public API

- `src/prompt/prompt_builder.build_prompt(review_context) -> dict` — the only public
  function. Takes exactly `src/review/context_builder.build_review_context`'s return
  value, no adapter needed. Returns `{"system_prompt": str, "user_prompt": str}` —
  plain dict, reusing ADR-014's own "system content"/"user content" vocabulary rather
  than any specific model SDK's role naming.
- `src/prompt/prompt_builder.SYSTEM_PROMPT` — the fixed system prompt constant,
  built once at import time, identical for every commit.

## Internal data flow

1. `SYSTEM_PROMPT` is assembled from two source constants at import time —
   `_MODEL_ROLE_AND_REASONING_CONTRACT` (ADR-012: role, seven-stage reasoning
   sequence with steps 4/5 and 6/7 held strictly separate, precedence hierarchy,
   decline boundary, four-term uncertainty vocabulary, forbidden behaviors,
   optimization objective) and `_REVIEW_OUTPUT_CONTRACT` (ADR-013: five-section
   output format and content rules, what must never appear, how to weave
   deterministic fact and interpretation into one sentence, tone, philosophy). It
   takes no input and never varies — it is never trimmed or made conditional on the
   commit, satisfying ADR-014's "complete set of ADR-012's frozen constraints, every
   time, never trimmed to save space."
2. `_build_user_prompt(review_context)` renders exactly five labeled blocks, in one
   fixed canonical order — Commit Summary, Claims, Gaps, Evidence Units, Coverage
   Ledger — via `_json_block(label, data)`.
3. `_json_block` is `json.dumps(data, indent=2, ensure_ascii=False)` under a `##
   <label>` header, wrapped in a fenced code block. Each block's `data` is the exact
   `ReviewContext` value for that section — no reformatting, no re-derivation, no
   paraphrasing.
4. `build_prompt` returns `{"system_prompt": SYSTEM_PROMPT, "user_prompt":
   _build_user_prompt(review_context)}`.

## The central design decision: verbatim JSON, not hand-written prose

ADR-014 requires "embedded verbatim... no alteration of any claim's or gap's
content" and "referenced only" for collapsed material. A hand-written formatter
(e.g. one prose line per claim) is itself a place a field could be silently dropped
or reworded — exactly the "Prompt Builder bug" ADR-014's own diagnostic test exists
to catch. A direct `json.dumps` of the exact `ReviewContext` value has zero
paraphrasing surface, is trivially auditable (the diagnostic test becomes "diff the
JSON against the object"), and stays correct automatically if the Reasoning Layer
ever adds a new claim field.

This also satisfies "referenced only" for collapsed material with no extra logic:
`context_builder.py` already sets `diff_text: None` on every `"collapsed"` evidence
unit, so a verbatim JSON dump of `evidence_units` never re-expands collapsed
material — there is nothing left to re-expand. The Prompt Builder has no
collapse-awareness logic of its own; it trusts the `tag` field it is given.

## Integration point with ReviewContextBuilder

Direct pass-through. `build_prompt` takes exactly what `build_review_context`
returns; no translation layer exists or is needed, since ADR-011 built
`ReviewContext` specifically to be the one object anything downstream receives.

## Deterministic behavior

`SYSTEM_PROMPT` is a constant. `_build_user_prompt` uses one fixed section order and
fixed `json.dumps` parameters. Every `ReviewContext`-producing path already
constructs its dicts in one fixed key order (`claim()`/`gap()`/`context_builder.py`),
so Python's dict insertion-order preservation is sufficient for reproducibility — no
`sort_keys` needed. Same `ReviewContext` in, byte-identical prompt out, always.

## Unit-testing strategy

`tests/prompt/test_prompt_builder.py`, stdlib `unittest`, 19 tests: `SYSTEM_PROMPT`
contains all four uncertainty terms, all five ADR-013 section names, and the
precedence/decline/objective concepts; `SYSTEM_PROMPT` does *not* contain forbidden
constructs (numeric-confidence phrasing, persona-inflation, decisiveness-over-honesty
pressure); `SYSTEM_PROMPT` is a fixed constant, identical object across repeated
calls; every section round-trips exactly (`json.loads` of the extracted block equals
the original `ReviewContext` value, including empty sections); a `"full"` unit's
`diff_text` survives exactly; section order is fixed; `commit_hash` never appears in
either prompt half; two calls on the same `ReviewContext` produce a byte-identical
result. One integration test builds a real `ReviewContext` via
`build_review_context` and confirms `build_prompt` consumes it directly with no
adapter. Also validated against a real on-disk commit
(`benchmark/tcx_nogrunt-1/...`) end-to-end through both Milestone 10A and 10B.

## Edge cases explicitly handled

- Empty `commit_claims`/`file_claims`/`symbol_claims`/`gaps`/`coverage_ledger` —
  rendered as an empty JSON structure, section never omitted.
- An evidence unit with `diff_text: None` but `tag: "full"` (the "file missing from
  diff" case from Milestone 10A) — rendered as `"diff_text": null`, not dropped.
- Non-ASCII content in the message or diff — `ensure_ascii=False` keeps it readable
  without any loss of fidelity.

## Explicit decisions (resolved by user instruction, not implementation judgment)

- **`commit_hash` is never included in either prompt half.** ADR-011 scopes it to
  "addressing purposes only, not as evidence," and ADR-014's Prompt Content section
  never names it — confirmed by explicit instruction rather than assumed.
- **Serialization is verbatim JSON, not hand-formatted prose**, per explicit
  instruction: "the Prompt Builder's responsibility is faithful transmission, not
  translation or formatting."
- **Output keys are `system_prompt`/`user_prompt`**, per explicit instruction to
  keep the Prompt Builder provider-neutral — any mapping to a specific model SDK's
  message format belongs to the future LLM Adapter, not this component.

## Explicit decisions and open questions carried over from design review

- **No cross-referencing between `evidence_units` and `coverage_ledger` is
  performed here** (e.g. no generated "3 files were collapsed here, see claim X"
  sentence). ADR-014's own rationale text uses that sentence as an example of what
  referencing accomplishes, not as literal prompt content — that synthesis is the
  model's own output (ADR-013), since producing it requires judging the raw facts
  are worth connecting, which is generation, not delivery.
- **No truncation/context-window management is implemented.** ADR-014 only
  constrains *how* truncation must work if it is ever needed (an explicit record,
  never silent) — it does not mandate building it now, and no real `ReviewContext`
  has been measured against any model's context window yet. Flagged, not built.

## Fidelity review outcome (frozen)

A clause-by-clause trace of `SYSTEM_PROMPT` against ADR-012/ADR-013's literal text
(2026-07-26) found six concrete deviations, all fixed in the same pass, each pinned
by its own regression test in `tests/prompt/test_prompt_builder.py`: the
`HOW TO WRITE EACH POINT` example now reproduces ADR-013's quoted example verbatim
(previously a paraphrase had silently dropped "since it's a public API"); Reasoning
Step 4 is now sourced only from ADR-012's own text ("held strictly apart from
step 5"), with the previously-added "specific, falsifiable theories about how the
change could fail" — imported from `docs/research/reviewer_reasoning_model.md`,
not from the accepted ADR — removed; Verdict's "not a claim inventory, not style
detail" and "What changed and why"'s "not line-by-line detail, not raw diff text
reproduced wholesale" (both from ADR-013's per-section content rules) are restored;
ADR-012's "not something to resolve silently in either direction" (message/diff
disagreement) is restored; ADR-013's third usefulness principle, "silence about the
unknown is a defect, not a virtue," is restored.

A second trace after the fix pass found no further fixable deviations — every
remaining difference from the ADRs' literal wording is an **accepted editorial
compression, not an architectural deviation**: shortened rationale clauses where the
underlying rule is stated in full (e.g. evidence-precedence tier 2 keeps "the claim
wins" but not the fuller "computed mechanically... re-reading fallibly by eye"
justification); one ADR-013 exclusion clause omitted because it is structurally
moot (raw AST/fusion envelopes were never given to the model in the first place, so
there is nothing to exclude in practice); ADR-012's "receiving vs. generating" label
not named explicitly, though every stage's actual behavior matches it; one of
ADR-012's four rejected-role alternatives ("not an evidence synthesizer alone") not
restated, since the positive triage definition already excludes it in substance.
None of these change what the model is instructed to do — they are compressions of
already-stated rationale, not new or missing rules.

**Frozen. Do not continue refining `SYSTEM_PROMPT` wording** on the basis of further
close-reading against the ADRs — that pass is done. Revisit only if a future
evaluation against real model output demonstrates a measurable behavioral problem
traceable to specific wording (e.g. a model consistently fabricating a numeric score
despite the "no numeric confidence figures" instruction) — and even then, per this
project's own standing discipline, fix against that evidence, not against intuition.

## Milestone 8 update (2026-08-16): section 3 revised under the stated evidence bar

The freeze above was revisited — the first revision since Milestone 15E — because
all four of its own stated conditions were met: observed in real production usage
(two live PRs reviewed against the deployed system), repeatable (reproduced across
multiple live model calls, not a one-off), a systematic failure rather than expected
model variance, and a fix verified not to regress the cases it was meant to fix. The
two real failures: (1) a benign fact the model happened to phrase using the word
"Confirmed" pushed an unrelated, low-risk commit to a HIGH RISK verdict, because the
downstream classifier treated any occurrence of that word as dispositive regardless
of the finding's actual severity; (2) a real behavioral regression worded with
"order" instead of "ordering" was missed entirely, because the downstream
classification was keyword matching over free prose and cannot generalize past the
literal words it was written for.

**What changed:** only `OUTPUT FORMAT` point 3 ("What deserves attention, ranked").
It now requires a single fenced ` ```json ` array instead of free markdown, with
exactly 14 named fields per finding (title/category/severity/confidence/
evidenceStrength/status/proofType/explanation/whyItMatters/evidence/affectedFiles/
affectedSymbols/verificationNeeded/suggestedAction — see
`src/api/models.py:StructuredFinding` for the authoritative field list and enum
values) and a `CONFIDENCE` subsection requiring the model to work through six
justification questions before setting that field, with explicit language that a
word's mere appearance in the finding's prose ("confirmed", "fail", "mismatch", a
citation label) carries no meaning for the field on its own. A second, smaller fix
followed the first live test: the finding-level `confidence` field's three-term
vocabulary (Confirmed/Strong evidence/Needs verification) is deliberately distinct
from `UNCERTAINTY VOCABULARY`'s four-term prose vocabulary (Confirmed/Likely/Worth
checking/Unknown) used everywhere else in the response — the model initially bled
"Likely" from the latter into the former; both `UNCERTAINTY VOCABULARY` and the
per-finding field description were amended to state explicitly that the two
vocabularies are separate and non-interchangeable.

**What did not change:** `ROLE`, `REASONING SEQUENCE`, `EVIDENCE PRECEDENCE`,
`DECLINE BOUNDARY`, `FORBIDDEN BEHAVIORS`, `OBJECTIVE`, and `OUTPUT FORMAT` points
1/2/4/5 are byte-identical to Prompt v1. `WHAT MUST NEVER APPEAR` and
`HOW TO WRITE EACH PROSE FIELD` (renamed from `HOW TO WRITE EACH POINT`) gained
clarifying language reconciling them with the new structured fields, but the actual
rules they state are unchanged. This is a targeted amendment to one section's
content contract, not a prompt replacement.

**Verification:** 4 real, live calls against two real PRs on a real repository
(`src/pipeline/shakti_execute.call_shakti`, no fixed seed) — one correct change, one
with two real, independently-verified defects — after the fix, all 4 produced
schema-valid JSON with correctly calibrated confidence values, including the
specific "Likely" leak the first live call actually produced. See
`docs/MILESTONE_8_REVIEW_INTELLIGENCE_AND_UX.md` for the full account, and
`src/response_validation/structured_findings.py` for the parser/validator that
treats this section's output as untrusted input regardless — the prompt change
narrows how often the model drifts from the contract, but the backend never assumes
it always will comply.

**Freeze reinstated for section 3, under the same standing discipline:** do not
continue refining this section's wording without new evidence meeting the same bar
this revision met.

## Dependencies

Python stdlib only (`json`).

## Future Improvements

- If a real model family's behavior shows the JSON-block format is harder for it to
  follow than expected, that is a question for how content is serialized — an
  implementation detail ADR-014 explicitly leaves open — not a reason to revisit
  ADR-014 itself.
- No mechanism exists yet for inspecting/logging exactly what was sent to a model at
  the moment it was sent — ADR-014 names this as "a real operational requirement
  this ADR assumes will exist, without designing it here." Needed before the
  Prompt-Builder-bug-vs-model-mistake diagnostic test can actually be run in
  practice; out of scope for this milestone.

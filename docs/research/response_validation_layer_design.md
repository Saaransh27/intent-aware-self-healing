# Response Validation Layer — Design (Milestone 17, design only)

**Status: design proposal, not implemented.** No code, prompt, parser, or ADR
changes were made to produce this document. It exists to be implementable in
a future milestone without further architectural research.

## Task 1 — Where this belongs

### Why outside the Review Engine

Applying the same elimination test used throughout this project's ADRs: if
the Review Engine (ADR-016) didn't exist, would these checks still need to
happen? Yes — a response with a literal claim id leaked into it, or missing
a mandatory section, is a problem regardless of what outcome/findings model
sits downstream of it. That means these checks are not really about
*evaluating this commit's review* (ADR-016's actual, frozen scope) — they're
about the response artifact's own **presentation-contract compliance**
(fidelity to ADR-013's `OUTPUT FORMAT` and `WHAT MUST NEVER APPEAR` rules),
which is an orthogonal axis to "does the content check out against the
evidence." This is the same structure-vs-meaning split this project has
drawn at every prior layer (Evidence Fusion vs. Reasoning; ReviewContextBuilder
vs. PromptBuilder) — here it's presentation-format vs. evidentiary-content,
and ADR-016 only ever claimed the second one.

Concretely, ADR-016's category-1/2/3 boundary is about whether a property is
checkable *against the evidence the model was given* without becoming a
second reasoner. A missing section header, a duplicated paragraph, or a
literal `shape.wide_change`-shaped token are not evidentiary questions at
all — they don't require knowing anything about this commit's Claims or
Gaps to detect. They are strictly properties of the string itself. Giving
the Review Engine this responsibility would quietly widen its frozen scope
without new evidence forcing that — exactly what Milestone 11A's and
ADR-016's own "stop and report, don't silently redesign" discipline exists
to prevent.

### Why this must be deterministic

The whole reason the Milestone 15/15B–15D/16B arc exists is that a second
LLM call cannot be trusted to reliably catch what a first LLM call got
wrong — the GPT-OSS-120B benchmark just demonstrated this directly: the
*same* prompt, unchanged, produced a different leak outcome on consecutive
runs. Delegating validation to another model call would inherit the exact
non-determinism this milestone is trying to guard against, plus double the
per-review cost and latency for a check that doesn't need any judgment —
every rule below is a string-level, mechanical fact, not an interpretive
one.

### Where it fits in the pipeline

```
run_pipeline_for_commit(...)
  -> run_adapter(...)          (unchanged)
  -> run_review_engine(...)    (unchanged)
  -> validate_response(...)    <- NEW, this milestone's proposal
  -> [API layer shapes the final response]  (unchanged for now)
```

It sits downstream of the Review Engine, upstream of whatever returns a
response to a caller (today, `src/api/app.py`'s `POST /review` handler,
after `run_review_engine` and before `ReviewResponse` is constructed). It
does not sit inside the Review Engine, the Adapter, or the Prompt Builder,
and none of those are modified to accommodate it.

It is a **sibling** to `src/api/response_parser.py`, not a replacement or
extension of it. `parse_review_sections` is deliberately lenient — it never
raises, and it silently tolerates things this layer needs to catch
precisely: it does not detect duplicate headings (a repeated heading's
content silently overwrites the first occurrence), does not check ordering
(it explicitly sorts by position, by design, to stay order-tolerant), and
does not look at content for forbidden vocabulary at all. The parser's job
is "best-effort shape this response for API consumers." This layer's job is
"precisely diagnose whether the response complies with the contract" — two
different purposes that happen to both need to find section boundaries.

### Inputs

Exactly one: the raw response text (the same string held in
`adapter_result["response"]` / `review_result["response"]`). Deliberately
**not** the Review Context, Claims, or Gaps — this is a narrower input
surface than the Review Engine's own (which at least receives the full
`adapter_result`). Withholding evidence access is intentional: it structurally
prevents this layer from ever re-deriving whether a *claim* is correct
(ADR-016's rejected category-3), only whether the *text* is well-formed and
free of internal vocabulary. A validator that could see the Claims list
would inevitably be tempted to cross-check content against evidence — a
different, larger responsibility this milestone does not want.

### Outputs

A structured report, independent of and additive to the Review Engine's own
result — never a mutation of it:

```json
{
  "outcome": "clean" | "flagged" | "invalid",
  "response": "<original or sanitized text>",
  "findings": [
    {"rule": "missing_section", "severity": "ERROR", "action": "reject",
     "detail": "Open questions"}
  ]
}
```

`outcome` is derived mechanically from the worst finding present (`invalid`
if any `ERROR`/`reject` finding fired, `flagged` if only `WARNING`/`sanitize`/
`log` findings fired, `clean` otherwise) — never a judgment call. `response`
is the original text unchanged unless a `sanitize`-tagged rule fired, in
which case it is the text with only that rule's precisely-matched span
removed or replaced — never a rewritten sentence.

## Task 2 — Validation catalogue

Every check below operates on the response string alone; none requires
evidence, another model call, or subjective judgment.

### Formatting

| Check | What it detects |
|---|---|
| Missing required section | One of the five `SECTION_KEYS` headings absent entirely |
| Duplicate section heading | The same heading text appears more than once |
| Sections out of order | Detected heading order doesn't match the frozen sequence (Verdict → What changed and why → What deserves attention, ranked → Open questions → Minor notes) |
| Unknown/extra heading | A heading-shaped line that isn't one of the five expected labels |

### Internal terminology

| Check | What it detects |
|---|---|
| Literal claim-id leak | A token matching the closed, enumerable prefix vocabulary the reasoning modules actually emit (e.g. `shape.`, `history.`, `reach.`, `verification.`, `contract.`, `structure.`, plus `body_evidence`'s category prefixes) followed by a snake_case suffix — anchored on real module-name prefixes derivable from `src/reasoning/modules/*.py`, not a generic "any dotted word" pattern, to avoid false positives on legitimate prose (`numpy.pad`, `self.band.id`, real code references have all appeared correctly in real reviews and must not be flagged) |
| Reserved confidence-tier self-tagging | The four words `FORBIDDEN BEHAVIORS` already reserves for the Claims themselves ("observed", "corroborated", "inferred", "conflicting") appearing in the model's own generated prose, e.g. `(Observed ...)`-style self-applied tags |
| Module/reasoning-artifact soft jargon | A maintained, growable phrase list seeded from what's actually been observed leaking across this investigation: "symbol claim(s)", "semantic analysis claim", "contract stability", "body evidence"/"body-evidence", "coverage ledger", "evidence unit(s)", "the claim(s)" used as a system-noun. Lower precision than the literal-id check — flagged explicitly below as best-effort only |

### Structural

| Check | What it detects |
|---|---|
| Empty section body | A detected heading whose text before the next heading is empty or whitespace-only |
| Duplicated paragraph across sections | The same sentence/paragraph (exact or whitespace-normalized match) appears in more than one section |
| Malformed markdown | Unbalanced code fences (`` ``` ``) or bold/italic markers (`**`, `*`) within the response |
| Heading-swallowing malformation | An unclosed code fence or similar construct that would cause subsequent real headings to be absorbed into one block, effectively hiding them from detection |

Deliberately excluded (would require judgment, not mechanics): whether a
finding is "actually important," whether prioritization is sound, whether
length is proportionate to risk, whether the uncertainty vocabulary was used
correctly in context. All of these were explicitly named in this project's
own evaluation rubric (Milestones 15/16B) precisely because they need a
reader (human or model) to judge — not because they're overlooked here.

## Task 3 — Severity model

| Rule | Rationale | Severity | Action |
|---|---|---|---|
| Missing required section | Response is structurally incomplete against ADR-013's mandatory five; cannot be sanitized into existing | ERROR | reject |
| Duplicate section heading | Unusual, but the parser still extracts *a* value for that key; doesn't break consumption | WARNING | log only |
| Sections out of order | Parser is already order-tolerant by design; a fidelity signal, not a breakage | WARNING | log only |
| Unknown/extra heading | Doesn't break anything; signals prompt/model drift worth tracking | WARNING | log only |
| Literal claim-id leak | Precise, bounded match against a closed vocabulary; unambiguous violation of "must never appear"; mechanically safe to redact (bounded token span) | ERROR | sanitize |
| Reserved confidence-tier self-tagging | Small closed set (4 words); could mislead a reader into believing the tagged claim carries the deterministic-evidence meaning the vocabulary reserves for actual Claims | ERROR | sanitize |
| Module/reasoning-artifact soft jargon | Lower precision, fuzzier phrase boundaries; sanitizing risks damaging otherwise-good prose; real false-positive risk (e.g. "the commit's claim that..." is legitimate English) | WARNING | log only |
| Empty section body | Milder than a fully missing section; doesn't corrupt the other four | WARNING | log only |
| Duplicated paragraph across sections | Redundancy/efficiency issue, not a correctness one | WARNING | log only |
| Malformed markdown (non-cascading) | Cosmetic; doesn't prevent reading the content | WARNING | log only |
| Heading-swallowing malformation | Cascades into effectively-missing sections; same consequence as a missing section | ERROR | reject |

## Task 4 — Minimal architecture proposal

**New files only — nothing existing is modified:**

- `src/response_validation/__init__.py` — empty, matching every other
  package's convention.
- `src/response_validation/response_validator.py` — one public function,
  `validate_response(response_text) -> dict`, matching this project's
  established plain-function-no-class convention (same shape as
  `fuse_evidence`, `run_reasoning`, `run_adapter`, `run_review_engine`).
  Internally reimplements a small, private heading-scan helper rather than
  importing `response_parser._HEADING_LINE` (private, and the instruction is
  explicit: no parser changes) — it may freely import the already-public
  `SECTION_KEYS` tuple from `response_parser.py` to stay in lockstep with the
  five canonical section labels, since that constant already exists and
  needs no modification to be imported.

One file is intentionally enough for the first cut — splitting rule
categories into separate modules can happen later if the catalogue grows
large enough to justify it; doing so now would be speculative structure
ahead of a demonstrated need, the same discipline this project has applied
everywhere else.

**Modified files:** none, in this milestone. The natural future call site
(not built now) is `src/api/app.py`'s `POST /review` handler, inserted
between `run_review_engine(...)` and the construction of `ReviewResponse` —
composing with the existing pipeline exactly as shown in Task 1's diagram.
Whether the API's response schema gains a new field to expose the
validation report is a decision for that future implementation milestone,
not this one.

**Execution order (for the future implementation milestone):**
1. `run_pipeline_for_commit(...)` — unchanged, produces `adapter_result` and
   `review_result` exactly as today.
2. `validate_response(review_result["response"])` — new, runs once per
   request, no network call, no added latency of consequence.
3. The caller (API layer) decides what to do with an `invalid` outcome
   (e.g., map to an error response) versus `flagged` (return the review with
   the validation report attached) versus `clean` (return as today) — that
   decision itself is also deferred to the implementation milestone.

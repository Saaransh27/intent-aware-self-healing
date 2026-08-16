# Milestone 8 — Review Intelligence Reliability and UX

_2026-08-16. A reliability and information-architecture milestone, not a
redesign from scratch — the existing review pipeline, deterministic
reasoning layer, and Prompt v1's frozen ROLE/REASONING SEQUENCE/EVIDENCE
PRECEDENCE/DECLINE BOUNDARY/FORBIDDEN BEHAVIORS/OBJECTIVE content are all
untouched. What changed: how the model's "what deserves attention" output
is produced, parsed, validated, and aggregated into a verdict (Part A),
and how the PR review page presents that data (Part B)._

## Why this milestone exists

Milestone 7 built `frontend/src/lib/reviewIntelligence.js`: a keyword-based
classifier that turned the model's free prose into severity/confidence/
category/behavioral-change signals. Re-running the live system against the
same two real demo PRs (`Saaransh27/intent-aware-self-healing`, PR #2 —
correct change, ground truth 9/9 tests pass; PR #3 — the same claimed
change with two real, independently verified defects) with **fresh,
non-cached** model generations surfaced two real, repeatable failures:

1. **PR #2 (no real defect) → the system reported `HIGH RISK`.** The model
   wrote a sentence describing a benign, harmless fact (a rule-description
   string was updated to match) and happened to use the word "Confirmed"
   in it. The keyword classifier's aggregation rule treated any `Confirmed`
   finding, regardless of severity, as sufficient to reach `HIGH RISK`.
   Confidence ("is this really true?") and severity ("how bad would it be
   if it were?") are different questions, and conflating them produced a
   false alarm on a safe change — exactly the outcome this product exists
   to prevent.

2. **PR #3 (2 real defects) → the system reported `SAFE TO REVIEW` with 0
   confirmed findings**, on a different run. The model cited its evidence
   using a citation-label style ("【Evidence Unit N】") instead of the
   literal word "Confirmed" that run — pure model non-determinism, already
   a documented phenomenon in this project. Separately, the real
   tier-ordering regression wasn't flagged as a behavioral change because
   the model wrote bare "order" instead of "ordering"/"orderer", the exact
   words the keyword list was written for.

The explicit instruction that opened this milestone: **do not fix this by
adding more keywords** ("Evidence Unit", "tier-selection order", etc.) —
that would only produce a larger, still-fragile keyword system, chasing
whatever specific wording the model happened to use in the two failures
already observed, with no reason to believe the next failure wouldn't use
different wording again. Instead: make the model report its own
classification as structured, schema-checked data, and derive the verdict
deterministically from that data — never from searching its prose.

## Part A: reliable review intelligence

### A1/A3 — the structured finding contract

`src/prompt/prompt_builder.py`'s section 3 ("What deserves attention,
ranked") now requires a single fenced JSON array instead of free markdown.
Each element is one finding with exactly 14 fields — `title`, `category`
(12 allowed values), `severity` (`Critical`/`High`/`Medium`/`Low`/
`Informational`), `confidence` (`Confirmed`/`Strong evidence`/`Needs
verification` — a vocabulary deliberately distinct from the four-term
prose vocabulary used elsewhere in the response), `evidenceStrength`
(`Direct`/`Strong`/`Indirect`/`None`), `status` (7 allowed values,
including `Intent mismatch` and `Regression risk`), `proofType` (9 allowed
values describing *how* the finding is grounded — e.g. `test_failure`,
`behavioral_regression`, `inferred_risk`), `explanation`, `whyItMatters`,
and four array fields (`evidence`, `affectedFiles`, `affectedSymbols`,
`verificationNeeded`) plus `suggestedAction`. See
`src/api/models.py:StructuredFinding` for the authoritative schema.

### A2 — forcing real justification, not word choice

The prompt's `CONFIDENCE` subsection requires the model to work through
six questions (what changed, what it interacts with, what evidence
supports it, whether that evidence directly demonstrates the concern or
only implies it, what remains unverified if not, what a reviewer would
need to check) before setting `confidence` — with explicit language that a
word appearing in the finding's own prose ("confirmed", "fail", "mismatch",
a citation label) "carries no meaning for this field on its own." This
directly targets both real failures: severity and confidence are now
structurally separate fields the model must set independently, and
confidence is tied to an evidence-directness judgment, not word choice.

A second, smaller fix followed the first live test against this new
prompt: the model bled the word "Likely" (from the separate four-term
prose vocabulary) into the finding-level `confidence` field, which doesn't
allow it. `UNCERTAINTY VOCABULARY` and the per-finding field description
were both amended to state explicitly that the two vocabularies never
overlap. See `docs/modules/prompt_builder.md`'s Milestone 8 update section
for the full before/after text and why this qualifies as a legitimate
revision under Prompt v1's own freeze discipline (observed in real usage,
repeatable, systematic, verified fix).

### A5 — never trusting the model to comply

`src/response_validation/structured_findings.py` (new module) parses and
strictly validates this JSON independently of the prompt change — a
better prompt reduces how often the model drifts from the contract, but
does not guarantee it. Mechanical repairs are applied only where they
cannot change meaning (casing/whitespace on a controlled field, a bare
string wrapped into a single-element array, a trailing comma). Anything
still non-conformant is a **rejected finding**, not a fabricated one — the
per-finding validation is independent, so one bad finding never discards
the rest of a response.

The overall result carries a `state`: `"ok"` (everything validated,
including a legitimate empty array), `"reduced"` (some findings had to be
dropped), or `"unavailable"` (no JSON could be extracted or parsed at
all). The frontend surfaces `"reduced"`/`"unavailable"` as a visible
**"Analysis confidence reduced"** banner — on `ReviewVerdict` (top-level)
and inside `ReviewFindings` (with the model's raw response shown
underneath, not hidden) — rather than silently presenting a verdict that
might be based on an incomplete or empty finding set.

**Verified against the exact failure that motivated this**: the very
first live test of the new prompt produced a real invalid value
(`"confidence": "Likely"`) on one finding. `parse_structured_findings`
correctly dropped that single finding (`state: "reduced"`, 1 rejected)
while keeping the other, valid one — proof the validator's reject
discipline works on real model drift, not just hypothetical bad input.

### A4 — deterministic verdict aggregation

`frontend/src/lib/reviewIntelligence.js`'s `deriveVerdict` reads three
structured fields per finding and nothing else:

- **HIGH RISK** requires a finding with `confidence: "Confirmed"` **and**
  `severity` of `Critical`/`High` **and** a `status` that names a real
  risk category (`Defect`, `Regression risk`, `Security risk`, `Test gap`,
  `Intent mismatch`, `Maintainability risk`) — all three together. This is
  the exact fix for failure #1: a `Confirmed`-but-`Low`-severity,
  `Informational`-status fact can never reach `HIGH RISK` on its own.
- **REVIEWER ATTENTION** covers any other non-informational finding with
  `Confirmed`/`Strong evidence` confidence, or `Medium`+ severity
  regardless of confidence — a real, disclosed concern that doesn't meet
  the higher bar above.
- **SAFE TO REVIEW** otherwise (including a legitimately empty finding
  array).

No prose is searched anywhere in this function.

### A6 — frontend consumption

`reviewIntelligence.js`'s keyword classifiers (`classifyConfidence`,
`classifySeverity`, `classifyCategory`, `isBehavioralChange`) are removed
entirely, not extended. `buildFindings` now adapts the backend's own
`StructuredFinding[]` directly; `isBehavioralChange` reads
`proofType === "behavioral_regression"` or `category === "Behavioral
regression"` (a real structured signal, immune to "order" vs "ordering"
wording drift); `deriveIntentVsImplementation` reads `status === "Intent
mismatch"` or `proofType` in `{test_failure, direct_data_mismatch,
direct_code_contradiction}` — each grounded directly in the prompt's own
field definitions, not a second-guessed regex. `attributeFindingsToFiles`
now reads each finding's own `affectedFiles` array directly instead of
cross-referencing quoted identifiers against a separate prose section —
simpler and more robust than Milestone 7's version, since the model states
this explicitly per the section-3 contract. See
`docs/modules/reviewIntelligence.md` for the full API.

### A7 — regression coverage for both real failures

`frontend/src/lib/reviewIntelligence.test.js`'s CASE A/B model both real
failure scenarios directly: CASE A asserts a `Confirmed`+`Low`-severity+
`Informational` finding never reaches `HIGH RISK`; CASE B asserts a
`Confirmed`+`High`-severity+`behavioral_regression` finding does, and that
it's correctly flagged behavioral from its structured `proofType`, not
keyword matching. `PRDetail.reviewintelligence.test.jsx` re-verifies both
against the real, regenerated live fixtures end-to-end through the actual
component tree.

## Part B: PR review workspace redesign

The existing visual design system (typography, color tokens, card/badge
language) is unchanged throughout — this is an information-architecture
and content change, not a new look. New page order in `PRDetail.jsx`:

1. **PR Header** (unchanged) → **Review Status** (B1) — the renamed,
   visually strengthened `ReviewVerdict`: a compact eyebrow label, a
   larger verdict line (19px/800 weight, up from 15px/700), positioned
   immediately under the header.
2. **Review at a Glance** (B2, new — `ReviewAtAGlance.jsx`) — four jump
   links (Findings/Risk Hotspots/What We Could Not Verify/Test Impact),
   each with one real, already-computed count (actionable finding count,
   distinct affected-file count, blind-spot count, whether tests
   changed). No new computation — every number is read from data the page
   already derives.
3. **Intent vs Implementation** (unchanged position/content).
4. **Findings** (B3/B4) — now the page's structurally primary content
   block (`id="findings"`, jump-linked from Review at a Glance). Each
   finding card shows title, severity/confidence/category badges,
   `explanation`, `whyItMatters` (a real, separate field now — not folded
   into one paragraph), `evidence`, `verificationNeeded` (when
   confidence isn't `Confirmed`), the model's own `suggestedAction`, and
   affected files. New filter controls (severity/confidence/category
   dropdowns, `FindingsFilters`) operate strictly on these structured
   fields — never on finding text.
5. **What Changed** (B5, new — `WhatChanged.jsx`) — every changed file,
   grouped by directory (the simplest grouping that's actually meaningful
   — no dependency graph, no invented "logical area" labels), each row
   showing real change type (added/modified/deleted/renamed, from the
   real change_set) and real reconciled severity, reusing the exact same
   `attributeFindingsToFiles`/`fileSeverity` functions Risk Hotspots uses
   so the two sections never disagree about the same file.
6. **Risk Hotspots** (B6, renamed `FileOverview`) — unchanged table logic,
   reframed heading/copy: "the files that deserve the most attention,
   sorted by real risk," explicitly positioned as a differentiator from a
   plain diff view.
7. **What We Could Not Verify** (B7, renamed `BlindSpots`) — reworded
   throughout to honest, non-bug language: the section-level badge reads
   "Requires reviewer confirmation" (behavioral-change findings) or "Not
   verified" (mismatch-only findings), never implying a confirmed defect.
   The behavioral-change card's fields are now What Changed (the
   finding's own `explanation`) / Impact (`whyItMatters`) / Evidence /
   Tests — the forced Before/After clause extraction from Milestone 7 is
   gone (see A6/A4 above; those fields are always `null` now, since no
   structured field maps to them, and a guaranteed-empty row is worse
   than not showing one).
8. **Test Impact** (B8, renamed `TestSignal`) — added an explicit
   disclaimer: "passing or unaffected tests never mean the change itself
   is safe; see Review Status and Findings above for the actual risk
   assessment." Underlying logic unchanged, except the previous
   regex-based "behavioral change with no nearby 'test' word" heuristic
   was removed — the model's own `Missing test coverage` category/
   `missing_test` proofType is now a direct structured signal for exactly
   that case, making the old prose-scanning fallback redundant.
9. **Supporting Details** (B9, unchanged — still the same collapsed
   accordion; no label or structural change was needed).

**B10 (optional sticky sidebar) was not built.** The spec marked it
optional, conditioned on not cramping the main content, and building it
would have meant a layout-level change (fixed positioning, scroll
tracking, responsive breakpoints) disproportionate to the four jump-links
Review at a Glance already provides on one screen. Disclosed here as a
deliberate deferral, not a silent omission — revisit if real usage shows
the jump-links aren't sufficient for a long review.

**Part C (repository selection)** — confirmed unchanged: no file under
`RepositorySelector.jsx`/`RepositoryList.jsx` or their tests was touched;
their existing 12 tests still pass.

## Verification

- **Backend**: 318 tests passed, 12 subtests passed (`pytest`, full
  suite) — includes the new `StructuredFinding` schema, the new
  `structured_findings.py` parser/validator, and the updated prompt
  content tests.
- **Frontend**: 114 tests passed across 19 test files (`vitest run`) —
  includes rewritten unit tests for the new structured-field aggregation
  logic (`reviewIntelligence.test.js`), updated component tests for every
  file touched, and the real, regenerated end-to-end fixture tests below.
- **Build**: `npm run build` succeeds, no errors.
- **Lint**: `npm run lint` (oxlint) — clean, no findings.
- **Real fixture regeneration**: `frontend/src/test/fixtures/real_pr_review_response.{pr2_correct,pr3_incorrect,click_2202}.json`
  were regenerated via real, live `POST /review/pr`-equivalent calls
  (real GitHub clone, real deterministic reasoning, real Shakti Studio
  GPT-OSS-120B call, using this milestone's actual updated `app.py`
  response-construction code) — not hand-edited. Confirmed directly:
  PR #2's regenerated fixture never reaches `HIGH RISK` (its one finding
  is `Medium`/`Needs verification`); PR #3's regenerated fixture reaches
  `HIGH RISK` (a `Critical`/`Confirmed`/`Regression risk` finding present).
  `PRDetail.reviewintelligence.test.jsx` renders both through the real
  component tree and asserts exactly this.

## Known limitations (disclosed, not fixed here)

- **This system does not have perfect review accuracy.** The prompt
  change reduces how often the model's self-classification drifts from
  the intended contract; it does not guarantee correctness of the
  model's *judgment* about what's risky, only the *shape* of how it
  reports that judgment. A well-formed, schema-valid finding can still be
  a wrong conclusion — this milestone does not change that, and nothing
  here should be read as claiming otherwise.
- **`deriveIntentVsImplementation`'s implementation/test split is coarser
  than Milestone 7's.** Real captured data shows `affectedSymbols` is
  frequently empty (the model tends to cite file paths/diff descriptions,
  not symbol names), so this milestone buckets whole findings into
  test/implementation rather than splitting individual identifiers within
  one finding — a disclosed, deliberate tradeoff for reliability over a
  finer split the data often can't support anyway.
- **The pre-existing `response_validator.py` claim-id-leak false positive**
  (documented in `docs/modules/structured_findings.md`) is real,
  reproduced directly against a regenerated PR #2 fixture, and not fixed
  in this milestone — it predates Milestone 8, is unrelated to structured
  findings, and has no live user-facing effect today (the frontend never
  renders `validation.outcome`/`validation.findings`).
- **No browser/visual verification was performed.** This session's tool
  environment has no browser-automation capability; verification relied
  on `vitest`'s jsdom-based rendering (114 tests, including real-fixture
  end-to-end renders) plus a clean production build. Layout/visual
  correctness (spacing, responsive behavior, actual pixel appearance)
  was not visually inspected in a real browser and should be checked
  before or during deployment.

## Explicitly out of scope (per Part E)

Not built, and not started: an AI chat interface, one-click fixes,
auto-commits, inline GitHub comments, architecture/dependency-graph
diagrams, CI/CD/Jira/GitLab integration, database-backed sessions,
background workers, deployment automation, billing, or team management.
None of this milestone's changes touch deployment — no deploy was
performed as part of this work.

## Stop condition

Per the milestone's own instruction: acceptance criteria above are met;
this document does not begin or imply Milestone 9. No additional changes
beyond what's described here were made.

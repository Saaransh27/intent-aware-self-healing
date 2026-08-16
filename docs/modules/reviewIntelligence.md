# `frontend/src/lib/reviewIntelligence.js`

## Purpose

Turns the backend's own validated structured findings
(`structured_findings.findings`, produced by `src/prompt/prompt_builder.py`'s
section-3 JSON contract and validated server-side by
`src/response_validation/structured_findings.py`) into the presentation
this product is built around: a conservative verdict, per-finding
severity/confidence/category/evidence, intent-vs-implementation
consistency, and behavioral-change detection. As of Milestone 8, this
module performs **no text classification of its own** — every field a
finding carries traces directly to a field the model set and the backend
already validated. It introduces no new backend data beyond the
`structured_findings` field itself (see `docs/MILESTONE_8_REVIEW_INTELLIGENCE_AND_UX.md`)
and no new LLM call.

## Milestone 7 → Milestone 8: what changed and why

Milestone 7's version of this module classified confidence/severity/
category/behavioral-change by pattern-matching the model's free prose
(`classifyConfidence`, `classifySeverity`, `classifyCategory`,
`isBehavioralChange` — all removed). Real, live production use surfaced
two independent failures this approach could not fix by adding more
keywords: (1) a benign fact the model phrased using the word "Confirmed"
pushed an unrelated, low-risk commit to a HIGH RISK verdict, because
confidence and severity were conflated into one keyword signal; (2) a
real behavioral regression worded with "order" instead of "ordering" was
missed entirely, since keyword matching cannot generalize past the exact
words it was written for. Milestone 8 replaced the classification
mechanism itself: the backend prompt now requires the model to set these
fields directly and explicitly (with a six-question justification
requirement for `confidence` specifically), a server-side validator
enforces the contract, and this module only adapts and aggregates what
already arrived pre-classified. See `docs/MILESTONE_8_REVIEW_INTELLIGENCE_AND_UX.md`
for the full account, including the exact real responses that motivated this.

## Responsibilities

- Adapt each backend `StructuredFinding` into the shape this module's
  consumers use (`buildFindings`), deriving only two convenience flags
  from real structured fields: `isInformational` (from `severity`/
  `status`) and `isBehavioralChange` (from `proofType`/`category` — a real
  structured signal now, not a regex guess over wording).
- Compute the page-level **verdict** (`SAFE TO REVIEW` / `REVIEWER
  ATTENTION` / `HIGH RISK` — deliberately never "SAFE TO MERGE")
  deterministically from the set of findings' `severity`/`confidence`/
  `status` fields — never from scanning any finding's prose. `HIGH RISK`
  requires a finding whose `confidence` is `Confirmed`, whose `severity`
  is `Critical`/`High`, *and* whose `status` reflects a real risk category
  — all three together, since severity and confidence answer different
  questions and neither alone is a reliable signal (see `deriveVerdict`).
- Report **confidenceReduced** on the verdict — `true` whenever the
  backend's own `structured_findings.state` is not `"ok"`, so the UI can
  show "Analysis confidence reduced" instead of implying a verdict that
  may be based on an incomplete or empty set of findings.
- Compute **Intent vs Implementation** (claimed intent from the real PR
  title/commit message; a finding is "mismatch-shaped" when its `status`
  is `"Intent mismatch"` or its `proofType` is `test_failure`/
  `direct_data_mismatch`/`direct_code_contradiction` — all fields the
  model set directly, never inferred from a regex over its explanation).
- Detect **behavioral-change** findings directly from `proofType ===
  "behavioral_regression"` or `category === "Behavioral regression"`, and
  build a Impact/Evidence/Tests breakdown from the finding's own
  `whyItMatters` field (a real, dedicated field now — no more forced
  before/after clause extraction from one prose blob).
- Compute **blind spots** — the subset of findings that require reasoning
  beyond the changed lines themselves (behavioral-change or mismatch-
  shaped), legitimately empty when nothing qualifies.
- Attribute a finding's severity to the **real file(s)** it's about,
  reading the finding's own `affectedFiles` field directly (the model
  states this explicitly per the section-3 contract) — no more cross-
  referencing quoted identifiers against a separate prose section to
  reconstruct an attribution the model already provides directly.

## Public API

- `buildFindings(structuredFindings) -> Finding[]` — adapts the backend's
  `StructuredFinding[]` array. Each `Finding` has: `index`, `title`,
  `explanation`, `whyItMatters`, `category`, `severity`, `confidence`,
  `evidenceStrength`, `status`, `proofType`, `evidence`, `affectedFiles`,
  `affectedSymbols`, `verificationNeeded`, `suggestedAction`,
  `isInformational`, `isBehavioralChange`, `behavioralDetail` (null unless
  `isBehavioralChange`).
- `deriveVerdict(findings, structuredState) -> {level, confirmedCount, strongEvidenceCount, needsVerificationCount, informationalCount, confidenceReduced}`
- `deriveIntentVsImplementation(claimedIntent, findings) -> {claimedIntent, implementationDetail, testDetail, consistency, mismatchFinding}`
- `deriveBlindSpots(findings) -> Finding[]`
- `attributeFindingsToFiles(findings, changedFilePaths) -> Map<path, severity>`
- `fileSeverity(filePath, severityByPath, isRiskBearingFile, isRoutineFile) -> severity | "Routine"`
- `buildBehavioralDetail(finding) -> {before: null, after: null, impact, evidence, testsNote}` — `before`/`after` are always `null` now (no field in the structured schema maps to them; `impact` reuses `whyItMatters` directly); normally called internally by `buildFindings`, exported for direct testing.
- `quotedIdentifiersIn(text)` — preserved only as a display convenience
  for components that want to bold a code span inside prose; carries no
  classification weight anywhere in this module.
- Constants: `SAFE_TO_REVIEW`, `REVIEWER_ATTENTION`, `HIGH_RISK`,
  `CONFIRMED`, `STRONG_EVIDENCE`, `NEEDS_VERIFICATION` (identical strings
  to the backend's own three-term finding-confidence vocabulary — no
  frontend renaming needed), `SEVERITY_CRITICAL/HIGH/MEDIUM/LOW/INFORMATIONAL`,
  `FILE_RISK_ROUTINE`, and one `CATEGORY_*` constant per category.

## Internal workflow

1. `buildFindings` maps each raw `StructuredFinding` through `adaptFinding`,
   which copies every field verbatim, derives `isInformational`/
   `isBehavioralChange` from structured fields, and computes
   `behavioralDetail` via `buildBehavioralDetail` when applicable.
2. `deriveVerdict` partitions findings into actionable vs. informational,
   counts each confidence tier, and applies two rules: `isRealRisk`
   (Confirmed + Critical/High severity + a real-risk `status`) drives
   `HIGH_RISK`; `deservesAttention` (Confirmed/Strong evidence, or
   Medium+ severity, on a non-informational finding) drives
   `REVIEWER_ATTENTION`. Neither rule scans any finding's prose.
3. `attributeFindingsToFiles` reads each finding's own `affectedFiles`
   array directly and matches it against the commit's real changed-file
   paths (exact match or path-suffix match, to tolerate a model citing a
   shorter relative path). `fileSeverity` then takes the higher of this
   attribution and the real risk-bearing-claim signal, falling back to
   `"Routine"` only when the coverage ledger already collapsed the file
   and nothing escalates it.
4. `deriveIntentVsImplementation` filters findings to those that are
   "mismatch-shaped" (see Responsibilities above), buckets each into
   `testDetail` (category `Test failure` or `proofType` `test_failure`)
   or `implementationDetail` (everything else mismatch-shaped), and sets
   `consistency: "MISMATCH"` when at least one such finding exists.

## Dependencies

- `./textFormatting` (`renderInlineMarkdown`, `renderMarkdownLite`) — used
  only by consumer components for prose display, not by this module's own
  classification logic (there is none left).
- Consumed by: `components/ReviewVerdict.jsx`, `components/ReviewFindings.jsx`,
  `components/IntentVsImplementation.jsx`, `components/BlindSpots.jsx`,
  `components/TestSignal.jsx`, `components/FileOverview.jsx`,
  `components/WhatChanged.jsx`, `components/ReviewAtAGlance.jsx`,
  `pages/PRDetail.jsx`, `pages/PRList.jsx`.
- No backend dependency beyond the `structured_findings` response field
  itself, no network call.

## Future improvements

- `deriveIntentVsImplementation`'s test/implementation split is coarser
  than Milestone 7's prose-proximity heuristic was (that heuristic split
  individual identifiers within one finding; this reads whole findings'
  `affectedSymbols`/`evidence`/`affectedFiles` arrays instead) — a
  deliberate tradeoff, since real captured data shows `affectedSymbols` is
  frequently empty (the model tends to cite file diffs, not symbol
  names), so a finer split would often have nothing to split.
- No real test-run/CI signal exists anywhere in this system; nothing here
  claims a test "actually failed," only what the model concluded from
  reading the code, or what `observations.change_categories.touches_tests`
  reports.

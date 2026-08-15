# `frontend/src/lib/reviewIntelligence.js`

## Purpose

Turns the review pipeline's existing free-text output (the model's five
prose sections) plus its existing deterministic data
(`review_context`/`observations`) into the structured presentation
Milestone 7 ("Review Intelligence") built the product around: a
conservative verdict, per-finding severity/confidence/category/evidence,
intent-vs-implementation consistency, behavioral-change detection, and
evidence-based blind spots. It introduces no new backend data (with one
narrow exception documented in `git_client.md`'s sibling doc for
`client.py`'s `head_sha` field, unrelated to this module) and no new LLM
call — everything here is a deterministic derivation over data the
backend already produces.

## Responsibilities

- Classify each parsed finding's **confidence** (Confirmed / Strong
  evidence / Needs verification), **severity** (Critical / High / Medium
  / Low), and **category** (Bug, Behavioral regression, Test failure,
  Missing test coverage, Security, API/contract mismatch, Dependency/
  compatibility, Data correctness, Logic inconsistency, Configuration,
  Maintainability, Other) from the finding's own real text plus, when
  available, real deterministic risk-bearing claims.
- Extract each finding's **evidence** — the model's own quoted code
  identifiers (backtick spans), stripped of one redundant layer of
  quoting.
- Compute the page-level **verdict** (`SAFE TO REVIEW` /
  `REVIEWER ATTENTION` / `HIGH RISK` — deliberately never
  "SAFE TO MERGE") from the set of classified findings.
- Compute **Intent vs Implementation** (claimed intent from the real PR
  title/commit message; implementation/test identifiers correctly split
  from a mismatch finding's own text; PASS/MISMATCH consistency).
- Detect **behavioral-change** findings (ordering, precedence, default,
  early return, fallback, etc.) and extract a real Before/After/Impact/
  Evidence/Tests breakdown from the finding's own sentence shape, never
  fabricating a field the text doesn't support.
- Compute **blind spots** — the subset of findings that require reasoning
  beyond the changed lines themselves (behavioral-change or
  intent/implementation mismatch), legitimately empty when nothing
  qualifies.
- Attribute a finding's severity to the **real file(s)** it's actually
  about, by cross-referencing the finding's quoted identifiers against
  each changed file's own identifiers (extracted from
  `what_changed_and_why`'s real per-file bulleted breakdown), since
  individual findings in `what_deserves_attention_ranked` generally name
  symbols, not files.

## Public API

- `buildFindings(rawFindingsText, reviewContext) -> Finding[]` — parses
  and fully classifies every finding. Each `Finding` has: `index`,
  `title`, `body`, `severity`, `confidence`, `category`, `mentionedFiles`,
  `corroboratingCount`, `evidence`, `isBehavioralChange`,
  `behavioralDetail` (null unless `isBehavioralChange`), `isInformational`.
- `deriveVerdict(findings) -> {level, confirmedCount, strongEvidenceCount, needsVerificationCount, informationalCount}`
- `deriveIntentVsImplementation(claimedIntent, findings) -> {claimedIntent, implementationDetail, testDetail, consistency, mismatchFinding}`
- `deriveBlindSpots(findings) -> Finding[]`
- `attributeFindingsToFiles(findings, changeText, changedFilePaths) -> Map<path, severity>`
- `fileSeverity(filePath, severityByPath, isRiskBearingFile, isRoutineFile) -> severity | "Routine"`
- `buildBehavioralDetail(finding) -> {before, after, impact, evidence, testsNote}` — normally called internally by `buildFindings`, exported for direct testing.
- Classification primitives, also independently exported for testing:
  `classifyConfidence`, `classifySeverity`, `classifyCategory`,
  `isBehavioralChange`.
- Constants: `SAFE_TO_REVIEW`, `REVIEWER_ATTENTION`, `HIGH_RISK`,
  `CONFIRMED`, `STRONG_EVIDENCE`, `NEEDS_VERIFICATION`,
  `SEVERITY_CRITICAL/HIGH/MEDIUM/LOW`, `FILE_RISK_ROUTINE`, and one
  `CATEGORY_*` constant per category.

## Internal workflow

1. `buildFindings` parses `what_deserves_attention_ranked` via the
   already-existing `parseTitledListItems` (`textFormatting.jsx`,
   unchanged).
2. For each parsed row, `classifyConfidence` checks Prompt v1's own real
   four-term uncertainty vocabulary (Confirmed/Likely/Worth checking/
   Unknown — frozen in `src/prompt/prompt_builder.py` since Milestone
   10B) first; if the text doesn't use it literally (an already-documented,
   pre-existing model behavior — see Milestone 32), a disclosed
   hedge-language pattern list is the fallback, floored at "Needs
   verification" — never defaulting to Confirmed.
3. `classifySeverity` checks an explicit "no functional impact" pattern
   first (forces Low regardless of anything else), then real severity
   keywords, boosted to Critical when the finding also names a file
   carrying a real deterministic risk-bearing claim.
4. `classifyCategory` runs an ordered keyword-rule list, falling back to
   "Bug" for unclassified High/Critical findings or "Other" otherwise.
5. `isBehavioralChange` runs a keyword check; when true,
   `buildBehavioralDetail` attempts to extract a real "after" clause
   (pattern: `now X.`), a real "before" clause (patterns: `previously X,`
   / `used to X,` / `had X, but/now`), and a real "impact" clause (the
   last sentence containing a genuine consequence word) — any of the
   three that doesn't match the text's actual shape is left `null`, shown
   in the UI as an honest "not stated," never guessed.
6. `deriveIntentVsImplementation` finds the Confirmed-tier mismatch
   finding (if any) and splits its quoted identifiers by proximity to a
   real occurrence of the word "test" in the same sentence — the
   identifier nearest "test" is attributed to `testDetail`, the rest to
   `implementationDetail`. Falls back to putting everything under
   `implementationDetail` (test empty) when the text never mentions
   "test" at all.
7. `attributeFindingsToFiles` groups `what_changed_and_why` by file (the
   already-existing `groupByFile` in `textFormatting.jsx`), collects each
   file's own quoted identifiers, and attributes a finding to a file when
   they share at least one identifier. `fileSeverity` then takes the
   higher of this attribution and the real risk-bearing-claim signal,
   falling back to `"Routine"` only when the coverage ledger already
   collapsed the file and nothing escalates it.

## Dependencies

- `./textFormatting` (`parseTitledListItems`, `extractFilenames`,
  `groupByFile`) — all pre-existing, unmodified.
- `./claimVocabulary` (`isRiskBearingClaim`) — pre-existing, unmodified.
- Consumed by: `components/ReviewVerdict.jsx`, `components/ReviewFindings.jsx`,
  `components/IntentVsImplementation.jsx`, `components/BlindSpots.jsx`,
  `components/TestSignal.jsx`, `components/FileOverview.jsx`,
  `pages/PRDetail.jsx`, `pages/PRList.jsx`.
- No backend dependency, no network call, no new API field required
  beyond the one already-documented additive `head_sha` field (unrelated
  to this module — see `docs/MILESTONE_7_REVIEW_INTELLIGENCE.md`).

## Future improvements

- Confidence/severity/category classification is a disclosed heuristic
  over real text, not a certainty — validated against exactly two real,
  deliberately-paired PRs (`docs/MILESTONE_7_REVIEW_INTELLIGENCE.md`), not
  yet evaluated against a larger, more diverse real-PR sample.
- Before/After/Impact extraction only fires when the model's sentence is
  phrased in a recognizable shape; a differently-worded real response may
  leave one or more fields honestly blank rather than populated.
- File-severity attribution depends on `what_changed_and_why` naming each
  file in its own bulleted breakdown, which is not guaranteed by the
  prompt contract (true for both real evaluation PRs, not proven
  universal).
- No real test-run/CI signal exists anywhere in this system; nothing here
  claims a test "actually failed," only what the model concluded from
  reading the code or what `observations.change_categories.touches_tests`
  reports.

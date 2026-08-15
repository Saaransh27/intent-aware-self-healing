# Milestone 7 — Review Intelligence

_2026-08-15. A release-focused refinement milestone, not feature development —
the goal was to make the existing review experience materially more useful,
not to redesign it. No architecture, reasoning pipeline, or existing working
component was rewritten._

_This document was rewritten after a precision re-review (same day). The
initial implementation covered the spec's structure but was shallower than
it should have been in several places — that re-review, its findings, and
the resulting fixes are documented in full below, not glossed over._

## Objective

Refine the product's review analysis and review UI so it answers, in under
five seconds: *is this change safe, what evidence supports that conclusion,
and what would a normal diff-based reviewer likely miss* — optimizing for
high signal over high comment count, and staying strictly conservative
("SAFE TO REVIEW," never "SAFE TO MERGE").

## What was changed, and why

The backend already produced everything genuinely needed for this — five
prose sections from the LLM (`verdict`, `what_changed_and_why`,
`what_deserves_attention_ranked`, `open_questions`, `minor_notes`) plus a
fully real, deterministic `review_context`/`observations` payload (claims,
gaps, coverage ledger, file classification, diff stats). What was missing
was a layer that turned the free-text findings list into something with
real severity/confidence/category/evidence — the product's stated
differentiator. That layer is new: `frontend/src/lib/reviewIntelligence.js`.

**A critical discovery, made before writing any classification logic**:
neither of this milestone's two evaluation PRs (see below) touches a Python
file, and `src/semantic/python/` is Python-only (ADR-005) — so the
deterministic reasoning layer produces **zero claims** for either PR,
confirmed directly against both PRs' real captured API responses
(`"file_claims": {}`). This meant severity/confidence classification could
not lean primarily on deterministic claims data (as `reviewTiers.js`'s
existing file-tier logic does) — it had to come from the model's own real
generated language. That, in turn, led to the second key discovery:

**Prompt v1's frozen `SYSTEM_PROMPT` already mandates a real four-term
uncertainty vocabulary** — Confirmed / Likely / Worth checking / Unknown
(`src/prompt/prompt_builder.py`, "UNCERTAINTY VOCABULARY," present since
Milestone 10B) — tied precisely to evidence grounding. This is exactly Part
6's confidence tiers, and using it is not inventing anything; it's
surfacing a designed part of the contract that was never previously exposed
in the UI. But this project's own prior history (Milestone 32) already
documented the model using this vocabulary *non-literally* in practice —
reconfirmed directly in PR #2's real response (hedge phrasing like "Confirm
that..." rather than the literal word). So the classifier's design is:
literal vocabulary match first, a disclosed hedge-language heuristic
second, and a conservative "Needs verification" floor when neither signal
is present — **never a default to Confirmed**.

## Precision re-review: what was found, and fixed for real

The first implementation pass covered all 25 parts of the spec structurally,
but a self-audit — re-reading the actual rendered output against real data,
not just the code's own comments — found seven parts that were shallower
than claimed. Each was genuinely fixed, not just re-described, and
re-verified against the real captured PR #2/#3 data:

1. **Part 4/5 (Evidence as a first-class field)** — originally, a finding's
   evidence was folded into one combined prose paragraph with no separate
   label. Fixed: every finding now carries a real `evidence` array (the
   model's own quoted code identifiers, extracted independently of the
   narrative body) rendered under its own **"Evidence"** label in
   `ReviewFindings.jsx`, separate from the explanation and from "Affected
   file(s)" (previously the same unlabeled block).

2. **Part 8 (a real bug, not just an incompleteness)** — the plain "tests
   changed?" fact was only ever shown when nothing else was, inside an
   `if (lines.length === 0)` fallback. For PR #3 (which has a real test
   mismatch), that meant the basic fact "yes, this PR touches test files"
   never appeared at all. Fixed: it's now always the first line,
   unconditionally, verified with a dedicated test against the real PR #3
   fixture proving both lines now appear together.

3. **Part 9 (Intent vs Implementation had a real, worse-than-disclosed
   bug)** — investigating the Part 8 fix surfaced a deeper problem:
   `deriveIntentVsImplementation` dumped **both** conflicting identifiers
   from a mismatch finding into `implementationDetail` and left `testDetail`
   permanently empty, for exactly the real case Part 9 is built around (a
   test expecting one identifier, code using another). Fixed: a real
   extraction (`splitTestVsImplementation`) finds the identifier nearest a
   real occurrence of the word "test" in the same sentence and attributes
   it correctly; verified against real PR #3 data
   (`implementationDetail: ["history.high_recent_curn"]`,
   `testDetail: ["history.high_recent_churn"]` — previously both would have
   landed in `implementationDetail`). An honest fallback (everything under
   Implementation, Test empty) is verified for the case where the text
   never mentions "test" at all, so nothing is ever guessed.

4. **Part 10 (the biggest gap — "a core differentiator" per the spec)** —
   the first pass only computed a boolean `isBehavioralChange` flag feeding
   Blind Spots; the actual **Before / After / Impact / Evidence / Tests**
   structured card was never built. Fixed for real: `buildBehavioralDetail`
   extracts a real "after" clause when the model phrases it as "now X"
   (never fabricated when it doesn't), a real "impact" clause (the last
   sentence containing a genuine consequence word — could/would/downgrade/
   cause/etc.), real quoted-identifier evidence, and a tests note reusing
   the same classification `TestSignal.jsx` uses. `BlindSpots.jsx` now
   renders this full card for behavioral-change findings and the older
   simple title+body treatment for mismatch-only ones. Verified against the
   real PR #3 tier-ordering finding: After = "checks for `STANDARD_REVIEW`
   before `REQUIRES_IMMEDIATE_REVIEW`" (extracted, not written by hand),
   Before = correctly null (the model's text never states the prior
   behavior — shown honestly as "not stated," not invented), Impact = "This
   could downgrade files that should trigger immediate review." (the real
   trailing sentence).

5. **Part 11 (IA ordering wasn't actually clean)** — `CommitStats` and
   `ExecutiveSummary` were both still rendered, interleaved around the new
   `ReviewVerdict` banner, contradicting the spec's explicit 10-section list
   and reintroducing the "wall of equally-weighted cards" problem Part 11
   warned against. Investigating this found `ExecutiveSummary`'s entire
   content set (verdict prose, priority files, change bullets) was now
   fully duplicated elsewhere: verdict → `ReviewVerdict`; priority files →
   the now-fixed `FileOverview` (see #6); change bullets → already present
   in `SupportingDetails`'s "What changed and why" accordion item. Fixed:
   `ExecutiveSummary` is no longer rendered in `PRDetail` (the component
   itself is untouched — the legacy commit-review flow still uses it
   unmodified). `CommitStats` stays, positioned before `ReviewVerdict`,
   with an explicit code comment explaining why: it's objective per-commit
   metadata (files/lines/tests changed), not an assessment, so it reads as
   a header extension rather than a competing verdict section.

6. **Part 13 (the deepest fix — File Overview's Risk column was a cosmetic
   relabel, not a real fix)** — only the column *header* text had been
   changed (File/Change/Risk/Why it matters); the actual *values* were
   still the old three-tier labels ("Requires Immediate Review"/"Standard
   Review"/"Routine") from `reviewTiers.js`'s deterministic-claims-only
   logic. Since both real evaluation PRs have zero deterministic claims
   (finding #1 above), every file in File Overview would have shown
   "Standard Review" regardless of the real `HIGH RISK` verdict — a File
   Overview table that visibly disagreed with the page's own verdict.
   Fixed properly, not cosmetically: a new `attributeFindingsToFiles`
   cross-references each finding's quoted identifiers against each
   changed file's own identifiers (extracted from `what_changed_and_why`'s
   real, per-file bulleted breakdown — confirmed this section does name
   each file explicitly, even though individual findings in
   `what_deserves_attention_ranked` do not). `fileSeverity` then reconciles
   this attribution with the existing risk-bearing-claim signal and the
   coverage ledger's "Routine" designation. Verified end to end against
   the real PR #3 fixture: `reviewTiers.js` (the file with the actual bug)
   now correctly shows High/Critical risk; a dedicated
   `FileOverview.test.jsx` (previously nonexistent) asserts this directly
   against real data, not a hand-built fixture.

7. **Part 15 (skipped, now stated plainly)** — reducing generic hedge
   language in the model's own writing requires a `SYSTEM_PROMPT` change,
   which conflicts with Part 21's "do not modify prompt_builder unless
   absolutely required" and this project's standing frozen-Prompt-v1
   discipline. Not attempted. This was true in the first pass too, but
   wasn't stated with enough clarity in the original report — corrected
   here.

All of the above were re-verified end to end against the real captured
PR #2/#3 API responses, not just at the unit level, and the full test
suite (125 frontend, 318 backend) passes after every fix.

## Existing backend data reused (no backend reasoning change)

- `review.sections.what_deserves_attention_ranked` — parsed via the
  already-existing `parseTitledListItems` (unchanged).
- `review.sections.what_changed_and_why` — now also cross-referenced
  (`attributeFindingsToFiles`) to correctly attribute a finding's severity
  to the real file it's actually about, since individual findings usually
  don't name files directly (finding #6 above).
- `review_context.file_claims` / `coverage_ledger` — reused via the
  already-existing `isRiskBearingClaim`/`reviewStrategyGroups`, as a
  secondary severity signal when real claims exist, and for the
  now-correctly-reconciled "Routine" designation.
- `observations.change_categories.touches_tests` — reused directly for the
  Test/Validation Coverage section, now always shown (finding #2 above).
- The model's own quoted code identifiers (backtick spans in its prose) —
  the closest real substitute for raw diff text, which the API does not
  expose at all (no Evidence Unit text crosses the API boundary). Also now
  stripped of one redundant layer of quoting (`` `"literal"` `` →
  `literal`) when the model double-wraps an identifier, a real cosmetic
  fix caught by the engine's own test suite.

## The one additive backend change

`PullRequestSummary` gained `head_sha` (`src/api/models.py`,
`src/github/client.py`'s `_pull_request_summary`) — GitHub returns
`head.sha` on both the list and single-PR endpoints (confirmed directly,
same as `state`, unlike `additions`/`deletions`/`changed_files` which are
single-PR-only), but it had never been extracted. This is the one piece of
real data genuinely missing: without it, there is no way to tell whether a
PR's code has changed since a cached review was generated (Part 18). No
reasoning/prompt/adapter/review_engine code was touched. 318 backend tests
pass (was 317; +1 new: `test_head_sha_is_present_on_the_list_endpoint`).

## Frontend changes (current, post-fix-pass state)

**New library**: `frontend/src/lib/reviewIntelligence.js` —
`buildFindings`, `deriveVerdict`, `deriveIntentVsImplementation`,
`deriveBlindSpots`, `buildBehavioralDetail`, `attributeFindingsToFiles`,
`fileSeverity`, plus the exported classification functions
(`classifyConfidence`, `classifySeverity`, `classifyCategory`,
`isBehavioralChange`). Pure, disclosed heuristics over real text — every
function's doc comment states exactly what it does and does not verify.

**New components**: `ReviewVerdict.jsx` (top-of-page verdict banner —
badge, Confirmed/Strong evidence/Needs verification/Informational counts,
up to 2 headline findings, a synthesized "Next" action), `IntentVsImplementation.jsx`
(claimed intent / implementation / test / PASS-MISMATCH, now correctly
attributed — see fix #3), `BlindSpots.jsx` (the full Before/After/Impact/
Evidence/Tests card for behavioral-change findings — fix #4 — plus "None
identified." when legitimately empty), `TestSignal.jsx` (Validation & Test
Coverage — always shows the plain tests-changed fact now — fix #2 — plus
test mismatch detection and untested-behavioral-change detection),
`StaleReviewBanner.jsx` (Part 18).

**Restructured**: `ReviewFindings.jsx` groups by **confidence** (Confirmed
→ Strong evidence → Needs verification, informational findings shown last
and de-emphasized), and every finding card shows severity/confidence/
category badges, the explanation, a separately-labeled **Evidence** block
(fix #1), Affected file(s), and a next-action line. `FileOverview.jsx`'s
Risk column now shows real, cross-referenced severity (fix #6), not just a
relabeled header. `PRList.jsx` shows real per-row risk status (`Not
reviewed` never fabricated) plus real files/lines-changed for
already-reviewed PRs only. `PRDetail.jsx` assembles the current, cleaned-up
information architecture (fix #5 — `ExecutiveSummary` no longer rendered
here), stamps a real client-side `_reviewedAt` timestamp, and offers
"Review again" on a real `head_sha` mismatch.

**Explicitly untouched**: `ExecutiveSummary.jsx` itself (only stopped being
*called* from `PRDetail`; the component and the legacy commit-review flow
that still uses it are fully intact), repository selection/login/OAuth
(Part 16 — already satisfies "which repo am I reviewing" via `PRHeader`'s
existing `owner/repo` display; no change made), `reviewTiers.js`'s
underlying file-tier rule (still used as one real input to the new
`fileSeverity` reconciliation, not replaced).

## Tests

- `reviewIntelligence.test.js` — 29 tests (17 from the first pass, +12 from
  the fix pass: 7 for Part 10's Before/After/Impact/Evidence/Tests
  extraction, 4 for Part 13's file-attribution reconciliation, 1 for Part
  9's honest fallback) — exercises the engine against the **exact, real,
  unedited** text captured from the real production API for PR #2 and #3.
- `PRDetail.reviewintelligence.test.jsx` — 3 tests rendering the real, full
  captured `POST /review/pr` responses through the actual `PRDetail` tree.
- `BlindSpots.test.jsx` (new, 3 tests), `TestSignal.test.jsx` (new, 3
  tests, one directly against real PR #3 data), `ReviewFindings.test.jsx`
  (new, 2 tests), `FileOverview.test.jsx` (new, 1 test directly against
  real PR #3 data) — none of these four component test files existed
  before the fix pass.
- `PRList.test.jsx` (+2), `PRDetail.test.jsx` (+2 new, 3 updated — the
  removal of `ExecutiveSummary` from `PRDetail` meant the model's literal
  verdict sentence is no longer rendered verbatim, so three pre-existing
  assertions were updated to check the real derived verdict badge
  instead), `PRDetail.realdata.test.jsx` (1 updated, same reason).
- `test_client.py` (+1 backend test) — `head_sha` extraction.

Totals: **125 frontend tests** (was 80 after Milestone 7A; 104 after the
first Milestone 7 pass; +21 in the fix pass), **318 backend tests** (was
317; +1). All pass; `npm run build`/`npm run lint` clean.

## PR #2 evaluation (real, captured production output)

**Ground truth**: 9/9 tests pass, no known defect.
**Rendered result**: `SAFE TO REVIEW`, 0 Confirmed, 0 Strong evidence, 3
Needs verification, 0 Informational. "No blocking issue found." No blind
spots. Intent vs Implementation: PASS. Matches acceptance Case A exactly.

## PR #3 evaluation (real, captured production output, identical claimed change)

**Ground truth**: `history.high_recent_curn` (typo) fails a real test;
`highestTier()`'s check order was swapped (a real, untested logic
regression); the `FILE_TIER_RULE` text update is real but harmless.
**Rendered result**: `HIGH RISK` (one of the two acceptance-valid outcomes
for Case B), 3 Confirmed, 1 Informational (the rule-description update,
correctly *not* presented as a defect). The tier-ordering finding now
renders the full Before/After/Impact/Evidence/Tests card under **Potential
blind spots**: After = the real extracted "now checks..." clause; Impact =
the real "This could downgrade..." sentence; Evidence = the real quoted
constants; Tests = "No test coverage was found for this behavior." Intent
vs Implementation: **MISMATCH**, now correctly split —
Implementation: `history.high_recent_curn`, Test: `history.high_recent_churn`
(previously both would have shown under Implementation with Test empty —
fix #3). File Overview now shows `reviewTiers.js` — the file with the
actual bug — at real High/Critical risk, not "Standard Review" (fix #6).

**The two PRs render meaningfully differently** — the core acceptance
criterion — despite an identical title, identical file set, and identical
surface-level "claimed intent."

## Known limitations (stated plainly, not glossed over)

- **Confidence/severity/category classification is a disclosed heuristic
  over real text, not a certainty.** It is only as good as (a) the model's
  own real language and (b) the keyword patterns chosen. A differently-worded
  real response could be misclassified; this is a known, accepted property
  of building on free-text LLM output without changing the prompt or adding
  structured LLM output fields (both explicitly out of this milestone's
  scope).
- **Before/After/Impact extraction (Part 10) only fires when the model's
  own sentence is phrased in a recognizable shape** ("now X" for After, a
  real consequence word for Impact). When it isn't, both are shown honestly
  as "not stated" rather than guessed — verified directly with a dedicated
  test, but this means the rich card is not guaranteed for every
  behavioral-change finding a differently-phrased response might produce.
- **File-severity attribution (Part 13) depends on `what_changed_and_why`
  actually naming each file in its own bulleted breakdown**, which was true
  for both real evaluation PRs but is not guaranteed by the prompt
  contract. When it doesn't, a file falls back to the risk-bearing-claim
  signal alone (or Low/Routine) — the same, narrower behavior as before
  this fix, not a regression, just not a universal solution.
- **"Evidence" is the model's own real quoted identifiers, not a
  synthesized reasoning chain.** The API exposes no raw diff/Evidence Unit
  text. If the model quotes nothing, the Evidence field is simply absent
  (never backfilled with a placeholder).
- **No real test-run/CI signal exists anywhere in this system.**
  `TestSignal.jsx` explicitly never claims a test "actually failed" — only
  what the model concluded from reading the code, or what the deterministic
  layer's own `touches_tests` flag says.
- **This heuristic was validated against exactly two real, deliberately-paired
  PRs** (plus the pre-existing `pallets/click#2202` fixture, still rendering
  correctly post-fix-pass). It has not been evaluated against a larger,
  more diverse real-PR sample the way Milestone 5's hardening pass was —
  legitimate future work, not claimed as done here.
- Repository selection (Part 16) was reviewed and found to already satisfy
  the requirement via `PRHeader`; genuinely nothing needed changing there.
- **Part 15 (reducing generic AI language) was not attempted**, since it
  requires a `SYSTEM_PROMPT` change — out of this milestone's scope by its
  own explicit constraint.

## Intentionally not changed

Backend reasoning/reasoning modules, Evidence Fusion, `context_builder.py`,
`prompt_builder.py`, `adapter`, `review_engine` — none touched.
`ExecutiveSummary.jsx` (the file itself, and the legacy commit-review flow
that still calls it), `reviewTiers.js`'s underlying tier rule,
`CommitStats.jsx`, `SupportingDetails.jsx`/`OpenQuestions.jsx`/
`ManualVerification.jsx`/`ReviewStrategy.jsx`, GitHub OAuth, session
handling — all unchanged. No comments system, chat agent, AI fix
generation, dashboards, or deployment work was added, per explicit
instruction.

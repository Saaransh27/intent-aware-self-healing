import { describe, expect, it } from "vitest";
import {
  buildFindings,
  deriveVerdict,
  deriveIntentVsImplementation,
  deriveBlindSpots,
  attributeFindingsToFiles,
  fileSeverity,
  SAFE_TO_REVIEW,
  HIGH_RISK,
  CONFIRMED,
  NEEDS_VERIFICATION,
  SEVERITY_LOW,
  SEVERITY_HIGH,
  SEVERITY_CRITICAL,
  FILE_RISK_ROUTINE,
} from "./reviewIntelligence";
import pr3Response from "../test/fixtures/real_pr_review_response.pr3_incorrect.json";

// Milestone 7: these are the EXACT, real, unedited
// what_deserves_attention_ranked strings captured from the real production
// API against two real PRs on a real repository (PR #2, a correct change;
// PR #3, the same claimed change with two real, verified defects). Not
// synthetic fixtures -- see docs/MILESTONE_7_REVIEW_INTELLIGENCE.md for the
// full captured responses and independently-verified ground truth.

const PR2_FINDINGS_TEXT = `1. **Identifier consistency** – Confirm that the string \`"history.high_recent_churn"\` exactly matches the identifier produced by the backend; a typo would cause the frontend to miss a genuine risk signal.
2. **Membership logic** – Verify that the function which checks risk‑bearing claims correctly includes the newly added identifier; otherwise the description change would be misleading.
3. **Description string usage** – Ensure that the modified rule text is not parsed elsewhere (e.g., UI components) in a way that could break because of the added phrase "high‑recent‑churn signal".`;

const PR3_FINDINGS_TEXT = `1. **Misspelled claim identifier** – the set contains \`"history.high_recent_curn"\` while the test (and the intended semantics) refer to \`"history.high_recent_churn"\` (**Confirmed**). This mismatch will cause the new test to fail and the churn signal not to be recognized at runtime.
2. **Changed tier‑selection ordering** – \`highestTier\` now checks for \`STANDARD_REVIEW\` before \`REQUIRES_IMMEDIATE_REVIEW\`. If a file's tier list includes both constants, the function will return \`STANDARD_REVIEW\` instead of the more urgent \`REQUIRES_IMMEDIATE_REVIEW\` (**Confirmed**). This could downgrade files that should trigger immediate review.
3. **Rule description update** – the \`FILE_TIER_RULE\` string now mentions the churn signal (**Confirmed**). No functional impact, but ensure the wording stays in sync with the actual logic.
4. **Added test for the churn claim** – the test expects the correctly spelled claim to be risk‑bearing (**Confirmed**). It will expose the typo above.`;

// Both real PRs' file_claims came back empty against the real API --
// neither PR touches a Python file, and semantic analysis is Python-only
// (ADR-005). Confirmed directly, not assumed.
const EMPTY_REVIEW_CONTEXT = { file_claims: {} };

describe("Milestone 7 review intelligence — CASE A: PR #2 (correct change)", () => {
  const findings = buildFindings(PR2_FINDINGS_TEXT, EMPTY_REVIEW_CONTEXT);

  it("produces exactly 3 findings", () => {
    expect(findings).toHaveLength(3);
  });

  it("never marks a PR #2 finding as Confirmed (no confirmed defect exists)", () => {
    expect(findings.some((f) => f.confidence === CONFIRMED)).toBe(false);
  });

  it("classifies identifier consistency as needs verification, not a confirmed defect", () => {
    expect(findings[0].confidence).toBe(NEEDS_VERIFICATION);
  });

  it("resolves to SAFE TO REVIEW overall", () => {
    const verdict = deriveVerdict(findings);
    expect(verdict.level).toBe(SAFE_TO_REVIEW);
    expect(verdict.confirmedCount).toBe(0);
  });

  it("does not fabricate a blind spot for a correct, unremarkable change", () => {
    expect(deriveBlindSpots(findings)).toHaveLength(0);
  });

  it("intent vs implementation is PASS (no confirmed mismatch)", () => {
    const result = deriveIntentVsImplementation(
      "Treat history.high_recent_churn as risk-bearing",
      findings
    );
    expect(result.consistency).toBe("PASS");
  });
});

describe("Milestone 7 review intelligence — CASE B: PR #3 (defective change)", () => {
  const findings = buildFindings(PR3_FINDINGS_TEXT, EMPTY_REVIEW_CONTEXT);

  it("produces exactly 4 findings", () => {
    expect(findings).toHaveLength(4);
  });

  it("marks the misspelled-identifier finding as Confirmed", () => {
    expect(findings[0].confidence).toBe(CONFIRMED);
  });

  it("marks the tier-ordering finding as Confirmed", () => {
    expect(findings[1].confidence).toBe(CONFIRMED);
  });

  it("does not present the rule-description update as a real defect (informational, not actionable)", () => {
    expect(findings[2].isInformational).toBe(true);
    expect(findings[2].severity).toBe(SEVERITY_LOW);
  });

  it("resolves to REVIEWER ATTENTION or HIGH RISK, never SAFE TO REVIEW", () => {
    const verdict = deriveVerdict(findings);
    expect(verdict.level).not.toBe(SAFE_TO_REVIEW);
    expect(verdict.level).toBe(HIGH_RISK);
    expect(verdict.confirmedCount).toBeGreaterThanOrEqual(2);
  });

  it("flags the tier-ordering change as a behavioral regression, no test coverage claimed", () => {
    expect(findings[1].isBehavioralChange).toBe(true);
    expect(findings[1].category).toBe("Behavioral regression");
  });

  it("surfaces the tier-ordering regression as a blind spot (a human reading the diff alone could miss it)", () => {
    const blindSpots = deriveBlindSpots(findings);
    expect(blindSpots.some((f) => f.title === "Changed tier‑selection ordering")).toBe(true);
  });

  it("intent vs implementation is MISMATCH, correctly attributing each real conflicting identifier to Implementation vs Test", () => {
    const result = deriveIntentVsImplementation(
      "Treat history.high_recent_churn as risk-bearing",
      findings
    );
    expect(result.consistency).toBe("MISMATCH");
    // Precision check (found on re-review): a naive split had previously
    // dumped BOTH conflicting identifiers into implementationDetail and
    // left testDetail empty, for exactly this real case.
    expect(result.implementationDetail).toEqual(["history.high_recent_curn"]);
    expect(result.testDetail).toEqual(["history.high_recent_churn"]);
  });
});

describe("Milestone 7 review intelligence — CASE C: no meaningful findings at all", () => {
  // A real, valid model output for a trivial commit -- plain prose, no
  // list structure, nothing to flag. "No blocking issue found" is a
  // valid, complete result (Part 2) -- never force a fabricated finding.
  const NOTHING_TO_REPORT_TEXT = "Nothing in this commit requires special attention.";

  it("produces zero findings, never a fabricated one", () => {
    expect(buildFindings(NOTHING_TO_REPORT_TEXT, EMPTY_REVIEW_CONTEXT)).toHaveLength(0);
  });

  it("resolves to SAFE TO REVIEW with all-zero counts", () => {
    const verdict = deriveVerdict(buildFindings(NOTHING_TO_REPORT_TEXT, EMPTY_REVIEW_CONTEXT));
    expect(verdict).toEqual({
      level: SAFE_TO_REVIEW,
      confirmedCount: 0,
      strongEvidenceCount: 0,
      needsVerificationCount: 0,
      informationalCount: 0,
    });
  });

  it("reports no blind spots", () => {
    expect(deriveBlindSpots(buildFindings(NOTHING_TO_REPORT_TEXT, EMPTY_REVIEW_CONTEXT))).toHaveLength(0);
  });
});

describe("Milestone 7 (fix pass) — Part 10: real Before/After/Impact/Evidence/Tests", () => {
  const findings = buildFindings(PR3_FINDINGS_TEXT, EMPTY_REVIEW_CONTEXT);
  const tierOrderingFinding = findings[1];

  it("attaches a behavioralDetail object only to the behavioral-change finding", () => {
    expect(tierOrderingFinding.isBehavioralChange).toBe(true);
    expect(tierOrderingFinding.behavioralDetail).not.toBeNull();
    expect(findings[0].behavioralDetail).toBeNull(); // the typo finding isn't a behavioral-change match
  });

  it("extracts a real 'after' clause from the model's own 'now X' phrasing, not a fabricated one", () => {
    expect(tierOrderingFinding.behavioralDetail.after).toBe(
      "checks for `STANDARD_REVIEW` before `REQUIRES_IMMEDIATE_REVIEW`"
    );
  });

  it("honestly reports no 'before' clause when the model's text doesn't state one, rather than inventing it", () => {
    expect(tierOrderingFinding.behavioralDetail.before).toBeNull();
  });

  it("extracts the real trailing consequence sentence as impact", () => {
    expect(tierOrderingFinding.behavioralDetail.impact).toBe(
      "This could downgrade files that should trigger immediate review."
    );
  });

  it("evidence is the real quoted identifiers from the model's own text", () => {
    expect(tierOrderingFinding.behavioralDetail.evidence).toEqual(
      expect.arrayContaining(["highestTier", "STANDARD_REVIEW", "REQUIRES_IMMEDIATE_REVIEW"])
    );
  });

  it("reports no test coverage for this behavior, matching TestSignal's own conclusion", () => {
    expect(tierOrderingFinding.behavioralDetail.testsNote).toBe("No test coverage was found for this behavior.");
  });

  it("every finding carries a real evidence field (Part 4/5), not folded silently into the body", () => {
    for (const finding of findings) {
      expect(finding.evidence).toBeInstanceOf(Array);
    }
    expect(findings[0].evidence).toEqual(
      expect.arrayContaining(["history.high_recent_curn", "history.high_recent_churn"])
    );
  });
});

describe("Milestone 7 (fix pass) — Part 13: File Overview risk reconciled with real severity", () => {
  // Real gap found on re-review: neither PR #2 nor PR #3 has any
  // file_claims (Python-only semantic analysis), and NOT ONE individual
  // finding in either PR's real what_deserves_attention_ranked names a
  // real file with its extension -- only what_changed_and_why does. A
  // naive "does this finding mention this filename" check therefore
  // NEVER fires, and every file would show as Low/Routine regardless of
  // the real HIGH RISK verdict. This is the real fix, tested against the
  // real PR #3 data.
  const findings = buildFindings(pr3Response.review.sections.what_deserves_attention_ranked, pr3Response.review_context);
  const changeText = pr3Response.review.sections.what_changed_and_why;
  const changedFiles = pr3Response.review_context.commit_summary.changed_files;
  const severityByPath = attributeFindingsToFiles(findings, changeText, changedFiles);

  it("attributes the real tier-ordering finding's High severity specifically to reviewTiers.js", () => {
    const path = changedFiles.find((p) => p.endsWith("reviewTiers.js"));
    const severity = fileSeverity(path, severityByPath, false, false);
    expect([SEVERITY_HIGH, SEVERITY_CRITICAL]).toContain(severity);
  });

  it("does not over-attribute the same severity to a file the finding isn't actually about", () => {
    const path = changedFiles.find((p) => p.endsWith("claimVocabulary.test.js"));
    const severity = fileSeverity(path, severityByPath, false, false);
    // The test file IS implicated by the typo finding (it shares the
    // correctly-spelled identifier), but never by the tier-ordering one.
    expect(severity).not.toBe(FILE_RISK_ROUTINE);
  });

  it("never fabricates a risk-bearing file when nothing attributes to it and it isn't a real collapsed/routine file", () => {
    const severity = fileSeverity("some/unrelated/file.py", new Map(), false, false);
    expect(severity).toBe(SEVERITY_LOW);
  });

  it("shows Routine only when the coverage ledger really collapsed the file and nothing escalates it", () => {
    const severity = fileSeverity("some/routine/file.py", new Map(), false, true);
    expect(severity).toBe(FILE_RISK_ROUTINE);
  });
});

describe("Milestone 7 (fix pass) — Part 9 robustness: mismatch with no nearby 'test' word", () => {
  // The real PR #3 case always has "test" appear near the conflicting
  // identifier -- this checks the honest fallback when a mismatch is
  // described without that anchor at all, so the split never guesses.
  const text = "the constant is named `FOO_BAR` but should be `FOO_BARR` (**Confirmed**). These do not match.";
  const findings = buildFindings(`1. **Name mismatch** – ${text}`, EMPTY_REVIEW_CONTEXT);

  it("puts everything under Implementation and leaves Test empty, rather than guessing which is which", () => {
    const result = deriveIntentVsImplementation("Some claimed intent", findings);
    expect(result.consistency).toBe("MISMATCH");
    expect(result.testDetail).toEqual([]);
    expect(result.implementationDetail).toEqual(expect.arrayContaining(["FOO_BAR", "FOO_BARR"]));
  });
});

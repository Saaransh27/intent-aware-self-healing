import { describe, expect, it } from "vitest";
import {
  buildFindings,
  deriveVerdict,
  deriveIntentVsImplementation,
  deriveBlindSpots,
  attributeFindingsToFiles,
  findingsForFile,
  fileSeverity,
  SAFE_TO_REVIEW,
  REVIEWER_ATTENTION,
  HIGH_RISK,
  SEVERITY_LOW,
  SEVERITY_HIGH,
  SEVERITY_CRITICAL,
  FILE_RISK_ROUTINE,
} from "./reviewIntelligence";
import pr3Response from "../test/fixtures/real_pr_review_response.pr3_incorrect.json";

// Milestone 8: buildFindings/deriveVerdict/etc. now consume the backend's
// own validated StructuredFinding objects (structured_findings.findings)
// directly -- no more prose parsing. The fixtures below are hand-built,
// not captured, because these are unit tests of the deterministic
// aggregation rules themselves: each one isolates one specific rule (e.g.
// "Confirmed confidence at Low severity must not trigger HIGH RISK") so
// the expected output can be asserted exactly. They model the two real,
// independently-verified failure modes this milestone was built to fix
// (see docs/MILESTONE_8_REVIEW_INTELLIGENCE_AND_UX.md): a benign fact the
// model called "Confirmed" wrongly promoting a safe change to HIGH RISK,
// and a real defect worded differently than expected being missed by
// keyword matching. The Part 13 (File Overview) and Part 9 robustness
// tests below instead exercise real, live-captured PR #3 data.

function finding(overrides) {
  return {
    title: "Untitled finding",
    category: "Other",
    severity: "Medium",
    confidence: "Needs verification",
    evidenceStrength: "Indirect",
    status: "Informational",
    proofType: "inferred_risk",
    explanation: "An explanation.",
    whyItMatters: "A consequence.",
    evidence: [],
    affectedFiles: [],
    affectedSymbols: [],
    verificationNeeded: [],
    suggestedAction: "Take a look.",
    ...overrides,
  };
}

describe("Milestone 8 review intelligence — CASE A: PR #2-shaped (correct change, no real defect)", () => {
  // The exact real failure this milestone fixes: the model called this
  // benign fact "Confirmed", but its severity is Low and its status is
  // purely informational -- confidence and severity answer different
  // questions, and neither alone should drive the verdict to HIGH RISK.
  const structured = [
    finding({
      title: "Rule description now mentions the churn signal",
      category: "Maintainability",
      severity: "Low",
      confidence: "Confirmed",
      status: "Informational",
      proofType: "informational",
    }),
    finding({
      title: "Backend claim existence unverified",
      category: "API/contract mismatch",
      severity: "Medium",
      confidence: "Needs verification",
      status: "Intent mismatch",
      proofType: "inferred_risk",
    }),
  ];
  const findings = buildFindings(structured);

  it("adapts every structured field onto the finding, unchanged", () => {
    expect(findings).toHaveLength(2);
    expect(findings[1].category).toBe("API/contract mismatch");
    expect(findings[1].confidence).toBe("Needs verification");
  });

  it("marks the informational finding as informational, excluded from actionable counts", () => {
    expect(findings[0].isInformational).toBe(true);
  });

  it("never resolves to HIGH RISK — a Confirmed but Low-severity, informational fact is not a real risk", () => {
    const verdict = deriveVerdict(findings, "ok");
    expect(verdict.level).not.toBe(HIGH_RISK);
    expect(verdict.level).toBe(REVIEWER_ATTENTION);
  });

  it("confidenceReduced is false when the backend's structured_findings state is ok", () => {
    expect(deriveVerdict(findings, "ok").confidenceReduced).toBe(false);
  });
});

describe("Milestone 8 review intelligence — CASE B: PR #3-shaped (real defects)", () => {
  const structured = [
    finding({
      title: "Misspelled claim identifier",
      category: "Test failure",
      severity: "High",
      confidence: "Confirmed",
      status: "Defect",
      proofType: "test_failure",
      evidence: ["history.high_recent_curn", "history.high_recent_churn"],
    }),
    finding({
      title: "Reordered tier-selection logic",
      category: "Behavioral regression",
      severity: "High",
      confidence: "Confirmed",
      status: "Regression risk",
      proofType: "behavioral_regression",
      whyItMatters: "Files needing immediate review could be downgraded.",
      affectedSymbols: ["highestTier"],
    }),
  ];
  const findings = buildFindings(structured);

  it("resolves to HIGH RISK — a Confirmed, High-severity real defect", () => {
    const verdict = deriveVerdict(findings, "ok");
    expect(verdict.level).toBe(HIGH_RISK);
    expect(verdict.confirmedCount).toBe(2);
  });

  it("flags the reordering finding as a behavioral change from its structured category, not keyword matching", () => {
    expect(findings[1].isBehavioralChange).toBe(true);
    expect(findings[1].behavioralDetail).not.toBeNull();
    expect(findings[1].behavioralDetail.impact).toBe("Files needing immediate review could be downgraded.");
  });

  it("surfaces the behavioral-change finding as a blind spot", () => {
    const blindSpots = deriveBlindSpots(findings);
    expect(blindSpots.some((f) => f.title === "Reordered tier-selection logic")).toBe(true);
  });

  it("intent vs implementation is MISMATCH, reading proofType directly (test_failure), never scanning prose", () => {
    const result = deriveIntentVsImplementation("Treat history.high_recent_churn as risk-bearing", findings);
    expect(result.consistency).toBe("MISMATCH");
    expect(result.testDetail).toEqual(
      expect.arrayContaining(["history.high_recent_curn", "history.high_recent_churn"])
    );
  });
});

describe("Milestone 8 review intelligence — CASE C: no findings at all", () => {
  it("produces zero findings for an empty structured array", () => {
    expect(buildFindings([])).toHaveLength(0);
  });

  it("resolves to SAFE TO REVIEW with all-zero counts when state is ok", () => {
    const verdict = deriveVerdict(buildFindings([]), "ok");
    expect(verdict).toEqual({
      level: SAFE_TO_REVIEW,
      confirmedCount: 0,
      strongEvidenceCount: 0,
      needsVerificationCount: 0,
      informationalCount: 0,
      confidenceReduced: false,
    });
  });

  it("reports no blind spots", () => {
    expect(deriveBlindSpots(buildFindings([]))).toHaveLength(0);
  });

  it("flags confidenceReduced when the backend could not validate the model's structured output", () => {
    expect(deriveVerdict(buildFindings([]), "unavailable").confidenceReduced).toBe(true);
    expect(deriveVerdict(buildFindings([]), "reduced").confidenceReduced).toBe(true);
  });
});

describe("Milestone 8 — Part 13: File Overview risk reconciled with real severity (real PR #3 data)", () => {
  // Real, live-captured data: attributeFindingsToFiles now reads each
  // finding's own "affectedFiles" field directly (a real field the model
  // sets per the section-3 contract), rather than cross-referencing
  // quoted identifiers against a separate prose section.
  const findings = buildFindings(pr3Response.structured_findings.findings);
  const changedFiles = pr3Response.review_context.commit_summary.changed_files;
  const severityByPath = attributeFindingsToFiles(findings, changedFiles);

  it("attributes a real elevated severity specifically to reviewTiers.js", () => {
    const path = changedFiles.find((p) => p.endsWith("reviewTiers.js"));
    const severity = fileSeverity(path, severityByPath, false, false);
    expect([SEVERITY_HIGH, SEVERITY_CRITICAL]).toContain(severity);
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

describe("Milestone 8 — Part 9 robustness: mismatch-shaped finding with no test-category counterpart", () => {
  // The real PR #3 case always has a dedicated Test failure finding
  // alongside the code-contradiction one -- this checks the honest
  // fallback when a mismatch-shaped finding has no test-category sibling
  // at all, so nothing is guessed into testDetail.
  const findings = buildFindings([
    finding({
      title: "Constant name mismatch",
      severity: "High",
      confidence: "Confirmed",
      status: "Defect",
      proofType: "direct_code_contradiction",
      affectedSymbols: ["FOO_BAR", "FOO_BARR"],
    }),
  ]);

  it("puts everything under Implementation and leaves Test empty, rather than guessing which is which", () => {
    const result = deriveIntentVsImplementation("Some claimed intent", findings);
    expect(result.consistency).toBe("MISMATCH");
    expect(result.testDetail).toEqual([]);
    expect(result.implementationDetail).toEqual(expect.arrayContaining(["FOO_BAR", "FOO_BARR"]));
  });
});

describe("Milestone 9 — Risk Hotspots attribution: a file's reason must be its own, never borrowed", () => {
  // Real gap found and reported this milestone: the prior attribution
  // fell back to "any finding with some evidence" when nothing named the
  // target file directly, which could attribute an unrelated file's
  // "why it matters" text to the first finding that happened to carry any
  // evidence at all. findingsForFile now requires the finding to actually
  // name the file in its own "affectedFiles" -- no fallback.
  const otherFileFinding = finding({
    title: "Unrelated finding about another file",
    severity: "High",
    affectedFiles: ["src/other.js"],
    evidence: ["some evidence, but not about src/a.js"],
  });
  const targetFileFinding = finding({
    title: "The real reason src/a.js is flagged",
    severity: "High",
    affectedFiles: ["src/a.js"],
    evidence: [],
  });
  const findings = buildFindings([otherFileFinding, targetFileFinding]);

  it("never attributes a finding to a file it doesn't actually name, even when an earlier finding has evidence", () => {
    const matches = findingsForFile("src/a.js", findings);
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe("The real reason src/a.js is flagged");
  });

  it("never returns the unrelated file's own finding for its own path either", () => {
    const matches = findingsForFile("src/other.js", findings);
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe("Unrelated finding about another file");
  });
});

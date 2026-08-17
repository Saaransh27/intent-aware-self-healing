// Milestone 8 (Part A): consumes the backend's own structured findings
// (api `structured_findings`, produced by src/prompt/prompt_builder.py's
// section-3 JSON contract and validated server-side by
// src/response_validation/structured_findings.py) directly. Verdict,
// category, severity, confidence, intent-vs-implementation, and
// behavioral-change detection are all read straight off fields the model
// itself set and the backend already validated -- never re-derived by
// scanning prose for keywords.
//
// This replaces Milestone 7's keyword classifiers (classifyConfidence/
// classifySeverity/classifyCategory/isBehavioralChange), which were found
// against real, live production data to misclassify in two independent
// ways: (1) a benign fact using the word "Confirmed" pushed an unrelated
// commit to HIGH RISK, because confidence and severity were conflated into
// one signal; (2) a real behavioral regression worded with "order" instead
// of "ordering" was missed entirely, because keyword matching cannot
// generalize past the exact words it was written for. See
// docs/MILESTONE_8_REVIEW_INTELLIGENCE_AND_UX.md.

export const SAFE_TO_REVIEW = "SAFE TO REVIEW";
export const REVIEWER_ATTENTION = "REVIEWER ATTENTION";
export const HIGH_RISK = "HIGH RISK";

export const CONFIRMED = "Confirmed";
export const STRONG_EVIDENCE = "Strong evidence";
export const NEEDS_VERIFICATION = "Needs verification";

export const SEVERITY_CRITICAL = "Critical";
export const SEVERITY_HIGH = "High";
export const SEVERITY_MEDIUM = "Medium";
export const SEVERITY_LOW = "Low";
export const SEVERITY_INFORMATIONAL = "Informational";

export const CATEGORY_BUG = "Bug";
export const CATEGORY_BEHAVIORAL_REGRESSION = "Behavioral regression";
export const CATEGORY_TEST_FAILURE = "Test failure";
export const CATEGORY_MISSING_TEST_COVERAGE = "Missing test coverage";
export const CATEGORY_SECURITY = "Security";
export const CATEGORY_API_CONTRACT = "API/contract mismatch";
export const CATEGORY_DEPENDENCY = "Dependency/compatibility";
export const CATEGORY_DATA_CORRECTNESS = "Data correctness";
export const CATEGORY_LOGIC_INCONSISTENCY = "Logic inconsistency";
export const CATEGORY_CONFIGURATION = "Configuration";
export const CATEGORY_MAINTAINABILITY = "Maintainability";
export const CATEGORY_OTHER = "Other";

export const FILE_RISK_ROUTINE = "Routine";

const SEVERITY_RANK = {
  [SEVERITY_CRITICAL]: 4,
  [SEVERITY_HIGH]: 3,
  [SEVERITY_MEDIUM]: 2,
  [SEVERITY_LOW]: 1,
  [SEVERITY_INFORMATIONAL]: 0,
};

// --- Finding assembly ----------------------------------------------------
//
// Each backend StructuredFinding, adapted for this frontend's downstream
// components. Every field here traces directly to a field the model set
// and the backend already validated -- nothing is reclassified from
// prose. `isBehavioralChange` is now a real structured signal (proofType/
// category the model itself chose), not a regex guess over its wording.
function adaptFinding(raw, index) {
  const isBehavioralChange =
    raw.proofType === "behavioral_regression" || raw.category === CATEGORY_BEHAVIORAL_REGRESSION;

  const finding = {
    index,
    title: raw.title,
    explanation: raw.explanation,
    whyItMatters: raw.whyItMatters,
    category: raw.category,
    severity: raw.severity,
    confidence: raw.confidence,
    evidenceStrength: raw.evidenceStrength,
    status: raw.status,
    proofType: raw.proofType,
    evidence: raw.evidence || [],
    affectedFiles: raw.affectedFiles || [],
    affectedSymbols: raw.affectedSymbols || [],
    verificationNeeded: raw.verificationNeeded || [],
    suggestedAction: raw.suggestedAction,
    isInformational: raw.severity === SEVERITY_INFORMATIONAL || raw.status === "Informational",
    isBehavioralChange,
  };

  // Part 10: the full Before/After/Impact/Evidence/Tests breakdown, only
  // computed (and only ever shown) for findings whose own structured
  // fields already flag them as a behavioral change.
  finding.behavioralDetail = isBehavioralChange ? buildBehavioralDetail(finding) : null;

  return finding;
}

export function buildFindings(structuredFindings) {
  return (structuredFindings || []).map(adaptFinding);
}

// Real, quoted code identifiers a finding's own prose fields cite --
// preserved only as a display convenience for components that still want
// to bold a code span inside "explanation"/"whyItMatters" text; carries no
// classification weight anywhere in this module anymore.
export function quotedIdentifiersIn(text) {
  const seen = new Set();
  const out = [];
  const re = /`([^`\n]+)`/g;
  let match;
  while ((match = re.exec(text || "")) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      out.push(match[1]);
    }
  }
  return out;
}

// Part 10's "Behavioral change detected" card: Impact / Evidence / Tests.
// Before/After are no longer force-extracted from prose with a regex --
// "explanation" already states the change in the model's own words, in
// its own dedicated field, so this module doesn't need to re-split it.
// Impact reuses "whyItMatters" directly, since that field's entire purpose
// (per the prompt contract) is the real consequence if the finding holds.
export function buildBehavioralDetail(finding) {
  return {
    before: null,
    after: null,
    impact: finding.whyItMatters || null,
    evidence: [...finding.evidence, ...finding.affectedSymbols],
    testsNote:
      finding.category === CATEGORY_MISSING_TEST_COVERAGE
        ? "Missing test coverage identified for this change."
        : finding.category === CATEGORY_TEST_FAILURE || finding.proofType === "test_failure"
          ? "A test failure was identified for this change — see Findings for detail."
          : "No test coverage was found for this behavior.",
  };
}

// --- Verdict (Part A4) ---------------------------------------------------
//
// Deterministic aggregation over structured fields only -- never prose
// search. A finding's confidence and severity answer different questions
// (a trivial fact can be "Confirmed" at Low severity; a serious concern
// can be High severity but "Needs verification"), so HIGH RISK requires
// BOTH Critical/High severity AND Confirmed confidence on a finding whose
// status reflects a real risk category -- never confidence alone. This is
// the exact fix for the real false-HIGH-RISK failure this milestone was
// built around (a benign fact the model happened to call "Confirmed").
const REAL_RISK_STATUSES = new Set([
  "Defect",
  "Regression risk",
  "Security risk",
  "Test gap",
  "Intent mismatch",
  "Maintainability risk",
]);

function isRealRisk(finding) {
  return (
    finding.confidence === CONFIRMED &&
    SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[SEVERITY_HIGH] &&
    REAL_RISK_STATUSES.has(finding.status)
  );
}

function deservesAttention(finding) {
  if (finding.isInformational) return false;
  if (finding.confidence === CONFIRMED || finding.confidence === STRONG_EVIDENCE) return true;
  return SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[SEVERITY_MEDIUM];
}

// `structuredState` is the backend's own StructuredFindingsResult.state
// ("ok" | "reduced" | "unavailable"). Part A5: never silently present a
// confident verdict when the backend couldn't fully validate the model's
// structured output -- `confidenceReduced` tells the UI to show "Analysis
// confidence reduced" instead of implying the verdict below is complete.
export function deriveVerdict(findings, structuredState) {
  const actionable = findings.filter((f) => !f.isInformational);
  const confirmedCount = actionable.filter((f) => f.confidence === CONFIRMED).length;
  const strongEvidenceCount = actionable.filter((f) => f.confidence === STRONG_EVIDENCE).length;
  const needsVerificationCount = actionable.filter((f) => f.confidence === NEEDS_VERIFICATION).length;
  const informationalCount = findings.length - actionable.length;

  let level = SAFE_TO_REVIEW;
  if (findings.some(isRealRisk)) level = HIGH_RISK;
  else if (actionable.some(deservesAttention)) level = REVIEWER_ATTENTION;

  return {
    level,
    confirmedCount,
    strongEvidenceCount,
    needsVerificationCount,
    informationalCount,
    confidenceReduced: structuredState !== "ok",
  };
}

function pathsMatch(filePath, rawPath) {
  return filePath === rawPath || filePath.endsWith("/" + rawPath) || filePath.endsWith(rawPath);
}

// Part 13: attributes each finding's severity to the real file(s) it's
// actually about, now read directly from the finding's own "affectedFiles"
// field -- the model states this explicitly per the section-3 contract,
// so no more cross-referencing quoted identifiers against a separate
// prose section to reconstruct an attribution that already exists.
export function attributeFindingsToFiles(findings, changedFilePaths) {
  const severityByPath = new Map();
  for (const finding of findings) {
    for (const rawPath of finding.affectedFiles) {
      const matchingPath = changedFilePaths.find((path) => pathsMatch(path, rawPath));
      if (!matchingPath) continue;
      const current = severityByPath.get(matchingPath) || SEVERITY_LOW;
      if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current]) {
        severityByPath.set(matchingPath, finding.severity);
      }
    }
  }
  return severityByPath;
}

// Milestone 9: the real finding(s) a specific file's own "affectedFiles"
// field actually names -- strictly, never a fallback to "this finding
// merely has some evidence." A real, disclosed gap this replaces: the
// prior version fell back to any finding with a non-empty evidence array
// when nothing named the file directly, which could attribute a file's
// "why it matters" text to an unrelated finding whenever an earlier,
// higher-severity finding happened to be the first one carrying any
// evidence at all. Sorted highest severity first so callers that want
// only the single most relevant finding can take the first element.
export function findingsForFile(filePath, findings) {
  return findings
    .filter((f) => f.affectedFiles.some((rawPath) => pathsMatch(filePath, rawPath)))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

// Reconciles the two risk signals this product computes for a file, so
// File Overview and Findings never silently disagree about the same file.
// Takes the higher of: the real risk-bearing-claim signal (when it
// exists) and the attributed finding severity above. "Routine" is
// preserved as a distinct, still-honest value -- only when the backend's
// own coverage ledger already collapsed this file AND nothing escalates it.
export function fileSeverity(filePath, severityByPath, isRiskBearingFile, isRoutineFile) {
  let maxSeverity = severityByPath.get(filePath) || SEVERITY_LOW;
  if (isRiskBearingFile && SEVERITY_RANK[SEVERITY_MEDIUM] > SEVERITY_RANK[maxSeverity]) {
    maxSeverity = SEVERITY_MEDIUM;
  }
  if (maxSeverity === SEVERITY_LOW && isRoutineFile && !isRiskBearingFile) {
    return FILE_RISK_ROUTINE;
  }
  return maxSeverity;
}

// --- Intent vs Implementation (Part 9) ------------------------------------
//
// "Mismatch-shaped" is read directly off the fields the prompt contract
// already defines for exactly this purpose: proofType "test_failure" (a
// real test disagrees with the implementation -- the test is real data
// standing in for "intent"), "direct_data_mismatch" (two literal values
// that must agree don't), "direct_code_contradiction" (the diff shows two
// things that can't both be true), or status "Intent mismatch" itself.
// None of this scans explanation/whyItMatters text -- every one of these
// is a field the model set directly.
const MISMATCH_PROOF_TYPES = new Set(["test_failure", "direct_data_mismatch", "direct_code_contradiction"]);

function isMismatchShaped(finding) {
  return finding.status === "Intent mismatch" || MISMATCH_PROOF_TYPES.has(finding.proofType);
}

function findingIdentifiers(finding) {
  return [...finding.affectedSymbols, ...finding.evidence, ...finding.affectedFiles];
}

export function deriveIntentVsImplementation(claimedIntent, findings) {
  const mismatchShaped = findings.filter(isMismatchShaped);
  const mismatchFinding = mismatchShaped[0] || null;

  const implementationDetail = [];
  const testDetail = [];
  for (const finding of mismatchShaped) {
    const bucket =
      finding.category === CATEGORY_TEST_FAILURE || finding.proofType === "test_failure"
        ? testDetail
        : implementationDetail;
    bucket.push(...findingIdentifiers(finding));
  }

  return {
    claimedIntent,
    implementationDetail: [...new Set(implementationDetail)],
    testDetail: [...new Set(testDetail)],
    consistency: mismatchFinding ? "MISMATCH" : "PASS",
    mismatchFinding,
  };
}

// --- Blind spots (Part 7) --------------------------------------------------
//
// Findings that require reasoning beyond the changed lines themselves --
// a real behavioral change, or a real mismatch between what was intended/
// tested and what was implemented. Both are now structured-field checks;
// legitimately empty when nothing qualifies.
export function deriveBlindSpots(findings) {
  return findings.filter((f) => f.isBehavioralChange || isMismatchShaped(f));
}

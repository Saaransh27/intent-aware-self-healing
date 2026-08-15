// The one place that turns real, already-computed backend decisions into a
// visible label. This is NOT a second analysis layer — every function here
// re-applies a rule the backend already encodes (which files its coverage
// ledger collapses as routine; which claims its own context_builder.py
// treats as risk-bearing) rather than inventing a new scoring scheme. If a
// requested concept had no backend fact to point to, it was replaced with
// one that does — see reviewContext.js for the underlying real data this
// reads, and claimVocabulary.js for the plain-language claim/gap labels.
//
// No percentages, no numeric confidence, no time estimates. Where the spec
// asked for "confidence," this exposes a real corroborating-signal COUNT
// instead. Where it asked for "risk level," these are the three labels
// used instead — deliberately not severity words, since no severity exists
// anywhere in the backend.
import { riskBearingFilePaths, reviewStrategyGroups } from "./reviewContext";
import { isRiskBearingClaim, claimLabel } from "./claimVocabulary";

export const REQUIRES_IMMEDIATE_REVIEW = "Requires Immediate Review";
export const STANDARD_REVIEW = "Standard Review";
export const ROUTINE = "Routine";

export const FILE_TIER_RULE =
  "Requires Immediate Review = a public-contract change, a first-touch-by-this-author, hot-file, or " +
  "high-recent-churn signal, or a missing expected co-change partner — and isn't already marked routine below. " +
  "Routine = the backend's own coverage ledger already collapsed it as safe to skim. " +
  "Standard Review = everything else.";

// Per-file label — reuses the backend's OWN coverage-ledger routine
// decision. The risk-bearing definition itself is this frontend's own
// (see claimVocabulary.js) — narrower than the backend's coverage-ledger
// definition, by design, after Milestone 5 found the backend's broader
// one tiers almost every file "Requires Immediate Review" in practice.
export function fileTier(filePath, reviewContext) {
  const { routineGroups } = reviewStrategyGroups(reviewContext);
  const isRoutine = routineGroups.some((g) => g.collapsed_group_files.includes(filePath));
  if (isRoutine) return ROUTINE;

  const isRiskBearing = riskBearingFilePaths(reviewContext).has(filePath);
  return isRiskBearing ? REQUIRES_IMMEDIATE_REVIEW : STANDARD_REVIEW;
}

export function fileTierMap(reviewContext) {
  const allFiles = reviewContext?.commit_summary?.changed_files || [];
  const map = new Map();
  for (const path of allFiles) map.set(path, fileTier(path, reviewContext));
  return map;
}

export const CRITICAL = "Critical";
export const MEDIUM = "Medium";
export const LOW = "Low";

export const FINDING_TIER_RULE =
  "Critical = names a file with a real risk-bearing signal. Medium = names a changed file with no " +
  "risk-bearing signal. Low = names no specific file.";

// Finding label — grounded in whether the finding's OWN text names a file
// that the backend already treats as risk-bearing (the same real
// cross-reference the evidence-ref chips use), never the finding's
// position in the model's list.
export function findingTier(mentionedFiles, reviewContext) {
  const riskBearing = riskBearingFilePaths(reviewContext);
  const changedFiles = new Set(reviewContext?.commit_summary?.changed_files || []);

  if (mentionedFiles.some((f) => riskBearing.has(f))) return CRITICAL;
  if (mentionedFiles.some((f) => changedFiles.has(f))) return MEDIUM;
  return LOW;
}

// "Why it matters" — the title of a file's strongest real signal (a
// risk-bearing claim if it has one, otherwise its first claim), not a
// generated sentence. Real corroborating-signal count, not a confidence
// percentage, is what backs this up on screen.
export function whyItMatters(filePath, reviewContext) {
  const claims = reviewContext?.file_claims?.[filePath] || [];
  const riskBearing = claims.filter(isRiskBearingClaim);
  if (riskBearing.length > 0) return claimLabel(riskBearing[0].claim).title;
  if (claims.length > 0) return claimLabel(claims[0].claim).title;
  return "No specific signals detected";
}

// The single highest tier among a set of per-file tiers — a commit-level
// "how much attention does this need" phrase that's always traceable back
// to the exact same per-file tiers shown in File Overview.
export function highestTier(tiers) {
  if (tiers.includes(STANDARD_REVIEW)) return STANDARD_REVIEW;
  if (tiers.includes(REQUIRES_IMMEDIATE_REVIEW)) return REQUIRES_IMMEDIATE_REVIEW;
  return ROUTINE;
}

import { buildFindings, deriveVerdict } from "./reviewIntelligence";

export const NOT_REVIEWED = "Not reviewed";

// Milestone 7 (Part 17), extracted to a shared module in Milestone 9 so
// PRList and the sidebar's Recent PRs rail never compute a PR's risk
// status two different ways. Risk status is only ever derived from a
// review that actually exists in this session's cache -- never
// fabricated for a PR nobody has reviewed yet.
export function riskStatusFor(cached) {
  if (!cached?.review?.parsed) return { label: NOT_REVIEWED, level: null };
  const findings = buildFindings(cached.structured_findings?.findings);
  const verdict = deriveVerdict(findings, cached.structured_findings?.state ?? "unavailable");
  return { label: verdict.level, level: verdict.level };
}

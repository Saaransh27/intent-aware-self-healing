import { snapshotCounts } from "../lib/reviewContext";
import { fileTierMap, highestTier, REQUIRES_IMMEDIATE_REVIEW, ROUTINE } from "../lib/reviewTiers";

// Real facts only. No "estimated review time" — there is no timing signal
// anywhere in this system, and the project's own design record explicitly
// rejected fabricating one ("a number implies a calibration guarantee
// that cannot actually be validated"). No "risk level" as a score either
// — "Review scope" here is the single highest real per-file priority tier
// (see reviewTiers.js), the same labels shown in Risk Hotspots, never a
// number.
//
// Milestone 9 (UI refinement): compacted from a 4-column icon/number
// grid into one small stat line directly under the PR header — the same
// real facts, reading like a single sentence instead of four equally-
// weighted cards.
function CommitStats({ reviewContext, observations }) {
  if (!reviewContext || !observations) return null;

  const { totalFiles } = snapshotCounts(reviewContext, observations);
  if (totalFiles === 0) return null;

  const { total_insertions, total_deletions } = observations.diff_stats;
  const testFilesTouched = Object.values(observations.file_classification).filter((c) => c === "Test").length;
  const tiers = [...fileTierMap(reviewContext).values()];
  const scope = highestTier(tiers);

  return (
    <p className="commit-stats-line" aria-label="Change stats">
      <span>{totalFiles} file{totalFiles === 1 ? "" : "s"} changed</span>
      <span className="commit-stats-dot">·</span>
      <span>
        <span className="stat-additions">+{total_insertions}</span>{" "}
        <span className="stat-deletions">-{total_deletions}</span>
      </span>
      <span className="commit-stats-dot">·</span>
      <span>Tests {testFilesTouched > 0 ? "changed" : "not changed"}</span>
      <span className="commit-stats-dot">·</span>
      <span className={scope === ROUTINE ? "commit-stats-scope-routine" : scope === REQUIRES_IMMEDIATE_REVIEW ? "commit-stats-scope-immediate" : ""}>
        Review scope: {scope}
      </span>
    </p>
  );
}

export default CommitStats;

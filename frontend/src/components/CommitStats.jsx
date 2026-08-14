import { FileText, GitCommit, TestTube2, Layers } from "lucide-react";
import { snapshotCounts } from "../lib/reviewContext";
import { fileTierMap, highestTier, REQUIRES_IMMEDIATE_REVIEW, ROUTINE } from "../lib/reviewTiers";

// Real facts only. No "estimated review time" — there is no timing signal
// anywhere in this system, and the project's own design record explicitly
// rejected fabricating one ("a number implies a calibration guarantee
// that cannot actually be validated"). No "risk level" as a score either
// — "Review Scope" here is the single highest real per-file priority tier
// (see reviewTiers.js), the same labels shown in File Overview, never a
// number.
function CommitStats({ reviewContext, observations }) {
  if (!reviewContext || !observations) return null;

  const { totalFiles } = snapshotCounts(reviewContext, observations);
  if (totalFiles === 0) return null;

  const { total_insertions, total_deletions } = observations.diff_stats;
  const testFilesTouched = Object.values(observations.file_classification).filter((c) => c === "Test").length;
  const tiers = [...fileTierMap(reviewContext).values()];
  const scope = highestTier(tiers);

  return (
    <section className="metric-strip" aria-label="Change stats">
      <div className="metric">
        <FileText className="metric-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        <div className="metric-body">
          <span className="metric-value">{totalFiles}</span>
          <span className="metric-label">Files Changed</span>
        </div>
      </div>
      <div className="metric">
        <GitCommit className="metric-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        <div className="metric-body">
          <span className="metric-value">
            <span className="stat-additions">+{total_insertions}</span>{" "}
            <span className="stat-deletions">-{total_deletions}</span>
          </span>
          <span className="metric-label">Lines Changed</span>
        </div>
      </div>
      <div className="metric">
        <TestTube2 className="metric-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        <div className="metric-body">
          <span className="metric-value">{testFilesTouched > 0 ? "Yes" : "No"}</span>
          <span className="metric-label">Tests Changed</span>
        </div>
      </div>
      <div className="metric">
        <Layers className="metric-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        <div className="metric-body">
          <span className={`metric-value metric-value-tier${scope === ROUTINE ? "-routine" : scope === REQUIRES_IMMEDIATE_REVIEW ? "-immediate" : ""}`}>
            {scope}
          </span>
          <span className="metric-label">Review Scope</span>
        </div>
      </div>
    </section>
  );
}

export default CommitStats;

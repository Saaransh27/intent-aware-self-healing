import { AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  SAFE_TO_REVIEW,
  REVIEWER_ATTENTION,
  HIGH_RISK,
  CONFIRMED,
  STRONG_EVIDENCE,
} from "../lib/reviewIntelligence";

const VERDICT_META = {
  [SAFE_TO_REVIEW]: { Icon: ShieldCheck, className: "verdict-safe" },
  [REVIEWER_ATTENTION]: { Icon: ShieldAlert, className: "verdict-attention" },
  [HIGH_RISK]: { Icon: AlertTriangle, className: "verdict-high-risk" },
};

const CONFIDENCE_RANK = { [CONFIRMED]: 2, [STRONG_EVIDENCE]: 1 };

// Answers Part 12's four questions within 5 seconds: should I be worried,
// why, how confident is the system, what should I inspect first. Never
// "SAFE TO MERGE" -- this product stays conservative by design (Part 3).
function ReviewVerdict({ verdict, findings }) {
  const { level, confirmedCount, strongEvidenceCount, needsVerificationCount, informationalCount, confidenceReduced } = verdict;
  const { Icon, className } = VERDICT_META[level];

  const actionable = findings.filter((f) => !f.isInformational);
  const headline = [...actionable]
    .sort((a, b) => (CONFIDENCE_RANK[b.confidence] || 0) - (CONFIDENCE_RANK[a.confidence] || 0))
    .slice(0, 2);

  const topConfirmed = actionable.find((f) => f.confidence === CONFIRMED);
  const nextAction = topConfirmed
    ? `Inspect ${topConfirmed.affectedFiles.length > 0 ? topConfirmed.affectedFiles.join(" and ") : "the change described above"} before merging.`
    : "No blocking issue found.";

  return (
    <section id="review-status" className={`review-verdict ${className}`}>
      <span className="review-verdict-eyebrow">Review Status</span>
      <div className="review-verdict-top">
        <Icon className="review-verdict-icon" size={22} strokeWidth={1.75} aria-hidden="true" />
        <span className="review-verdict-level">{level}</span>
      </div>

      {confidenceReduced && (
        <p className="review-verdict-confidence-reduced" role="status">
          Analysis confidence reduced — the model's structured findings for this review didn't fully validate, so
          this verdict may be based on an incomplete or empty set of findings. Read the full response below before
          relying on it.
        </p>
      )}

      <div className="review-verdict-counts">
        <span className="verdict-count verdict-count-confirmed">{confirmedCount} Confirmed</span>
        <span className="verdict-count verdict-count-strong">{strongEvidenceCount} Strong evidence</span>
        <span className="verdict-count verdict-count-needs-verification">{needsVerificationCount} Needs verification</span>
        <span className="verdict-count verdict-count-informational">{informationalCount} Informational</span>
      </div>

      {headline.length > 0 && (
        <ul className="review-verdict-headlines">
          {headline.map((finding) => (
            <li key={finding.index} className="review-verdict-headline">
              <span className={`badge badge-severity-${finding.severity.toLowerCase()}`}>{finding.severity}</span>
              <span className={`badge badge-confidence-${finding.confidence.replace(/\s+/g, "-").toLowerCase()}`}>
                {finding.confidence}
              </span>
              <span className="review-verdict-headline-text">{finding.title || finding.explanation}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="review-verdict-next">
        <strong>Next: </strong>
        {nextAction}
      </p>
    </section>
  );
}

export default ReviewVerdict;

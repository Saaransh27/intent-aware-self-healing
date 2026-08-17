import { AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  SAFE_TO_REVIEW,
  REVIEWER_ATTENTION,
  HIGH_RISK,
  CONFIRMED,
  STRONG_EVIDENCE,
} from "../lib/reviewIntelligence";

const VERDICT_META = {
  [SAFE_TO_REVIEW]: { Icon: ShieldCheck, className: "verdict-safe", subtext: "No blocking issues found." },
  [REVIEWER_ATTENTION]: { Icon: ShieldAlert, className: "verdict-attention", subtext: "Review before merging." },
  [HIGH_RISK]: { Icon: AlertTriangle, className: "verdict-high-risk", subtext: "Do not merge yet." },
};

const CONFIDENCE_RANK = { [CONFIRMED]: 2, [STRONG_EVIDENCE]: 1 };

// Milestone 9: SAFE_TO_REVIEW deliberately never says "ready to merge" or
// similar, even though the spec's own example phrases the opposite case
// as "do not merge yet" — this product's own standing design invariant
// (see docs/ARCHITECTURE.md, ADR-013) is that the verdict is a
// prioritization signal, never a final merge adjudication. "No blocking
// issues found" keeps that promise while still answering the same
// question ("should I be worried about merging this?").
//
// Confirmed-defects/test-failures/open-questions counts are computed
// from the same structured fields ConfirmedIssues/OpenQuestions sections
// below use — never a second, independently-computed number, so the
// verdict line and those sections can never contradict each other.
function ReviewVerdict({ verdict, findings }) {
  const { level, confidenceReduced } = verdict;
  const { Icon, className, subtext } = VERDICT_META[level];

  const actionable = findings.filter((f) => !f.isInformational);
  const confirmed = actionable.filter((f) => f.confidence === CONFIRMED);
  const testFailures = confirmed.filter((f) => f.category === "Test failure");
  const defects = confirmed.filter((f) => f.category !== "Test failure");
  const openQuestions = actionable.filter((f) => f.confidence !== CONFIRMED);

  const summaryParts = [
    defects.length > 0 && `${defects.length} confirmed defect${defects.length === 1 ? "" : "s"}`,
    testFailures.length > 0 && `${testFailures.length} test failure${testFailures.length === 1 ? "" : "s"}`,
    openQuestions.length > 0 && `${openQuestions.length} open question${openQuestions.length === 1 ? "" : "s"}`,
  ].filter(Boolean);

  const headline = [...actionable]
    .sort((a, b) => (CONFIDENCE_RANK[b.confidence] || 0) - (CONFIDENCE_RANK[a.confidence] || 0))
    .slice(0, 2);

  // The next action reuses the model's own suggestedAction text for the
  // top 1-2 confirmed findings, joined into one line -- never a new
  // sentence invented on top of them.
  const nextActions = confirmed.slice(0, 2).map((f) => f.suggestedAction).filter(Boolean);
  const nextAction = nextActions.length > 0 ? nextActions.join(" ") : "No specific action required.";

  return (
    <section id="review-status" className={`review-verdict ${className}`}>
      <span className="review-verdict-eyebrow">Review verdict</span>
      <div className="review-verdict-top">
        <Icon className="review-verdict-icon" size={22} strokeWidth={1.75} aria-hidden="true" />
        <span className="review-verdict-level">{level}</span>
      </div>
      <p className="review-verdict-subtext">{subtext}</p>

      {confidenceReduced && (
        <p className="review-verdict-confidence-reduced" role="status">
          Analysis confidence reduced — the model's structured findings for this review didn't fully validate, so
          this verdict may be based on an incomplete or empty set of findings. Read the full response below before
          relying on it.
        </p>
      )}

      {summaryParts.length > 0 && (
        <p className="review-verdict-summary">{summaryParts.join(" · ")}</p>
      )}

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
        <strong>Next action: </strong>
        {nextAction}
      </p>
    </section>
  );
}

export default ReviewVerdict;

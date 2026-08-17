import { AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { SAFE_TO_REVIEW, REVIEWER_ATTENTION, HIGH_RISK, CONFIRMED, deriveInferenceSummary } from "../lib/reviewIntelligence";

const VERDICT_META = {
  [SAFE_TO_REVIEW]: { Icon: ShieldCheck, className: "verdict-safe", subtext: "No blocking issues found." },
  [REVIEWER_ATTENTION]: { Icon: ShieldAlert, className: "verdict-attention", subtext: "Review before merging." },
  [HIGH_RISK]: { Icon: AlertTriangle, className: "verdict-high-risk", subtext: "Do not merge yet." },
};

// Milestone 9 (command-deck header): a categorical dial, not a gauge --
// this product's standing rule (docs/ARCHITECTURE.md ADR-013, enforced by
// PRDetail.realdata.test.jsx's "no `\d+% confiden` anywhere in the DOM"
// assertion) is that risk is a real, discrete verdict level, never a
// manufactured percentage. The ring's three zones and their order are
// always the same; only which third is lit (the real, already-derived
// verdict.level) changes -- this is a position indicator over an
// existing categorical value, not a new signal.
const RING_ZONES = [
  { level: SAFE_TO_REVIEW, colorVar: "--color-safe", bgVar: "--color-safe-bg" },
  { level: REVIEWER_ATTENTION, colorVar: "--color-warning", bgVar: "--color-warning-bg" },
  { level: HIGH_RISK, colorVar: "--color-danger", bgVar: "--color-danger-bg" },
];
const ZONE_SPAN_DEG = 120;
const ZONE_GAP_DEG = 6;

function ringBackground(activeLevel) {
  const stops = RING_ZONES.map((zone, i) => {
    const color = `var(${zone.level === activeLevel ? zone.colorVar : zone.bgVar})`;
    const start = i * ZONE_SPAN_DEG;
    const end = start + ZONE_SPAN_DEG - ZONE_GAP_DEG;
    const next = start + ZONE_SPAN_DEG;
    return `${color} ${start}deg ${end}deg, transparent ${end}deg ${next}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

// Confirmed-defects/test-failures/open-questions counts are computed from
// the same structured fields Confirmed Issues/Open Questions use below --
// never a second, independently-computed number, so this header and
// those sections can never contradict each other.
function ReviewConfidenceHeader({ verdict, findings, intentVsImplementation }) {
  const { level, confidenceReduced } = verdict;
  const { Icon, className, subtext } = VERDICT_META[level];

  const actionable = findings.filter((f) => !f.isInformational);
  const confirmed = actionable.filter((f) => f.confidence === CONFIRMED);
  const testFailures = confirmed.filter((f) => f.category === "Test failure");
  const defects = confirmed.filter((f) => f.category !== "Test failure");
  const openQuestions = actionable.filter((f) => f.confidence !== CONFIRMED);

  const inference = deriveInferenceSummary(intentVsImplementation, findings);

  return (
    <section id="review-status" className="review-confidence-header">
      <div className="confidence-panels">
        <div className={`confidence-panel verdict-panel ${className}`}>
          <span className="confidence-eyebrow">Review Verdict</span>
          <div className="verdict-ring" style={{ background: ringBackground(level) }}>
            <div className="verdict-ring-hole">
              <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
            </div>
          </div>
          <span className="verdict-pill">{level}</span>
          <p className="verdict-subtext">{subtext}</p>
          {(defects.length > 0 || testFailures.length > 0 || openQuestions.length > 0) && (
            <div className="verdict-counts">
              {defects.length > 0 && <span>{defects.length} confirmed defect{defects.length === 1 ? "" : "s"}</span>}
              {testFailures.length > 0 && (
                <span>{testFailures.length} test failure{testFailures.length === 1 ? "" : "s"}</span>
              )}
              {openQuestions.length > 0 && (
                <span>{openQuestions.length} open question{openQuestions.length === 1 ? "" : "s"}</span>
              )}
            </div>
          )}
          {confidenceReduced && (
            <p className="review-verdict-confidence-reduced" role="status">
              Analysis confidence reduced — the model's structured findings for this review didn't fully validate,
              so this verdict may be based on an incomplete or empty set of findings.
            </p>
          )}
        </div>

        <div className="confidence-panel inference-panel">
          <div className="inference-division">
            <span className="confidence-eyebrow">Inferred Intent</span>
            {intentVsImplementation.claimedIntent ? (
              <p className="inference-intent-text">{intentVsImplementation.claimedIntent}</p>
            ) : (
              <p className="inference-empty">No claimed intent available for this PR.</p>
            )}
          </div>

          <div className="inference-division">
            <span className="confidence-eyebrow">
              Implementation vs. Intent
              {inference.rows.length > 0 && (
                <span className="inference-tally">
                  {inference.matchedCount > 0 && (
                    <span className="tally-matched">
                      {inference.matchedCount} matched
                    </span>
                  )}
                  {inference.matchedCount > 0 && inference.mismatchedCount > 0 && " · "}
                  {inference.mismatchedCount > 0 && (
                    <span className="tally-mismatched">
                      {inference.mismatchedCount} mismatched
                    </span>
                  )}
                </span>
              )}
            </span>
            {inference.rows.length === 0 ? (
              <p className="inference-empty">Nothing to compare — no mismatch-shaped or confirmed findings.</p>
            ) : (
              <ul className="inference-rows">
                {inference.rows.map((row, i) => (
                  <li
                    key={i}
                    className={`inference-row ${row.matched ? "inference-row-matched" : "inference-row-mismatched"}`}
                  >
                    <span className="inference-mark" aria-hidden="true">{row.matched ? "✓" : "✕"}</span>
                    <span className="inference-row-text">{row.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ReviewConfidenceHeader;

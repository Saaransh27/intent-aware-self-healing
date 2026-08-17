import { deriveInferenceSummary } from "../lib/reviewIntelligence";

// Command-deck header, middle column: two divisions, separated by a
// hairline -- the real claimed intent (the PR's own title/commit
// message), and the real match/mismatch tally already computed for
// Intent -> Implementation -> Test, regrouped one row per finding (see
// lib/reviewIntelligence.js's deriveInferenceSummary).
function InferencePanel({ intentVsImplementation, findings }) {
  const inference = deriveInferenceSummary(intentVsImplementation, findings);

  return (
    <section className="confidence-panel inference-panel">
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
    </section>
  );
}

export default InferencePanel;

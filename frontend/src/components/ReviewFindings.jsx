import { renderInlineMarkdown, renderMarkdownLite } from "../lib/textFormatting";
import { CONFIRMED, STRONG_EVIDENCE, NEEDS_VERIFICATION } from "../lib/reviewIntelligence";

const CONFIDENCE_ORDER = [CONFIRMED, STRONG_EVIDENCE, NEEDS_VERIFICATION];

const NEXT_ACTION_BY_CONFIDENCE = {
  [CONFIRMED]: "Fix before merging.",
  [STRONG_EVIDENCE]: "Verify this inference before merging.",
  [NEEDS_VERIFICATION]: "Verify before merging.",
};

// Milestone 7: every finding now carries severity/confidence/category/
// evidence/affected-files/next-action (Part 4), grouped by CONFIDENCE
// (Confirmed -> Strong evidence -> Needs verification) so the distinction
// Part 6 requires is visually obvious, not buried in prose. Purely
// informational findings (e.g. a real but harmless rule-description
// update) are shown last, visually de-emphasized, never mixed in with
// actionable ones.
function ReviewFindings({ rawText, findings, selectedFile, onSelectFile, reviewContext }) {
  if (!rawText || !rawText.trim()) return null;

  if (findings.length === 0) {
    return (
      <section className="review-findings">
        <h2 className="section-heading">Findings</h2>
        <div className="section-body">{renderMarkdownLite(rawText)}</div>
      </section>
    );
  }

  const actionable = findings.filter((f) => !f.isInformational);
  const informational = findings.filter((f) => f.isInformational);

  const grouped = CONFIDENCE_ORDER.map((confidence) => ({
    confidence,
    items: actionable.filter((f) => f.confidence === confidence),
  })).filter((g) => g.items.length > 0);

  function renderFinding(finding) {
    const isRelated = !!selectedFile && finding.mentionedFiles.includes(selectedFile);
    const isDimmed = !!selectedFile && !isRelated;

    return (
      <article
        className={`finding-card${isRelated ? " finding-card-related" : ""}${isDimmed ? " finding-card-dimmed" : ""}`}
        key={finding.index}
      >
        <div className="finding-card-top">
          <span className={`badge badge-severity-${finding.severity.toLowerCase()}`}>{finding.severity}</span>
          <span className={`badge badge-confidence-${finding.confidence.replace(/\s+/g, "-").toLowerCase()}`}>
            {finding.confidence}
          </span>
          <span className="badge badge-category">{finding.category}</span>
        </div>
        {finding.title && <h4 className="finding-title">{renderInlineMarkdown(finding.title)}</h4>}
        <p className="finding-explanation">{renderInlineMarkdown(finding.body)}</p>

        {/* Part 4/5: Evidence as its own labeled field, separate from the
            narrative body above -- the real quoted code identifiers the
            model itself cited. Never shown as a fabricated bullet list
            when the model quoted nothing; simply omitted instead. */}
        {finding.evidence.length > 0 && (
          <div className="finding-evidence">
            <span className="finding-field-label">Evidence</span>
            <span className="finding-evidence-values">
              {finding.evidence.map((id, i) => (
                <code key={i} className="intent-code">{id}</code>
              ))}
            </span>
          </div>
        )}

        {!finding.isInformational && (
          <p className="finding-next-action">
            <strong>Next: </strong>
            {NEXT_ACTION_BY_CONFIDENCE[finding.confidence]}
          </p>
        )}

        {(finding.mentionedFiles.length > 0 || finding.corroboratingCount > 0) && (
          <div className="finding-affected-files">
            <span className="finding-field-label">Affected file(s)</span>
            <div className="finding-evidence-refs">
              {finding.mentionedFiles.map((name) => {
                const claimCount = reviewContext?.file_claims?.[name]?.length || 0;
                return (
                  <button
                    type="button"
                    key={name}
                    className="finding-evidence-ref"
                    onClick={() => onSelectFile(selectedFile === name ? null : name)}
                  >
                    {name}
                    {claimCount > 0 && <span className="finding-evidence-ref-count">{claimCount}</span>}
                  </button>
                );
              })}
              {finding.corroboratingCount > 0 && (
                <span className="finding-corroboration">
                  {finding.corroboratingCount} corroborating signal{finding.corroboratingCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="review-findings">
      <h2 className="section-heading">Findings</h2>
      {grouped.map(({ confidence, items }) => (
        <div className="findings-group" key={confidence}>
          <h3 className={`findings-group-label findings-group-label-${confidence.replace(/\s+/g, "-").toLowerCase()}`}>
            {confidence} ({items.length})
          </h3>
          <div className="findings-list">{items.map(renderFinding)}</div>
        </div>
      ))}
      {informational.length > 0 && (
        <div className="findings-group findings-group-informational">
          <h3 className="findings-group-label findings-group-label-informational">
            Informational ({informational.length})
          </h3>
          <div className="findings-list">{informational.map(renderFinding)}</div>
        </div>
      )}
    </section>
  );
}

export default ReviewFindings;

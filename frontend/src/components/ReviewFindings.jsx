import { parseTitledListItems, renderMarkdownLite, renderInlineMarkdown, extractFilenames } from "../lib/textFormatting";
import { findingTier, CRITICAL, MEDIUM, LOW, FINDING_TIER_RULE } from "../lib/reviewTiers";

const TIER_ORDER = [CRITICAL, MEDIUM, LOW];

// Maps to review.sections.what_deserves_attention_ranked — the model's own
// list of things worth a reviewer's attention, grouped into Critical /
// Medium / Low. That grouping is NOT the model's rank position — it's
// derived from whether the finding's own text names a file the backend
// already treats as risk-bearing (see reviewTiers.js's findingTier),
// which is a real, disclosed rule, not an arbitrary position cutoff.
//
// "Confidence" is not a fabricated percentage — it's the real count of
// corroborating claims for the file(s) this finding names, the same
// count the evidence-ref chip already shows.
function ReviewFindings({ rawText, selectedFile, onSelectFile, reviewContext }) {
  if (!rawText || !rawText.trim()) return null;

  const rows = parseTitledListItems(rawText);

  if (!rows) {
    return (
      <section className="review-findings">
        <h2 className="section-heading">Review Findings</h2>
        <div className="section-body">{renderMarkdownLite(rawText)}</div>
      </section>
    );
  }

  const findings = rows.map((row, index) => {
    const mentionedFiles = extractFilenames(row.body);
    return { ...row, index, mentionedFiles, tier: findingTier(mentionedFiles, reviewContext) };
  });

  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: findings.filter((f) => f.tier === tier),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="review-findings">
      <h2 className="section-heading">Review Findings</h2>
      <p className="section-hint">{FINDING_TIER_RULE}</p>
      {grouped.map(({ tier, items }) => (
        <div className="findings-group" key={tier}>
          <h3 className={`findings-group-label findings-group-label-${tier.toLowerCase()}`}>
            {tier} ({items.length})
          </h3>
          <div className="findings-list">
            {items.map((row) => {
              const isRelated = !!selectedFile && row.mentionedFiles.includes(selectedFile);
              const isDimmed = !!selectedFile && !isRelated;
              const corroboratingCount = row.mentionedFiles.reduce(
                (sum, name) => sum + (reviewContext?.file_claims?.[name]?.length || 0),
                0
              );

              return (
                <article
                  className={`finding-card${isRelated ? " finding-card-related" : ""}${isDimmed ? " finding-card-dimmed" : ""}`}
                  key={row.index}
                >
                  <div className="finding-card-top">
                    {row.title && <h4 className="finding-title">{renderInlineMarkdown(row.title)}</h4>}
                  </div>
                  <p className="finding-explanation">{renderInlineMarkdown(row.body)}</p>
                  {(row.mentionedFiles.length > 0 || corroboratingCount > 0) && (
                    <div className="finding-evidence-refs">
                      {row.mentionedFiles.map((name) => {
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
                      {corroboratingCount > 0 && (
                        <span className="finding-corroboration">
                          {corroboratingCount} corroborating signal{corroboratingCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export default ReviewFindings;

import { useMemo } from "react";
import { renderInlineMarkdown } from "../lib/textFormatting";

export const ALL = "All";

// Part B4: filters read three structured fields directly off each
// finding -- severity/confidence/category -- never the finding's own
// prose. Options are built from what's actually present in this review's
// real findings, so a filter never offers a choice with zero matches.
export function FindingsFilters({ findings, filters, onChange }) {
  const options = useMemo(() => {
    const uniq = (values) => [ALL, ...new Set(values)];
    return {
      severity: uniq(findings.map((f) => f.severity)),
      confidence: uniq(findings.map((f) => f.confidence)),
      category: uniq(findings.map((f) => f.category)),
    };
  }, [findings]);

  return (
    <div className="findings-filters" role="group" aria-label="Filter findings">
      {["severity", "confidence", "category"].map((dimension) => (
        <label key={dimension} className="findings-filter">
          <span className="findings-filter-label">{dimension}</span>
          <select
            value={filters[dimension]}
            onChange={(e) => onChange({ ...filters, [dimension]: e.target.value })}
          >
            {options[dimension].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

// One finding card, in the compact [SEVERITY] [STATUS] [CATEGORY] /
// title / one-sentence explanation / "Why it matters" / "Evidence" /
// "Next" / "Affected files" shape -- shared by both Confirmed Issues and
// Open Questions, since the two differ only in *which* findings they
// show (by confidence tier), never in how one is rendered.
function FindingCard({ finding, selectedFile, onSelectFile, reviewContext }) {
  const isRelated = !!selectedFile && finding.affectedFiles.includes(selectedFile);
  const isDimmed = !!selectedFile && !isRelated;

  return (
    <article
      className={`finding-card${isRelated ? " finding-card-related" : ""}${isDimmed ? " finding-card-dimmed" : ""}`}
    >
      <div className="finding-card-top">
        <span className={`badge badge-severity-${finding.severity.toLowerCase()}`}>{finding.severity}</span>
        <span className="badge badge-status">{finding.status}</span>
        <span className="badge badge-category">{finding.category}</span>
      </div>
      {finding.title && <h4 className="finding-title">{renderInlineMarkdown(finding.title)}</h4>}
      <p className="finding-explanation">{renderInlineMarkdown(finding.explanation)}</p>
      {finding.whyItMatters && (
        <p className="finding-why-it-matters">
          <strong>Why it matters: </strong>
          {renderInlineMarkdown(finding.whyItMatters)}
        </p>
      )}

      {/* Evidence as its own labeled field, separate from the narrative
          explanation above -- the real identifiers/values/paths the
          model itself cited to ground this finding. Never shown as a
          fabricated bullet list when the model cited nothing; simply
          omitted instead. */}
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

      {finding.verificationNeeded.length > 0 && (
        <div className="finding-verification-needed">
          <span className="finding-field-label">To verify</span>
          <ul className="finding-verification-list">
            {finding.verificationNeeded.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {finding.suggestedAction && (
        <p className="finding-next-action">
          <strong>Next: </strong>
          {finding.suggestedAction}
        </p>
      )}

      {finding.affectedFiles.length > 0 && (
        <div className="finding-affected-files">
          <span className="finding-field-label">Affected file(s)</span>
          <div className="finding-evidence-refs">
            {finding.affectedFiles.map((name) => {
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
          </div>
        </div>
      )}
    </article>
  );
}

export default FindingCard;

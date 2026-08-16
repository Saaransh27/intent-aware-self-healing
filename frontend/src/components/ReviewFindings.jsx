import { useMemo, useState } from "react";
import { renderInlineMarkdown, renderMarkdownLite } from "../lib/textFormatting";
import { CONFIRMED, STRONG_EVIDENCE, NEEDS_VERIFICATION } from "../lib/reviewIntelligence";

const CONFIDENCE_ORDER = [CONFIRMED, STRONG_EVIDENCE, NEEDS_VERIFICATION];

const NEXT_ACTION_BY_CONFIDENCE = {
  [CONFIRMED]: "Fix before merging.",
  [STRONG_EVIDENCE]: "Verify this inference before merging.",
  [NEEDS_VERIFICATION]: "Verify before merging.",
};

const ALL = "All";

// Part B4: filters read three structured fields directly off each
// finding -- severity/confidence/category -- never the finding's own
// prose. Options are built from what's actually present in this review's
// real findings, so a filter never offers a choice with zero matches.
function FindingsFilters({ findings, filters, onChange }) {
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

// Milestone 8: every finding is now the backend's own validated structured
// data (severity/confidence/category/evidence/affected-files/
// suggestedAction), grouped by CONFIDENCE (Confirmed -> Strong evidence ->
// Needs verification) so the distinction the product is built around is
// visually obvious, not buried in prose. Purely informational findings
// (e.g. a real but harmless rule-description update) are shown last,
// visually de-emphasized, never mixed in with actionable ones.
function ReviewFindings({ rawText, findings, structuredState, selectedFile, onSelectFile, reviewContext }) {
  const [filters, setFilters] = useState({ severity: ALL, confidence: ALL, category: ALL });

  if (!rawText || !rawText.trim()) return null;

  if (findings.length === 0) {
    // A legitimately empty array (state "ok") means the model itself
    // concluded nothing here deserves special attention -- an honest,
    // valid outcome, not a fallback. Anything else (state "reduced"/
    // "unavailable") means the backend couldn't fully trust what the
    // model produced, so this is shown as a disclosed degradation, with
    // the model's own raw output underneath for anyone who wants to judge
    // it directly, rather than silently hidden.
    if (structuredState === "ok") {
      return (
        <section id="findings" className="review-findings">
          <h2 className="section-heading">Findings</h2>
          <p className="section-hint">Nothing in this change was flagged as requiring special attention.</p>
        </section>
      );
    }
    return (
      <section id="findings" className="review-findings">
        <h2 className="section-heading">Findings</h2>
        <p className="review-verdict-confidence-reduced">
          Analysis confidence reduced — the model's structured findings for this review could not be fully
          validated. Showing its raw response below instead of a parsed findings list.
        </p>
        <div className="section-body">{renderMarkdownLite(rawText)}</div>
      </section>
    );
  }

  const filtered = findings.filter(
    (f) =>
      (filters.severity === ALL || f.severity === filters.severity) &&
      (filters.confidence === ALL || f.confidence === filters.confidence) &&
      (filters.category === ALL || f.category === filters.category)
  );
  const actionable = filtered.filter((f) => !f.isInformational);
  const informational = filtered.filter((f) => f.isInformational);

  const grouped = CONFIDENCE_ORDER.map((confidence) => ({
    confidence,
    items: actionable.filter((f) => f.confidence === confidence),
  })).filter((g) => g.items.length > 0);

  function renderFinding(finding) {
    const isRelated = !!selectedFile && finding.affectedFiles.includes(selectedFile);
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

        {!finding.isInformational && (
          <p className="finding-next-action">
            <strong>Next: </strong>
            {finding.suggestedAction || NEXT_ACTION_BY_CONFIDENCE[finding.confidence]}
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

  return (
    <section id="findings" className="review-findings">
      <h2 className="section-heading">Findings</h2>
      <FindingsFilters findings={findings} filters={filters} onChange={setFilters} />
      {filtered.length === 0 && (
        <p className="section-hint">No findings match the current filters.</p>
      )}
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

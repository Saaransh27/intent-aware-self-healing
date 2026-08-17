import { useMemo, useState } from "react";
import { renderInlineMarkdown, renderMarkdownLite } from "../lib/textFormatting";
import { CONFIRMED } from "../lib/reviewIntelligence";

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

// One finding card, in the compact [SEVERITY] [STATUS] [CATEGORY] /
// title / one-sentence explanation / "Why it matters" / "Evidence" /
// "Next" / "Affected files" shape -- shared by both Confirmed Issues and
// Open Questions below, since the two sections differ only in *which*
// findings they show (by confidence tier), never in how one is rendered.
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

// Milestone 9: Findings is now two strictly separate sections instead of
// one, split by confidence tier -- Confirmed Issues (real, Confirmed-
// tier problems the reviewer should fix) and Open Questions (Strong
// evidence/Needs verification findings that are worth a second look but
// aren't established fact). A finding appears in exactly one of the two,
// never both -- the split key (confidence === CONFIRMED) is the same
// field ReviewVerdict's summary line counts from, so the two can never
// show contradictory numbers.
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
        <section id="confirmed-issues" className="review-findings">
          <h2 className="section-heading">Confirmed Issues</h2>
          <p className="section-hint">Nothing in this change was flagged as requiring special attention.</p>
        </section>
      );
    }
    return (
      <section id="confirmed-issues" className="review-findings">
        <h2 className="section-heading">Confirmed Issues</h2>
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
  const confirmedIssues = actionable.filter((f) => f.confidence === CONFIRMED);
  const openQuestions = actionable.filter((f) => f.confidence !== CONFIRMED);
  const informational = filtered.filter((f) => f.isInformational);

  function card(finding) {
    return (
      <FindingCard
        key={finding.index}
        finding={finding}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        reviewContext={reviewContext}
      />
    );
  }

  return (
    <>
      <section id="confirmed-issues" className="review-findings">
        <h2 className="section-heading">Confirmed Issues</h2>
        <FindingsFilters findings={findings} filters={filters} onChange={setFilters} />
        {confirmedIssues.length === 0 ? (
          <p className="section-hint">No confirmed defects in this change.</p>
        ) : (
          <div className="findings-list">{confirmedIssues.map(card)}</div>
        )}
        {informational.length > 0 && (
          <div className="findings-group findings-group-informational">
            <h3 className="findings-group-label findings-group-label-informational">
              Informational ({informational.length})
            </h3>
            <div className="findings-list">{informational.map(card)}</div>
          </div>
        )}
      </section>

      <section id="open-questions" className="review-findings">
        <h2 className="section-heading">Open Questions</h2>
        <p className="section-hint">Not yet established as fact — worth a second look before merging.</p>
        {openQuestions.length === 0 ? (
          <p className="section-hint">No open questions for this change.</p>
        ) : (
          <div className="findings-list">{openQuestions.map(card)}</div>
        )}
      </section>
    </>
  );
}

export default ReviewFindings;

import { useState } from "react";
import { renderMarkdownLite } from "../lib/textFormatting";
import { CONFIRMED } from "../lib/reviewIntelligence";
import FindingCard, { ALL, FindingsFilters } from "./FindingCard";

// Milestone 9: split out of the former combined ReviewFindings so
// Confirmed Issues and Open Questions can be two independent command-deck
// cards -- real, Confirmed-tier problems the reviewer should fix. A
// finding appears here or in UnconfirmedFindings, never both; the split
// key (confidence === CONFIRMED) is the same field the header's counts
// use, so this section and the header can never show contradictory
// numbers.
function ConfirmedIssues({ rawText, findings, structuredState, selectedFile, onSelectFile, reviewContext }) {
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
          <p className="section-hint">Nothing in this change was flagged as requiring special attention.</p>
        </section>
      );
    }
    return (
      <section id="confirmed-issues" className="review-findings">
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
    <section id="confirmed-issues" className="review-findings">
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
  );
}

export default ConfirmedIssues;

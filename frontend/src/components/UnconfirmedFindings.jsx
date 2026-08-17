import { useState } from "react";
import { CONFIRMED } from "../lib/reviewIntelligence";
import FindingCard, { ALL, FindingsFilters } from "./FindingCard";

// Milestone 9: split out of the former combined ReviewFindings so
// Confirmed Issues and Open Questions can be two independent command-deck
// cards -- Strong evidence/Needs verification findings worth a second
// look, but not yet established as fact. Named UnconfirmedFindings (not
// OpenQuestions) to avoid colliding with the existing, unrelated
// OpenQuestions.jsx, which renders the model's raw prose "open_questions"
// section inside Supporting Details -- a different feature entirely.
function UnconfirmedFindings({ rawText, findings, selectedFile, onSelectFile, reviewContext }) {
  const [filters, setFilters] = useState({ severity: ALL, confidence: ALL, category: ALL });

  if (!rawText || !rawText.trim()) return null;

  const filtered = findings.filter(
    (f) =>
      (filters.severity === ALL || f.severity === filters.severity) &&
      (filters.confidence === ALL || f.confidence === filters.confidence) &&
      (filters.category === ALL || f.category === filters.category)
  );
  const actionable = filtered.filter((f) => !f.isInformational);
  const openQuestions = actionable.filter((f) => f.confidence !== CONFIRMED);

  return (
    <section id="open-questions" className="review-findings">
      <p className="section-hint">Not yet established as fact — worth a second look before merging.</p>
      <FindingsFilters findings={findings} filters={filters} onChange={setFilters} />
      {openQuestions.length === 0 ? (
        <p className="section-hint">No open questions for this change.</p>
      ) : (
        <div className="findings-list">
          {openQuestions.map((finding) => (
            <FindingCard
              key={finding.index}
              finding={finding}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              reviewContext={reviewContext}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default UnconfirmedFindings;

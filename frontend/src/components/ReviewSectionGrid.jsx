import { useState } from "react";
import {
  CONFIRMED,
  CATEGORY_TEST_FAILURE,
  SEVERITY_CRITICAL,
  SEVERITY_HIGH,
  SEVERITY_MEDIUM,
  SEVERITY_LOW,
  attributeFindingsToFiles,
  deriveInferenceSummary,
} from "../lib/reviewIntelligence";
import SectionOverlay from "./SectionOverlay";
import ConfirmedIssues from "./ConfirmedIssues";
import UnconfirmedFindings from "./UnconfirmedFindings";
import IntentVsImplementation from "./IntentVsImplementation";
import TestSignal from "./TestSignal";
import ChangeStory from "./ChangeStory";
import FileOverview from "./FileOverview";

const FILE_RANK = { [SEVERITY_CRITICAL]: 0, [SEVERITY_HIGH]: 1, [SEVERITY_MEDIUM]: 2, [SEVERITY_LOW]: 3 };

// Milestone 9 (command-deck redesign): the 6 fixed-order sections that
// used to render stacked and always-visible now render as one clickable
// card each, in the same order -- clicking opens the section's own
// existing component, completely unchanged, inside a SectionOverlay.
// Every card's own count is read from the exact same real data its
// detail view renders, so a card can never promise something its own
// overlay doesn't show. Fix pass (fixed-viewport deck): cards are now
// title + count only, no preview sentence -- there isn't room for one in
// a 2-column-by-3-row grid sized to share a screen with two other
// columns. Supporting Details stays outside this grid entirely, exactly
// where it already was -- it's deliberately secondary/collapsed by its
// own design, not one of this milestone's primary command-deck cards.
function ReviewSectionGrid({
  sections,
  findings,
  structuredState,
  intentVsImplementation,
  observations,
  reviewContext,
  selectedFile,
  onSelectFile,
  owner,
  repo,
  headSha,
}) {
  const [activeKey, setActiveKey] = useState(null);

  const actionable = findings.filter((f) => !f.isInformational);
  const confirmed = actionable.filter((f) => f.confidence === CONFIRMED);
  const openQuestions = actionable.filter((f) => f.confidence !== CONFIRMED);
  const inference = deriveInferenceSummary(intentVsImplementation, findings);
  const testImpactFindings = findings.filter(
    (f) => f.category === CATEGORY_TEST_FAILURE || f.proofType === "test_failure"
  );
  const changedFilePaths = reviewContext?.commit_summary?.changed_files || [];
  const severityByPath = attributeFindingsToFiles(findings, changedFilePaths);
  const hotspots = [...severityByPath.entries()]
    .filter(([, severity]) => FILE_RANK[severity] !== undefined)
    .sort((a, b) => FILE_RANK[a[1]] - FILE_RANK[b[1]]);
  const topHotspot = hotspots[0] || null;

  const rawFindingsText = sections?.what_deserves_attention_ranked;
  const hasIntentContent = !!intentVsImplementation.claimedIntent || inference.rows.length > 0;

  const cards = [
    {
      key: "confirmed-issues",
      title: "Confirmed Issues",
      show: !!rawFindingsText?.trim(),
      dot: confirmed.length > 0 ? "crit" : "safe",
      count: String(confirmed.length),
      countTone: confirmed.length > 0 ? "crit" : "zero",
      render: () => (
        <ConfirmedIssues
          rawText={rawFindingsText}
          findings={findings}
          structuredState={structuredState}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          reviewContext={reviewContext}
        />
      ),
    },
    {
      key: "open-questions",
      title: "Open Questions",
      show: !!rawFindingsText?.trim(),
      dot: openQuestions.length > 0 ? "warn" : "safe",
      count: String(openQuestions.length),
      countTone: openQuestions.length > 0 ? "" : "zero",
      render: () => (
        <UnconfirmedFindings
          rawText={rawFindingsText}
          findings={findings}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          reviewContext={reviewContext}
        />
      ),
    },
    {
      key: "intent-flow",
      title: "Intent → Implementation → Test",
      show: hasIntentContent,
      dot: intentVsImplementation.consistency === "MISMATCH" ? "crit" : "safe",
      count: intentVsImplementation.consistency,
      countTone: intentVsImplementation.consistency === "MISMATCH" ? "crit" : "zero",
      render: () => <IntentVsImplementation intentVsImplementation={intentVsImplementation} />,
    },
    {
      key: "test-impact",
      title: "Test Impact",
      show: true,
      dot: testImpactFindings.length > 0 ? "warn" : "safe",
      count: `${testImpactFindings.length} test${testImpactFindings.length === 1 ? "" : "s"}`,
      countTone: testImpactFindings.length > 0 ? "" : "zero",
      render: () => (
        <TestSignal observations={observations} findings={findings} intentVsImplementation={intentVsImplementation} />
      ),
    },
    {
      key: "change-story",
      title: "Change Story",
      show: changedFilePaths.length > 0,
      dot: "neutral",
      count: `${changedFilePaths.length} file${changedFilePaths.length === 1 ? "" : "s"}`,
      countTone: "",
      render: () => <ChangeStory reviewContext={reviewContext} observations={observations} findings={findings} />,
    },
    {
      key: "risk-hotspots",
      title: "Risk Hotspots",
      show: !!reviewContext && changedFilePaths.length > 0,
      dot: topHotspot ? "crit" : "safe",
      count: `${hotspots.length} file${hotspots.length === 1 ? "" : "s"}`,
      countTone: hotspots.length > 0 ? "crit" : "zero",
      render: () => (
        <FileOverview
          reviewContext={reviewContext}
          observations={observations}
          findings={findings}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          owner={owner}
          repo={repo}
          headSha={headSha}
        />
      ),
    },
  ].filter((card) => card.show);

  const activeCard = cards.find((c) => c.key === activeKey) || null;

  return (
    <section className="review-section-grid" aria-label="Review sections">
      <div className="section-grid">
        {cards.map((card) => (
          <button
            type="button"
            key={card.key}
            className="section-card"
            onClick={() => setActiveKey(card.key)}
          >
            <span className={`dot dot-${card.dot}`} aria-hidden="true" />
            <h3 className="section-card-title">{card.title}</h3>
            <span className={`count-chip${card.countTone ? ` count-chip-${card.countTone}` : ""}`}>{card.count}</span>
          </button>
        ))}
      </div>

      {activeCard && (
        <SectionOverlay title={activeCard.title} onClose={() => setActiveKey(null)}>
          {activeCard.render()}
        </SectionOverlay>
      )}
    </section>
  );
}

export default ReviewSectionGrid;

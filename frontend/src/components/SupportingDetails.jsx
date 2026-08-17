import { parseTitledListItems } from "../lib/textFormatting";
import { gapsByReason } from "../lib/reviewContext";
import ProseSection from "./ProseSection";
import OpenQuestions from "./OpenQuestions";
import ManualVerification from "./ManualVerification";
import ReviewStrategy from "./ReviewStrategy";

// Secondary information, collapsed by default so the primary view (PR
// header, summary, key attention, files to inspect) isn't a wall of
// equal-weight cards. Each <details> only renders when its own section
// would actually show something — reuses the exact same emptiness
// checks those components already make internally, so there's never an
// empty disclosure triangle with nothing underneath it.
//
// Milestone 9: added "Raw evidence" -- the model's own validated
// structured findings, exactly as the backend parsed them, for anyone
// who wants to check the literal data behind Confirmed Issues/Open
// Questions/Risk Hotspots rather than trusting this page's own
// presentation of it.
function SupportingDetails({ sections, reviewContext, observations, structuredFindings }) {
  const hasChangeNarrative = !!sections?.what_changed_and_why?.trim();
  const hasOpenQuestions = !!parseTitledListItems(sections?.open_questions || "");
  const hasManualVerification =
    gapsByReason(reviewContext).length > 0 ||
    (observations?.extraction_confidence &&
      (observations.extraction_confidence.skipped_binary_file_count > 0 ||
        observations.extraction_confidence.unknown_file_count > 0));
  const hasMinorNotes = !!sections?.minor_notes?.trim();
  const hasFiles = (reviewContext?.commit_summary?.changed_files?.length || 0) > 0;
  const hasRawEvidence = (structuredFindings?.findings?.length || 0) > 0;

  if (!hasChangeNarrative && !hasOpenQuestions && !hasManualVerification && !hasMinorNotes && !hasFiles && !hasRawEvidence) {
    return null;
  }

  return (
    <div className="supporting-details">
      {hasChangeNarrative && (
        <details className="supporting-details-item">
          <summary>What changed and why</summary>
          <ProseSection title="What changed and why" rawText={sections.what_changed_and_why} showTitle={false} />
        </details>
      )}

      {hasOpenQuestions && (
        <details className="supporting-details-item">
          <summary>Open questions</summary>
          <OpenQuestions rawText={sections.open_questions} showTitle={false} />
        </details>
      )}

      {hasManualVerification && (
        <details className="supporting-details-item">
          <summary>Manual verification</summary>
          <ManualVerification reviewContext={reviewContext} observations={observations} />
        </details>
      )}

      {hasFiles && (
        <details className="supporting-details-item">
          <summary>Review strategy</summary>
          <ReviewStrategy reviewContext={reviewContext} observations={observations} />
        </details>
      )}

      {hasMinorNotes && (
        <details className="supporting-details-item">
          <summary>Minor notes</summary>
          <ProseSection title="Minor notes" rawText={sections.minor_notes} showTitle={false} />
        </details>
      )}

      {hasRawEvidence && (
        <details className="supporting-details-item">
          <summary>Raw evidence</summary>
          <pre className="raw-evidence-json">{JSON.stringify(structuredFindings.findings, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export default SupportingDetails;

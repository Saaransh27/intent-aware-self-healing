import { gapsByReason, fileCountWithAnyGap } from "../lib/reviewContext";
import { gapLabel } from "../lib/claimVocabulary";

// Answers "what do I need to verify myself, manually?" — the backend's
// real data-coverage gaps, AGGREGATED. An ordinary commit produces the
// same gap for many files (e.g. every non-Python file gets
// "cannot_assess_contract") — showing that once per file is noise, not
// signal, so this groups by reason: "6 files: <reason>," never 6
// identical lines. extraction_confidence's own real aggregate counts
// (already computed by the backend, not derived here) cover binary/
// unknown files the same way.
function ManualVerification({ reviewContext, observations }) {
  const groups = gapsByReason(reviewContext);
  const extraction = observations?.extraction_confidence;
  const hasExtractionNotes = extraction && (extraction.skipped_binary_file_count > 0 || extraction.unknown_file_count > 0);

  if (groups.length === 0 && !hasExtractionNotes) return null;

  const totalFilesNeedingValidation = fileCountWithAnyGap(reviewContext);

  return (
    <section className="manual-verification">
      <h2 className="section-heading">Manual Verification</h2>
      {totalFilesNeedingValidation > 0 && (
        <p className="verification-summary">
          {totalFilesNeedingValidation} file{totalFilesNeedingValidation === 1 ? "" : "s"} require manual validation.
        </p>
      )}
      <ul className="verification-list">
        {hasExtractionNotes && extraction.skipped_binary_file_count > 0 && (
          <li>{extraction.skipped_binary_file_count} binary asset{extraction.skipped_binary_file_count === 1 ? "" : "s"} skipped (semantic analysis unavailable).</li>
        )}
        {hasExtractionNotes && extraction.unknown_file_count > 0 && (
          <li>{extraction.unknown_file_count} file{extraction.unknown_file_count === 1 ? "" : "s"} of an unrecognized type couldn't be classified.</li>
        )}
        {groups.map(({ reason, count }) => {
          const label = gapLabel(reason);
          return (
            <li key={reason}>
              {count} file{count === 1 ? "" : "s"}: {label.title}
              {label.description && <span className="verification-detail"> — {label.description}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ManualVerification;

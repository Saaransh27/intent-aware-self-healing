// Part 18: never silently show a stale analysis. reviewedHeadSha is the
// real head_sha the review was generated against, compared against the
// PR's real current head_sha (Milestone 7's additive backend field).
//
// Command-deck redesign: the passive "Reviewed <time> · Based on PR state
// at review time" line is gone -- it repeated nothing wrong, but it was
// pure noise on every non-stale review (the common case), competing with
// the header for attention. Only the genuinely actionable case (the PR
// has actually changed since this review ran) still renders anything.
function StaleReviewBanner({ reviewedHeadSha, currentHeadSha, onReviewAgain }) {
  const isStale = !!currentHeadSha && !!reviewedHeadSha && currentHeadSha !== reviewedHeadSha;
  if (!isStale) return null;

  return (
    <div className="stale-review-banner stale-review-banner-stale">
      <span className="stale-review-text">This PR has changed since this review ran.</span>
      <button type="button" className="secondary-button stale-review-action" onClick={onReviewAgain}>
        Review again
      </button>
    </div>
  );
}

export default StaleReviewBanner;

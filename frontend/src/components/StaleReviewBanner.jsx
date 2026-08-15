// Part 18: never silently show a stale analysis. reviewedAt is a real
// client-side timestamp taken the moment this review was actually cached
// (the backend response itself carries no timestamp); reviewedHeadSha is
// the real head_sha the review was generated against, compared against
// the PR's real current head_sha (Milestone 7's additive backend field).
function StaleReviewBanner({ reviewedAt, reviewedHeadSha, currentHeadSha, onReviewAgain }) {
  const isStale = !!currentHeadSha && !!reviewedHeadSha && currentHeadSha !== reviewedHeadSha;
  const reviewedAtLabel = reviewedAt ? new Date(reviewedAt).toLocaleString() : null;

  return (
    <div className={`stale-review-banner${isStale ? " stale-review-banner-stale" : ""}`}>
      <span className="stale-review-text">
        {reviewedAtLabel && <>Reviewed {reviewedAtLabel} · </>}
        Based on PR state at review time{reviewedHeadSha && ` (commit ${reviewedHeadSha.slice(0, 7)})`}.
        {isStale && " This PR has changed since then."}
      </span>
      {isStale && (
        <button type="button" className="secondary-button stale-review-action" onClick={onReviewAgain}>
          Review again
        </button>
      )}
    </div>
  );
}

export default StaleReviewBanner;

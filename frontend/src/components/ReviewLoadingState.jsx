// A deliberate developer-tool loading state, not a frozen page — shown
// while POST /review/pr is running (can take up to ~90s: a real clone,
// evidence extraction, and an LLM call).
function ReviewLoadingState({ prNumber, retryAttempt }) {
  return (
    <div className="review-loading-state">
      <span className="spinner" role="presentation" />
      <p className="review-loading-title">Reviewing PR #{prNumber}</p>
      <p className="review-loading-body">
        {retryAttempt > 0
          ? `The model's first response didn't validate — retrying (attempt ${retryAttempt})…`
          : "Analyzing changed files, history, and repository evidence…"}
      </p>
    </div>
  );
}

export default ReviewLoadingState;

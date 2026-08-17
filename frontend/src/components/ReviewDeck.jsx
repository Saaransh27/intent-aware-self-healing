import StaleReviewBanner from "./StaleReviewBanner";
import VerdictPanel from "./VerdictPanel";
import InferencePanel from "./InferencePanel";
import ReviewSectionGrid from "./ReviewSectionGrid";
import ReviewerAction from "./ReviewerAction";

// Fix pass (fixed-viewport command deck): everything from here down to
// Reviewer Action is meant to fit inside one screen, no page scrolling --
// see .review-deck/.deck-columns in App.css for the height math. Three
// columns share one row: Verdict (left), Inferred Intent/Implementation
// vs. Intent (middle), the 6 section cards (right, 2x3). Reviewer Action
// is its own full-width row underneath with its own internal scrollbar,
// since a long checklist is the one piece here whose length genuinely
// varies with how many real findings this PR has.
function ReviewDeck({
  verdict,
  findings,
  intentVsImplementation,
  sections,
  structuredState,
  observations,
  reviewContext,
  selectedFile,
  onSelectFile,
  owner,
  repo,
  headSha,
  reviewedHeadSha,
  currentHeadSha,
  onReviewAgain,
}) {
  return (
    <div className="review-deck">
      <StaleReviewBanner reviewedHeadSha={reviewedHeadSha} currentHeadSha={currentHeadSha} onReviewAgain={onReviewAgain} />

      <div className="deck-columns">
        <VerdictPanel verdict={verdict} findings={findings} />
        <InferencePanel intentVsImplementation={intentVsImplementation} findings={findings} />
        <ReviewSectionGrid
          sections={sections}
          findings={findings}
          structuredState={structuredState}
          intentVsImplementation={intentVsImplementation}
          observations={observations}
          reviewContext={reviewContext}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          owner={owner}
          repo={repo}
          headSha={headSha}
        />
      </div>

      <ReviewerAction findings={findings} />
    </div>
  );
}

export default ReviewDeck;

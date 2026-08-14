import { useState } from "react";
import { fetchReview } from "../lib/api";
import { buildPlainTextReview } from "../lib/textFormatting";
import SearchPanel from "../components/SearchPanel";
import ExecutiveSummary from "../components/ExecutiveSummary";
import CommitStats from "../components/CommitStats";
import FileOverview from "../components/FileOverview";
import ReviewFindings from "../components/ReviewFindings";
import OpenQuestions from "../components/OpenQuestions";
import ManualVerification from "../components/ManualVerification";
import ReviewStrategy from "../components/ReviewStrategy";
import Footer from "../components/Footer";

function formatGeneratedTimestamp(date) {
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Milestone 4: this is the pre-existing commit-URL review flow, moved
// here verbatim (logic unchanged) so it keeps working exactly as before
// while no longer being the app's primary navigation — see
// docs/MILESTONES.md (Milestone 4) for why. Reachable at /legacy/commit
// only; nothing in the new sidebar links to it.
function CommitReviewPage() {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [reviewData, setReviewData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [generatedAt, setGeneratedAt] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  async function handleSubmit({ repositoryUrl, commitHash }) {
    setStatus("loading");
    setErrorMessage("");
    setReviewData(null);
    setSelectedFile(null);
    setRetryAttempt(0);

    try {
      const body = await fetchReview({
        repositoryUrl,
        commitHash,
        onRetry: (attempt) => setRetryAttempt(attempt),
      });
      setReviewData(body);
      setGeneratedAt(formatGeneratedTimestamp(new Date()));
      setStatus("success");
    } catch (err) {
      setErrorMessage(
        typeof err.status === "number"
          ? err.message
          : "Couldn't reach the review service. Confirm it's running and try again."
      );
      setStatus("error");
    }
  }

  const sections = reviewData?.review?.sections ?? null;
  const hasSections = reviewData?.review?.parsed && sections;
  const reviewContext = reviewData?.review_context ?? null;
  const observations = reviewData?.observations ?? null;

  const plainText = hasSections
    ? buildPlainTextReview({
        repositoryUrl: reviewData.repository_url,
        commitHash: reviewData.commit_hash,
        sections,
      })
    : null;

  return (
    <div className="page-shell">
      <header className="app-bar">
        <div className="app-bar-inner">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">Commit Review</span>
        </div>
      </header>

      <div className="page">
        <main className="main-column">
          <SearchPanel onSubmit={handleSubmit} isLoading={status === "loading"} />

          {status === "loading" && (
            <p className="loading-caption">
              <span className="spinner" role="presentation" />
              {retryAttempt > 0
                ? `The model's first response didn't validate — retrying (attempt ${retryAttempt})…`
                : "Reviewing commit — this can take up to a minute."}
            </p>
          )}

          {status === "error" && (
            <div className="error-box" role="alert">
              <p className="error-title">Unable to complete this review</p>
              <p className="error-message">{errorMessage}</p>
            </div>
          )}

          {status === "success" && hasSections && (
            <>
              <ExecutiveSummary
                repositoryUrl={reviewData.repository_url}
                commitHash={reviewData.commit_hash}
                verdictText={sections.verdict}
                changeText={sections.what_changed_and_why}
                reviewContext={reviewContext}
              />
              <CommitStats reviewContext={reviewContext} observations={observations} />
              <FileOverview
                reviewContext={reviewContext}
                observations={observations}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
              />
              <ReviewFindings
                rawText={sections.what_deserves_attention_ranked}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
                reviewContext={reviewContext}
              />
              <OpenQuestions rawText={sections.open_questions} />
              <ManualVerification reviewContext={reviewContext} observations={observations} />
              <ReviewStrategy reviewContext={reviewContext} observations={observations} />
            </>
          )}

          {status === "success" && reviewData && !hasSections && (
            <section className="raw-response">
              <p className="raw-response-note">
                This response didn't parse into the standard sections. Showing it as received.
              </p>
              <p className="section-body raw-response-text">{reviewData.review?.raw || ""}</p>
            </section>
          )}
        </main>
      </div>

      <Footer generatedAt={generatedAt} plainText={plainText} />
    </div>
  );
}

export default CommitReviewPage;

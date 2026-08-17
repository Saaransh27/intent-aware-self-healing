import { useEffect, useMemo, useState } from "react";
import { fetchPullRequestDetail, loginUrl } from "../lib/authApi";
import { fetchPRReview } from "../lib/api";
import { buildFindings, deriveVerdict, deriveIntentVsImplementation } from "../lib/reviewIntelligence";
import PRHeader from "../components/PRHeader";
import PRNavigation from "../components/PRNavigation";
import ReviewLoadingState from "../components/ReviewLoadingState";
import EmptyState from "../components/EmptyState";
import ReviewConfidenceHeader from "../components/ReviewConfidenceHeader";
import ReviewerAction from "../components/ReviewerAction";
import StaleReviewBanner from "../components/StaleReviewBanner";
import ReviewSectionGrid from "../components/ReviewSectionGrid";

// The review workspace for one PR. Two independent fetches, deliberately
// not chained: PR metadata (fast, real additions/deletions/changed_files
// for PRHeader) and the review itself (slow — a real clone + LLM call).
// The header doesn't wait on the review to render.
//
// Milestone 9 (command-deck redesign): the page is now a single-screen
// command deck instead of ten always-stacked sections. ReviewConfidenceHeader
// (a categorical verdict ring + the real Inferred Intent / Implementation-
// vs-Intent summary) and ReviewerAction (the actionable checklist) stay
// always visible -- everything a reviewer needs to decide "should I be
// worried" in the first few seconds. The remaining six sections (Confirmed
// Issues, Open Questions, Intent -> Implementation -> Test, Test Impact,
// Change Story, Risk Hotspots) are now ReviewSectionGrid's clickable cards:
// each card's own count/preview and its full detail view (unchanged
// components, just relocated into a SectionOverlay on click) both read the
// exact same real data, so a card can never promise something its detail
// doesn't show. The underlying analysis functions in lib/reviewIntelligence.js
// are untouched; only where and how their output renders changed.
// findings/verdict/intentVsImplementation are all derived once per render
// from the real response and threaded to every component that needs them,
// rather than each component re-parsing the raw data itself.
//
// Fix pass (declutter, prompted directly against the deployed page):
// CommitStats and SupportingDetails no longer render here. CommitStats'
// file-count/+/- line duplicated PRHeader's own real GitHub stats
// (computed from a different source -- our own diff extraction vs the
// GitHub API -- but the same on-screen fact); its "Tests changed" line
// is already the Test Impact card's own first line. Its one genuinely
// unique fact, "Review scope: <tier>", has no replacement yet -- flagged,
// not silently relocated. SupportingDetails' six always-present
// accordion items (What changed and why / Open questions / Manual
// verification / Review strategy / Minor notes / Raw evidence) are gone
// from the page entirely; three of those (What changed and why, the raw-
// prose Open questions, Raw evidence) are superseded by the command-deck
// cards showing the same underlying data structured instead of as prose/
// JSON, but Manual Verification's real extraction-confidence/gap facts
// and Review Strategy's real routine-file grouping have no other home on
// this page anymore -- also flagged, not silently dropped. ExecutiveSummary
// was already removed in an earlier pass for the same reason (fully
// duplicated content) and is untouched, still used by the legacy
// commit-review flow -- as is ReviewFindings.jsx (ConfirmedIssues/
// UnconfirmedFindings below are new, PRDetail-specific components, not a
// replacement of it), and CommitStats.jsx/SupportingDetails.jsx
// themselves, neither deleted, both still real components just no longer
// imported here.
function PRDetail({ owner, repo, prNumber, pullRequests, reviewCache }) {
  const [prDetail, setPrDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailErrorStatus, setDetailErrorStatus] = useState(null);

  const [reviewStatus, setReviewStatus] = useState("loading"); // loading | success | error
  const [reviewData, setReviewData] = useState(null);
  const [reviewError, setReviewError] = useState(null);
  const [reviewErrorStatus, setReviewErrorStatus] = useState(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPrDetail(null);
    setDetailError(null);
    setDetailErrorStatus(null);
    fetchPullRequestDetail(owner, repo, prNumber)
      .then((data) => !cancelled && setPrDetail(data))
      .catch((err) => {
        if (cancelled) return;
        setDetailError(err.message);
        setDetailErrorStatus(err.status);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, prNumber]);

  useEffect(() => {
    setSelectedFile(null);
    setRetryAttempt(0);

    const cached = reviewCache.get(prNumber);
    if (cached) {
      setReviewData(cached);
      setReviewStatus("success");
      return;
    }

    let cancelled = false;
    setReviewStatus("loading");
    setReviewData(null);
    setReviewError(null);
    setReviewErrorStatus(null);

    fetchPRReview({
      owner,
      repo,
      prNumber,
      onRetry: (attempt) => !cancelled && setRetryAttempt(attempt),
    })
      .then((body) => {
        if (cancelled) return;
        // Part 18: the backend response itself carries no timestamp --
        // this is the real client-side moment the review was actually
        // received, stamped once, here, not recomputed on every render.
        const stamped = { ...body, _reviewedAt: Date.now() };
        reviewCache.set(prNumber, stamped);
        setReviewData(stamped);
        setReviewStatus("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setReviewError(
          typeof err.status === "number" ? err.message : "Couldn't reach the review service. Confirm it's running and try again."
        );
        setReviewErrorStatus(err.status);
        setReviewStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, prNumber, reviewCache, refreshToken]);

  // Part 18: "Review again" -- discards the cached (now-stale) review and
  // re-runs the effect above by bumping refreshToken; the effect's own
  // cache lookup will naturally miss and fetch fresh, no special-casing.
  function handleReviewAgain() {
    reviewCache.delete(prNumber);
    setRefreshToken((token) => token + 1);
  }

  const sections = reviewData?.review?.sections ?? null;
  const hasSections = reviewData?.review?.parsed && sections;
  const reviewContext = reviewData?.review_context ?? null;
  const observations = reviewData?.observations ?? null;
  const structuredFindings = reviewData?.structured_findings ?? null;

  const findings = useMemo(
    () => (hasSections ? buildFindings(structuredFindings?.findings) : []),
    [hasSections, structuredFindings]
  );
  const verdict = useMemo(
    () => deriveVerdict(findings, structuredFindings?.state ?? "unavailable"),
    [findings, structuredFindings]
  );
  const claimedIntent = prDetail?.title || reviewContext?.commit_summary?.message?.split("\n")[0] || "";
  const intentVsImplementation = useMemo(
    () => deriveIntentVsImplementation(claimedIntent, findings),
    [claimedIntent, findings]
  );

  return (
    <div className="pr-detail-page">
      {detailError ? (
        <EmptyState
          tone="error"
          title="Couldn't load this pull request"
          body={detailError}
          action={detailErrorStatus === 401 ? { label: "Sign in again", href: loginUrl() } : undefined}
        />
      ) : (
        <PRHeader owner={owner} repo={repo} pr={prDetail} />
      )}

      <PRNavigation owner={owner} repo={repo} pullRequests={pullRequests} reviewCache={reviewCache} currentNumber={prNumber} />

      {reviewStatus === "loading" && <ReviewLoadingState prNumber={prNumber} retryAttempt={retryAttempt} />}

      {reviewStatus === "error" && (
        <EmptyState
          tone="error"
          title="Unable to complete this review"
          body={reviewError}
          action={reviewErrorStatus === 401 ? { label: "Sign in again", href: loginUrl() } : undefined}
        />
      )}

      {reviewStatus === "success" && hasSections && (
        <>
          <StaleReviewBanner
            reviewedHeadSha={reviewData.head_sha}
            currentHeadSha={prDetail?.head_sha}
            onReviewAgain={handleReviewAgain}
          />

          {/* Always-visible: verdict + real inferred-intent summary */}
          <ReviewConfidenceHeader verdict={verdict} findings={findings} intentVsImplementation={intentVsImplementation} />

          {/* Always-visible: the actionable checklist */}
          <ReviewerAction findings={findings} />

          {/* Command-deck cards: Confirmed Issues, Open Questions,
              Intent -> Implementation -> Test, Test Impact, Change Story,
              Risk Hotspots -- each opens its own unchanged detail view in
              a SectionOverlay on click. */}
          <ReviewSectionGrid
            sections={sections}
            findings={findings}
            structuredState={structuredFindings?.state ?? "unavailable"}
            intentVsImplementation={intentVsImplementation}
            observations={observations}
            reviewContext={reviewContext}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            owner={owner}
            repo={repo}
            headSha={reviewData.head_sha}
          />
        </>
      )}

      {reviewStatus === "success" && reviewData && !hasSections && (
        <section className="raw-response">
          <p className="raw-response-note">
            This response didn't parse into the standard sections. Showing it as received.
          </p>
          <p className="section-body raw-response-text">{reviewData.review?.raw || ""}</p>
        </section>
      )}
    </div>
  );
}

export default PRDetail;

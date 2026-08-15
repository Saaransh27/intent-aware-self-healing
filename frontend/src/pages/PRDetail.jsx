import { useEffect, useMemo, useState } from "react";
import { fetchPullRequestDetail, loginUrl } from "../lib/authApi";
import { fetchPRReview } from "../lib/api";
import { buildFindings, deriveVerdict, deriveIntentVsImplementation, deriveBlindSpots } from "../lib/reviewIntelligence";
import PRHeader from "../components/PRHeader";
import PRNavigation from "../components/PRNavigation";
import ReviewLoadingState from "../components/ReviewLoadingState";
import EmptyState from "../components/EmptyState";
import ReviewVerdict from "../components/ReviewVerdict";
import StaleReviewBanner from "../components/StaleReviewBanner";
import CommitStats from "../components/CommitStats";
import IntentVsImplementation from "../components/IntentVsImplementation";
import ReviewFindings from "../components/ReviewFindings";
import BlindSpots from "../components/BlindSpots";
import TestSignal from "../components/TestSignal";
import FileOverview from "../components/FileOverview";
import SupportingDetails from "../components/SupportingDetails";

// The review workspace for one PR. Two independent fetches, deliberately
// not chained: PR metadata (fast, real additions/deletions/changed_files
// for PRHeader) and the review itself (slow — a real clone + LLM call).
// The header doesn't wait on the review to render.
//
// Milestone 7 (Review Intelligence): the information architecture below
// follows the order the milestone spec fixed — PR Header, Review Verdict,
// Intent vs Implementation, Findings, Blind Spots, Test Coverage, File
// Overview, Supporting Details — reusing the same visual design system
// throughout. findings/verdict/intentVsImplementation/blindSpots are all
// derived once per render from the real response (see
// lib/reviewIntelligence.js) and threaded to every component that needs
// them, rather than each component re-parsing the raw text itself.
//
// Fix pass (precision re-review): ExecutiveSummary was originally still
// rendered here too, directly under ReviewVerdict -- its own content
// (verdict prose, priority files, change bullets) turned out to be fully
// duplicated by ReviewVerdict (verdict), the now-fixed FileOverview (real
// risk-sorted files), and SupportingDetails' own "What changed and why"
// accordion item -- exactly the redundant-card clutter the spec warned
// against, and not one of the 10 named sections. Removed here only;
// ExecutiveSummary.jsx itself is untouched and still used by the legacy
// commit-review flow. CommitStats stays, positioned before Review
// Verdict -- it is purely objective per-commit metadata (files/lines/
// tests changed), not an assessment, so it reads as an extension of the
// header rather than a competing verdict-like section.
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

  const findings = useMemo(
    () => (hasSections ? buildFindings(sections.what_deserves_attention_ranked, reviewContext) : []),
    [hasSections, sections, reviewContext]
  );
  const verdict = useMemo(() => deriveVerdict(findings), [findings]);
  const claimedIntent = prDetail?.title || reviewContext?.commit_summary?.message?.split("\n")[0] || "";
  const intentVsImplementation = useMemo(
    () => deriveIntentVsImplementation(claimedIntent, findings),
    [claimedIntent, findings]
  );
  const blindSpots = useMemo(() => deriveBlindSpots(findings), [findings]);

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

      <PRNavigation owner={owner} repo={repo} pullRequests={pullRequests} currentNumber={prNumber} />

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
            reviewedAt={reviewData._reviewedAt}
            reviewedHeadSha={reviewData.head_sha}
            currentHeadSha={prDetail?.head_sha}
            onReviewAgain={handleReviewAgain}
          />
          <CommitStats reviewContext={reviewContext} observations={observations} />
          <ReviewVerdict verdict={verdict} findings={findings} />
          <IntentVsImplementation intentVsImplementation={intentVsImplementation} />
          <ReviewFindings
            rawText={sections.what_deserves_attention_ranked}
            findings={findings}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            reviewContext={reviewContext}
          />
          <BlindSpots blindSpots={blindSpots} />
          <TestSignal
            observations={observations}
            findings={findings}
            intentVsImplementation={intentVsImplementation}
          />
          <FileOverview
            reviewContext={reviewContext}
            observations={observations}
            findings={findings}
            changeText={sections.what_changed_and_why}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            owner={owner}
            repo={repo}
            headSha={reviewData.head_sha}
          />
          <SupportingDetails sections={sections} reviewContext={reviewContext} observations={observations} />
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

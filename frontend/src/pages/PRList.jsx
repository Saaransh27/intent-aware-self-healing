import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import { loginUrl } from "../lib/authApi";
import { SAFE_TO_REVIEW, REVIEWER_ATTENTION, HIGH_RISK } from "../lib/reviewIntelligence";
import { riskStatusFor } from "../lib/prStatus";

// Files/lines changed only show for an already-reviewed PR (the real
// numbers come from that review's own review_context/observations);
// GitHub's list endpoint itself still never returns them (unchanged,
// deliberate, since Milestone 4 -- see below).
function RiskBadge({ status }) {
  const className =
    status.level === HIGH_RISK
      ? "badge badge-severity-critical"
      : status.level === REVIEWER_ATTENTION
        ? "badge badge-severity-medium"
        : status.level === SAFE_TO_REVIEW
          ? "badge badge-severity-low"
          : "badge pr-list-not-reviewed-badge";
  return <span className={className}>{status.label}</span>;
}

// Real GitHub PR fields only (src/api/models.py PullRequestSummary) —
// additions/deletions/changed_files are deliberately NOT shown here:
// GitHub's list endpoint never returns them (only the single-PR endpoint
// does), so showing them here would mean either fabricating a number or
// firing one extra GitHub API call per row. Real values appear once a
// PR is opened (see PRHeader), from the endpoint that actually has them,
// or (Milestone 7) once a review has actually been generated for it.
function PRList({ owner, repo, status, pullRequests, errorMessage, errorStatus, reviewCache }) {
  if (status === "loading") {
    return <EmptyState tone="loading" title={`Loading pull requests for ${owner}/${repo}…`} />;
  }
  if (status === "error") {
    return (
      <EmptyState
        tone="error"
        title="Couldn't load pull requests"
        body={errorMessage}
        action={errorStatus === 401 ? { label: "Sign in again", href: loginUrl() } : undefined}
      />
    );
  }
  if (status === "success" && pullRequests.length === 0) {
    return (
      <EmptyState
        tone="empty"
        title="No open pull requests"
        body={`${owner}/${repo} has no open pull requests right now.`}
      />
    );
  }
  if (status !== "success") return null;

  return (
    <div className="pr-list-page">
      <h1 className="pr-list-heading">{owner}/{repo}</h1>
      <p className="pr-list-subheading">
        {pullRequests.length} open pull request{pullRequests.length === 1 ? "" : "s"}
      </p>
      <ul className="pr-list">
        {pullRequests.map((pr) => {
          const cached = reviewCache?.get(pr.number);
          const riskStatus = riskStatusFor(cached);
          const changedFiles = cached?.review_context?.commit_summary?.changed_files?.length;
          const diffStats = cached?.observations?.diff_stats;

          return (
            <li key={pr.number}>
              <Link className="pr-list-row" to={`/r/${owner}/${repo}/pull/${pr.number}`}>
                <span className="pr-list-row-number">#{pr.number}</span>
                <span className="pr-list-row-main">
                  <span className="pr-list-row-title">
                    {pr.title}
                    {pr.draft && <span className="pr-state-badge pr-state-badge-draft">Draft</span>}
                  </span>
                  <span className="pr-list-row-meta">
                    by {pr.author_login} · opened {new Date(pr.created_at).toLocaleDateString()}
                    {pr.updated_at !== pr.created_at && ` · updated ${new Date(pr.updated_at).toLocaleDateString()}`}
                    {changedFiles != null && ` · ${changedFiles} file${changedFiles === 1 ? "" : "s"} changed`}
                    {diffStats && (
                      <>
                        {" · "}
                        <span className="stat-additions">+{diffStats.total_insertions}</span>{" "}
                        <span className="stat-deletions">-{diffStats.total_deletions}</span>
                      </>
                    )}
                  </span>
                </span>
                <RiskBadge status={riskStatus} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PRList;

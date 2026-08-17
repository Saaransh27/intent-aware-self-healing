import { useState } from "react";
import { NavLink } from "react-router-dom";
import { riskStatusFor } from "../lib/prStatus";
import { SAFE_TO_REVIEW, REVIEWER_ATTENTION, HIGH_RISK } from "../lib/reviewIntelligence";

const TABS = ["All", "Reviewed", "Not reviewed"];

function badgeClassFor(level) {
  if (level === HIGH_RISK) return "badge badge-severity-critical";
  if (level === REVIEWER_ATTENTION) return "badge badge-severity-medium";
  if (level === SAFE_TO_REVIEW) return "badge badge-severity-low";
  return "badge pr-list-not-reviewed-badge";
}

// Milestone 9 (Part "Sidebar"): a persistent, compact list of this
// repository's open PRs, alongside the main content -- lets a reviewer
// jump between PRs without going back to the full list. Reuses the exact
// same review cache PRList/PRDetail already own (RepoWorkspace fetches
// once, passes down) -- no second fetch, no fabricated status for a PR
// that hasn't been reviewed yet. "Reviewed"/"Not reviewed" reflect real
// session-cache state; there is no "closed PR" data to filter by (the
// backend only ever fetches open PRs), so no separate "Open" tab is
// offered -- it would be indistinguishable from "All" and would imply a
// distinction that doesn't exist in the real data.
function PRRail({ owner, repo, pullRequests, reviewCache, currentNumber }) {
  const [tab, setTab] = useState("All");

  if (!pullRequests || pullRequests.length === 0) return null;

  const visible = pullRequests.filter((pr) => {
    const isReviewed = !!reviewCache?.get(pr.number)?.review?.parsed;
    if (tab === "Reviewed") return isReviewed;
    if (tab === "Not reviewed") return !isReviewed;
    return true;
  });

  return (
    <nav className="pr-rail" aria-label="Recent pull requests">
      <div className="pr-rail-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`pr-rail-tab${tab === t ? " pr-rail-tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <ul className="pr-rail-list">
        {visible.map((pr) => {
          const status = riskStatusFor(reviewCache?.get(pr.number));
          return (
            <li key={pr.number}>
              <NavLink
                to={`/r/${owner}/${repo}/pull/${pr.number}`}
                className={`pr-rail-item${pr.number === currentNumber ? " pr-rail-item-active" : ""}`}
              >
                <span className="pr-rail-item-number">#{pr.number}</span>
                <span className="pr-rail-item-title">{pr.title}</span>
                <span className={badgeClassFor(status.level)}>{status.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default PRRail;

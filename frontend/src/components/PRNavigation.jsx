import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Link } from "react-router-dom";

// Sequential review without returning to the repository list — walks
// the SAME open-PR list already fetched for the sidebar/list view
// (sorted by number ascending by the caller), never a second fetch.
function PRNavigation({ owner, repo, pullRequests, currentNumber }) {
  const index = pullRequests.findIndex((pr) => pr.number === currentNumber);
  const prevPR = index > 0 ? pullRequests[index - 1] : null;
  const nextPR = index !== -1 && index < pullRequests.length - 1 ? pullRequests[index + 1] : null;

  return (
    <nav className="pr-navigation" aria-label="Pull request navigation">
      {prevPR ? (
        <Link className="pr-nav-link" to={`/r/${owner}/${repo}/pull/${prevPR.number}`}>
          <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" />
          Previous PR
        </Link>
      ) : (
        <span className="pr-nav-link pr-nav-link-disabled" aria-disabled="true">
          <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" />
          Previous PR
        </span>
      )}

      <Link className="pr-nav-link pr-nav-link-list" to={`/r/${owner}/${repo}`}>
        <List size={14} strokeWidth={1.75} aria-hidden="true" />
        All PRs
      </Link>

      {nextPR ? (
        <Link className="pr-nav-link" to={`/r/${owner}/${repo}/pull/${nextPR.number}`}>
          Next PR
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      ) : (
        <span className="pr-nav-link pr-nav-link-disabled" aria-disabled="true">
          Next PR
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}

export default PRNavigation;

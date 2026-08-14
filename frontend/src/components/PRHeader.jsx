import { ExternalLink } from "lucide-react";

// Every metric here has exactly one home — nothing below is repeated in
// ReviewSummary/CommitStats (see App.css comment + docs/MILESTONES.md,
// Milestone 4). additions/deletions/changed_files come from the
// single-PR GitHub endpoint (src/github/client.py's get_pull_request) —
// real fields, absent (not zero) until that fetch resolves.
// Milestone 5: real bug fixed here — this used to have no field to
// distinguish a closed/merged PR from an open one and defaulted to
// "Open" for anything not explicitly draft. Reachable via prev/next
// navigation into a PR that gets merged mid-session, or a stale
// bookmark. `pr.state` is now real GitHub data ("open"/"closed");
// draft is only meaningful while state is "open".
function stateBadge(pr) {
  if (pr.state !== "open") return { label: "Closed", className: "pr-state-badge-closed" };
  if (pr.draft) return { label: "Draft", className: "pr-state-badge-draft" };
  return { label: "Open", className: "" };
}

function PRHeader({ owner, repo, pr }) {
  if (!pr) return null;

  const hasStats = pr.changed_files != null || pr.additions != null;
  const badge = stateBadge(pr);

  return (
    <header className="pr-header">
      <div className="pr-header-top">
        <span className="pr-header-repo">{owner}/{repo}</span>
        <span className="pr-header-number">#{pr.number}</span>
        <span className={`pr-state-badge${badge.className ? " " + badge.className : ""}`}>
          {badge.label}
        </span>
      </div>

      <h1 className="pr-header-title">{pr.title}</h1>

      <div className="pr-header-meta">
        <span className="pr-header-author">by {pr.author_login}</span>
        {hasStats && (
          <>
            {pr.changed_files != null && (
              <span className="pr-header-stat">{pr.changed_files} file{pr.changed_files === 1 ? "" : "s"} changed</span>
            )}
            {pr.additions != null && (
              <span className="pr-header-stat">
                <span className="stat-additions">+{pr.additions}</span>{" "}
                <span className="stat-deletions">-{pr.deletions}</span>
              </span>
            )}
          </>
        )}
        <a className="pr-header-link" href={pr.html_url} target="_blank" rel="noreferrer">
          View on GitHub
          <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

export default PRHeader;

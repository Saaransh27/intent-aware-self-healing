import { Lock, GitBranch } from "lucide-react";
import { NavLink } from "react-router-dom";
import EmptyState from "./EmptyState";

// Real GitHub repositories the session's own token can access (owner,
// collaborator, or org member) — see src/github/client.py's
// list_repositories. `private` is GitHub's own real flag, never inferred.
function RepositoryList({ status, repositories, errorMessage }) {
  if (status === "loading") {
    return <EmptyState tone="loading" title="Loading repositories…" />;
  }
  if (status === "error") {
    return <EmptyState tone="error" title="Couldn't load repositories" body={errorMessage} />;
  }
  if (status === "success" && repositories.length === 0) {
    return (
      <EmptyState
        tone="empty"
        title="No accessible repositories"
        body="This GitHub account has no owned, collaborator, or organization repositories."
      />
    );
  }
  if (status !== "success") return null;

  return (
    <ul className="repo-list">
      {repositories.map((repo) => (
        <li key={repo.full_name}>
          <NavLink
            to={`/r/${repo.owner}/${repo.name}`}
            className={({ isActive }) => `repo-list-item${isActive ? " repo-list-item-active" : ""}`}
          >
            {repo.private ? (
              <Lock size={13} strokeWidth={1.75} className="repo-list-icon" aria-hidden="true" />
            ) : (
              <GitBranch size={13} strokeWidth={1.75} className="repo-list-icon" aria-hidden="true" />
            )}
            <span className="repo-list-name">{repo.full_name}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export default RepositoryList;

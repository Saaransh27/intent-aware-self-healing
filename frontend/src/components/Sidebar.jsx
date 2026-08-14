import { LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import RepositoryList from "./RepositoryList";
import EmptyState from "./EmptyState";

// Persistent across every route — the one place the authenticated
// identity and repository list live, so navigating between PRs never
// re-fetches or re-renders either.
//
// Milestone 7A: the sidebar shows only the user's *selected* subset of
// their accessible repositories (`selectedRepositories`), not every
// repository GET /github/repos returns (`allRepositories`) — selection
// is a pure display filter, never a change to what the API itself
// returns or what the user is authorized to see.
function Sidebar({
  user,
  allRepositories,
  selectedRepositories,
  repositoriesStatus,
  repositoriesError,
  hasEverSelected,
  onManageRepositories,
  onLogout,
}) {
  const hasAccessibleRepos = repositoriesStatus === "success" && allRepositories.length > 0;
  const showManageAction = hasAccessibleRepos;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Link to="/" className="app-bar-inner">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">PR Review</span>
        </Link>
      </div>

      {user && (
        <div className="sidebar-user">
          <img className="sidebar-user-avatar" src={user.avatar_url} alt="" />
          <span className="sidebar-user-login">{user.name || user.login}</span>
          <button type="button" className="sidebar-logout" onClick={onLogout} title="Sign out" aria-label="Sign out">
            <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-label">Repositories</span>
          {showManageAction && (
            <button type="button" className="sidebar-manage-repos" onClick={onManageRepositories}>
              Manage repositories
            </button>
          )}
        </div>

        {hasAccessibleRepos && !hasEverSelected ? (
          <EmptyState
            tone="empty"
            title="Select repositories"
            body="Choose which of your accessible repositories show up here."
            action={{ label: "Select repositories", onClick: onManageRepositories }}
          />
        ) : hasAccessibleRepos && selectedRepositories.length === 0 ? (
          <EmptyState
            tone="empty"
            title="No repositories selected"
            body="Manage repositories to choose which ones appear here."
            action={{ label: "Manage repositories", onClick: onManageRepositories }}
          />
        ) : (
          <RepositoryList
            status={repositoriesStatus}
            repositories={repositoriesStatus === "success" ? selectedRepositories : allRepositories}
            errorMessage={repositoriesError}
          />
        )}
      </div>
    </aside>
  );
}

export default Sidebar;

import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import { fetchCurrentUser, fetchRepositories, logout } from "./lib/authApi";
import { readStoredSelection, writeStoredSelection, reconcileSelection } from "./lib/repoSelection";
import LoginGate from "./components/LoginGate";
import Sidebar from "./components/Sidebar";
import EmptyState from "./components/EmptyState";
import RepositorySelector from "./components/RepositorySelector";
import RepoWorkspace from "./pages/RepoWorkspace";
import CommitReviewPage from "./pages/CommitReviewPage";

// Milestone 4: the PR review workspace is now the primary product —
// GitHub login -> accessible repositories -> open PRs -> review, with a
// persistent sidebar across every route. The old commit-URL flow
// (CommitReviewPage) still works exactly as before but isn't linked
// from anywhere in this shell; it's reachable only at /legacy/commit.
function App() {
  const [authStatus, setAuthStatus] = useState("loading"); // loading | authenticated | unauthenticated
  const [user, setUser] = useState(null);
  const [repoState, setRepoState] = useState({ status: "idle", data: [], error: null });
  // Milestone 7A: which of the user's accessible repositories are shown
  // in the sidebar — a pure display filter, persisted in localStorage
  // only (no backend persistence). `hasSelection` distinguishes
  // "never confirmed a selection" (onboarding) from "confirmed an
  // empty one."
  const [selection, setSelection] = useState(() => readStoredSelection());
  const [selectorOpen, setSelectorOpen] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then((data) => {
        setUser(data);
        setAuthStatus("authenticated");
      })
      .catch(() => setAuthStatus("unauthenticated"));
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    setRepoState({ status: "loading", data: [], error: null });
    fetchRepositories()
      .then((data) => setRepoState({ status: "success", data, error: null }))
      .catch((err) => {
        // Milestone 5: a real, demonstrated gap fixed here — a session
        // that expires or gets revoked mid-browsing used to leave the
        // sidebar stuck showing a text error forever (authStatus never
        // got re-checked after the initial mount), with no way back to
        // LoginGate short of a full page reload. A 401 here means the
        // whole session is dead, not just this one call, so it goes
        // through the exact same path as an explicit logout.
        if (err.status === 401) {
          setUser(null);
          setAuthStatus("unauthenticated");
          setRepoState({ status: "idle", data: [], error: null });
          return;
        }
        setRepoState({ status: "error", data: [], error: err.message });
      });
  }, [authStatus]);

  // Requirement 8: once real repository data arrives, drop any
  // previously-selected repository that's no longer accessible.
  // Never adds a repository — a newly-accessible one is not
  // auto-selected.
  useEffect(() => {
    if (repoState.status !== "success") return;
    const reconciled = reconcileSelection(selection.fullNames, repoState.data);
    if (reconciled.length !== selection.fullNames.length) {
      writeStoredSelection(reconciled);
      setSelection((prev) => ({ ...prev, fullNames: reconciled }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoState.status, repoState.data]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
      setAuthStatus("unauthenticated");
      setRepoState({ status: "idle", data: [], error: null });
    }
  }

  function handleConfirmSelection(fullNames) {
    writeStoredSelection(fullNames);
    setSelection({ hasSelection: true, fullNames });
    setSelectorOpen(false);
  }

  const selectedFullNames = new Set(selection.fullNames);
  const selectedRepositories = repoState.data.filter((repo) => selectedFullNames.has(repo.full_name));

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/legacy/commit" element={<CommitReviewPage />} />
        <Route
          path="/*"
          element={
            authStatus === "loading" ? (
              <div className="page-shell">
                <EmptyState tone="loading" title="Checking your session…" />
              </div>
            ) : authStatus === "unauthenticated" ? (
              <LoginGate />
            ) : (
              <div className="app-shell-layout">
                <Sidebar
                  user={user}
                  allRepositories={repoState.data}
                  selectedRepositories={selectedRepositories}
                  repositoriesStatus={repoState.status}
                  repositoriesError={repoState.error}
                  hasEverSelected={selection.hasSelection}
                  onManageRepositories={() => setSelectorOpen(true)}
                  onLogout={handleLogout}
                />
                <main className="app-shell-main">
                  <Routes>
                    <Route
                      path="/"
                      element={
                        <EmptyState
                          tone="empty"
                          title="Select a repository"
                          body="Choose a repository from the sidebar to see its open pull requests."
                        />
                      }
                    />
                    <Route path="/r/:owner/:repo" element={<RepoWorkspace />} />
                    <Route path="/r/:owner/:repo/pull/:number" element={<RepoWorkspace />} />
                  </Routes>
                </main>
                {selectorOpen && (
                  <RepositorySelector
                    repositories={repoState.data}
                    initialSelected={selection.fullNames}
                    onConfirm={handleConfirmSelection}
                    onClose={() => setSelectorOpen(false)}
                  />
                )}
              </div>
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

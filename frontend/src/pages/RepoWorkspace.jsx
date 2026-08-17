import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchOpenPullRequests } from "../lib/authApi";
import PRList from "./PRList";
import PRDetail from "./PRDetail";
import PRRail from "../components/PRRail";

// Owns the open-PR list fetch for one repository (once per owner/repo,
// not once per PR) and a session-only review cache (a plain Map, reset
// whenever this component remounts — no persistence, per Milestone 4's
// "no database/Redis" boundary) so navigating PR #5 -> #6 -> back to #5
// doesn't re-run a ~90s review it already has.
//
// Milestone 9: PRRail renders alongside PRList/PRDetail, reusing this
// same fetch and cache — no second network call, no separate data
// ownership. Only shown once the PR list actually loaded and there's
// more than one PR to switch between.
function RepoWorkspace() {
  const { owner, repo, number } = useParams();
  const [prState, setPrState] = useState({ status: "loading", data: [], error: null });
  const reviewCacheRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    reviewCacheRef.current = new Map();
    setPrState({ status: "loading", data: [], error: null });

    fetchOpenPullRequests(owner, repo)
      .then((data) => {
        if (cancelled) return;
        const sorted = [...data].sort((a, b) => a.number - b.number);
        setPrState({ status: "success", data: sorted, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // errorStatus (Milestone 5) lets PRList show a real "Sign in
        // again" action on a 401 instead of just a stuck text error.
        setPrState({ status: "error", data: [], error: err.message, errorStatus: err.status });
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  const showRail = prState.status === "success" && prState.data.length > 1;

  return (
    <div className={showRail ? "repo-workspace repo-workspace-with-rail" : "repo-workspace"}>
      {showRail && (
        <PRRail
          owner={owner}
          repo={repo}
          pullRequests={prState.data}
          reviewCache={reviewCacheRef.current}
          currentNumber={number ? Number(number) : null}
        />
      )}
      <div className="repo-workspace-main">
        {number ? (
          <PRDetail
            owner={owner}
            repo={repo}
            prNumber={Number(number)}
            pullRequests={prState.data}
            reviewCache={reviewCacheRef.current}
          />
        ) : (
          <PRList
            owner={owner}
            repo={repo}
            status={prState.status}
            pullRequests={prState.data}
            errorMessage={prState.error}
            errorStatus={prState.errorStatus}
            reviewCache={reviewCacheRef.current}
          />
        )}
      </div>
    </div>
  );
}

export default RepoWorkspace;

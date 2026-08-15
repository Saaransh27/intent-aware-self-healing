import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchOpenPullRequests } from "../lib/authApi";
import PRList from "./PRList";
import PRDetail from "./PRDetail";

// Owns the open-PR list fetch for one repository (once per owner/repo,
// not once per PR) and a session-only review cache (a plain Map, reset
// whenever this component remounts — no persistence, per Milestone 4's
// "no database/Redis" boundary) so navigating PR #5 -> #6 -> back to #5
// doesn't re-run a ~90s review it already has.
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

  if (number) {
    return (
      <PRDetail
        owner={owner}
        repo={repo}
        prNumber={Number(number)}
        pullRequests={prState.data}
        reviewCache={reviewCacheRef.current}
      />
    );
  }

  return (
    <PRList
      owner={owner}
      repo={repo}
      status={prState.status}
      pullRequests={prState.data}
      errorMessage={prState.error}
      errorStatus={prState.errorStatus}
      reviewCache={reviewCacheRef.current}
    />
  );
}

export default RepoWorkspace;

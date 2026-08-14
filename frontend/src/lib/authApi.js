// GitHub identity, repository, and PR discovery — all of it real GitHub
// data via the backend's session-authenticated /github/* routes (see
// src/api/app.py). Every call sends credentials: "include" so the
// session cookie rides along; the backend never returns the GitHub
// access token itself in any response body.
import { API_BASE_URL } from "./api";

function messageForGithubStatus(status) {
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 404:
      return "This repository or pull request couldn't be found, or you don't have access to it.";
    case 502:
      return "Couldn't reach GitHub. Please try again.";
    default:
      return "Something went wrong talking to GitHub. Please try again.";
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
  });

  if (!response.ok) {
    const error = new Error(messageForGithubStatus(response.status));
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

// Not a fetch — a real browser navigation. /github/login is a redirect
// endpoint (it sets a CSRF cookie and 307s to GitHub's own authorize
// page); the OAuth dance can't happen inside an XHR/fetch call.
export function loginUrl() {
  return `${API_BASE_URL}/github/login`;
}

// Real GitHub identity, from the session's own token. Throws (status
// 401) when there's no valid session — callers use this to decide
// whether to show the logged-out state.
export function fetchCurrentUser() {
  return request("/github/me");
}

// Repositories the authenticated user can actually access (owner,
// collaborator, or org member) — real GitHub permissions, not a
// separate authorization layer of this app's own. Capped at 100 by the
// backend (see src/github/client.py) — not paginated further here.
export function fetchRepositories() {
  return request("/github/repos");
}

export function fetchOpenPullRequests(owner, repo) {
  return request(`/github/repos/${owner}/${repo}/pulls`);
}

// The single-PR endpoint — unlike the list endpoint, GitHub really does
// include additions/deletions/changed_files here (see PullRequestDetail
// in src/api/models.py), so this is the source for the PR header's
// change-size facts, not the list response.
export function fetchPullRequestDetail(owner, repo, number) {
  return request(`/github/repos/${owner}/${repo}/pulls/${number}`);
}

export function logout() {
  return request("/github/logout", { method: "POST" });
}

// Talks to the real POST /review endpoint. No mock data, no hardcoded
// review content — every field the dashboard renders comes from this
// response. VITE_API_BASE_URL is the only per-deployment config value
// (see .env.example); it defaults to the currently deployed backend so
// local dev works without extra setup, mirroring how playground/config.js
// worked for the static site.
const DEFAULT_API_BASE_URL = "https://intent-aware-self-healing.onrender.com";
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;

// Maps the backend's real HTTP status codes to calm, specific messages.
// Never surfaces the raw `detail` string from the API.
export function messageForStatus(status) {
  switch (status) {
    case 404:
      return "This repository or commit couldn't be found. Check the URL and try again.";
    case 500:
      return "Something went wrong while preparing this review. Please try again.";
    case 502:
      return "The model couldn't produce a usable review for this commit. Try again, or try a different commit.";
    case 504:
      return "This is taking longer than expected and the request timed out.";
    default:
      return "Something went wrong while completing this review. Please try again.";
  }
}

// 502 means the model's raw output failed the backend's deterministic
// response-contract check (src/api/app.py's _has_contract_violation) — it
// leaked an internal claim-id string or misused a reserved confidence-tier
// word as a self-tag. The LLM call has no fixed seed, so the exact same
// request can produce a compliant response on a later attempt — this is
// empirically transient, not a permanent failure for that commit. Other
// statuses (404 not found, 500 unexpected, 504 timeout) won't be fixed by
// blindly retrying, so only 502 gets retried.
const MAX_ATTEMPTS = 3;

async function requestReview({ repositoryUrl, commitHash }) {
  const response = await fetch(`${API_BASE_URL}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repository_url: repositoryUrl,
      commit_hash: commitHash || null,
    }),
  });

  if (!response.ok) {
    const error = new Error(messageForStatus(response.status));
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// Throws on a non-2xx response with `.status` set, so callers can
// distinguish a real (mapped) API error from a network-level failure
// (fetch() itself throwing, e.g. offline or CORS) and fall back to a
// generic "couldn't reach the service" message for the latter.
//
// `onRetry(attempt)` is called (attempt = 2, 3, ...) right before each
// retry fires, so a caller can reflect "retrying" in its loading state —
// purely optional, the retry happens regardless of whether it's provided.
export async function fetchReview({ repositoryUrl, commitHash, onRetry }) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await requestReview({ repositoryUrl, commitHash });
    } catch (err) {
      const isRetryableContractViolation = err.status === 502 && attempt < MAX_ATTEMPTS;
      if (!isRetryableContractViolation) throw err;
      if (onRetry) onRetry(attempt + 1);
    }
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error("fetchReview: exhausted retries without a definitive result.");
}

// --- PR review (Milestone 4) --------------------------------------------
//
// POST /review/pr, the same retry-on-502 behavior as fetchReview above
// (same underlying cause: the LLM call has no fixed seed) but its own
// independent request/message functions rather than a shared helper —
// requestReview/fetchReview above are the old commit flow's and are left
// untouched. credentials: "include" so a private repo's PR can be
// reviewed when the caller has a session; a public repo works exactly
// the same with or without one (see src/api/app.py's
// get_pr_pipeline_runner).

function messageForPRReviewStatus(status) {
  switch (status) {
    case 404:
      return "This pull request couldn't be found, or you don't have access to it.";
    case 500:
      return "Something went wrong while preparing this review. Please try again.";
    case 502:
      return "The model couldn't produce a usable review for this PR. Try again, or try a different PR.";
    case 504:
      return "This is taking longer than expected and the request timed out.";
    default:
      return "Something went wrong while completing this review. Please try again.";
  }
}

async function requestPRReview({ owner, repo, prNumber }) {
  const response = await fetch(`${API_BASE_URL}/review/pr`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repository_url: `https://github.com/${owner}/${repo}`,
      pr_number: prNumber,
    }),
  });

  if (!response.ok) {
    const error = new Error(messageForPRReviewStatus(response.status));
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchPRReview({ owner, repo, prNumber, onRetry }) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await requestPRReview({ owner, repo, prNumber });
    } catch (err) {
      const isRetryableContractViolation = err.status === 502 && attempt < MAX_ATTEMPTS;
      if (!isRetryableContractViolation) throw err;
      if (onRetry) onRetry(attempt + 1);
    }
  }
  throw new Error("fetchPRReview: exhausted retries without a definitive result.");
}

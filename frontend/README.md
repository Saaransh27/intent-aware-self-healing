# PR Review — Frontend

React 19 + Vite app. As of Milestone 31, its primary flow is GitHub
login → accessible repositories → open PRs → a PR review workspace with
previous/next navigation — not the "repository URL + commit hash" flow
that came before it. `playground/` (the live Vercel product) is
untouched and unaffected by anything in this directory.

**Not deployed.** This app currently only runs locally, against a
locally running backend.

## Run it

1. Start the API: `uvicorn src.api.app:app --reload` (from the project
   root) — or point `.env.local` at a different running backend. GitHub
   OAuth needs `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/
   `GITHUB_OAUTH_REDIRECT_URI`/`FRONTEND_URL` set on the backend (see
   `.env.example`) — without a real registered GitHub OAuth App, login
   will fail with a real, honest error, not silently.
2. `npm install`
3. `npm run dev`
4. Sign in with GitHub, pick a repository, pick an open PR.

`.env.local` (gitignored) sets `VITE_API_BASE_URL` — currently
`http://localhost:8020`.

## Tests

`npm run test` (or `npx vitest`) — `vitest` + `@testing-library/react`,
added in Milestone 31 (this project's first frontend test
infrastructure). The network layer (`lib/api.js`, `lib/authApi.js`) is
mocked in every test; nothing hits a real backend or GitHub.

## Layout

- `src/App.jsx` — the router root: checks `GET /github/me` once on
  load, then renders either `LoginGate` or the authenticated shell
  (`Sidebar` + routed main content).
- `src/pages/RepoWorkspace.jsx` — owns the open-PR list fetch for one
  repository and a session-only (in-memory, no persistence) review
  cache; renders `PRList` or `PRDetail` depending on the URL.
- `src/pages/PRList.jsx`, `src/pages/PRDetail.jsx` — the PR list and the
  single-PR review workspace.
- `src/pages/CommitReviewPage.jsx` — the original commit-URL flow,
  unchanged, reachable only at `/legacy/commit`.
- `src/components/` — `Sidebar`, `RepositoryList`, `LoginGate`,
  `PRHeader`, `PRNavigation`, `ReviewLoadingState`, `EmptyState`,
  `ProseSection`, `SupportingDetails` (collapsed-by-default secondary
  info), plus the reused-unmodified `FileOverview`, `ReviewFindings`,
  `OpenQuestions`, `ManualVerification`, `ReviewStrategy`,
  `ExecutiveSummary`, `CommitStats`, `SearchPanel`, `Footer`.
- `src/lib/authApi.js` — session-cookie-authenticated GitHub discovery
  calls (`fetchCurrentUser`, `fetchRepositories`,
  `fetchOpenPullRequests`, `fetchPullRequestDetail`, `logout`,
  `loginUrl`). Every call sends `credentials: "include"`; the GitHub
  access token itself never appears in any response the browser
  receives (see `src/api/session_store.py`).
- `src/lib/api.js` — `fetchReview` (old flow) and `fetchPRReview` (new),
  both with retry-on-502 handling, kept as independent functions rather
  than a shared helper.
- `src/lib/reviewContext.js`, `claimVocabulary.js`, `reviewTiers.js`,
  `textFormatting.jsx` — pure derivation helpers over the real
  `review_context`/`observations` API shapes (`src/api/models.py`),
  reused unmodified from Milestone 27; generic over commit vs. PR
  already, since neither is baked into their logic.

## Guiding constraint

Every visible label must be traceable to a concrete backend fact. No
synthetic risk scores, confidence percentages, severity values, or time
estimates. One real, named exception to completeness rather than
fabrication: GitHub's PR list endpoint never returns
additions/deletions/changed-files, so `PRList` rows don't show them —
real values appear once a specific PR is opened, from the endpoint that
actually has them (`PRHeader`).

## Scope

No GitHub write actions, comments, webhooks, notifications, database,
Redis, billing, teams/roles, analytics, or CI/CD — all explicitly out of
scope for this milestone. See `docs/PR_REVIEW_MIGRATION.md` for the full
migration history and what's still ahead.

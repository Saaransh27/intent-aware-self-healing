import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PRDetail from "./PRDetail";
import * as authApi from "../lib/authApi";
import * as api from "../lib/api";

vi.mock("../lib/authApi");
vi.mock("../lib/api");

beforeEach(() => {
  vi.clearAllMocks();
});

const PR_DETAIL = {
  number: 42, title: "Fix the thing", author_login: "octocat",
  html_url: "https://github.com/octocat/hello-world/pull/42", state: "open", draft: false,
  additions: 10, deletions: 2, changed_files: 1, body: "Because reasons.",
};

const PARSEABLE_RESPONSE = {
  repository_url: "https://github.com/octocat/hello-world",
  commit_hash: "head0000",
  pr_number: 42,
  base_sha: "base0000",
  head_sha: "head0000",
  outcome: "evaluated",
  adapter_state: "success",
  review: {
    raw: "raw text",
    parsed: true,
    sections: {
      verdict: "This looks safe to merge.",
      what_changed_and_why: "",
      what_deserves_attention_ranked: "",
      open_questions: "",
      minor_notes: "",
    },
  },
  findings: [],
  validation: null,
  review_context: {
    commit_summary: { message: "Fix the thing", changed_files: ["src/app.py"], added_files: [], deleted_files: [], modified_files: ["src/app.py"], renamed_files: [] },
    commit_claims: [],
    file_claims: {},
    gaps: { commit: [], files: {} },
    coverage_ledger: [],
  },
  observations: {
    touched_directories: { source: ["src/"], tests: [], documentation: [], examples: [], scripts: [] },
    file_classification: { "src/app.py": "Source" },
    change_statistics: { files_added: 0, files_deleted: 0, files_modified: 1, files_renamed: 0 },
    change_categories: { touches_tests: false, touches_documentation: false, touches_dependencies: false, touches_build_files: false, touches_ci: false, touches_config: false },
    extraction_confidence: { unknown_file_count: 0, unsupported_extensions: [], skipped_binary_file_count: 0 },
    diff_stats: { total_insertions: 10, total_deletions: 2, files: { "src/app.py": { insertions: 10, deletions: 2 } } },
  },
};

function renderDetail(prNumber = 42, reviewCache = new Map()) {
  return render(
    <MemoryRouter>
      <PRDetail owner="octocat" repo="hello-world" prNumber={prNumber} pullRequests={[{ number: 42 }]} reviewCache={reviewCache} />
    </MemoryRouter>
  );
}

describe("PRDetail", () => {
  it("shows the real PR header as soon as the fast detail fetch resolves, without waiting on the review", async () => {
    authApi.fetchPullRequestDetail.mockResolvedValue(PR_DETAIL);
    api.fetchPRReview.mockReturnValue(new Promise(() => {})); // review never resolves in this test

    renderDetail();

    await waitFor(() => expect(screen.getByText("Fix the thing")).toBeInTheDocument());
    expect(screen.getByText("Reviewing PR #42")).toBeInTheDocument();
  });

  it("shows the real review sections once the review resolves", async () => {
    authApi.fetchPullRequestDetail.mockResolvedValue(PR_DETAIL);
    api.fetchPRReview.mockResolvedValue(PARSEABLE_RESPONSE);

    renderDetail();

    await waitFor(() => expect(screen.getByText("This looks safe to merge.")).toBeInTheDocument());
  });

  it("shows a real error message when the review fails, not a crash", async () => {
    authApi.fetchPullRequestDetail.mockResolvedValue(PR_DETAIL);
    api.fetchPRReview.mockRejectedValue(Object.assign(new Error("This pull request couldn't be found."), { status: 404 }));

    renderDetail();

    await waitFor(() => expect(screen.getByText("This pull request couldn't be found.")).toBeInTheDocument());
  });

  it("shows a real sign-in-again action when the review fails with a 401", async () => {
    authApi.fetchPullRequestDetail.mockResolvedValue(PR_DETAIL);
    api.fetchPRReview.mockRejectedValue(Object.assign(new Error("Your session has expired."), { status: 401 }));

    renderDetail();

    await waitFor(() => expect(screen.getByText("Sign in again")).toBeInTheDocument());
  });

  it("shows a real sign-in-again action when the PR detail fetch fails with a 401", async () => {
    authApi.fetchPullRequestDetail.mockRejectedValue(Object.assign(new Error("Your session has expired."), { status: 401 }));
    api.fetchPRReview.mockReturnValue(new Promise(() => {}));

    renderDetail();

    await waitFor(() => expect(screen.getByText("Sign in again")).toBeInTheDocument());
  });

  it("uses an already-cached review instead of calling fetchPRReview again", async () => {
    authApi.fetchPullRequestDetail.mockResolvedValue(PR_DETAIL);
    const cache = new Map([[42, PARSEABLE_RESPONSE]]);

    renderDetail(42, cache);

    await waitFor(() => expect(screen.getByText("This looks safe to merge.")).toBeInTheDocument());
    expect(api.fetchPRReview).not.toHaveBeenCalled();
  });

  it("populates the cache after a real, successful review fetch", async () => {
    authApi.fetchPullRequestDetail.mockResolvedValue(PR_DETAIL);
    api.fetchPRReview.mockResolvedValue(PARSEABLE_RESPONSE);
    const cache = new Map();

    renderDetail(42, cache);

    await waitFor(() => expect(cache.get(42)).toEqual(PARSEABLE_RESPONSE));
  });
});

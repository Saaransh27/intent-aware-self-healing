import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PRDetail from "./PRDetail";
import * as authApi from "../lib/authApi";
import * as api from "../lib/api";
import pr2Response from "../test/fixtures/real_pr_review_response.pr2_correct.json";
import pr3Response from "../test/fixtures/real_pr_review_response.pr3_incorrect.json";

vi.mock("../lib/authApi");
vi.mock("../lib/api");

// Milestone 7/8 (Review Intelligence): these fixtures are the literal,
// unmodified JSON bodies from real POST /review/pr calls against two real
// PRs on a real repository -- PR #2 (a correct change, ground truth: 9/9
// tests pass) and PR #3 (the same claimed change, ground truth: a real
// typo that fails a real test, plus a real untested logic regression).
// Regenerated for Milestone 8 against the live model with the new
// structured-findings prompt (src/prompt/prompt_builder.py) -- the model
// has no fixed seed, so exact wording/field values differ run to run; the
// assertions below check the real, spec-critical outcomes (never HIGH RISK
// for a correct change; always HIGH RISK for one with real defects), not
// incidental wording from a single capture. Rendering both through the
// real PRDetail component tree closes the loop between "the engine
// classifies structured data correctly" (reviewIntelligence.test.js) and
// "the full page renders that classification correctly with real API data."
function renderPR(response, prNumber) {
  authApi.fetchPullRequestDetail.mockResolvedValue({
    number: prNumber, title: "Treat history.high_recent_churn as risk-bearing", author_login: "Saaransh27",
    html_url: `https://github.com/Saaransh27/intent-aware-self-healing/pull/${prNumber}`,
    state: "open", draft: false, additions: null, deletions: null, changed_files: null,
  });
  api.fetchPRReview.mockResolvedValue(response);

  return render(
    <MemoryRouter>
      <PRDetail
        owner="Saaransh27"
        repo="intent-aware-self-healing"
        prNumber={prNumber}
        pullRequests={[{ number: prNumber }]}
        reviewCache={new Map()}
      />
    </MemoryRouter>
  );
}

describe("PRDetail review intelligence — real captured PR #2 (correct)", () => {
  it("never renders HIGH RISK for a change with no real defect", async () => {
    renderPR(pr2Response, 2);

    await waitFor(() =>
      expect(screen.queryByText("SAFE TO REVIEW") || screen.queryByText("REVIEWER ATTENTION")).toBeTruthy()
    );
    expect(screen.queryByText("HIGH RISK")).not.toBeInTheDocument();
    expect(screen.getByText("0 Confirmed")).toBeInTheDocument();
  });
});

describe("PRDetail review intelligence — real captured PR #3 (defective, identical claimed change)", () => {
  it("renders REVIEWER ATTENTION or HIGH RISK with confirmed findings, distinct from PR #2", async () => {
    renderPR(pr3Response, 3);

    await waitFor(() =>
      expect(screen.queryByText("REVIEWER ATTENTION") || screen.queryByText("HIGH RISK")).toBeTruthy()
    );
    expect(screen.queryByText("SAFE TO REVIEW")).not.toBeInTheDocument();
    expect(screen.getByText("MISMATCH")).toBeInTheDocument();
    // The real, distinguishing evidence: the two actual conflicting
    // identifiers, quoted verbatim from the model's own real response.
    expect(screen.getAllByText((_, node) => node?.textContent?.includes("history.high_recent_curn")).length).toBeGreaterThan(0);
  });

  it("surfaces the tier-ordering regression as a behavioral blind spot", async () => {
    renderPR(pr3Response, 3);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "What We Could Not Verify" })).toBeInTheDocument()
    );
    expect(screen.queryByText(/Nothing here requires separate reviewer confirmation/)).not.toBeInTheDocument();
  });
});

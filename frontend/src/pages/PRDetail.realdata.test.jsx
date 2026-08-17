import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PRDetail from "./PRDetail";
import * as authApi from "../lib/authApi";
import * as api from "../lib/api";
import realResponse from "../test/fixtures/real_pr_review_response.click_2202.json";

vi.mock("../lib/authApi");
vi.mock("../lib/api");

// Milestone 6: this fixture is not hand-written — it's the literal,
// unmodified JSON body from a real POST /review/pr call against the
// locally running backend (real clone, real evidence extraction, real
// Shakti LLM output) for pallets/click#2202, captured during this
// milestone's real end-to-end validation. Rendering it here closes the
// loop between "the backend produces this shape" and "the frontend
// renders it correctly" with real data, not an assumption that a
// hand-typed fixture matches production.
describe("PRDetail against a real, captured POST /review/pr response", () => {
  it("renders the real verdict, findings, and files without crashing", async () => {
    authApi.fetchPullRequestDetail.mockResolvedValue({
      number: 2202, title: "refactor command decorator", author_login: "davidism",
      html_url: "https://github.com/pallets/click/pull/2202", state: "closed", draft: false,
      additions: null, deletions: null, changed_files: null,
    });
    api.fetchPRReview.mockResolvedValue(realResponse);

    render(
      <MemoryRouter>
        <PRDetail owner="pallets" repo="click" prNumber={2202} pullRequests={[{ number: 2202 }]} reviewCache={new Map()} />
      </MemoryRouter>
    );

    // Milestone 7 (fix pass): the model's literal verdict sentence is no
    // longer rendered verbatim (ExecutiveSummary was removed from
    // PRDetail, superseded by ReviewVerdict/FileOverview/SupportingDetails
    // -- see PRDetail.jsx's own comment). A real derived verdict badge
    // (one of exactly three) is the correct thing to wait on instead.
    await waitFor(() =>
      expect(
        screen.queryByText("SAFE TO REVIEW") ||
          screen.queryByText("REVIEWER ATTENTION") ||
          screen.queryByText("HIGH RISK")
      ).toBeTruthy()
    );

    // Real files from the real review_context actually render -- Change
    // Story is now a command-deck card, so open it to reach the full
    // per-file list underneath.
    await userEvent.click(screen.getByRole("button", { name: /Change Story/ }));
    for (const path of realResponse.review_context.commit_summary.changed_files) {
      expect(screen.getAllByText(new RegExp(path.split("/").pop())).length).toBeGreaterThan(0);
    }

    // No fabricated risk/confidence language anywhere in the rendered DOM.
    expect(document.body.textContent).not.toMatch(/\d+% confiden/i);
    expect(document.body.textContent).not.toMatch(/risk score/i);
  });
});

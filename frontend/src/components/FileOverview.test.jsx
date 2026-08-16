import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FileOverview from "./FileOverview";
import { buildFindings } from "../lib/reviewIntelligence";
import pr3Response from "../test/fixtures/real_pr_review_response.pr3_incorrect.json";

// Milestone 7 (Part 13 fix, real data): before this fix, File Overview's
// Risk column only reflected real deterministic risk-bearing claims,
// which are empty for this real PR (no Python files) -- every row would
// have shown "Standard Review"/"Routine" regardless of the real HIGH RISK
// verdict. This proves the fix end to end against the real captured data.
describe("FileOverview — real PR #3 data (Part 13 fix)", () => {
  it("shows reviewTiers.js with an elevated real risk level, not silently Low", () => {
    const findings = buildFindings(pr3Response.structured_findings.findings);

    render(
      <FileOverview
        reviewContext={pr3Response.review_context}
        observations={pr3Response.observations}
        findings={findings}
        selectedFile={null}
        onSelectFile={vi.fn()}
      />
    );

    const row = screen.getByText("reviewTiers.js").closest(".file-table-row");
    expect(row.textContent).not.toMatch(/\bLow\b/);
    expect(row.textContent).toMatch(/High|Critical/);
  });
});

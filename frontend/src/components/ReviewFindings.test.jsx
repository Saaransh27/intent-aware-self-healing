import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReviewFindings from "./ReviewFindings";
import { buildFindings } from "../lib/reviewIntelligence";

const RAW_TEXT = `1. **Misspelled claim identifier** – the set contains \`"history.high_recent_curn"\` while the test refers to \`"history.high_recent_churn"\` (**Confirmed**). This mismatch will cause the new test to fail.`;

describe("ReviewFindings", () => {
  it("renders Evidence as its own labeled field, separate from the explanation (Part 4/5)", () => {
    const findings = buildFindings(RAW_TEXT, { file_claims: {} });

    render(
      <ReviewFindings rawText={RAW_TEXT} findings={findings} selectedFile={null} onSelectFile={vi.fn()} reviewContext={{ file_claims: {} }} />
    );

    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("history.high_recent_curn")).toBeInTheDocument();
    expect(screen.getByText("history.high_recent_churn")).toBeInTheDocument();
  });

  it("never shows an Evidence label when the finding quotes no identifiers", () => {
    const rawText = "1. **A plain observation** – nothing quoted here at all.";
    const findings = buildFindings(rawText, { file_claims: {} });

    render(
      <ReviewFindings rawText={rawText} findings={findings} selectedFile={null} onSelectFile={vi.fn()} reviewContext={{ file_claims: {} }} />
    );

    expect(screen.queryByText("Evidence")).not.toBeInTheDocument();
  });
});

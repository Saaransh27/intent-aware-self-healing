import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReviewFindings from "./ReviewFindings";
import { buildFindings } from "../lib/reviewIntelligence";

const RAW_TEXT = '```json\n[{"title": "Misspelled claim identifier"}]\n```';

function structuredFinding(overrides) {
  return {
    title: "Misspelled claim identifier",
    category: "Test failure",
    severity: "High",
    confidence: "Confirmed",
    evidenceStrength: "Direct",
    status: "Defect",
    proofType: "test_failure",
    explanation: "This mismatch will cause the new test to fail.",
    whyItMatters: "The risk signal will not be recognized at runtime.",
    evidence: [],
    affectedFiles: [],
    affectedSymbols: [],
    verificationNeeded: [],
    suggestedAction: "Fix the identifier.",
    ...overrides,
  };
}

describe("ReviewFindings", () => {
  it("renders Evidence as its own labeled field, separate from the explanation", () => {
    const findings = buildFindings([
      structuredFinding({ evidence: ["history.high_recent_curn", "history.high_recent_churn"] }),
    ]);

    render(
      <ReviewFindings
        rawText={RAW_TEXT}
        findings={findings}
        structuredState="ok"
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("history.high_recent_curn")).toBeInTheDocument();
    expect(screen.getByText("history.high_recent_churn")).toBeInTheDocument();
  });

  it("never shows an Evidence label when the finding cites no identifiers", () => {
    const findings = buildFindings([structuredFinding({ evidence: [] })]);

    render(
      <ReviewFindings
        rawText={RAW_TEXT}
        findings={findings}
        structuredState="ok"
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(screen.queryByText("Evidence")).not.toBeInTheDocument();
  });

  it("shows a clean empty state, not raw JSON, when the model legitimately reported nothing", () => {
    render(
      <ReviewFindings
        rawText={RAW_TEXT}
        findings={[]}
        structuredState="ok"
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(screen.getByText(/Nothing in this change was flagged/)).toBeInTheDocument();
    expect(screen.queryByText(/Analysis confidence reduced/)).not.toBeInTheDocument();
  });

  it("shows the disclosed degraded state, not a silent empty list, when structured parsing failed", () => {
    render(
      <ReviewFindings
        rawText={RAW_TEXT}
        findings={[]}
        structuredState="unavailable"
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(screen.getByText(/Analysis confidence reduced/)).toBeInTheDocument();
  });
});

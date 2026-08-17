import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmedIssues from "./ConfirmedIssues";
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

// Milestone 9: split out of the shared ReviewFindings (kept, unchanged,
// for the legacy commit-review flow) so Confirmed Issues can be its own
// command-deck card. Same real behavior, ported from ReviewFindings.test.jsx.
describe("ConfirmedIssues", () => {
  it("renders Evidence as its own facet tab, separate from the description, and only shows its identifiers once opened", async () => {
    const findings = buildFindings([
      structuredFinding({ evidence: ["history.high_recent_curn", "history.high_recent_churn"] }),
    ]);

    render(
      <ConfirmedIssues
        rawText={RAW_TEXT}
        findings={findings}
        structuredState="ok"
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.queryByText("history.high_recent_curn")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Evidence"));
    expect(screen.getByText("history.high_recent_curn")).toBeInTheDocument();
    expect(screen.getByText("history.high_recent_churn")).toBeInTheDocument();
  });

  it("only shows one facet's content at a time, per card", async () => {
    const findings = buildFindings([
      structuredFinding({ evidence: ["history.high_recent_curn"] }),
    ]);

    render(
      <ConfirmedIssues
        rawText={RAW_TEXT}
        findings={findings}
        structuredState="ok"
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    await userEvent.click(screen.getByText("Why it matters"));
    expect(screen.getByText("The risk signal will not be recognized at runtime.")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Evidence"));
    expect(screen.queryByText("The risk signal will not be recognized at runtime.")).not.toBeInTheDocument();
    expect(screen.getByText("history.high_recent_curn")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Evidence"));
    expect(screen.queryByText("history.high_recent_curn")).not.toBeInTheDocument();
  });

  it("never shows an Evidence label when the finding cites no identifiers", () => {
    const findings = buildFindings([structuredFinding({ evidence: [] })]);

    render(
      <ConfirmedIssues
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
      <ConfirmedIssues
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
      <ConfirmedIssues
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

  it("renders nothing at all when the model produced no ranked-attention text", () => {
    const { container } = render(
      <ConfirmedIssues
        rawText=""
        findings={[]}
        structuredState="ok"
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UnconfirmedFindings from "./UnconfirmedFindings";
import { buildFindings } from "../lib/reviewIntelligence";

const RAW_TEXT = '```json\n[{"title": "Backend claim existence unverified"}]\n```';

function structuredFinding(overrides) {
  return {
    title: "Backend claim existence unverified",
    category: "API/contract mismatch",
    severity: "Medium",
    confidence: "Needs verification",
    evidenceStrength: "Indirect",
    status: "Intent mismatch",
    proofType: "inferred_risk",
    explanation: "Could not confirm this claim exists server-side.",
    whyItMatters: "The behavior may not actually be enforced.",
    evidence: [],
    affectedFiles: [],
    affectedSymbols: [],
    verificationNeeded: ["Check the backend route handles this claim."],
    suggestedAction: null,
    ...overrides,
  };
}

describe("UnconfirmedFindings", () => {
  it("shows a Strong evidence/Needs verification finding, never a Confirmed one", () => {
    const findings = buildFindings([
      structuredFinding(),
      structuredFinding({ title: "A confirmed defect", confidence: "Confirmed", status: "Defect" }),
    ]);

    render(
      <UnconfirmedFindings
        rawText={RAW_TEXT}
        findings={findings}
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(screen.getByText("Backend claim existence unverified")).toBeInTheDocument();
    expect(screen.queryByText("A confirmed defect")).not.toBeInTheDocument();
  });

  it("shows a real empty state when there are no open questions", () => {
    render(
      <UnconfirmedFindings
        rawText={RAW_TEXT}
        findings={[]}
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(screen.getByText("No open questions for this change.")).toBeInTheDocument();
  });

  it("renders nothing at all when the model produced no ranked-attention text", () => {
    const { container } = render(
      <UnconfirmedFindings
        rawText=""
        findings={[]}
        selectedFile={null}
        onSelectFile={vi.fn()}
        reviewContext={{ file_claims: {} }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

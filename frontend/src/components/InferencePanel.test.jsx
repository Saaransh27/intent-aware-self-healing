import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InferencePanel from "./InferencePanel";
import { buildFindings, deriveIntentVsImplementation } from "../lib/reviewIntelligence";

function structuredFinding(overrides) {
  return {
    title: "Untitled finding",
    category: "Other",
    severity: "Medium",
    confidence: "Needs verification",
    evidenceStrength: "Indirect",
    status: "Informational",
    proofType: "inferred_risk",
    explanation: "An explanation.",
    whyItMatters: "A consequence.",
    evidence: [],
    affectedFiles: [],
    affectedSymbols: [],
    verificationNeeded: [],
    suggestedAction: "Take a look.",
    ...overrides,
  };
}

// Milestone 9: split out of the former combined ReviewConfidenceHeader so
// Inferred Intent / Implementation vs. Intent can be its own middle-
// column panel in the fixed-viewport deck. Same real behavior.
describe("InferencePanel", () => {
  it("shows the real claimed intent and marks a confirmed defect outside the intent/implementation/test shape as mismatched", () => {
    const findings = buildFindings([
      structuredFinding({
        title: "Reordered tier-selection logic",
        category: "Behavioral regression",
        severity: "High",
        confidence: "Confirmed",
        status: "Regression risk",
        proofType: "behavioral_regression",
      }),
    ]);
    const intentVsImplementation = deriveIntentVsImplementation("Treat churn as risk-bearing", findings);

    render(<InferencePanel intentVsImplementation={intentVsImplementation} findings={findings} />);

    expect(screen.getByText("Treat churn as risk-bearing")).toBeInTheDocument();
    const row = screen.getByText("Reordered tier-selection logic").closest(".inference-row");
    expect(row).toHaveClass("inference-row-mismatched");
    expect(screen.getByText("1 mismatched")).toBeInTheDocument();
  });

  it("shows an honest empty state when there's no claimed intent and nothing to compare", () => {
    const findings = buildFindings([]);
    const intentVsImplementation = deriveIntentVsImplementation("", findings);

    render(<InferencePanel intentVsImplementation={intentVsImplementation} findings={findings} />);

    expect(screen.getByText("No claimed intent available for this PR.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing to compare/)).toBeInTheDocument();
  });
});

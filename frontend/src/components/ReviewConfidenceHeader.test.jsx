import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReviewConfidenceHeader from "./ReviewConfidenceHeader";
import { buildFindings, deriveVerdict, deriveIntentVsImplementation, HIGH_RISK, SAFE_TO_REVIEW } from "../lib/reviewIntelligence";

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

// Milestone 9: this header replaces ReviewVerdict's numeric-adjacent
// "headline" list with a categorical ring plus a real Inferred Intent /
// Implementation-vs-Intent summary -- the one hard rule is the same one
// PRDetail.realdata.test.jsx enforces end to end: never a numeric
// confidence figure anywhere in the DOM.
describe("ReviewConfidenceHeader", () => {
  it("renders the real verdict level and its honest subtext, never 'ready to merge'", () => {
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
    const verdict = deriveVerdict(findings, "ok");
    const intentVsImplementation = deriveIntentVsImplementation("Some claimed intent", findings);

    render(<ReviewConfidenceHeader verdict={verdict} findings={findings} intentVsImplementation={intentVsImplementation} />);

    expect(screen.getByText(HIGH_RISK)).toBeInTheDocument();
    expect(screen.getByText("Do not merge yet.")).toBeInTheDocument();
    expect(screen.queryByText(/ready to merge/i)).not.toBeInTheDocument();
  });

  it("never renders a numeric confidence figure anywhere, regardless of verdict", () => {
    const findings = buildFindings([]);
    const verdict = deriveVerdict(findings, "ok");
    const intentVsImplementation = deriveIntentVsImplementation("Some claimed intent", findings);

    const { container } = render(
      <ReviewConfidenceHeader verdict={verdict} findings={findings} intentVsImplementation={intentVsImplementation} />
    );

    expect(screen.getByText(SAFE_TO_REVIEW)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+%/);
  });

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
    const verdict = deriveVerdict(findings, "ok");
    const intentVsImplementation = deriveIntentVsImplementation("Treat churn as risk-bearing", findings);

    render(<ReviewConfidenceHeader verdict={verdict} findings={findings} intentVsImplementation={intentVsImplementation} />);

    expect(screen.getByText("Treat churn as risk-bearing")).toBeInTheDocument();
    const row = screen.getByText("Reordered tier-selection logic").closest(".inference-row");
    expect(row).toHaveClass("inference-row-mismatched");
    expect(screen.getByText("1 mismatched")).toBeInTheDocument();
  });

  it("shows the disclosed degradation notice when the backend's structured state isn't ok", () => {
    const findings = buildFindings([]);
    const verdict = deriveVerdict(findings, "unavailable");
    const intentVsImplementation = deriveIntentVsImplementation("", findings);

    render(<ReviewConfidenceHeader verdict={verdict} findings={findings} intentVsImplementation={intentVsImplementation} />);

    expect(screen.getByText(/Analysis confidence reduced/)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import VerdictPanel from "./VerdictPanel";
import { buildFindings, deriveVerdict, HIGH_RISK, SAFE_TO_REVIEW } from "../lib/reviewIntelligence";

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
// the verdict ring can be its own left-column panel in the fixed-
// viewport deck. Same real behavior.
describe("VerdictPanel", () => {
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

    render(<VerdictPanel verdict={verdict} findings={findings} />);

    expect(screen.getByText(HIGH_RISK)).toBeInTheDocument();
    expect(screen.getByText("Do not merge yet.")).toBeInTheDocument();
    expect(screen.queryByText(/ready to merge/i)).not.toBeInTheDocument();
  });

  it("never renders a numeric confidence figure anywhere, regardless of verdict", () => {
    const findings = buildFindings([]);
    const verdict = deriveVerdict(findings, "ok");

    const { container } = render(<VerdictPanel verdict={verdict} findings={findings} />);

    expect(screen.getByText(SAFE_TO_REVIEW)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it("shows the disclosed degradation notice when the backend's structured state isn't ok", () => {
    const findings = buildFindings([]);
    const verdict = deriveVerdict(findings, "unavailable");

    render(<VerdictPanel verdict={verdict} findings={findings} />);

    expect(screen.getByText(/Analysis confidence reduced/)).toBeInTheDocument();
  });
});

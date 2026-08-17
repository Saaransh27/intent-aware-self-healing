import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FindingCard from "./FindingCard";
import { buildFindings } from "../lib/reviewIntelligence";

function structuredFinding(overrides) {
  return {
    title: "Untitled finding",
    category: "Other",
    severity: "Medium",
    confidence: "Needs verification",
    evidenceStrength: "Indirect",
    status: "Intent mismatch",
    proofType: "inferred_risk",
    explanation: "An explanation.",
    whyItMatters: "A consequence.",
    evidence: [],
    affectedFiles: [],
    affectedSymbols: [],
    verificationNeeded: [],
    suggestedAction: null,
    ...overrides,
  };
}

describe("FindingCard", () => {
  it("shows only the first sentence of a multi-sentence explanation as the description", () => {
    const [finding] = buildFindings([
      structuredFinding({ explanation: "First real sentence. Second real sentence with more detail." }),
    ]);

    render(<FindingCard finding={finding} selectedFile={null} onSelectFile={vi.fn()} reviewContext={{}} />);

    expect(screen.getByText("First real sentence.")).toBeInTheDocument();
    expect(screen.queryByText(/Second real sentence/)).not.toBeInTheDocument();
  });

  it("never renders a facet tab for a field the finding doesn't have", () => {
    const [finding] = buildFindings([structuredFinding({ whyItMatters: null, suggestedAction: null })]);

    render(<FindingCard finding={finding} selectedFile={null} onSelectFile={vi.fn()} reviewContext={{}} />);

    expect(screen.queryByText("Why it matters")).not.toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  // The exact scenario asked for: two independent finding cards (e.g. two
  // Open Questions), each opening/closing its own facets without ever
  // affecting the other.
  it("keeps each card's open facet fully independent when multiple cards render together", async () => {
    const findings = buildFindings([
      structuredFinding({
        title: "First open question",
        whyItMatters: "Reason for the first question.",
        suggestedAction: "Check the first thing.",
      }),
      structuredFinding({
        title: "Second open question",
        whyItMatters: "Reason for the second question.",
        suggestedAction: "Check the second thing.",
      }),
    ]);

    render(
      <>
        {findings.map((finding) => (
          <FindingCard key={finding.index} finding={finding} selectedFile={null} onSelectFile={vi.fn()} reviewContext={{}} />
        ))}
      </>
    );

    const [firstWhy, secondWhy] = screen.getAllByText("Why it matters");
    await userEvent.click(firstWhy);
    expect(screen.getByText("Reason for the first question.")).toBeInTheDocument();
    expect(screen.queryByText("Reason for the second question.")).not.toBeInTheDocument();

    await userEvent.click(secondWhy);
    expect(screen.getByText("Reason for the first question.")).toBeInTheDocument();
    expect(screen.getByText("Reason for the second question.")).toBeInTheDocument();

    const [firstNext] = screen.getAllByText("Next");
    await userEvent.click(firstNext);
    expect(screen.queryByText("Reason for the first question.")).not.toBeInTheDocument();
    expect(screen.getByText("Check the first thing.")).toBeInTheDocument();
    // The second card's own open facet is untouched by the first card's click.
    expect(screen.getByText("Reason for the second question.")).toBeInTheDocument();
  });
});

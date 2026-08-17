import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReviewSectionGrid from "./ReviewSectionGrid";
import { buildFindings, deriveIntentVsImplementation } from "../lib/reviewIntelligence";

const SECTIONS = { what_deserves_attention_ranked: "1. Misspelled claim identifier" };

const STRUCTURED_FINDINGS = [
  {
    title: "Misspelled claim identifier",
    category: "Bug",
    severity: "High",
    confidence: "Confirmed",
    evidenceStrength: "Direct",
    status: "Defect",
    proofType: "direct_code_contradiction",
    explanation: "The identifier is misspelled.",
    whyItMatters: "It will never match at runtime.",
    evidence: ["src/a.js diff adding history.high_recent_curn"],
    affectedFiles: ["src/a.js"],
    affectedSymbols: [],
    verificationNeeded: [],
    suggestedAction: "Fix the spelling.",
  },
];

const REVIEW_CONTEXT = {
  commit_summary: { changed_files: ["src/a.js"], added_files: [], deleted_files: [], modified_files: ["src/a.js"], renamed_files: [] },
  file_claims: {},
  gaps: { commit: [], files: {} },
  coverage_ledger: [],
};

const OBSERVATIONS = {
  change_categories: { touches_tests: false },
  file_classification: { "src/a.js": "Source" },
  diff_stats: { files: { "src/a.js": { insertions: 1, deletions: 1 } } },
};

function renderGrid(overrides = {}) {
  const findings = buildFindings(STRUCTURED_FINDINGS);
  const intentVsImplementation = deriveIntentVsImplementation("Fix the risk-bearing check", findings);

  return render(
    <ReviewSectionGrid
      sections={SECTIONS}
      findings={findings}
      structuredState="ok"
      intentVsImplementation={intentVsImplementation}
      observations={OBSERVATIONS}
      reviewContext={REVIEW_CONTEXT}
      selectedFile={null}
      onSelectFile={vi.fn()}
      owner="octocat"
      repo="hello-world"
      headSha="abc123"
      {...overrides}
    />
  );
}

// Milestone 9 (command-deck redesign): each card's face and its detail
// overlay must agree, since both are read from the exact same real data.
describe("ReviewSectionGrid", () => {
  it("renders a card per real section, each with a real count reflecting the same findings", () => {
    renderGrid();

    expect(screen.getByRole("button", { name: /Confirmed Issues/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Risk Hotspots/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Intent → Implementation → Test/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Change Story/ })).toBeInTheDocument();
    // One real confirmed defect -- the card face already says so, no click needed.
    expect(screen.getByRole("button", { name: /Confirmed Issues/ })).toHaveTextContent("1");
  });

  it("opens the real detail view in an overlay when a card is clicked, and closes it again", async () => {
    renderGrid();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Confirmed Issues/ }));

    const dialog = screen.getByRole("dialog", { name: "Confirmed Issues" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("The identifier is misspelled.")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switches to a different section's real content when a different card is clicked", async () => {
    renderGrid();

    await userEvent.click(screen.getByRole("button", { name: /Change Story/ }));
    expect(screen.getByRole("dialog", { name: "Change Story" })).toBeInTheDocument();
    expect(screen.getByText("src/a.js")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Risk Hotspots/ }));
    expect(screen.getByRole("dialog", { name: "Risk Hotspots" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Change Story" })).not.toBeInTheDocument();
  });

  it("never shows Open Questions or Confirmed Issues cards when the model produced no ranked-attention text", () => {
    renderGrid({ sections: { what_deserves_attention_ranked: "" } });

    expect(screen.queryByRole("button", { name: /Confirmed Issues/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open Questions/ })).not.toBeInTheDocument();
  });
});

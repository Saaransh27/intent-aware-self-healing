import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BlindSpots from "./BlindSpots";

describe("BlindSpots (Milestone 8: 'What We Could Not Verify')", () => {
  it("shows an honest empty state when there are no blind spots, not a fabricated one", () => {
    render(<BlindSpots blindSpots={[]} />);
    expect(screen.getByText(/Nothing here requires separate reviewer confirmation/)).toBeInTheDocument();
  });

  it("renders the What changed/Impact/Evidence/Tests card for a behavioral-change finding (Part 10)", () => {
    const finding = {
      index: 0,
      title: "Changed tier‑selection ordering",
      explanation: "`highestTier` now checks `STANDARD_REVIEW` before `REQUIRES_IMMEDIATE_REVIEW`.",
      behavioralDetail: {
        before: null,
        after: null,
        impact: "This could downgrade files that should trigger immediate review.",
        evidence: ["highestTier", "STANDARD_REVIEW", "REQUIRES_IMMEDIATE_REVIEW"],
        testsNote: "No test coverage was found for this behavior.",
      },
    };

    render(<BlindSpots blindSpots={[finding]} />);

    expect(screen.getByText("Requires reviewer confirmation")).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes("checks STANDARD_REVIEW before")).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/This could downgrade files/)).toBeInTheDocument();
    expect(screen.getAllByText("highestTier").length).toBeGreaterThan(0);
    expect(screen.getByText("No test coverage was found for this behavior.")).toBeInTheDocument();
  });

  it("renders a simple title+body item, tagged 'Not verified', for a mismatch-only blind spot with no behavioralDetail", () => {
    const finding = {
      index: 0,
      title: "Misspelled claim identifier",
      explanation: "The identifiers do not match.",
      behavioralDetail: null,
    };

    render(<BlindSpots blindSpots={[finding]} />);

    expect(screen.getByText("Misspelled claim identifier")).toBeInTheDocument();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.queryByText("Requires reviewer confirmation")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BlindSpots from "./BlindSpots";

describe("BlindSpots", () => {
  it("shows 'None identified.' when there are no blind spots, not a fabricated one", () => {
    render(<BlindSpots blindSpots={[]} />);
    expect(screen.getByText("None identified.")).toBeInTheDocument();
  });

  it("renders the full Before/After/Impact/Evidence/Tests card for a behavioral-change finding (Part 10)", () => {
    const finding = {
      index: 0,
      title: "Changed tier‑selection ordering",
      body: "`highestTier` now checks `STANDARD_REVIEW` before `REQUIRES_IMMEDIATE_REVIEW`.",
      behavioralDetail: {
        before: null,
        after: "checks `STANDARD_REVIEW` before `REQUIRES_IMMEDIATE_REVIEW`",
        impact: "This could downgrade files that should trigger immediate review.",
        evidence: ["highestTier", "STANDARD_REVIEW", "REQUIRES_IMMEDIATE_REVIEW"],
        testsNote: "No test coverage was found for this behavior.",
      },
    };

    render(<BlindSpots blindSpots={[finding]} />);

    expect(screen.getByText("Behavioral change detected")).toBeInTheDocument();
    expect(screen.getByText("Not stated in the review.")).toBeInTheDocument();
    expect(screen.getByText(/checks `STANDARD_REVIEW` before/)).toBeInTheDocument();
    expect(screen.getByText(/This could downgrade files/)).toBeInTheDocument();
    expect(screen.getByText("highestTier")).toBeInTheDocument();
    expect(screen.getByText("No test coverage was found for this behavior.")).toBeInTheDocument();
  });

  it("renders a simple title+body item for a mismatch-only blind spot with no behavioralDetail", () => {
    const finding = {
      index: 0,
      title: "Misspelled claim identifier",
      body: "The identifiers do not match.",
      behavioralDetail: null,
    };

    render(<BlindSpots blindSpots={[finding]} />);

    expect(screen.getByText("Misspelled claim identifier")).toBeInTheDocument();
    expect(screen.queryByText("Behavioral change detected")).not.toBeInTheDocument();
  });
});

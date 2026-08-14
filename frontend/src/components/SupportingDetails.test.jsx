import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SupportingDetails from "./SupportingDetails";

const EMPTY_REVIEW_CONTEXT = {
  commit_summary: { message: "", changed_files: [], added_files: [], deleted_files: [], modified_files: [], renamed_files: [] },
  commit_claims: [],
  file_claims: {},
  gaps: { commit: [], files: {} },
  coverage_ledger: [],
};

const REVIEW_CONTEXT_WITH_FILES = {
  ...EMPTY_REVIEW_CONTEXT,
  commit_summary: { ...EMPTY_REVIEW_CONTEXT.commit_summary, changed_files: ["src/app.py"], modified_files: ["src/app.py"] },
};

const REVIEW_CONTEXT_WITH_GAPS = {
  ...EMPTY_REVIEW_CONTEXT,
  gaps: {
    commit: [],
    files: {
      "src/app.py": [
        { reason: "cannot_assess_contract", scope: { level: "file", file_path: "src/app.py", qualified_name: null }, missing: ["semantic_analysis"], module: "contract_stability" },
      ],
    },
  },
};

describe("SupportingDetails", () => {
  it("renders nothing at all when there is genuinely nothing to show", () => {
    const { container } = render(
      <SupportingDetails sections={{}} reviewContext={EMPTY_REVIEW_CONTEXT} observations={{}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders every section collapsed by default", () => {
    render(
      <SupportingDetails
        sections={{ what_changed_and_why: "Added a function.", minor_notes: "A small note." }}
        reviewContext={EMPTY_REVIEW_CONTEXT}
        observations={{}}
      />
    );

    for (const details of document.querySelectorAll("details")) {
      expect(details).not.toHaveAttribute("open");
    }
  });

  it("shows 'What changed and why' only when that text is real and non-empty", () => {
    const { rerender } = render(
      <SupportingDetails sections={{}} reviewContext={EMPTY_REVIEW_CONTEXT} observations={{}} />
    );
    expect(screen.queryByText("What changed and why")).not.toBeInTheDocument();

    rerender(
      <SupportingDetails
        sections={{ what_changed_and_why: "Added a function." }}
        reviewContext={EMPTY_REVIEW_CONTEXT}
        observations={{}}
      />
    );
    expect(screen.getByText("What changed and why")).toBeInTheDocument();
  });

  it("shows 'Manual verification' only when the backend actually reported a gap", () => {
    const { rerender } = render(
      <SupportingDetails sections={{}} reviewContext={EMPTY_REVIEW_CONTEXT} observations={{}} />
    );
    expect(screen.queryByText("Manual verification")).not.toBeInTheDocument();

    rerender(
      <SupportingDetails sections={{}} reviewContext={REVIEW_CONTEXT_WITH_GAPS} observations={{}} />
    );
    expect(screen.getByText("Manual verification")).toBeInTheDocument();
  });

  it("shows 'Review strategy' only when there are changed files to strategize over", () => {
    const { rerender } = render(
      <SupportingDetails sections={{}} reviewContext={EMPTY_REVIEW_CONTEXT} observations={{}} />
    );
    expect(screen.queryByText("Review strategy")).not.toBeInTheDocument();

    rerender(
      <SupportingDetails sections={{}} reviewContext={REVIEW_CONTEXT_WITH_FILES} observations={{}} />
    );
    expect(screen.getByText("Review strategy")).toBeInTheDocument();
  });

  it("shows 'Minor notes' only when that text is real and non-empty", () => {
    render(
      <SupportingDetails
        sections={{ minor_notes: "A small note." }}
        reviewContext={EMPTY_REVIEW_CONTEXT}
        observations={{}}
      />
    );
    expect(screen.getByText("Minor notes")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TestSignal from "./TestSignal";
import { buildFindings, deriveIntentVsImplementation } from "../lib/reviewIntelligence";
import pr3Response from "../test/fixtures/real_pr_review_response.pr3_incorrect.json";

// Real bug found on re-review: "Tests changed" used to be shown ONLY when
// no other line existed, so a PR with a real test mismatch never
// displayed the basic, honest fact that it touched test files at all.
describe("TestSignal", () => {
  it("always shows the plain 'tests changed' fact, and a real test-impact detail block, for a real test mismatch", () => {
    const findings = buildFindings(pr3Response.structured_findings.findings);
    const intentVsImplementation = deriveIntentVsImplementation("Treat history.high_recent_churn as risk-bearing", findings);

    render(
      <TestSignal
        observations={pr3Response.observations}
        findings={findings}
        intentVsImplementation={intentVsImplementation}
      />
    );

    expect(screen.getByText("This PR modifies test files.")).toBeInTheDocument();
    expect(screen.getByText(/test.* affected/)).toBeInTheDocument();
    expect(screen.getByText("Result:").closest("p")).toHaveTextContent(/Expected failure|Potential failure/);
  });

  it("shows 'tests not changed' honestly when a PR touches no test files and has no findings", () => {
    render(
      <TestSignal
        observations={{ change_categories: { touches_tests: false } }}
        findings={[]}
        intentVsImplementation={{ consistency: "PASS", testDetail: [], implementationDetail: [] }}
      />
    );

    expect(screen.getByText(/No relevant test coverage identified/)).toBeInTheDocument();
    expect(screen.queryByText("This PR modifies test files.")).not.toBeInTheDocument();
  });

  it("shows the plain 'tests changed' fact alone when tests changed and nothing else is flagged", () => {
    render(
      <TestSignal
        observations={{ change_categories: { touches_tests: true } }}
        findings={[]}
        intentVsImplementation={{ consistency: "PASS", testDetail: [], implementationDetail: [] }}
      />
    );

    expect(screen.getByText("This PR modifies test files.")).toBeInTheDocument();
    expect(screen.queryByText(/test.* affected/)).not.toBeInTheDocument();
  });
});

import { CATEGORY_MISSING_TEST_COVERAGE, CONFIRMED } from "../lib/reviewIntelligence";

// Part 8, restructured for Milestone 9: real facts only -- touches_tests
// is real (observations), a test mismatch is only ever asserted when a
// real mismatch-shaped finding already says so, and "no coverage found"
// comes directly from the model's own "Missing test coverage" category /
// "missing_test" proof type -- never a prose-scanning guess. This is NOT
// a CI integration -- there is no real test-run result, so nothing here
// ever claims a test definitely failed. "Expected failure" is used only
// when a Confirmed, Direct-evidence finding demonstrates it; anything
// weaker is phrased as "Potential failure" instead, per this milestone's
// explicit correctness rule. Never implies passing/absent tests mean the
// change is safe -- this section reports what changed about tests, not a
// safety verdict.
//
// Fix (found during a precision re-review): the plain "tests changed?"
// fact used to be shown ONLY when nothing else was -- so a PR with a real
// test mismatch never displayed the basic fact that it touched test files
// at all. That fact is always the first line, unconditionally.
function TestSignal({ observations, findings, intentVsImplementation }) {
  const touchesTests = !!observations?.change_categories?.touches_tests;

  const testImpactFindings = findings.filter(
    (f) => f.category === "Test failure" || f.proofType === "test_failure"
  );
  const affectedTestFiles = [...new Set(testImpactFindings.flatMap((f) => f.affectedFiles))];
  const hasDirectConfirmedEvidence = testImpactFindings.some(
    (f) => f.confidence === CONFIRMED && f.evidenceStrength === "Direct"
  );

  const missingCoverageFindings = findings.filter((f) => f.category === CATEGORY_MISSING_TEST_COVERAGE);

  const hasNothingToReport =
    !touchesTests && testImpactFindings.length === 0 && missingCoverageFindings.length === 0;

  return (
    <section id="test-impact" className="test-signal">
      <p className="section-hint">
        What changed about tests, not a safety verdict — passing or unaffected tests never mean the change itself
        is safe; see Review Verdict and Confirmed Issues above for the actual risk assessment.
      </p>

      {hasNothingToReport ? (
        <p className="test-signal-item test-signal-item-neutral">
          No relevant test coverage identified — this PR does not modify any test files, and no specific coverage
          gap was identified from the evidence available.
        </p>
      ) : (
        <p className="test-signal-item test-signal-item-neutral">
          {touchesTests ? "This PR modifies test files." : "This PR does not modify any test files."}
        </p>
      )}

      {testImpactFindings.length > 0 && (
        <div className="test-impact-detail">
          <p className="test-impact-count">
            {testImpactFindings.length} test{testImpactFindings.length === 1 ? "" : "s"} affected
          </p>
          {affectedTestFiles.map((path) => (
            <p key={path} className="test-impact-file"><code>{path}</code></p>
          ))}
          {intentVsImplementation.testDetail.length > 0 && (
            <p className="test-impact-row">
              <strong>Expected: </strong>
              {intentVsImplementation.testDetail.map((id, i) => (
                <code key={i} className="intent-code">{id}</code>
              ))}
            </p>
          )}
          {intentVsImplementation.implementationDetail.length > 0 && (
            <p className="test-impact-row">
              <strong>Implementation: </strong>
              {intentVsImplementation.implementationDetail.map((id, i) => (
                <code key={i} className="intent-code">{id}</code>
              ))}
            </p>
          )}
          <p className="test-impact-row test-impact-result">
            <strong>Result: </strong>
            <span className={hasDirectConfirmedEvidence ? "test-impact-result-expected" : "test-impact-result-potential"}>
              {hasDirectConfirmedEvidence ? "Expected failure" : "Potential failure"}
            </span>
          </p>
        </div>
      )}

      {missingCoverageFindings.map((finding, i) => (
        <p key={i} className="test-signal-item test-signal-item-warning">
          <span className="test-signal-title">Missing test coverage</span>
          <span className="test-signal-body">{finding.explanation}</span>
        </p>
      ))}
    </section>
  );
}

export default TestSignal;

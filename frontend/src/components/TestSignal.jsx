import { CATEGORY_TEST_FAILURE, CATEGORY_MISSING_TEST_COVERAGE } from "../lib/reviewIntelligence";

// Part 8: real facts only -- touches_tests is real (observations), a test
// mismatch is only ever asserted when a Confirmed-tier finding already
// says so, and "no coverage found" is phrased as what the evidence
// supports, never as a fabricated claim that no tests exist anywhere.
// This is NOT a CI integration -- there is no real test-run result to
// report, so nothing here claims one.
//
// Fix (found during a precision re-review): the plain "tests changed?"
// fact used to be shown ONLY when nothing else was -- so a PR with a real
// test mismatch never displayed the basic fact that it touched test files
// at all. That fact is now always the first line, unconditionally; every
// other line is additional, never a replacement for it.
function TestSignal({ observations, findings, intentVsImplementation }) {
  const touchesTests = !!observations?.change_categories?.touches_tests;

  const lines = [
    {
      tone: "neutral",
      title: "Tests changed",
      body: touchesTests
        ? "This PR modifies test files."
        : "This PR does not modify any test files.",
    },
  ];

  if (intentVsImplementation.consistency === "MISMATCH" && intentVsImplementation.testDetail.length > 0) {
    lines.push({
      tone: "warning",
      title: "Test mismatch detected",
      body: `The new test expects ${intentVsImplementation.testDetail.map((t) => `\`${t}\``).join(", ")}, but the implementation uses ${intentVsImplementation.implementationDetail.map((t) => `\`${t}\``).join(", ")}.`,
    });
  }

  const behavioralWithoutTestMention = findings.filter(
    (f) =>
      f.isBehavioralChange &&
      f.category !== CATEGORY_TEST_FAILURE &&
      !/\btest\b/i.test(`${f.title} ${f.body}`)
  );
  for (const finding of behavioralWithoutTestMention) {
    lines.push({
      tone: "warning",
      title: "No relevant test coverage identified",
      body: `${finding.title || finding.body} — no test coverage was found for this behavior.`,
    });
  }

  const missingCoverageFindings = findings.filter((f) => f.category === CATEGORY_MISSING_TEST_COVERAGE);
  for (const finding of missingCoverageFindings) {
    lines.push({ tone: "warning", title: "Missing test coverage", body: finding.body });
  }

  if (lines.length === 1 && !touchesTests) {
    lines[0] = {
      tone: "neutral",
      title: "No relevant test coverage identified",
      body: "This PR does not modify any test files, and no specific coverage gap was identified from the evidence available.",
    };
  }

  return (
    <section className="test-signal">
      <h2 className="section-heading">Validation &amp; Test Coverage</h2>
      <ul className="test-signal-list">
        {lines.map((line, index) => (
          <li key={index} className={`test-signal-item test-signal-item-${line.tone}`}>
            <span className="test-signal-title">{line.title}</span>
            <span className="test-signal-body">{line.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TestSignal;

// Part 9, restyled for Milestone 9 as a real flow rather than a plain
// table -- one of this product's core differentiators, so it stays a
// visually prominent, always-visible section. claimedIntent is real (the
// PR's own title/commit message); implementation/test detail is real
// (the model's own cited identifiers/evidence); consistency is only ever
// MISMATCH when a real mismatch-shaped structured finding says so (see
// lib/reviewIntelligence.js's deriveIntentVsImplementation) -- never
// inferred here.
//
// The ✕/✓ marks on Implementation/Test items are not a second judgment
// layered on top of the data: a MISMATCH here is only ever concluded
// because the underlying finding already found the implementation's own
// identifiers disagree with what the test/intent expects, so marking
// Implementation ✕ and Test ✓ restates that same, already-established
// conclusion visually -- it never asserts a new fact of its own.
function IntentVsImplementation({ intentVsImplementation }) {
  const { claimedIntent, implementationDetail, testDetail, consistency } = intentVsImplementation;

  if (!claimedIntent && implementationDetail.length === 0) return null;

  const isMismatch = consistency === "MISMATCH";

  return (
    <section id="intent-flow" className="intent-vs-implementation">
      <h2 className="section-heading">Intent → Implementation → Test</h2>
      <div className="intent-flow">
        <div className="intent-flow-step">
          <span className="intent-flow-label">Intent</span>
          <p className="intent-flow-value">{claimedIntent}</p>
        </div>

        {implementationDetail.length > 0 && (
          <>
            <div className="intent-flow-arrow" aria-hidden="true">↓</div>
            <div className="intent-flow-step">
              <span className="intent-flow-label">Implementation</span>
              <ul className="intent-flow-items">
                {implementationDetail.map((id, i) => (
                  <li key={i} className={isMismatch ? "intent-flow-item-mismatch" : "intent-flow-item-ok"}>
                    <span className="intent-flow-mark" aria-hidden="true">{isMismatch ? "✕" : "✓"}</span>
                    <code className="intent-code">{id}</code>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {testDetail.length > 0 && (
          <>
            <div className="intent-flow-arrow" aria-hidden="true">↓</div>
            <div className="intent-flow-step">
              <span className="intent-flow-label">Test</span>
              <ul className="intent-flow-items">
                {testDetail.map((id, i) => (
                  <li key={i} className="intent-flow-item-ok">
                    <span className="intent-flow-mark" aria-hidden="true">✓</span>
                    <code className="intent-code">{id}</code>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="intent-flow-arrow" aria-hidden="true">↓</div>
        <div className="intent-flow-step">
          <span className="intent-flow-label">Result</span>
          <span className={`intent-consistency intent-consistency-${consistency.toLowerCase()}`}>
            {consistency}
          </span>
        </div>
      </div>
    </section>
  );
}

export default IntentVsImplementation;

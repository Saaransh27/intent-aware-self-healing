// Part 9: a first-class UI element, not buried inside a generic finding.
// claimedIntent is real (the PR's own title/commit message); implementation
// detail is real (the model's own quoted code identifiers); consistency is
// only ever MISMATCH when a Confirmed-tier finding's own text says so.
function IntentVsImplementation({ intentVsImplementation }) {
  const { claimedIntent, implementationDetail, testDetail, consistency } = intentVsImplementation;

  if (!claimedIntent && implementationDetail.length === 0) return null;

  return (
    <section className="intent-vs-implementation">
      <h2 className="section-heading">Intent vs Implementation</h2>
      <div className="intent-grid">
        <div className="intent-row">
          <span className="intent-label">Claimed intent</span>
          <span className="intent-value">{claimedIntent}</span>
        </div>
        {implementationDetail.length > 0 && (
          <div className="intent-row">
            <span className="intent-label">Implementation</span>
            <span className="intent-value">
              {implementationDetail.map((id, i) => (
                <code key={i} className="intent-code">{id}</code>
              ))}
            </span>
          </div>
        )}
        {testDetail.length > 0 && (
          <div className="intent-row">
            <span className="intent-label">Test</span>
            <span className="intent-value">
              {testDetail.map((id, i) => (
                <code key={i} className="intent-code">{id}</code>
              ))}
            </span>
          </div>
        )}
        <div className="intent-row">
          <span className="intent-label">Consistency</span>
          <span className={`intent-consistency intent-consistency-${consistency.toLowerCase()}`}>
            {consistency}
          </span>
        </div>
      </div>
    </section>
  );
}

export default IntentVsImplementation;

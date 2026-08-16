// Milestone 8, Part B2: a compact scan-and-jump strip -- every number here
// is a real count already computed elsewhere on the page (findings,
// affected files, blind spots), never a separate estimate. Exists so a
// reviewer can tell where to spend their attention within a few seconds,
// without reading every section in order.
function ReviewAtAGlance({ findings, blindSpotsCount, riskHotspotFileCount, touchesTests }) {
  const actionableCount = findings.filter((f) => !f.isInformational).length;

  const items = [
    {
      href: "#findings",
      label: "Findings",
      detail: actionableCount === 0 ? "Nothing flagged" : `${actionableCount} to review`,
    },
    {
      href: "#risk-hotspots",
      label: "Risk Hotspots",
      detail: riskHotspotFileCount === 0 ? "No files flagged" : `${riskHotspotFileCount} file${riskHotspotFileCount === 1 ? "" : "s"} flagged`,
    },
    {
      href: "#what-we-could-not-verify",
      label: "What We Could Not Verify",
      detail: blindSpotsCount === 0 ? "Nothing outstanding" : `${blindSpotsCount} item${blindSpotsCount === 1 ? "" : "s"}`,
    },
    {
      href: "#test-impact",
      label: "Test Impact",
      detail: touchesTests ? "Tests changed" : "No tests changed",
    },
  ];

  return (
    <nav className="review-at-a-glance" aria-label="Review at a glance">
      <span className="review-at-a-glance-label">Review at a glance</span>
      <ul className="review-at-a-glance-list">
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="review-at-a-glance-item">
              <span className="review-at-a-glance-item-label">{item.label}</span>
              <span className="review-at-a-glance-item-detail">{item.detail}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default ReviewAtAGlance;

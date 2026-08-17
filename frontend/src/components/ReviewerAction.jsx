import { CONFIRMED } from "../lib/reviewIntelligence";

// Milestone 9, Part 3: a compact, actionable checklist -- every line here
// is either a real finding's own "suggestedAction" (the model's own
// words, never invented) or a real "verificationNeeded" item. Confirmed
// findings get a filled checkmark (something to actually fix); anything
// still uncertain gets a hollow circle (something to check, not
// necessarily broken) -- this mirrors the same confidence split
// Confirmed Issues/Open Questions uses below, so nothing here
// contradicts those sections.
function ReviewerAction({ findings }) {
  const actionable = findings.filter((f) => !f.isInformational);

  const toFix = [
    ...new Set(actionable.filter((f) => f.confidence === CONFIRMED).map((f) => f.suggestedAction).filter(Boolean)),
  ];
  const toVerify = [
    ...new Set([
      ...actionable.filter((f) => f.confidence !== CONFIRMED).map((f) => f.suggestedAction).filter(Boolean),
      ...actionable.flatMap((f) => f.verificationNeeded),
    ]),
  ];

  if (toFix.length === 0 && toVerify.length === 0) return null;

  return (
    <section id="reviewer-action" className="reviewer-action">
      <h2 className="section-heading">Reviewer action</h2>
      <p className="section-hint">Before merging:</p>
      <ul className="reviewer-action-list">
        {toFix.map((action, i) => (
          <li key={`fix-${i}`} className="reviewer-action-item reviewer-action-item-fix">
            <span className="reviewer-action-mark" aria-hidden="true">✓</span>
            {action}
          </li>
        ))}
        {toVerify.map((action, i) => (
          <li key={`verify-${i}`} className="reviewer-action-item reviewer-action-item-verify">
            <span className="reviewer-action-mark" aria-hidden="true">○</span>
            {action}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ReviewerAction;

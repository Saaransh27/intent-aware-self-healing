import { filesWithContext } from "../lib/reviewContext";
import { fileTier, REQUIRES_IMMEDIATE_REVIEW, STANDARD_REVIEW, ROUTINE, FILE_TIER_RULE } from "../lib/reviewTiers";

// Answers "how should I spend my time?" as an ordered checklist, using
// exactly the same per-file tier shown in File Overview — never a
// separate ranking invented just for this section. "Finally" (routine)
// only appears when the backend's own coverage ledger actually collapsed
// something; there's no manufactured "routine" bucket when it didn't.
function ReviewStrategy({ reviewContext, observations }) {
  if (!reviewContext) return null;

  const files = filesWithContext(reviewContext, observations).map((f) => ({
    ...f,
    tier: fileTier(f.path, reviewContext),
  }));
  if (files.length === 0) return null;

  const reviewFirst = files.filter((f) => f.tier === REQUIRES_IMMEDIATE_REVIEW);
  const then = files.filter((f) => f.tier === STANDARD_REVIEW);
  const finally_ = files.filter((f) => f.tier === ROUTINE);

  const steps = [
    { label: "Review first", files: reviewFirst },
    { label: "Then", files: then },
    { label: "Finally", files: finally_ },
  ].filter((step) => step.files.length > 0);

  if (steps.length === 0) return null;

  return (
    <section className="review-strategy">
      <h2 className="section-heading">Review Strategy</h2>
      <p className="section-hint">{FILE_TIER_RULE}</p>
      <ol className="strategy-steps">
        {steps.map((step) => (
          <li className="strategy-step" key={step.label}>
            <span className="strategy-step-label">{step.label}</span>
            <ul className="strategy-file-list">
              {step.files.map((f) => (
                <li key={f.path}><code>{f.path}</code></li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default ReviewStrategy;

import { renderInlineMarkdown } from "../lib/textFormatting";

// Part 7 + Part 10, reframed for Milestone 8 Part B7: only findings the
// engine has real evidence require reasoning beyond the changed lines
// themselves (a real behavioral-change or mismatch-shaped structured
// finding) -- never random speculation, and legitimately empty most of
// the time. Renamed from "Potential blind spots" and reworded throughout
// to honest, non-bug language ("requires reviewer confirmation",
// "evidence unavailable") -- this section names what the system could NOT
// independently verify, not an accusation that something is wrong.
//
// A behavioral-change finding (finding.behavioralDetail is non-null) gets
// the full "Requires reviewer confirmation" card: Impact / Evidence /
// Tests, per Part 10 -- each field is either the model's own real,
// extracted value or an honest "Evidence unavailable," never a fabricated
// fill-in. A mismatch-only item (not itself a behavioral-change match)
// still gets the simpler title+body treatment, since that richer
// structure doesn't apply to it.
function BehavioralChangeCard({ finding }) {
  const { impact, evidence, testsNote } = finding.behavioralDetail;

  return (
    <li className="blind-spot-item blind-spot-item-behavioral">
      <span className="behavioral-change-badge">Requires reviewer confirmation</span>
      <span className="blind-spot-title">{renderInlineMarkdown(finding.title)}</span>
      <dl className="behavioral-detail-grid">
        <dt>What changed</dt>
        <dd>{renderInlineMarkdown(finding.explanation)}</dd>
        <dt>Impact</dt>
        <dd>{impact || <em>Evidence unavailable.</em>}</dd>
        <dt>Evidence</dt>
        <dd>
          {evidence.length > 0 ? (
            evidence.map((id, i) => (
              <code key={i} className="intent-code">{id}</code>
            ))
          ) : (
            <em>Evidence unavailable.</em>
          )}
        </dd>
        <dt>Tests</dt>
        <dd>{testsNote}</dd>
      </dl>
    </li>
  );
}

function BlindSpots({ blindSpots }) {
  return (
    <section id="what-we-could-not-verify" className="blind-spots">
      <h2 className="section-heading">What We Could Not Verify</h2>
      <p className="section-hint">
        Not a defect list — these are the points where confirming correctness requires more context than this
        review can check on its own, so a human should confirm them directly.
      </p>
      {blindSpots.length === 0 ? (
        <p className="blind-spots-empty">Nothing here requires separate reviewer confirmation.</p>
      ) : (
        <ul className="blind-spots-list">
          {blindSpots.map((finding) =>
            finding.behavioralDetail ? (
              <BehavioralChangeCard key={finding.index} finding={finding} />
            ) : (
              <li key={finding.index} className="blind-spot-item">
                <span className="behavioral-change-badge">Not verified</span>
                <span className="blind-spot-title">{renderInlineMarkdown(finding.title)}</span>
                <span className="blind-spot-body">{renderInlineMarkdown(finding.explanation)}</span>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}

export default BlindSpots;

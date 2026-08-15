import { renderInlineMarkdown } from "../lib/textFormatting";

// Part 7 + Part 10: only findings the engine has real evidence require
// reasoning beyond the changed lines themselves (a behavioral-change
// keyword match, or a confirmed intent/implementation mismatch) --
// never random speculation, and legitimately empty most of the time.
//
// A behavioral-change finding (finding.behavioralDetail is non-null) gets
// the full "Behavioral change detected" card: Before / After / Impact /
// Evidence / Tests, per Part 10 -- each field is either the model's own
// real, extracted clause or an honest "not stated," never a fabricated
// fill-in. A mismatch-only blind spot (not itself a behavioral-change
// match) still gets the simpler title+body treatment, since that
// richer structure doesn't apply to it.
function BehavioralChangeCard({ finding }) {
  const { before, after, impact, evidence, testsNote } = finding.behavioralDetail;

  return (
    <li className="blind-spot-item blind-spot-item-behavioral">
      <span className="behavioral-change-badge">Behavioral change detected</span>
      <span className="blind-spot-title">{renderInlineMarkdown(finding.title)}</span>
      <dl className="behavioral-detail-grid">
        <dt>Before</dt>
        <dd>{before || <em>Not stated in the review.</em>}</dd>
        <dt>After</dt>
        <dd>{after || <em>Not stated separately — see the description above.</em>}</dd>
        <dt>Impact</dt>
        <dd>{impact || <em>Not stated separately from the description above.</em>}</dd>
        <dt>Evidence</dt>
        <dd>
          {evidence.length > 0 ? (
            evidence.map((id, i) => (
              <code key={i} className="intent-code">{id}</code>
            ))
          ) : (
            <em>No specific identifiers quoted.</em>
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
    <section className="blind-spots">
      <h2 className="section-heading">Potential blind spots</h2>
      {blindSpots.length === 0 ? (
        <p className="blind-spots-empty">None identified.</p>
      ) : (
        <ul className="blind-spots-list">
          {blindSpots.map((finding) =>
            finding.behavioralDetail ? (
              <BehavioralChangeCard key={finding.index} finding={finding} />
            ) : (
              <li key={finding.index} className="blind-spot-item">
                <span className="blind-spot-title">{renderInlineMarkdown(finding.title)}</span>
                <span className="blind-spot-body">{renderInlineMarkdown(finding.body)}</span>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}

export default BlindSpots;

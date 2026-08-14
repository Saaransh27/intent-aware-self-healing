import { renderMarkdownLite } from "../lib/textFormatting";

// A generic wrapper for a raw review.sections.* field that has no
// dedicated component of its own (what_changed_and_why's full text,
// minor_notes) — same markdown-lite rendering every other section uses.
// showTitle defaults to true; SupportingDetails passes false since its
// own <summary> already IS the title — avoids a real, doubly-rendered
// heading (not just a CSS-hidden one).
function ProseSection({ title, rawText, showTitle = true }) {
  if (!rawText || !rawText.trim()) return null;

  return (
    <section className="prose-section">
      {showTitle && <h3 className="section-heading">{title}</h3>}
      <div className="section-body">{renderMarkdownLite(rawText)}</div>
    </section>
  );
}

export default ProseSection;

import { X } from "lucide-react";

// The command-deck card grid's detail view: a translucent overlay over
// the card being reviewed, same backdrop/panel language as PRListOverlay
// and the repo selector -- clicking a card never navigates away or
// discards the page underneath, it just surfaces that section's own
// existing component, unchanged, on top of it.
function SectionOverlay({ title, onClose, children }) {
  return (
    <div className="section-overlay" role="presentation" onClick={onClose}>
      <div
        className="section-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-overlay-header">
          <h2 className="section-overlay-title">{title}</h2>
          <button type="button" className="repo-selector-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="section-overlay-body">{children}</div>
      </div>
    </div>
  );
}

export default SectionOverlay;

import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { riskStatusFor } from "../lib/prStatus";
import { SAFE_TO_REVIEW, REVIEWER_ATTENTION, HIGH_RISK } from "../lib/reviewIntelligence";

function badgeClassFor(level) {
  if (level === HIGH_RISK) return "badge badge-severity-critical";
  if (level === REVIEWER_ATTENTION) return "badge badge-severity-medium";
  if (level === SAFE_TO_REVIEW) return "badge badge-severity-low";
  return "badge pr-list-not-reviewed-badge";
}

// A translucent overlay on top of the PR being reviewed, rather than a
// full navigation to the PR list route -- picking a different PR is a
// much shorter detour than "leave this page, lose your place, go back."
// Reuses the exact same pullRequests/reviewCache the caller already has
// (no second fetch); clicking a row navigates and closes the overlay in
// one action, since there's nothing left to overlay once you've left.
function PRListOverlay({ owner, repo, pullRequests, reviewCache, currentNumber, onClose }) {
  return (
    <div className="pr-list-overlay" role="presentation" onClick={onClose}>
      <div
        className="pr-list-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="All pull requests"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pr-list-overlay-header">
          <h2 className="pr-list-overlay-title">{owner}/{repo}</h2>
          <button type="button" className="repo-selector-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <ul className="pr-list-overlay-list">
          {pullRequests.map((pr) => {
            const status = riskStatusFor(reviewCache?.get(pr.number));
            return (
              <li key={pr.number}>
                <Link
                  to={`/r/${owner}/${repo}/pull/${pr.number}`}
                  className={`pr-list-overlay-item${pr.number === currentNumber ? " pr-list-overlay-item-active" : ""}`}
                  onClick={onClose}
                >
                  <span className="pr-list-row-number">#{pr.number}</span>
                  <span className="pr-list-overlay-item-title">{pr.title}</span>
                  <span className={badgeClassFor(status.level)}>{status.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default PRListOverlay;

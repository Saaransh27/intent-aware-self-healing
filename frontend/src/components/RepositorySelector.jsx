import { useState } from "react";
import { X } from "lucide-react";

// Milestone 7A: a selection layer on top of GET /github/repos, not a
// replacement for it -- `repositories` here is always the API's own,
// unmodified list. Local `pending` is a working copy so nothing is
// saved until "Save selection" is pressed ("confirm/save the
// selection" per the spec); Cancel/closing discards it.
function RepositorySelector({ repositories, initialSelected, onConfirm, onClose }) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(() => new Set(initialSelected));

  const filtered = repositories.filter((repo) =>
    repo.full_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  function toggle(fullName) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else {
        next.add(fullName);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setPending((prev) => {
      const next = new Set(prev);
      filtered.forEach((repo) => next.add(repo.full_name));
      return next;
    });
  }

  function clearSelection() {
    setPending(new Set());
  }

  return (
    <div className="repo-selector-overlay" role="presentation" onClick={onClose}>
      <div
        className="repo-selector-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Manage repositories"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="repo-selector-header">
          <h2 className="repo-selector-title">Manage repositories</h2>
          <button type="button" className="repo-selector-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <input
          type="text"
          className="repo-selector-search"
          placeholder="Search repositories…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search repositories"
        />

        <div className="repo-selector-toolbar">
          <button type="button" className="secondary-button" onClick={selectAllVisible}>
            Select all visible
          </button>
          <button type="button" className="secondary-button" onClick={clearSelection}>
            Clear selection
          </button>
          <span className="repo-selector-count">{pending.size} selected</span>
        </div>

        <ul className="repo-selector-list">
          {filtered.map((repo) => (
            <li key={repo.full_name}>
              <label className="repo-selector-item">
                <input
                  type="checkbox"
                  checked={pending.has(repo.full_name)}
                  onChange={() => toggle(repo.full_name)}
                />
                <span className="repo-selector-item-name">{repo.full_name}</span>
              </label>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="repo-selector-empty">No repositories match &quot;{query}&quot;</li>
          )}
        </ul>

        <div className="repo-selector-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={() => onConfirm(Array.from(pending))}>
            Save selection
          </button>
        </div>
      </div>
    </div>
  );
}

export default RepositorySelector;

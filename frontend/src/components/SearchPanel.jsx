import { useState } from "react";

// The only form on the page. Stays visible at all times — submitting again
// fetches fresh data and updates the dashboard below, it doesn't hide
// itself the way the old static playground UI did.
function SearchPanel({ onSubmit, isLoading }) {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [commitHash, setCommitHash] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedRepo = repositoryUrl.trim();
    if (!trimmedRepo) return;
    onSubmit({ repositoryUrl: trimmedRepo, commitHash: commitHash.trim() });
  }

  return (
    <form className="search-panel" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="repository-url">Repository URL</label>
        <input
          id="repository-url"
          type="text"
          value={repositoryUrl}
          onChange={(event) => setRepositoryUrl(event.target.value)}
          placeholder="https://github.com/pallets/click"
          required
          autoFocus
        />
      </div>

      <div className="field-row">
        <div className="field field-grow">
          <label htmlFor="commit-hash">
            Commit hash <span className="optional">(optional)</span>
          </label>
          <input
            id="commit-hash"
            type="text"
            value={commitHash}
            onChange={(event) => setCommitHash(event.target.value)}
            placeholder="Defaults to the latest commit"
          />
        </div>
        <div className="field field-action">
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Reviewing…" : "Review Commit"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default SearchPanel;

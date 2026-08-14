import { splitVerdict, extractSummaryBullets, renderInlineMarkdown } from "../lib/textFormatting";
import { filesWithContext } from "../lib/reviewContext";
import { fileTier, highestTier, REQUIRES_IMMEDIATE_REVIEW } from "../lib/reviewTiers";

// The most important card. Answers "what is this commit?" in one
// paragraph (the model's own verdict), then three real facts underneath:
// which files actually need inspection first, the single highest priority
// tier among them (never a fabricated risk score — see reviewTiers.js),
// and up to 6 key-change bullets. The bullets are NOT a synthesized
// summary — they only appear when what_changed_and_why is already a real,
// itemized list, reusing its own items verbatim. When that text is plain
// prose instead, there's nothing real to bullet-ize, so the bullets are
// omitted and the paragraph stands alone.
// showIdentity defaults to true (the old commit-review flow's exact
// prior behavior) — Milestone 4's PR workspace passes false since
// PRHeader already shows repo/PR identity once, and no metric should
// have two homes.
function ExecutiveSummary({ repositoryUrl, commitHash, verdictText, changeText, reviewContext, showIdentity = true }) {
  if (!verdictText || !verdictText.trim()) return null;

  const { conclusion, why } = splitVerdict(verdictText);
  const summary = changeText ? extractSummaryBullets(changeText, 6) : null;

  const files = reviewContext ? filesWithContext(reviewContext, null) : [];
  const priorityFiles = files
    .filter((f) => fileTier(f.path, reviewContext) === REQUIRES_IMMEDIATE_REVIEW)
    .map((f) => f.path);
  const scope = reviewContext
    ? highestTier(files.map((f) => fileTier(f.path, reviewContext)))
    : null;

  return (
    <section className="executive-summary">
      {showIdentity && (
        <div className="summary-meta">
          {repositoryUrl && <span className="summary-meta-item">{repositoryUrl}</span>}
          {repositoryUrl && commitHash && <span className="summary-meta-sep" aria-hidden="true">/</span>}
          {commitHash && <code className="summary-meta-commit">{commitHash.slice(0, 7)}</code>}
        </div>
      )}

      <p className="summary-conclusion">{renderInlineMarkdown(conclusion)}</p>
      {why && <p className="summary-why">{renderInlineMarkdown(why)}</p>}

      {scope && <p className="summary-scope">Review scope: <strong>{scope}</strong></p>}

      {priorityFiles.length > 0 && (
        <div className="summary-priority-files">
          <span className="summary-priority-files-label">Primary files to inspect</span>
          <ul>
            {priorityFiles.map((path) => (
              <li key={path}><code>{path}</code></li>
            ))}
          </ul>
        </div>
      )}

      {summary && summary.bullets.length > 0 && (
        <ul className="summary-bullets">
          {summary.bullets.map((bullet, index) => (
            <li key={index}>{renderInlineMarkdown(bullet)}</li>
          ))}
          {summary.truncatedCount > 0 && (
            <li className="summary-bullets-more">
              +{summary.truncatedCount} more in File Overview
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export default ExecutiveSummary;

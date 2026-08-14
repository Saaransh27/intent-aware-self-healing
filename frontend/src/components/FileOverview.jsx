import { FileText, ExternalLink } from "lucide-react";
import { filesWithContext } from "../lib/reviewContext";
import { fileTier, whyItMatters, FILE_TIER_RULE, REQUIRES_IMMEDIATE_REVIEW, ROUTINE } from "../lib/reviewTiers";
import { claimLabel, isRiskBearingClaim } from "../lib/claimVocabulary";

const TIER_ORDER = { [REQUIRES_IMMEDIATE_REVIEW]: 0, "Standard Review": 1, [ROUTINE]: 2 };

function splitPath(path) {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return { dir: "", base: path };
  return { dir: path.slice(0, lastSlash + 1), base: path.slice(lastSlash + 1) };
}

// Answers "where should I look?" as a compact, sorted table — the real
// change_set (no more text-mining the model's prose for filenames),
// ordered by the same real priority rule shown in Review Strategy, so the
// files worth opening first are always at the top, not buried
// alphabetically. Selection state is controlled by the caller because the
// selected file also becomes context for Review Findings below.
//
// owner/repo/headSha (Milestone 4, all optional) enable a real GitHub
// link per file — the file's content at the PR's actual head commit,
// the most specific correct URL constructible client-side without
// GitHub's own (undocumented) diff-anchor hashing. Omitted entirely for
// the old commit-review flow, which has no PR concept to link to.
function FileOverview({ reviewContext, observations, selectedFile, onSelectFile, owner, repo, headSha }) {
  if (!reviewContext) return null;

  const files = filesWithContext(reviewContext, observations)
    .map((file) => ({ ...file, tier: fileTier(file.path, reviewContext) }))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  if (files.length === 0) return null;

  return (
    <section className="file-overview">
      <h2 className="section-heading">File Overview</h2>
      <p className="section-hint">{FILE_TIER_RULE}</p>
      <div className="file-table">
        <div className="file-table-header" role="row">
          <span>File</span>
          <span>Type</span>
          <span>Priority</span>
          <span>Why it matters</span>
        </div>
        {files.map((file) => {
          const isSelected = selectedFile === file.path;
          const { dir, base } = splitPath(file.path);
          const riskClaims = file.claims.filter(isRiskBearingClaim);
          const githubUrl = owner && repo && headSha
            ? `https://github.com/${owner}/${repo}/blob/${headSha}/${file.path}`
            : null;

          return (
            <div className="file-table-row-group" key={file.path}>
              <div className="file-table-row-wrap">
                <button
                  type="button"
                  className={`file-table-row${isSelected ? " file-table-row-selected" : ""}`}
                  onClick={() => onSelectFile(isSelected ? null : file.path)}
                  aria-expanded={isSelected}
                >
                  <span className="file-table-cell file-table-cell-name">
                    <FileText size={13} strokeWidth={1.75} aria-hidden="true" />
                    <code>
                      {dir && <span className="file-name-dir">{dir}</span>}
                      <span className="file-name-base">{base}</span>
                    </code>
                  </span>
                  <span className="file-table-cell file-table-cell-type">{file.changeType}</span>
                  <span className="file-table-cell file-table-cell-tier">
                    <span className={`tier-tag tier-tag-${file.tier === ROUTINE ? "routine" : file.tier === REQUIRES_IMMEDIATE_REVIEW ? "immediate" : "standard"}`}>
                      {file.tier}
                    </span>
                  </span>
                  <span className="file-table-cell file-table-cell-why">{whyItMatters(file.path, reviewContext)}</span>
                </button>
                {githubUrl && (
                  <a
                    className="file-table-github-link"
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="View file on GitHub"
                    aria-label={`View ${file.path} on GitHub`}
                  >
                    <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                )}
              </div>
              {isSelected && (
                <div className="file-table-expand">
                  {file.category && <p className="file-expand-meta">Category: {file.category}</p>}
                  {file.lineStats && (
                    <p className="file-expand-meta">
                      {file.lineStats.insertions === null
                        ? "Binary file — line counts not applicable"
                        : `+${file.lineStats.insertions} / -${file.lineStats.deletions}`}
                    </p>
                  )}
                  {riskClaims.length > 0 ? (
                    <ul className="file-claim-list">
                      {riskClaims.map((claim, index) => {
                        const label = claimLabel(claim.claim);
                        return (
                          <li key={index}>
                            <span className="file-claim-title">{label.title}</span>
                            {label.description && <span className="file-claim-desc"> — {label.description}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="file-evidence-empty">No risk-bearing signals for this file.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FileOverview;

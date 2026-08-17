import { FileText, ExternalLink } from "lucide-react";
import { filesWithContext, riskBearingFilePaths, reviewStrategyGroups } from "../lib/reviewContext";
import { whyItMatters } from "../lib/reviewTiers";
import { claimLabel, isRiskBearingClaim } from "../lib/claimVocabulary";
import {
  attributeFindingsToFiles,
  findingsForFile,
  fileSeverity,
  FILE_RISK_ROUTINE,
  SEVERITY_CRITICAL,
  SEVERITY_HIGH,
  SEVERITY_MEDIUM,
} from "../lib/reviewIntelligence";

const RISK_ORDER = { [SEVERITY_CRITICAL]: 0, [SEVERITY_HIGH]: 1, [SEVERITY_MEDIUM]: 2, Low: 3, [FILE_RISK_ROUTINE]: 4 };

function splitPath(path) {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return { dir: "", base: path };
  return { dir: path.slice(0, lastSlash + 1), base: path.slice(lastSlash + 1) };
}

// Answers "where should I look?" as a compact, sorted table — the real
// change_set (no more text-mining the model's prose for filenames),
// ordered by real risk (Part 13: Critical/High/Medium/Low/Routine,
// reconciled from BOTH the deterministic risk-bearing-claim signal and
// the real findings actually attributed to each file — see
// lib/reviewIntelligence.js's attributeFindingsToFiles/fileSeverity).
// Selection state is controlled by the caller because the selected file
// also becomes context for Review Findings below.
//
// owner/repo/headSha (Milestone 4, all optional) enable a real GitHub
// link per file — the file's content at the PR's actual head commit,
// the most specific correct URL constructible client-side without
// GitHub's own (undocumented) diff-anchor hashing. Omitted entirely for
// the old commit-review flow, which has no PR concept to link to.
function FileOverview({ reviewContext, observations, findings, selectedFile, onSelectFile, owner, repo, headSha }) {
  if (!reviewContext) return null;

  const riskBearingPaths = riskBearingFilePaths(reviewContext);
  const { routineGroups } = reviewStrategyGroups(reviewContext);
  const routinePaths = new Set(routineGroups.flatMap((g) => g.collapsed_group_files));
  const changedFilePaths = reviewContext?.commit_summary?.changed_files || [];
  const severityByPath = attributeFindingsToFiles(findings || [], changedFilePaths);

  const files = filesWithContext(reviewContext, observations)
    .map((file) => ({
      ...file,
      risk: fileSeverity(file.path, severityByPath, riskBearingPaths.has(file.path), routinePaths.has(file.path)),
    }))
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);

  if (files.length === 0) return null;

  return (
    <section id="risk-hotspots" className="file-overview">
      <h2 className="section-heading">Risk Hotspots</h2>
      <p className="section-hint">
        The files that deserve the most attention, sorted by real risk — reconciling deterministic risk-bearing
        signals with the findings actually attributed to each file, never a fabricated score.
      </p>
      <div className="file-table">
        <div className="file-table-header" role="row">
          <span>File</span>
          <span>Change</span>
          <span>Risk</span>
          <span>Why it matters</span>
        </div>
        {files.map((file) => {
          const isSelected = selectedFile === file.path;
          const { dir, base } = splitPath(file.path);
          const riskClaims = file.claims.filter(isRiskBearingClaim);
          const attributedFinding = findingsForFile(file.path, findings || [])[0] || null;
          const whyText = attributedFinding
            ? attributedFinding.whyItMatters
              ? `${attributedFinding.title} — ${attributedFinding.whyItMatters}`
              : attributedFinding.title
            : whyItMatters(file.path, reviewContext);
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
                    <span className={file.risk === FILE_RISK_ROUTINE ? "badge badge-severity-low" : `badge badge-severity-${file.risk.toLowerCase()}`}>
                      {file.risk}
                    </span>
                  </span>
                  <span className="file-table-cell file-table-cell-why">{whyText}</span>
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

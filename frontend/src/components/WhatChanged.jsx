import { filesWithContext } from "../lib/reviewContext";
import { attributeFindingsToFiles, fileSeverity, SEVERITY_LOW } from "../lib/reviewIntelligence";

// Milestone 8, Part B5: a real, deterministic walkthrough of what changed,
// grouped by directory (the simplest grouping that's actually meaningful
// for a codebase — no dependency graph, no invented "logical area" naming).
// Change type (added/modified/deleted/renamed) comes straight from the
// real change_set; risk reuses the exact same attributeFindingsToFiles/
// fileSeverity reconciliation Risk Hotspots uses, so the two sections
// never silently disagree about the same file.
function dirOf(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "(root)" : path.slice(0, idx);
}

function WhatChanged({ reviewContext, observations, findings }) {
  if (!reviewContext) return null;

  const files = filesWithContext(reviewContext, observations);
  if (files.length === 0) return null;

  const changedFilePaths = reviewContext?.commit_summary?.changed_files || [];
  const severityByPath = attributeFindingsToFiles(findings || [], changedFilePaths);

  const groups = new Map();
  for (const file of files) {
    const dir = dirOf(file.path);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }

  return (
    <section id="what-changed" className="what-changed">
      <h2 className="section-heading">What Changed</h2>
      <p className="section-hint">
        Every changed file, grouped by directory — a simple, deterministic walkthrough, not a dependency graph.
      </p>
      {[...groups.entries()].map(([dir, filesInGroup]) => (
        <div className="what-changed-group" key={dir}>
          <h3 className="what-changed-group-label">
            <code>{dir}</code>
          </h3>
          <ul className="what-changed-file-list">
            {filesInGroup.map((file) => {
              const risk = fileSeverity(file.path, severityByPath, file.isRiskBearing, false);
              const base = dir === "(root)" ? file.path : file.path.slice(dir.length + 1);
              return (
                <li key={file.path} className="what-changed-file-item">
                  <code className="what-changed-file-base">{base}</code>
                  <span className="badge badge-change-type">{file.changeType}</span>
                  {risk !== SEVERITY_LOW && (
                    <span className={`badge badge-severity-${risk.toLowerCase()}`}>{risk}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default WhatChanged;

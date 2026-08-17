import { filesWithContext } from "../lib/reviewContext";
import { attributeFindingsToFiles, findingsForFile, fileSeverity, SEVERITY_LOW } from "../lib/reviewIntelligence";

// Milestone 9 (renamed from "What Changed"): each changed file gets its
// own purpose -- the real finding actually attributed to it (via its own
// "affectedFiles" field, never a fallback to "some finding has some
// evidence somewhere"), or, when nothing was flagged about it, a plain
// fact from its real file classification (Source/Test/Documentation/
// etc, from observations.file_classification). No dependency graph, no
// invented relationship between files -- purely per-file, in the
// commit's own real changed-file order.
//
// Fix pass (flagged directly: "which files changed but not what changed
// in them"): a flagged file now shows the finding's own "explanation"
// (a full sentence written for exactly this) instead of just its
// shorter title, and every file's real +/- line count (already
// extracted, already shown in Risk Hotspots' expanded row, just not
// here) renders alongside it. A routine file with neither an attributed
// finding nor a risk-bearing claim still only gets its category label --
// there is no real per-file "what changed" narrative for those today,
// so nothing is invented to fill that gap.
const CLASSIFICATION_PURPOSE = {
  Test: "Test coverage",
  Documentation: "Documentation",
  Configuration: "Configuration",
  Dependency: "Dependency",
  Source: "Source change",
};

function purposeFor(file, topFinding) {
  if (topFinding) return topFinding.explanation || topFinding.title;
  return CLASSIFICATION_PURPOSE[file.category] || "Source change";
}

function ChangeStory({ reviewContext, observations, findings }) {
  if (!reviewContext) return null;

  const files = filesWithContext(reviewContext, observations);
  if (files.length === 0) return null;

  const changedFilePaths = reviewContext?.commit_summary?.changed_files || [];
  const severityByPath = attributeFindingsToFiles(findings || [], changedFilePaths);

  return (
    <section id="change-story" className="change-story">
      <p className="section-hint">
        What this commit does, file by file — grouped by its own real purpose, not a dependency graph.
      </p>
      <ol className="change-story-list">
        {files.map((file) => {
          const risk = fileSeverity(file.path, severityByPath, file.isRiskBearing, false);
          const topFinding = findingsForFile(file.path, findings || [])[0] || null;

          return (
            <li key={file.path} className="change-story-item">
              <p className="change-story-purpose">{purposeFor(file, topFinding)}</p>
              <p className="change-story-file">
                <code>{file.path}</code>
                <span className="badge badge-change-type">{file.changeType}</span>
                {risk !== SEVERITY_LOW && (
                  <span className={`badge badge-severity-${risk.toLowerCase()}`}>{risk}</span>
                )}
                {file.lineStats && (
                  <span className="change-story-linestats">
                    {file.lineStats.insertions === null ? (
                      "Binary file"
                    ) : (
                      <>
                        <span className="stat-additions">+{file.lineStats.insertions}</span>{" "}
                        <span className="stat-deletions">-{file.lineStats.deletions}</span>
                      </>
                    )}
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default ChangeStory;

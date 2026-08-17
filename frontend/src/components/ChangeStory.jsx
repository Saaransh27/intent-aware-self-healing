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
const CLASSIFICATION_PURPOSE = {
  Test: "Test coverage",
  Documentation: "Documentation",
  Configuration: "Configuration",
  Dependency: "Dependency",
  Source: "Source change",
};

function purposeFor(file, topFinding) {
  if (topFinding) return topFinding.title;
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
      <h2 className="section-heading">Change Story</h2>
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
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default ChangeStory;

import { useMemo, useState } from "react";
import { renderInlineMarkdown } from "../lib/textFormatting";

export const ALL = "All";

// Part B4: filters read three structured fields directly off each
// finding -- severity/confidence/category -- never the finding's own
// prose. Options are built from what's actually present in this review's
// real findings, so a filter never offers a choice with zero matches.
export function FindingsFilters({ findings, filters, onChange }) {
  const options = useMemo(() => {
    const uniq = (values) => [ALL, ...new Set(values)];
    return {
      severity: uniq(findings.map((f) => f.severity)),
      confidence: uniq(findings.map((f) => f.confidence)),
      category: uniq(findings.map((f) => f.category)),
    };
  }, [findings]);

  return (
    <div className="findings-filters" role="group" aria-label="Filter findings">
      {["severity", "confidence", "category"].map((dimension) => (
        <label key={dimension} className="findings-filter">
          <span className="findings-filter-label">{dimension}</span>
          <select
            value={filters[dimension]}
            onChange={(e) => onChange({ ...filters, [dimension]: e.target.value })}
          >
            {options[dimension].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

// Real text only, never a fabricated summary -- just the first sentence
// of the model's own explanation, since the description's job is a
// glance, not the full account (that's what expanding "Why it matters"
// etc. below is for).
function firstSentence(text) {
  if (!text) return text;
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0] : text;
}

// Which of the five possible facets this specific finding actually has
// something to show for -- a finding never gets an empty tab.
const FACET_DEFS = [
  { key: "why", label: "Why it matters", colorVar: "--color-facet-why", has: (f) => !!f.whyItMatters },
  { key: "evidence", label: "Evidence", colorVar: "--color-facet-evidence", has: (f) => f.evidence.length > 0 },
  { key: "verify", label: "To verify", colorVar: "--color-facet-verify", has: (f) => f.verificationNeeded.length > 0 },
  { key: "next", label: "Next", colorVar: "--color-facet-next", has: (f) => !!f.suggestedAction },
  { key: "files", label: "Affected files", colorVar: "--color-facet-files", has: (f) => f.affectedFiles.length > 0 },
];

// One finding card: [SEVERITY] [STATUS] [CATEGORY] / title / a one-
// sentence description, then a row of colored facet tabs -- Why it
// matters / Evidence / To verify / Next / Affected files, whichever this
// finding actually has -- with only one facet's content shown at a time.
// `openFacet` is local state, so every card on the page (Confirmed Issues
// or Open Questions, one finding or many) tracks its own independently.
// Shared by both Confirmed Issues and Open Questions, since the two
// differ only in *which* findings they show (by confidence tier), never
// in how one is rendered.
function FindingCard({ finding, selectedFile, onSelectFile, reviewContext }) {
  const [openFacet, setOpenFacet] = useState(null);
  const isRelated = !!selectedFile && finding.affectedFiles.includes(selectedFile);
  const isDimmed = !!selectedFile && !isRelated;
  const facets = FACET_DEFS.filter((def) => def.has(finding));

  return (
    <article
      className={`finding-card${isRelated ? " finding-card-related" : ""}${isDimmed ? " finding-card-dimmed" : ""}`}
    >
      <div className="finding-card-top">
        <span className={`badge badge-severity-${finding.severity.toLowerCase()}`}>{finding.severity}</span>
        <span className="badge badge-status">{finding.status}</span>
        <span className="badge badge-category">{finding.category}</span>
      </div>
      {finding.title && <h4 className="finding-title">{renderInlineMarkdown(finding.title)}</h4>}
      <p className="finding-description">{renderInlineMarkdown(firstSentence(finding.explanation))}</p>

      {facets.length > 0 && (
        <div className="finding-facet-tabs">
          {facets.map((facet) => (
            <button
              type="button"
              key={facet.key}
              className={`finding-facet-tab${openFacet === facet.key ? " finding-facet-tab-open" : ""}`}
              style={{ "--facet-color": `var(${facet.colorVar})`, "--facet-color-bg": `var(${facet.colorVar}-bg)`, "--facet-color-border": `var(${facet.colorVar}-border)` }}
              aria-expanded={openFacet === facet.key}
              onClick={() => setOpenFacet(openFacet === facet.key ? null : facet.key)}
            >
              {facet.label}
            </button>
          ))}
        </div>
      )}

      {facets.map(
        (facet) =>
          openFacet === facet.key && (
            <div
              key={facet.key}
              className="finding-facet-panel"
              style={{ "--facet-color-border": `var(${facet.colorVar}-border)` }}
            >
              {facet.key === "why" && (
                <p className="finding-facet-text">{renderInlineMarkdown(finding.whyItMatters)}</p>
              )}

              {facet.key === "evidence" && (
                <span className="finding-evidence-values">
                  {finding.evidence.map((id, i) => (
                    <code key={i} className="intent-code">{id}</code>
                  ))}
                </span>
              )}

              {facet.key === "verify" && (
                <ul className="finding-verification-list">
                  {finding.verificationNeeded.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}

              {facet.key === "next" && <p className="finding-facet-text">{finding.suggestedAction}</p>}

              {facet.key === "files" && (
                <div className="finding-evidence-refs">
                  {finding.affectedFiles.map((name) => {
                    const claimCount = reviewContext?.file_claims?.[name]?.length || 0;
                    return (
                      <button
                        type="button"
                        key={name}
                        className="finding-evidence-ref"
                        onClick={() => onSelectFile(selectedFile === name ? null : name)}
                      >
                        {name}
                        {claimCount > 0 && <span className="finding-evidence-ref-count">{claimCount}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )
      )}
    </article>
  );
}

export default FindingCard;

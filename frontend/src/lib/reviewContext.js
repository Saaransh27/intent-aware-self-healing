// Pure derivation helpers over the real review_context/observations shapes
// (src/api/models.py ReviewContext/Observations) — every function here
// reshapes already-computed, deterministic backend data. Nothing here
// invents a fact; it only groups/filters/counts what's real.
import { isRiskBearingClaim } from "./claimVocabulary";

// Real per-file change type — added/modified/deleted/renamed, straight
// from the change_set's own lists (never inferred).
function changeTypeForFile(path, commitSummary) {
  if (!commitSummary) return "modified";
  if (commitSummary.added_files?.includes(path)) return "added";
  if (commitSummary.deleted_files?.includes(path)) return "deleted";
  if (commitSummary.renamed_files?.some((r) => r.path === path)) return "renamed";
  return "modified";
}

// Every changed file, cross-referenced with its real category, change
// type, line-diff stats, and claims. This replaces the old prose-mining
// heuristic entirely — the file list is always accurate now, since it
// comes from git, not from the model's text.
export function filesWithContext(reviewContext, observations) {
  const files = reviewContext?.commit_summary?.changed_files || [];
  const classification = observations?.file_classification || {};
  const fileClaims = reviewContext?.file_claims || {};
  const diffStatsFiles = observations?.diff_stats?.files || {};

  return files.map((path) => {
    const claims = fileClaims[path] || [];
    return {
      path,
      category: classification[path] || null,
      changeType: changeTypeForFile(path, reviewContext?.commit_summary),
      lineStats: diffStatsFiles[path] || null,
      claims,
      isRiskBearing: claims.some(isRiskBearingClaim),
    };
  });
}

// The set of file paths carrying at least one risk-bearing claim — reuses
// the backend's own definition (see claimVocabulary.js) so this never
// disagrees with the coverage ledger's own notion of "risk-bearing."
export function riskBearingFilePaths(reviewContext) {
  const fileClaims = reviewContext?.file_claims || {};
  const result = new Set();
  for (const [path, claims] of Object.entries(fileClaims)) {
    if (claims.some(isRiskBearingClaim)) result.add(path);
  }
  return result;
}

// Every gap, flattened into one list with its file context (or null for a
// commit-level gap) attached — a gap is literally "something the system
// could not determine," which is the most honest possible answer to
// "what do I need to verify myself."
export function flatGaps(reviewContext) {
  const gaps = reviewContext?.gaps || { commit: [], files: {} };
  const commitGaps = (gaps.commit || []).map((g) => ({ ...g, filePath: null }));
  const fileGaps = Object.entries(gaps.files || {}).flatMap(([path, entries]) =>
    entries.map((g) => ({ ...g, filePath: path }))
  );
  return [...commitGaps, ...fileGaps];
}


// The real, already-computed "routine vs needs attention" split — this is
// exactly what the coverage ledger was built for (a collapsed file and a
// file no claim happened to touch are otherwise indistinguishable).
export function reviewStrategyGroups(reviewContext) {
  const allFiles = reviewContext?.commit_summary?.changed_files || [];
  const ledger = reviewContext?.coverage_ledger || [];

  const routineFiles = new Set(ledger.flatMap((entry) => entry.collapsed_group_files));
  const needsAttention = allFiles.filter((path) => !routineFiles.has(path));

  return { routineGroups: ledger, needsAttention };
}

// Snapshot counts for "how much is there to review" — real counts, never a
// time estimate (there is no timing signal anywhere in this system).
export function snapshotCounts(reviewContext, observations) {
  const totalFiles = reviewContext?.commit_summary?.changed_files?.length ?? 0;
  const riskBearingCount = riskBearingFilePaths(reviewContext).size;
  const { routineGroups } = reviewStrategyGroups(reviewContext);
  const routineCount = routineGroups.reduce((sum, entry) => sum + entry.collapsed_count, 0);
  const gapCount = flatGaps(reviewContext).length;
  const stats = observations?.change_statistics;

  return { totalFiles, riskBearingCount, routineCount, gapCount, stats };
}

// --- Aggregation: replace repeated per-file facts with real counts -------
//
// The backend produces the SAME gap/claim for many files in an ordinary
// commit (e.g. every non-Python file gets "cannot_assess_contract"). That
// is real data, but listing it once per file is noise, not signal — these
// functions group it into the counts a reviewer actually wants: "6 files:
// <reason>", not the same line repeated 6 times.

// Gaps grouped by reason, each with the real count and file list behind
// it — e.g. "6 files: contract stability couldn't be assessed."
export function gapsByReason(reviewContext) {
  const grouped = new Map();
  for (const gap of flatGaps(reviewContext)) {
    if (!grouped.has(gap.reason)) grouped.set(gap.reason, []);
    grouped.get(gap.reason).push(gap.filePath);
  }
  return [...grouped.entries()].map(([reason, filePaths]) => ({
    reason,
    count: filePaths.length,
    filePaths: filePaths.filter(Boolean),
  }));
}

// How many distinct files have at least one gap at all — "N files require
// manual validation," not a per-reason breakdown.
export function fileCountWithAnyGap(reviewContext) {
  const paths = new Set(flatGaps(reviewContext).map((g) => g.filePath).filter(Boolean));
  return paths.size;
}

// What fraction of changed files carry a given claim id — e.g. to decide
// whether "no historical coupling" is worth one aggregate line ("detected
// for N of M files") instead of repeating it per file.
export function claimPrevalence(reviewContext, claimId) {
  const fileClaims = reviewContext?.file_claims || {};
  const totalFiles = reviewContext?.commit_summary?.changed_files?.length || 0;
  const matchingFiles = Object.values(fileClaims).filter((claims) =>
    claims.some((c) => c.claim === claimId)
  ).length;
  return { matchingFiles, totalFiles };
}

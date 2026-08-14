const STORAGE_KEY = "pr-review:selected-repos";

// Milestone 7A: distinguishes "the user has never confirmed a selection"
// (localStorage key absent -- the onboarding case) from "the user
// confirmed an empty selection" (a saved empty array -- not onboarding,
// just nothing chosen). `full_name` (owner/name) is the stable
// identifier -- RepositorySummary has no numeric GitHub id field.
export function readStoredSelection() {
  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { hasSelection: false, fullNames: [] };
  }
  if (raw === null) {
    return { hasSelection: false, fullNames: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { hasSelection: false, fullNames: [] };
    }
    return { hasSelection: true, fullNames: parsed.filter((v) => typeof v === "string") };
  } catch {
    return { hasSelection: false, fullNames: [] };
  }
}

export function writeStoredSelection(fullNames) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fullNames));
  } catch {
    // Storage can be unavailable (private browsing, quota) -- selection
    // still works for the current session, it just won't survive a reload.
  }
}

// Requirement 8: repositories no longer returned by GET /github/repos are
// dropped from the saved selection; repositories that are newly present
// are never auto-selected. Reconciliation only ever removes, never adds.
export function reconcileSelection(fullNames, availableRepositories) {
  const availableSet = new Set(availableRepositories.map((r) => r.full_name));
  return fullNames.filter((name) => availableSet.has(name));
}

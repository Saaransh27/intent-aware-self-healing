// Plain-language translations for every claim id and gap reason the
// backend's deterministic reasoning layer can produce (see
// src/reasoning/modules/*.py and src/response_validation/response_validator.py's
// _CLAIM_IDS allowlist — 34 claims, 9 gap reasons, verified against the real
// source code, not guessed).
//
// This table exists because of a real, enforced project rule: raw ids like
// "shape.wide_change" must NEVER be shown to a user (the backend's own
// response validator rejects the model's prose for doing exactly that).
// The frontend is held to the same discipline — translate, never display
// the raw string. If a new claim/gap id is ever added on the backend
// without a matching entry here, unknownClaimLabel()/unknownGapLabel()
// return a safe, honest fallback instead of leaking the id.

export const CLAIM_LABELS = {
  "shape.wide_change": {
    title: "Wide-reaching change",
    description: "This commit touches more than 10 files.",
  },
  "shape.narrow_change": {
    title: "Narrow change",
    description: "This commit touches a small, contained set of files.",
  },
  "shape.heterogeneous_categories": {
    title: "Mixed change types",
    description: "This commit spans multiple kinds of files (e.g. source, docs, config) rather than one uniform type.",
  },
  "shape.homogeneous_categories": {
    title: "Uniform change type",
    description: "Every changed file falls into the same category.",
  },
  "shape.touches_tests": {
    title: "Touches tests",
    description: "This commit modifies test files.",
  },
  "shape.touches_documentation": {
    title: "Touches documentation",
    description: "This commit modifies documentation files.",
  },
  "shape.touches_dependencies": {
    title: "Touches dependencies",
    description: "This commit modifies dependency or package files.",
  },
  "shape.touches_build_files": {
    title: "Touches build files",
    description: "This commit modifies build configuration.",
  },
  "shape.touches_ci": {
    title: "Touches CI configuration",
    description: "This commit modifies CI/CD pipeline files.",
  },
  "shape.touches_config": {
    title: "Touches configuration",
    description: "This commit modifies configuration files.",
  },
  "shape.low_extraction_confidence": {
    title: "Some files couldn't be classified",
    description: "One or more changed files have an unrecognized type, so this analysis may be incomplete.",
  },
  "history.first_appearance": {
    title: "New file",
    description: "This file has no prior history in the repository.",
  },
  "history.hot_file": {
    title: "Frequently changed file",
    description: "This file has been modified in 50 or more commits.",
  },
  "history.long_dormant_reactivated": {
    title: "Dormant file reactivated",
    description: "This file hadn't been touched in 6+ months before this commit.",
  },
  "history.rapid_iteration": {
    title: "Rapid iteration",
    description: "This file was also changed within the last hour, suggesting a quick follow-up edit.",
  },
  "history.high_recent_churn": {
    title: "High recent churn",
    description: "This file has been changed 5 or more times in the last 30 days.",
  },
  "history.first_author_touch": {
    title: "First touch by this author",
    description: "This is the first commit by this author to touch this file.",
  },
  "reach.high_historical_coupling": {
    title: "Strongly coupled to another file",
    description: "This file has historically changed together with another file in 10+ prior commits.",
  },
  "reach.no_historical_coupling": {
    title: "No historical coupling",
    description: "This file has no prior pattern of changing alongside other files.",
  },
  "reach.expected_co_change_partner_missing": {
    title: "Usual co-change partner missing",
    description: "A file that normally changes alongside this one wasn't touched in this commit.",
  },
  "reach.large_neighborhood": {
    title: "Large neighborhood",
    description: "This file has more than 15 sibling files in the same directory.",
  },
  "reach.isolated_module": {
    title: "Isolated module",
    description: "This file has no sibling files in its directory.",
  },
  "reach.corroborated_wide_reach": {
    title: "Corroborated wide reach",
    description: "Historical coupling and a large neighborhood both point to this file having broad reach.",
  },
  "verification.test_files_changed": {
    title: "Test files changed",
    description: "This commit includes changes to test files.",
  },
  "verification.no_test_files_changed": {
    title: "No test files changed",
    description: "This commit does not modify any test files.",
  },
  "verification.public_change_without_tests": {
    title: "Public API changed without tests",
    description: "A public function or method's signature changed, but no test files were updated.",
  },
  "contract.public_signature_changed": {
    title: "Public signature changed",
    description: "A public function or method's signature was changed.",
  },
  "contract.public_symbol_removed": {
    title: "Public symbol removed",
    description: "A public function, class, or method was removed.",
  },
  "contract.decorator_changed": {
    title: "Decorator changed",
    description: "A function or method's decorators were changed.",
  },
  "interaction.callees_changed": {
    title: "Function calls changed",
    description: "The set of functions or methods this code calls was changed.",
  },
  "error_handling.exceptions_raised_changed": {
    title: "Exceptions raised changed",
    description: "The exceptions this code raises were changed.",
  },
  "error_handling.exceptions_caught_changed": {
    title: "Exceptions caught changed",
    description: "The exceptions this code catches were changed.",
  },
  "resource_management.context_managers_changed": {
    title: "Resource management changed",
    description: "The resource-handling (`with`-statement) logic in this code was changed.",
  },
  "documentation.deprecation_marker_added": {
    title: "Deprecation marker added",
    description: "A deprecation notice was added to this code.",
  },
  "structure.internal_symbol_added": {
    title: "Internal symbol added",
    description: "A new private or internal function/method was added alongside another change.",
  },
};

export const GAP_LABELS = {
  cannot_assess_size: {
    title: "Commit size couldn't be assessed",
    description: "The overall change size couldn't be determined.",
  },
  cannot_assess_categories: {
    title: "Change categories couldn't be assessed",
    description: "Which kinds of files were touched (tests, docs, config, etc.) couldn't be determined.",
  },
  cannot_assess_extraction_confidence: {
    title: "Extraction confidence couldn't be assessed",
    description: "Whether the file list for this commit is complete couldn't be verified.",
  },
  cannot_assess_history: {
    title: "History couldn't be assessed",
    description: "This file's commit history couldn't be retrieved.",
  },
  cannot_assess_dormancy: {
    title: "Dormancy couldn't be assessed",
    description: "Whether this file was recently active couldn't be determined.",
  },
  cannot_assess_coupling: {
    title: "Coupling couldn't be assessed",
    description: "This file's historical co-change pattern couldn't be determined.",
  },
  cannot_assess_neighborhood: {
    title: "Neighborhood couldn't be assessed",
    description: "This file's sibling files couldn't be determined.",
  },
  cannot_classify_file: {
    title: "File type couldn't be classified",
    description: "This file's category (source, test, docs, etc.) couldn't be determined.",
  },
  cannot_assess_contract: {
    title: "Contract stability couldn't be assessed",
    description: "This file isn't Python, or couldn't be parsed, so signature/contract changes can't be checked.",
  },
  cannot_assess_body_evidence: {
    title: "Code-body evidence couldn't be assessed",
    description: "This file isn't Python, or couldn't be parsed, so internal behavior changes can't be checked.",
  },
};

// Milestone 5: NOT the same set as the backend's coverage ledger anymore
// (src/review/context_builder.py's RISK_BEARING_MODULES still treats the
// whole `reach` module as risk-bearing — untouched here, out of this
// milestone's frontend-only scope, flagged separately in
// docs/MILESTONES.md). Real evaluation against 8 diverse real PRs found
// treating all of `reach` as risk-bearing meant 87% of files across the
// sample (34/39) were tiered "Requires Immediate Review" — including the
// single file in a one-line documentation typo fix — because
// reach.large_neighborhood/corroborated_wide_reach/high_historical_coupling
// are common structural facts (any file with >15 siblings, or any file
// with an active history, triggers them), not risk signals. Only
// contract_stability (a real external-contract change) and specific,
// individually-justified claims stay risk-bearing; reach contributes only
// its one genuinely surprising claim (an expected co-change partner that's
// conspicuously absent), the same one-claim-at-a-time discipline already
// applied to history/verification below.
const RISK_BEARING_MODULES = new Set(["contract_stability"]);
const RISK_BEARING_CLAIM_IDS = new Set([
  "verification.public_change_without_tests",
  "history.first_author_touch",
  "history.hot_file",
  "history.high_recent_curn",
  "reach.expected_co_change_partner_missing",
]);

export function isRiskBearingClaim(claimEntry) {
  return RISK_BEARING_MODULES.has(claimEntry.module) || RISK_BEARING_CLAIM_IDS.has(claimEntry.claim);
}

export function claimLabel(claimId) {
  return CLAIM_LABELS[claimId] || { title: "Additional signal detected", description: "" };
}

export function gapLabel(reasonId) {
  return GAP_LABELS[reasonId] || { title: "Additional limitation noted", description: "" };
}

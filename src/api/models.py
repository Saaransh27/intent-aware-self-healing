from typing import Dict, List, Literal, Optional

from pydantic import BaseModel


class ReviewRequest(BaseModel):
    repository_url: str
    commit_hash: Optional[str] = None


class ReviewSections(BaseModel):
    verdict: str
    what_changed_and_why: str
    what_deserves_attention_ranked: str
    open_questions: str
    minor_notes: str


class ReviewResult(BaseModel):
    raw: Optional[str]
    parsed: bool
    sections: Optional[ReviewSections] = None


class ValidationFinding(BaseModel):
    rule: str
    severity: str
    message: str
    location: Optional[int] = None


class ValidationResult(BaseModel):
    outcome: str
    findings: List[ValidationFinding]


# --- Structured findings (Milestone 8, Part A) ------------------------------
#
# Distinct from `findings: list` on ReviewResponse below, which is the
# Review Engine's own ADR-016 category-1 catalogue (a deliberately deferred,
# always-empty, separate mechanism — untouched here). A StructuredFinding is
# parsed from the model's own section-3 JSON output (see
# src/prompt/prompt_builder.py's OUTPUT FORMAT and
# src/response_validation/structured_findings.py), never fabricated by this
# project — every field the model didn't provide, or provided in a form that
# doesn't match this contract, causes the whole finding to be rejected rather
# than filled in with a guess.

class StructuredFinding(BaseModel):
    title: str
    category: Literal[
        "Bug", "Behavioral regression", "Test failure", "Missing test coverage",
        "Security", "API/contract mismatch", "Dependency/compatibility",
        "Data correctness", "Logic inconsistency", "Configuration",
        "Maintainability", "Other",
    ]
    severity: Literal["Critical", "High", "Medium", "Low", "Informational"]
    confidence: Literal["Confirmed", "Strong evidence", "Needs verification"]
    evidenceStrength: Literal["Direct", "Strong", "Indirect", "None"]
    status: Literal[
        "Defect", "Regression risk", "Test gap", "Security risk",
        "Maintainability risk", "Intent mismatch", "Informational",
    ]
    proofType: Literal[
        "test_failure", "direct_code_contradiction", "direct_data_mismatch",
        "behavioral_regression", "missing_test", "dependency_impact",
        "security_exposure", "inferred_risk", "informational",
    ]
    explanation: str
    whyItMatters: str
    evidence: List[str]
    affectedFiles: List[str]
    affectedSymbols: List[str]
    verificationNeeded: List[str]
    suggestedAction: str


class StructuredFindingsResult(BaseModel):
    state: Literal["ok", "reduced", "unavailable"]
    findings: List[StructuredFinding]
    total_reported: int
    rejected_count: int
    parse_error: Optional[str] = None


# --- Review context: the deterministic claim/gap ledger --------------------
#
# Everything below is real, rule-based data computed BEFORE the LLM ever
# runs (it's what gets turned into the prompt) — none of it is generated or
# inferred by the model. `claim`/`gap` fields mirror src/reasoning/contracts.py
# exactly. `claim` is one of the 34 ids in
# src/response_validation/response_validator.py's _CLAIM_IDS allowlist, and
# `reason` is one of the 9 gap ids from src/reasoning/modules/*.py — see
# that allowlist for the full set. Per ADR-013, callers must NEVER display
# these raw id strings to a user; they exist so a frontend can look them up
# in its own plain-language translation table, the same discipline the
# model itself is held to for its prose.

class ClaimScope(BaseModel):
    level: str
    file_path: Optional[str] = None
    qualified_name: Optional[str] = None


class Claim(BaseModel):
    claim: str
    scope: ClaimScope
    confidence: str
    basis: List[str]
    module: str


class Gap(BaseModel):
    reason: str
    scope: ClaimScope
    missing: List[str]
    module: str


class GapsBundle(BaseModel):
    commit: List[Gap]
    files: Dict[str, List[Gap]]


class RenamedFile(BaseModel):
    old_path: str
    path: str


class CommitSummary(BaseModel):
    message: str
    changed_files: List[str]
    added_files: List[str]
    deleted_files: List[str]
    modified_files: List[str]
    renamed_files: List[RenamedFile]


class JustifyingClaim(BaseModel):
    claim: str
    scope: ClaimScope


class CoverageLedgerEntry(BaseModel):
    collapsed_group_files: List[str]
    collapsed_count: int
    representative_file: Optional[str] = None
    justifying_claims: List[JustifyingClaim]


class ReviewContext(BaseModel):
    commit_summary: CommitSummary
    commit_claims: List[Claim]
    file_claims: Dict[str, List[Claim]]
    gaps: GapsBundle
    coverage_ledger: List[CoverageLedgerEntry]


# --- Observations: commit-level facts, no claims/inference involved --------

class ChangeStatistics(BaseModel):
    files_added: int
    files_deleted: int
    files_modified: int
    files_renamed: int


class ChangeCategories(BaseModel):
    touches_tests: bool
    touches_documentation: bool
    touches_dependencies: bool
    touches_build_files: bool
    touches_ci: bool
    touches_config: bool


class ExtractionConfidence(BaseModel):
    unknown_file_count: int
    unsupported_extensions: List[str]
    skipped_binary_file_count: int


class TouchedDirectories(BaseModel):
    source: List[str]
    tests: List[str]
    documentation: List[str]
    examples: List[str]
    scripts: List[str]


class FileDiffStat(BaseModel):
    insertions: Optional[int] = None
    deletions: Optional[int] = None


class DiffStats(BaseModel):
    total_insertions: int
    total_deletions: int
    files: Dict[str, FileDiffStat]


class Observations(BaseModel):
    touched_directories: TouchedDirectories
    file_classification: Dict[str, str]
    change_statistics: ChangeStatistics
    change_categories: ChangeCategories
    extraction_confidence: ExtractionConfidence
    diff_stats: DiffStats


class ReviewResponse(BaseModel):
    repository_url: str
    commit_hash: str
    outcome: str
    adapter_state: str
    review: ReviewResult
    findings: list
    validation: Optional[ValidationResult] = None
    structured_findings: Optional[StructuredFindingsResult] = None
    review_context: Optional[ReviewContext] = None
    observations: Optional[Observations] = None


# --- PR review ---------------------------------------------------------
#
# PRReviewResponse extends ReviewResponse rather than duplicating it —
# every field a commit review returns, a PR review also returns (with
# commit_hash set to the PR's head_sha), plus exactly the PR identity
# fields needed to know which two points were diffed.

class PRReviewRequest(BaseModel):
    repository_url: str
    pr_number: int


class PRReviewResponse(ReviewResponse):
    pr_number: int
    base_sha: str
    head_sha: str


# --- GitHub auth + discovery (Milestone 2) ------------------------------
#
# All fields below are real GitHub API fields, verbatim -- no derived
# score, priority, or confidence of any kind. `draft`/`private` are real
# booleans GitHub itself reports, not an inference this project makes.

class GitHubUser(BaseModel):
    login: str
    name: Optional[str] = None
    avatar_url: str


class RepositorySummary(BaseModel):
    full_name: str
    name: str
    owner: str
    private: bool
    default_branch: str
    html_url: str
    updated_at: str


class PullRequestSummary(BaseModel):
    number: int
    title: str
    author_login: str
    created_at: str
    updated_at: str
    head_ref: str
    base_ref: str
    html_url: str
    draft: bool
    # Milestone 5: present on both the list and single-PR endpoints
    # (unlike additions/deletions/changed_files below) -- "open" or
    # "closed" (GitHub does not distinguish "merged" here; merged_at
    # being set is what actually means merged, and this project's
    # discovery-only PullRequestSummary/Detail don't fetch it). Real
    # bug fixed this milestone: PRHeader previously had no field at all
    # to distinguish a closed/merged PR from an open one and defaulted
    # to showing "Open" for anything not explicitly draft.
    state: str
    # Milestone 7: present on both the list and single-PR endpoints (like
    # state, unlike additions/deletions/changed_files below) -- the PR's
    # current head commit, so a client can tell whether a cached review
    # (which recorded the head_sha it reviewed) is now stale.
    head_sha: str
    # Milestone 4: real GitHub fields, but only present on the single-PR
    # endpoint -- GitHub's list endpoint never returns them, so every PR
    # in a list response has these as None. Never coerced to 0; None here
    # means "not available from this call," not "zero."
    additions: Optional[int] = None
    deletions: Optional[int] = None
    changed_files: Optional[int] = None


class PullRequestDetail(PullRequestSummary):
    body: str

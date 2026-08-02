from typing import List, Optional

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


class ReviewResponse(BaseModel):
    repository_url: str
    commit_hash: str
    outcome: str
    adapter_state: str
    review: ReviewResult
    findings: list
    validation: Optional[ValidationResult] = None

import concurrent.futures

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.api.models import (
    ReviewRequest,
    ReviewResponse,
    ReviewResult,
    ReviewSections,
    ValidationFinding,
    ValidationResult,
)
from src.api.response_parser import parse_review_sections
from src.pipeline.shakti_execute import call_shakti
from src.pipeline.orchestrator import CommitResolutionError, run_pipeline_for_commit
from src.response_validation.response_validator import validate_response

REQUEST_TIMEOUT_SECONDS = 90

# Milestone 14B decided that a response missing one or more of the five
# sections is a recoverable presentation/structural condition, not an
# error — the API still returns 200 with `parsed: false`. These two rules
# are exactly the conditions that already produce that state, so their
# presence must not override that earlier decision.
_PARSEABILITY_RELATED_RULES = frozenset({"missing_section", "unclosed_code_fence"})

# Milestone 14B never addressed internal-terminology leaks; these are
# genuine response-contract violations the Response Validation Layer
# introduces as new guarantees, and are rejected outright.
_CONTRACT_VIOLATION_RULES = frozenset({
    "literal_claim_id_leak",
    "reserved_confidence_tier_self_tagging",
})


def _has_contract_violation(findings):
    return any(finding["rule"] in _CONTRACT_VIOLATION_RULES for finding in findings)


def _validation_result_or_none(validation):
    if not validation["findings"]:
        return None
    return ValidationResult(
        outcome=validation["outcome"],
        findings=[ValidationFinding(**finding) for finding in validation["findings"]],
    )


app = FastAPI(title="intent-aware-self-healing review API")

# Permits the Milestone 16A playground (a static file opened directly in a
# browser, not served from this app) to call /review — an internal tool with
# no auth, so an open CORS policy is not a meaningful security boundary here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)


def get_pipeline_runner():
    """FastAPI dependency seam: the real endpoint always reviews against the
    real Shakti Studio (GPT-OSS-120B) call; tests override this with a stub
    via app.dependency_overrides, never touching the network."""
    def runner(repository_url, commit_hash):
        return run_pipeline_for_commit(repository_url, commit_hash, execute=call_shakti)
    return runner


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/review", response_model=ReviewResponse)
def review(request: ReviewRequest, runner=Depends(get_pipeline_runner)):
    future = _executor.submit(runner, request.repository_url, request.commit_hash)
    try:
        result = future.result(timeout=REQUEST_TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="pipeline execution did not complete within the request timeout",
        )
    except CommitResolutionError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    adapter_result = result["adapter_result"]
    review_result = result["review_result"]
    adapter_state = adapter_result["state"]

    if adapter_state == "adapter_boundary_failure":
        raise HTTPException(status_code=500, detail="the pipeline produced an invalid prompt")
    if adapter_state == "execution_boundary_failure":
        raise HTTPException(status_code=502, detail="the model did not produce a usable response")

    raw_response = review_result["response"]
    sections = parse_review_sections(raw_response)
    validation = validate_response(raw_response)

    # Category B only: literal-terminology leaks are genuine contract
    # violations Milestone 14B never addressed. Category A (missing_section,
    # unclosed_code_fence — _PARSEABILITY_RELATED_RULES) is deliberately
    # never rejected here: it's exactly the condition `parsed: false`
    # already represents, and rejecting it would silently override that
    # earlier, deliberate decision rather than add a new guarantee.
    if _has_contract_violation(validation["findings"]):
        raise HTTPException(
            status_code=502,
            detail="the model's response violated the response contract",
        )

    return ReviewResponse(
        repository_url=result["repository_url"],
        commit_hash=result["commit_hash"],
        outcome=review_result["outcome"],
        adapter_state=adapter_state,
        review=ReviewResult(
            raw=raw_response,
            parsed=sections is not None,
            sections=ReviewSections(**sections) if sections is not None else None,
        ),
        findings=review_result["findings"],
        validation=_validation_result_or_none(validation),
    )

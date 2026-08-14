import concurrent.futures
import os
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from src.api.models import (
    GitHubUser,
    Observations,
    PRReviewRequest,
    PRReviewResponse,
    PullRequestDetail,
    PullRequestSummary,
    RepositorySummary,
    ReviewContext,
    ReviewRequest,
    ReviewResponse,
    ReviewResult,
    ReviewSections,
    ValidationFinding,
    ValidationResult,
)
from src.api.response_parser import parse_review_sections
from src.api.session_store import (
    SESSION_COOKIE_NAME,
    create_session,
    delete_session,
    get_current_access_token,
    get_optional_access_token,
)
from src.github.client import (
    GitHubApiError,
    get_authenticated_user,
    get_pull_request,
    get_pull_request_refs,
    list_open_pull_requests,
    list_repositories,
)
from src.github.oauth import OAuthError, build_authorize_url, exchange_code_for_token
from src.github.pr_resolver import resolve_pull_request
from src.pipeline.shakti_execute import call_shakti
from src.pipeline.orchestrator import CommitResolutionError, run_pipeline_for_commit, run_pipeline_for_pr
from src.response_validation.response_validator import sanitize_response, validate_response

REQUEST_TIMEOUT_SECONDS = 90

# A response's ERROR-severity findings (missing_section, unclosed_code_fence,
# literal_claim_id_leak, reserved_confidence_tier_self_tagging) never cause
# this endpoint to reject the response outright — Milestone 14B already
# decided a structurally incomplete response degrades to `parsed: false`
# with a 200, and internal-terminology leaks are the same kind of
# recoverable presentation defect, not a reason to discard an otherwise
# useful review. sanitize_response() removes the one leak pattern that's
# mechanically safe to strip before validation ever sees it; the rest are
# left visible and simply reported in `validation.findings` for anyone
# inspecting the response, exactly like every other WARNING-level finding.


def _validation_result_or_none(validation):
    if not validation["findings"]:
        return None
    return ValidationResult(
        outcome=validation["outcome"],
        findings=[ValidationFinding(**finding) for finding in validation["findings"]],
    )


def _review_context_model(review_context):
    # Deliberately excludes symbol_claims and evidence_units — the 10
    # frontend sections this powers only need commit- and file-level
    # claims, gaps, and the coverage ledger. Narrower now, easy to widen
    # later if a symbol-level use case shows up.
    return ReviewContext(
        commit_summary=review_context["commit_summary"],
        commit_claims=review_context["commit_claims"],
        file_claims=review_context["file_claims"],
        gaps=review_context["gaps"],
        coverage_ledger=review_context["coverage_ledger"],
    )


app = FastAPI(title="intent-aware-self-healing review API")

# Milestone 2: session cookies require a specific origin allowlist plus
# allow_credentials=True -- browsers reject a wildcard origin ("*") on any
# credentialed (cookie-bearing) request, which the new /github/* routes
# below need. FRONTEND_URL covers the React app (local dev or deployed);
# the Vercel URL is the currently deployed playground/. The one shared-
# infrastructure change this milestone requires -- neither /review nor
# /review/pr's own logic is touched.
#
# Milestone 5: "null" was removed from this list. It was added to cover a
# file://-opened static page, but a browser also sends Origin: "null" for
# a sandboxed iframe with no allow-same-origin -- allowlisting it let an
# attacker-controlled page make a credentialed, *readable* cross-origin
# request (CORS governs whether the response is readable, not whether a
# cookie-bearing request is sent or executed at all -- SameSite=None on
# the session cookie already means the request itself always goes through
# regardless of this list). No current legitimate origin actually needs
# "null"; removing it closes the one concrete part of this gap. The
# broader "no CSRF token for state-changing endpoints" gap remains --
# classified as acceptable-for-V1 in docs/MILESTONES.md, not fixed here.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
_ALLOWED_ORIGINS = [FRONTEND_URL, "https://intent-aware-self-healing.vercel.app"]
_SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "true").lower() != "false"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
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

    raw_response = sanitize_response(review_result["response"])
    sections = parse_review_sections(raw_response)
    validation = validate_response(raw_response)

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
        review_context=_review_context_model(result["review_context"]),
        observations=Observations(**result["observations"]),
    )


# --- PR review (Milestone 1) -------------------------------------------
#
# A separate endpoint, not a parameter on POST /review — the existing
# commit flow above is intentionally untouched. Duplicates the
# sanitize/parse/validate/response-construction block from review() above
# rather than extracting a shared helper, so review()'s own code stays
# byte-for-byte unmodified.


def get_pr_pipeline_runner(access_token: str = Depends(get_optional_access_token)):
    """FastAPI dependency seam for PR review, mirroring get_pipeline_runner
    above. Milestone 3A: authentication is optional here, not required —
    a public repo must keep working exactly as before with no session at
    all (get_optional_access_token returns None for that case, and
    everything below takes the exact Milestone 1 branch). When a real
    session is present, the token both selects an authenticated resolver
    (able to see a private repo's PR at all) and is threaded into
    run_pipeline_for_pr's own git operations (able to actually clone/fetch
    it) — the two are separate concrete needs, not one call covering both.
    Tests override this whole dependency via app.dependency_overrides,
    touching neither network call, same as before."""
    def runner(repository_url, pr_number):
        if access_token:
            resolve_pr = lambda repo_url, num: get_pull_request_refs(access_token, repo_url, num)
        else:
            resolve_pr = resolve_pull_request
        return run_pipeline_for_pr(
            repository_url, pr_number, execute=call_shakti, resolve_pr=resolve_pr, access_token=access_token
        )
    return runner


@app.post("/review/pr", response_model=PRReviewResponse)
def review_pr(request: PRReviewRequest, runner=Depends(get_pr_pipeline_runner)):
    future = _executor.submit(runner, request.repository_url, request.pr_number)
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

    raw_response = sanitize_response(review_result["response"])
    sections = parse_review_sections(raw_response)
    validation = validate_response(raw_response)

    return PRReviewResponse(
        repository_url=result["repository_url"],
        commit_hash=result["head_sha"],
        pr_number=result["pr_number"],
        base_sha=result["base_sha"],
        head_sha=result["head_sha"],
        outcome=review_result["outcome"],
        adapter_state=adapter_state,
        review=ReviewResult(
            raw=raw_response,
            parsed=sections is not None,
            sections=ReviewSections(**sections) if sections is not None else None,
        ),
        findings=review_result["findings"],
        validation=_validation_result_or_none(validation),
        review_context=_review_context_model(result["review_context"]),
        observations=Observations(**result["observations"]),
    )


# --- GitHub auth + discovery (Milestone 2) ------------------------------
#
# A separate concern from the review endpoints above: nothing here calls
# run_pipeline_for_commit/run_pipeline_for_pr, and neither of those
# functions (nor the two endpoints above) is touched by anything below.
# A GitHub access token is never returned to the frontend -- only an
# opaque session_id cookie is; the token itself lives only in
# src/api/session_store.py's in-memory store.

_OAUTH_STATE_COOKIE_NAME = "oauth_state"


@app.get("/github/login")
def github_login():
    state = secrets.token_urlsafe(24)
    try:
        authorize_url = build_authorize_url(state)
    except OAuthError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    response = RedirectResponse(authorize_url)
    # samesite="lax" is correct (not "none") -- this cookie is only ever
    # read back on the top-level redirect GitHub sends the browser to
    # /github/callback, and Lax cookies ARE sent on a top-level GET
    # navigation even when it originates cross-site.
    response.set_cookie(
        _OAUTH_STATE_COOKIE_NAME, state,
        httponly=True, secure=_SESSION_COOKIE_SECURE, samesite="lax", max_age=600,
    )
    return response


@app.get("/github/callback")
def github_callback(code: str, state: str, request: Request):
    expected_state = request.cookies.get(_OAUTH_STATE_COOKIE_NAME)
    if not expected_state or state != expected_state:
        raise HTTPException(status_code=400, detail="invalid or missing OAuth state")

    try:
        access_token = exchange_code_for_token(code)
    except OAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    session_id = create_session(access_token)
    response = RedirectResponse(FRONTEND_URL)
    response.delete_cookie(_OAUTH_STATE_COOKIE_NAME)
    # samesite="none" (+ secure) is required here -- unlike oauth_state
    # above, this cookie must also be sent on cross-origin fetch() calls
    # the frontend makes to this API, not just top-level navigations.
    response.set_cookie(
        SESSION_COOKIE_NAME, session_id,
        httponly=True, secure=_SESSION_COOKIE_SECURE, samesite="none", max_age=60 * 60 * 24 * 7,
    )
    return response


@app.post("/github/logout")
def github_logout(request: Request):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id:
        delete_session(session_id)
    response = JSONResponse({"status": "logged_out"})
    response.delete_cookie(SESSION_COOKIE_NAME)
    return response


def _raise_for_github_api_error(exc):
    raise HTTPException(status_code=exc.status_code or 502, detail=str(exc))


@app.get("/github/me", response_model=GitHubUser)
def github_me(access_token: str = Depends(get_current_access_token)):
    try:
        return GitHubUser(**get_authenticated_user(access_token))
    except GitHubApiError as exc:
        _raise_for_github_api_error(exc)


@app.get("/github/repos", response_model=list[RepositorySummary])
def github_repos(access_token: str = Depends(get_current_access_token)):
    try:
        return [RepositorySummary(**repo) for repo in list_repositories(access_token)]
    except GitHubApiError as exc:
        _raise_for_github_api_error(exc)


@app.get("/github/repos/{owner}/{repo}/pulls", response_model=list[PullRequestSummary])
def github_repo_pulls(owner: str, repo: str, access_token: str = Depends(get_current_access_token)):
    try:
        return [PullRequestSummary(**pr) for pr in list_open_pull_requests(access_token, owner, repo)]
    except GitHubApiError as exc:
        _raise_for_github_api_error(exc)


@app.get("/github/repos/{owner}/{repo}/pulls/{number}", response_model=PullRequestDetail)
def github_repo_pull_detail(
    owner: str, repo: str, number: int, access_token: str = Depends(get_current_access_token)
):
    try:
        return PullRequestDetail(**get_pull_request(access_token, owner, repo, number))
    except GitHubApiError as exc:
        _raise_for_github_api_error(exc)

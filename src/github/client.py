import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request

import certifi

_API_BASE = "https://api.github.com"

# Same pattern as src/github/pr_resolver.py's _GITHUB_URL_RE -- duplicated
# rather than imported, for the same reason as _SSL_CONTEXT below: not
# worth coupling to or risking Milestone 1's frozen module for two lines.
_GITHUB_URL_RE = re.compile(r"^https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$")

# Same rationale as src/github/pr_resolver.py's _SSL_CONTEXT -- duplicated
# rather than imported, since pr_resolver.py is Milestone 1's frozen
# module and this is a two-line constant, not worth risking it for.
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


class GitHubApiError(Exception):
    """Raised when an authenticated GitHub API call fails. Carries the
    real upstream HTTP status so callers (src/api/app.py) can propagate
    GitHub's own authorization semantics -- e.g. GitHub returns 404, not
    403, for a repository the token can't see, deliberately avoiding
    confirming its existence. This project defers to that rather than
    building a separate authorization layer of its own."""

    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def _get(token, path, params=None):
    url = f"{_API_BASE}{path}"
    if params:
        url += f"?{urllib.parse.urlencode(params)}"

    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "intent-aware-self-healing",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=15, context=_SSL_CONTEXT) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise GitHubApiError(f"GitHub API returned {exc.code} for {path}", status_code=exc.code) from exc
    except urllib.error.URLError as exc:
        raise GitHubApiError(f"could not reach the GitHub API for {path}") from exc


def get_authenticated_user(token):
    payload = _get(token, "/user")
    return {
        "login": payload["login"],
        "name": payload.get("name"),
        "avatar_url": payload["avatar_url"],
    }


def list_repositories(token):
    """The most recently updated 100 repositories the token's user can
    access (owned, collaborator, or org member) -- respects GitHub's own
    real permission model entirely; no separate authorization logic here.
    Not paginated past the first 100 -- a deliberate simplification, named
    here rather than left silent: a user with more than 100 accessible
    repositories will see a truncated list."""
    payload = _get(token, "/user/repos", params={
        "affiliation": "owner,collaborator,organization_member",
        "sort": "updated",
        "per_page": 100,
    })
    return [
        {
            "full_name": repo["full_name"],
            "name": repo["name"],
            "owner": repo["owner"]["login"],
            "private": repo["private"],
            "default_branch": repo["default_branch"],
            "html_url": repo["html_url"],
            "updated_at": repo["updated_at"],
        }
        for repo in payload
    ]


def list_open_pull_requests(token, owner, repo):
    payload = _get(token, f"/repos/{owner}/{repo}/pulls", params={"state": "open", "per_page": 100})
    return [_pull_request_summary(pr) for pr in payload]


def get_pull_request(token, owner, repo, number):
    payload = _get(token, f"/repos/{owner}/{repo}/pulls/{number}")
    detail = _pull_request_summary(payload)
    detail["body"] = payload.get("body") or ""
    return detail


def get_pull_request_refs(token, repository_url, pr_number):
    """Authenticated equivalent of src/github/pr_resolver.py's
    resolve_pull_request -- same exact output shape (base_sha/head_ref/
    etc.), so it's a drop-in `resolve_pr` for
    src.pipeline.orchestrator.run_pipeline_for_pr, just able to see
    private repositories the caller's token has access to.
    pr_resolver.py itself is untouched; this is a parallel path, not a
    replacement.
    """
    match = _GITHUB_URL_RE.match(repository_url.strip())
    if not match:
        raise GitHubApiError(f"not a recognizable GitHub repository URL: {repository_url}")
    owner, repo = match.group(1), match.group(2)

    payload = _get(token, f"/repos/{owner}/{repo}/pulls/{pr_number}")
    try:
        return {
            "number": payload["number"],
            "title": payload["title"],
            "body": payload.get("body") or "",
            "author_login": payload["user"]["login"],
            "created_at": payload["created_at"],
            "state": payload["state"],
            "base_sha": payload["base"]["sha"],
            "base_ref": payload["base"]["ref"],
            "head_sha": payload["head"]["sha"],
            "head_ref": payload["head"]["ref"],
        }
    except (KeyError, TypeError) as exc:
        raise GitHubApiError(
            f"unexpected GitHub API response shape for {owner}/{repo}#{pr_number}"
        ) from exc


def _pull_request_summary(payload):
    return {
        "number": payload["number"],
        "title": payload["title"],
        "author_login": payload["user"]["login"],
        "created_at": payload["created_at"],
        "updated_at": payload["updated_at"],
        "head_ref": payload["head"]["ref"],
        "base_ref": payload["base"]["ref"],
        "html_url": payload["html_url"],
        "draft": payload.get("draft", False),
        # Present on both list and single-PR payloads, unlike the three
        # fields below (Milestone 5 -- see PullRequestSummary.state).
        "state": payload["state"],
        # Milestone 7: also present on both payloads (unlike additions/
        # deletions/changed_files) -- lets a caller detect "this PR's
        # code changed since a cached review was generated" by comparing
        # against the head_sha a past PRReviewResponse recorded.
        "head_sha": payload["head"]["sha"],
        # Real GitHub fields, but GitHub's list endpoint never includes
        # them (only the single-PR endpoint does) -- .get() naturally
        # yields None for a list-shaped payload rather than a fabricated 0.
        "additions": payload.get("additions"),
        "deletions": payload.get("deletions"),
        "changed_files": payload.get("changed_files"),
    }

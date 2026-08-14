import json
import re
import ssl
import urllib.error
import urllib.request

import certifi

_GITHUB_URL_RE = re.compile(r"^https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$")

# Explicit certifi CA bundle rather than the platform default context: some
# environments (confirmed on this project before, Milestone 13's real Gemini
# call) have no usable local CA trust store, which makes plain
# urllib.request.urlopen fail SSL verification for any HTTPS call. certifi
# is already an installed dependency of httpx (requirements.txt); this just
# uses it explicitly instead of relying on it being pulled in transitively.
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


class PullRequestResolutionError(Exception):
    """Raised when a pull request cannot be resolved via the GitHub API."""


def _parse_owner_repo(repository_url):
    match = _GITHUB_URL_RE.match(repository_url.strip())
    if not match:
        raise PullRequestResolutionError(
            f"not a recognizable GitHub repository URL: {repository_url}"
        )
    return match.group(1), match.group(2)


def resolve_pull_request(repository_url, pr_number):
    """Resolves a PR number to its base/head refs and identity metadata via
    GitHub's public REST API. Unauthenticated — works for public
    repositories only, subject to GitHub's unauthenticated rate limit (60
    requests/hour/IP); OAuth is deliberately out of scope for this function.

    Returns {"number", "title", "body", "author_login", "created_at",
    "state", "base_sha", "base_ref", "head_sha", "head_ref"}. `base_sha` and
    `head_sha` are real commit SHAs, not branch names — branch tips move,
    SHAs don't, so callers can fetch and diff a stable, reproducible pair.
    """
    owner, repo = _parse_owner_repo(repository_url)
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "intent-aware-self-healing",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=15, context=_SSL_CONTEXT) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise PullRequestResolutionError(
            f"GitHub API returned {exc.code} for {owner}/{repo}#{pr_number}"
        ) from exc
    except urllib.error.URLError as exc:
        raise PullRequestResolutionError(
            f"could not reach the GitHub API for {owner}/{repo}#{pr_number}"
        ) from exc

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
        raise PullRequestResolutionError(
            f"unexpected GitHub API response shape for {owner}/{repo}#{pr_number}"
        ) from exc

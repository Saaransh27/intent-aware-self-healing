import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request

import certifi

_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_TOKEN_URL = "https://github.com/login/oauth/access_token"
_SCOPE = "repo"

# Same rationale as src/github/pr_resolver.py's _SSL_CONTEXT -- this
# environment has no usable local CA trust store for a raw urllib HTTPS
# call. Duplicated rather than imported from pr_resolver.py, which is
# Milestone 1's frozen module; not touching it avoids any risk to its
# tested behavior for a two-line constant.
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


class OAuthError(Exception):
    """Raised when the GitHub OAuth authorize/exchange flow cannot complete."""


def _required_env(name):
    value = os.environ.get(name)
    if not value:
        raise OAuthError(f"{name} is not configured")
    return value


def build_authorize_url(state):
    client_id = _required_env("GITHUB_CLIENT_ID")
    redirect_uri = _required_env("GITHUB_OAUTH_REDIRECT_URI")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": _SCOPE,
        "state": state,
    }
    return f"{_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def exchange_code_for_token(code):
    """Exchanges a GitHub OAuth `code` for a real access token. The token
    itself is never returned to the frontend by any caller of this
    function -- see src/api/session_store.py, the only place it's kept
    (in-memory, keyed by an opaque session id the browser holds instead)."""
    client_id = _required_env("GITHUB_CLIENT_ID")
    client_secret = _required_env("GITHUB_CLIENT_SECRET")
    redirect_uri = _required_env("GITHUB_OAUTH_REDIRECT_URI")

    body = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
    }).encode()

    request = urllib.request.Request(
        _TOKEN_URL,
        data=body,
        headers={
            "Accept": "application/json",
            "User-Agent": "intent-aware-self-healing",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=15, context=_SSL_CONTEXT) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise OAuthError(f"GitHub token exchange returned {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise OAuthError("could not reach GitHub's token exchange endpoint") from exc

    # GitHub's token endpoint returns HTTP 200 even on failure (e.g. a
    # reused or expired code) -- the only signal is an "error" key in an
    # otherwise-200 JSON body, not the status code.
    if "error" in payload:
        raise OAuthError(f"GitHub token exchange failed: {payload['error']}")

    access_token = payload.get("access_token")
    if not access_token:
        raise OAuthError("GitHub token exchange response had no access_token")

    return access_token

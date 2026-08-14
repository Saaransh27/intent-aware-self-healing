import secrets

from fastapi import HTTPException, Request

# In-memory only, by design -- this project has no database anywhere and
# the review pipeline itself is already stateless/ephemeral. A real
# limitation, not an oversight: sessions are lost on server restart and
# this does not work across multiple worker processes. Acceptable for
# Milestone 2's scope; revisit if this needs to survive a redeploy or
# scale past one process.
_SESSIONS = {}

SESSION_COOKIE_NAME = "session_id"


def create_session(access_token):
    session_id = secrets.token_urlsafe(32)
    _SESSIONS[session_id] = access_token
    return session_id


def get_access_token(session_id):
    return _SESSIONS.get(session_id)


def delete_session(session_id):
    _SESSIONS.pop(session_id, None)


def clear_all_sessions():
    """Test-only: resets the store between tests, mirroring how the rest
    of this project's tests reach into module state directly rather than
    introducing a class-based store just to make teardown cleaner."""
    _SESSIONS.clear()


def get_current_access_token(request: Request):
    """FastAPI dependency: the one place a request's session cookie is
    turned into a real GitHub access token. Raises 401 for a missing or
    unknown session -- never falls back to an unauthenticated call."""
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    access_token = get_access_token(session_id) if session_id else None
    if access_token is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    return access_token


def get_optional_access_token(request: Request):
    """Like get_current_access_token, but never raises. Milestone 3A's
    POST /review/pr treats authentication as an enhancement (it enables
    private-repo access), not a requirement -- a public repo must keep
    working with no session at all. A missing cookie and an unknown/
    expired session_id are deliberately treated identically: both just
    mean "proceed unauthenticated," never a 401 for this dependency."""
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    return get_access_token(session_id) if session_id else None

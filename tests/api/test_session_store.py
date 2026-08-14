import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from src.api.session_store import (
    clear_all_sessions,
    create_session,
    delete_session,
    get_access_token,
    get_optional_access_token,
    get_current_access_token,
)


class SessionStoreTests(unittest.TestCase):
    def tearDown(self):
        clear_all_sessions()

    def test_create_session_returns_a_lookup_key_that_resolves_to_the_real_token(self):
        session_id = create_session("real-access-token")

        self.assertEqual(get_access_token(session_id), "real-access-token")

    def test_two_sessions_are_independent(self):
        session_a = create_session("token-a")
        session_b = create_session("token-b")

        self.assertEqual(get_access_token(session_a), "token-a")
        self.assertEqual(get_access_token(session_b), "token-b")

    def test_session_ids_are_not_predictable_or_reused(self):
        session_a = create_session("token")
        session_b = create_session("token")

        self.assertNotEqual(session_a, session_b)

    def test_unknown_session_id_resolves_to_none(self):
        self.assertIsNone(get_access_token("not-a-real-session-id"))

    def test_delete_session_removes_it(self):
        session_id = create_session("real-access-token")
        delete_session(session_id)

        self.assertIsNone(get_access_token(session_id))

    def test_deleting_an_unknown_session_id_does_not_raise(self):
        delete_session("not-a-real-session-id")


class GetCurrentAccessTokenDependencyTests(unittest.TestCase):
    """get_current_access_token only ever reads request.cookies — a plain
    stand-in object is enough to test its logic directly, independent of
    real HTTP parsing (which the app.py-level tests cover separately)."""

    def tearDown(self):
        clear_all_sessions()

    def _request_with_cookie(self, session_id):
        cookies = {"session_id": session_id} if session_id else {}
        return SimpleNamespace(cookies=cookies)

    def test_valid_session_cookie_resolves_to_the_real_token(self):
        session_id = create_session("real-access-token")

        result = get_current_access_token(self._request_with_cookie(session_id))

        self.assertEqual(result, "real-access-token")

    def test_missing_cookie_raises_401(self):
        with self.assertRaises(HTTPException) as ctx:
            get_current_access_token(self._request_with_cookie(None))

        self.assertEqual(ctx.exception.status_code, 401)

    def test_unknown_session_id_raises_401(self):
        with self.assertRaises(HTTPException) as ctx:
            get_current_access_token(self._request_with_cookie("forged-session-id"))

        self.assertEqual(ctx.exception.status_code, 401)


class GetOptionalAccessTokenDependencyTests(unittest.TestCase):
    """Milestone 3A: POST /review/pr's authentication is optional, not
    required -- this dependency must never raise, unlike
    get_current_access_token above."""

    def tearDown(self):
        clear_all_sessions()

    def _request_with_cookie(self, session_id):
        cookies = {"session_id": session_id} if session_id else {}
        return SimpleNamespace(cookies=cookies)

    def test_valid_session_cookie_resolves_to_the_real_token(self):
        session_id = create_session("real-access-token")

        result = get_optional_access_token(self._request_with_cookie(session_id))

        self.assertEqual(result, "real-access-token")

    def test_missing_cookie_returns_none_without_raising(self):
        result = get_optional_access_token(self._request_with_cookie(None))

        self.assertIsNone(result)

    def test_unknown_or_expired_session_id_returns_none_without_raising(self):
        result = get_optional_access_token(self._request_with_cookie("forged-or-expired-session-id"))

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()

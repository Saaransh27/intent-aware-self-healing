import json
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from src.github.oauth import OAuthError, build_authorize_url, exchange_code_for_token

_ENV = {
    "GITHUB_CLIENT_ID": "client-id-123",
    "GITHUB_CLIENT_SECRET": "client-secret-456",
    "GITHUB_OAUTH_REDIRECT_URI": "http://localhost:8020/github/callback",
}


def _fake_response(payload):
    response = MagicMock()
    response.read.return_value = json.dumps(payload).encode()
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


class BuildAuthorizeUrlTests(unittest.TestCase):
    @patch.dict("os.environ", _ENV, clear=False)
    def test_includes_client_id_redirect_uri_scope_and_state(self):
        url = build_authorize_url("random-state-value")

        self.assertTrue(url.startswith("https://github.com/login/oauth/authorize?"))
        self.assertIn("client_id=client-id-123", url)
        self.assertIn("state=random-state-value", url)
        self.assertIn("scope=repo", url)
        self.assertIn("redirect_uri=", url)

    @patch.dict("os.environ", {}, clear=True)
    def test_missing_client_id_raises_oauth_error_not_a_crash(self):
        with self.assertRaises(OAuthError):
            build_authorize_url("state")


class ExchangeCodeForTokenTests(unittest.TestCase):
    @patch("src.github.oauth.urllib.request.urlopen")
    @patch.dict("os.environ", _ENV, clear=False)
    def test_extracts_the_real_access_token(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response({"access_token": "real-token-xyz", "scope": "repo", "token_type": "bearer"})

        token = exchange_code_for_token("some-code")

        self.assertEqual(token, "real-token-xyz")

    @patch("src.github.oauth.urllib.request.urlopen")
    @patch.dict("os.environ", _ENV, clear=False)
    def test_github_returns_200_with_an_error_body_still_raises(self, mock_urlopen):
        # GitHub's real behavior: a bad/reused code comes back as HTTP 200
        # with {"error": "..."} in the body, not a non-200 status.
        mock_urlopen.return_value = _fake_response({"error": "bad_verification_code"})

        with self.assertRaises(OAuthError):
            exchange_code_for_token("stale-code")

    @patch("src.github.oauth.urllib.request.urlopen")
    @patch.dict("os.environ", _ENV, clear=False)
    def test_http_error_raises_oauth_error(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://github.com/login/oauth/access_token", code=422, msg="Unprocessable", hdrs=None, fp=None,
        )

        with self.assertRaises(OAuthError):
            exchange_code_for_token("some-code")

    @patch.dict("os.environ", {}, clear=True)
    def test_missing_credentials_raises_oauth_error_without_a_network_call(self):
        with self.assertRaises(OAuthError):
            exchange_code_for_token("some-code")


if __name__ == "__main__":
    unittest.main()

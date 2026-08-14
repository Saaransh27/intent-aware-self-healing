import json
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from src.github.pr_resolver import PullRequestResolutionError, resolve_pull_request

_REAL_PR_PAYLOAD = {
    "number": 42,
    "title": "Fix the thing",
    "body": "This fixes the thing because of reasons.",
    "user": {"login": "octocat"},
    "created_at": "2026-01-15T10:30:00Z",
    "state": "open",
    "base": {"sha": "base" + "0" * 36, "ref": "main"},
    "head": {"sha": "head" + "0" * 36, "ref": "octocat:feature-branch"},
}


def _fake_response(payload):
    response = MagicMock()
    response.read.return_value = json.dumps(payload).encode()
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


class ResolvePullRequestTests(unittest.TestCase):
    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_extracts_all_fields_from_a_real_shaped_payload(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_REAL_PR_PAYLOAD)

        result = resolve_pull_request("https://github.com/octocat/hello-world", 42)

        self.assertEqual(result["number"], 42)
        self.assertEqual(result["title"], "Fix the thing")
        self.assertEqual(result["body"], "This fixes the thing because of reasons.")
        self.assertEqual(result["author_login"], "octocat")
        self.assertEqual(result["created_at"], "2026-01-15T10:30:00Z")
        self.assertEqual(result["state"], "open")
        self.assertEqual(result["base_sha"], "base" + "0" * 36)
        self.assertEqual(result["base_ref"], "main")
        self.assertEqual(result["head_sha"], "head" + "0" * 36)
        self.assertEqual(result["head_ref"], "octocat:feature-branch")

    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_requests_the_exact_expected_url_and_repo(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_REAL_PR_PAYLOAD)

        resolve_pull_request("https://github.com/octocat/hello-world", 42)

        request = mock_urlopen.call_args[0][0]
        self.assertEqual(request.full_url, "https://api.github.com/repos/octocat/hello-world/pulls/42")

    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_missing_body_normalizes_to_empty_string(self, mock_urlopen):
        payload = {**_REAL_PR_PAYLOAD, "body": None}
        mock_urlopen.return_value = _fake_response(payload)

        result = resolve_pull_request("https://github.com/octocat/hello-world", 42)

        self.assertEqual(result["body"], "")

    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_http_404_raises_pull_request_resolution_error(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://api.github.com/repos/octocat/hello-world/pulls/9999",
            code=404, msg="Not Found", hdrs=None, fp=None,
        )

        with self.assertRaises(PullRequestResolutionError):
            resolve_pull_request("https://github.com/octocat/hello-world", 9999)

    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_network_failure_raises_pull_request_resolution_error(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError("no route to host")

        with self.assertRaises(PullRequestResolutionError):
            resolve_pull_request("https://github.com/octocat/hello-world", 42)

    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_unexpected_response_shape_raises_pull_request_resolution_error(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response({"number": 42, "title": "no base/head at all"})

        with self.assertRaises(PullRequestResolutionError):
            resolve_pull_request("https://github.com/octocat/hello-world", 42)

    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_non_github_url_is_rejected_without_a_network_call(self, mock_urlopen):
        with self.assertRaises(PullRequestResolutionError):
            resolve_pull_request("https://gitlab.com/octocat/hello-world", 42)

        mock_urlopen.assert_not_called()

    @patch("src.github.pr_resolver.urllib.request.urlopen")
    def test_url_with_dot_git_suffix_and_trailing_slash_still_resolves(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_REAL_PR_PAYLOAD)

        resolve_pull_request("https://github.com/octocat/hello-world.git/", 42)

        request = mock_urlopen.call_args[0][0]
        self.assertEqual(request.full_url, "https://api.github.com/repos/octocat/hello-world/pulls/42")


if __name__ == "__main__":
    unittest.main()

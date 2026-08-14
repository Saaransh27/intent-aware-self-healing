import json
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from src.github.client import (
    GitHubApiError,
    get_authenticated_user,
    get_pull_request,
    get_pull_request_refs,
    list_open_pull_requests,
    list_repositories,
)

_USER_PAYLOAD = {"login": "octocat", "name": "The Octocat", "avatar_url": "https://example.com/a.png"}

_REPO_PAYLOAD = {
    "full_name": "octocat/hello-world",
    "name": "hello-world",
    "owner": {"login": "octocat"},
    "private": False,
    "default_branch": "main",
    "html_url": "https://github.com/octocat/hello-world",
    "updated_at": "2026-01-01T00:00:00Z",
}

_PR_PAYLOAD = {
    "number": 42,
    "title": "Fix the thing",
    "body": "Because reasons.",
    "user": {"login": "octocat"},
    "created_at": "2026-01-15T10:30:00Z",
    "updated_at": "2026-01-16T09:00:00Z",
    "head": {"ref": "feature-branch"},
    "base": {"ref": "main"},
    "html_url": "https://github.com/octocat/hello-world/pull/42",
    "draft": False,
    "state": "open",
}


def _fake_response(payload):
    response = MagicMock()
    response.read.return_value = json.dumps(payload).encode()
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


class GetAuthenticatedUserTests(unittest.TestCase):
    @patch("src.github.client.urllib.request.urlopen")
    def test_extracts_real_identity_fields(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_USER_PAYLOAD)

        result = get_authenticated_user("real-token")

        self.assertEqual(result, {"login": "octocat", "name": "The Octocat", "avatar_url": "https://example.com/a.png"})

    @patch("src.github.client.urllib.request.urlopen")
    def test_sends_the_token_as_a_bearer_authorization_header(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_USER_PAYLOAD)

        get_authenticated_user("real-token")

        request = mock_urlopen.call_args[0][0]
        self.assertEqual(request.get_header("Authorization"), "Bearer real-token")
        self.assertEqual(request.full_url, "https://api.github.com/user")


class ListRepositoriesTests(unittest.TestCase):
    @patch("src.github.client.urllib.request.urlopen")
    def test_extracts_real_repo_fields(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response([_REPO_PAYLOAD])

        result = list_repositories("real-token")

        self.assertEqual(result, [{
            "full_name": "octocat/hello-world",
            "name": "hello-world",
            "owner": "octocat",
            "private": False,
            "default_branch": "main",
            "html_url": "https://github.com/octocat/hello-world",
            "updated_at": "2026-01-01T00:00:00Z",
        }])

    @patch("src.github.client.urllib.request.urlopen")
    def test_requests_the_users_own_accessible_repos_endpoint(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response([_REPO_PAYLOAD])

        list_repositories("real-token")

        request = mock_urlopen.call_args[0][0]
        self.assertTrue(request.full_url.startswith("https://api.github.com/user/repos?"))
        self.assertIn("affiliation=owner%2Ccollaborator%2Corganization_member", request.full_url)


class ListOpenPullRequestsTests(unittest.TestCase):
    @patch("src.github.client.urllib.request.urlopen")
    def test_extracts_real_pr_summary_fields(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response([_PR_PAYLOAD])

        result = list_open_pull_requests("real-token", "octocat", "hello-world")

        self.assertEqual(result, [{
            "number": 42,
            "title": "Fix the thing",
            "author_login": "octocat",
            "created_at": "2026-01-15T10:30:00Z",
            "updated_at": "2026-01-16T09:00:00Z",
            "head_ref": "feature-branch",
            "base_ref": "main",
            "html_url": "https://github.com/octocat/hello-world/pull/42",
            "draft": False,
            "state": "open",
            # GitHub's list endpoint never returns these -- None (not 0),
            # since _PR_PAYLOAD (a real list-shaped payload) has no such keys.
            "additions": None,
            "deletions": None,
            "changed_files": None,
        }])

    @patch("src.github.client.urllib.request.urlopen")
    def test_requests_open_state_for_the_given_repo(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response([_PR_PAYLOAD])

        list_open_pull_requests("real-token", "octocat", "hello-world")

        request = mock_urlopen.call_args[0][0]
        self.assertTrue(request.full_url.startswith("https://api.github.com/repos/octocat/hello-world/pulls?"))
        self.assertIn("state=open", request.full_url)

    @patch("src.github.client.urllib.request.urlopen")
    def test_a_repo_the_token_cannot_see_raises_with_the_real_404_status(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://api.github.com/repos/octocat/private-repo/pulls",
            code=404, msg="Not Found", hdrs=None, fp=None,
        )

        with self.assertRaises(GitHubApiError) as ctx:
            list_open_pull_requests("real-token", "octocat", "private-repo")

        self.assertEqual(ctx.exception.status_code, 404)


class GetPullRequestTests(unittest.TestCase):
    @patch("src.github.client.urllib.request.urlopen")
    def test_extracts_summary_fields_plus_body(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_PR_PAYLOAD)

        result = get_pull_request("real-token", "octocat", "hello-world", 42)

        self.assertEqual(result["number"], 42)
        self.assertEqual(result["body"], "Because reasons.")

    @patch("src.github.client.urllib.request.urlopen")
    def test_missing_body_normalizes_to_empty_string(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response({**_PR_PAYLOAD, "body": None})

        result = get_pull_request("real-token", "octocat", "hello-world", 42)

        self.assertEqual(result["body"], "")

    @patch("src.github.client.urllib.request.urlopen")
    def test_extracts_real_additions_deletions_and_changed_files_when_present(self, mock_urlopen):
        # The single-PR endpoint (unlike the list endpoint) really does
        # include these fields -- Milestone 4.
        detail_payload = {**_PR_PAYLOAD, "additions": 120, "deletions": 45, "changed_files": 7}
        mock_urlopen.return_value = _fake_response(detail_payload)

        result = get_pull_request("real-token", "octocat", "hello-world", 42)

        self.assertEqual(result["additions"], 120)
        self.assertEqual(result["deletions"], 45)
        self.assertEqual(result["changed_files"], 7)

    @patch("src.github.client.urllib.request.urlopen")
    def test_absent_stats_are_none_not_zero(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_PR_PAYLOAD)

        result = get_pull_request("real-token", "octocat", "hello-world", 42)

        self.assertIsNone(result["additions"])
        self.assertIsNone(result["deletions"])
        self.assertIsNone(result["changed_files"])


_PR_PAYLOAD_WITH_SHAS = {
    **_PR_PAYLOAD,
    "state": "open",
    "base": {"ref": "main", "sha": "base" + "0" * 36},
    "head": {"ref": "feature-branch", "sha": "head" + "0" * 36},
}


class GetPullRequestRefsTests(unittest.TestCase):
    """Milestone 3A: the authenticated drop-in for
    src.github.pr_resolver.resolve_pull_request -- same exact output
    shape, so it's a valid resolve_pr for run_pipeline_for_pr, just able
    to see a private repo the token has access to."""

    @patch("src.github.client.urllib.request.urlopen")
    def test_extracts_the_same_shape_as_the_unauthenticated_resolver(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_PR_PAYLOAD_WITH_SHAS)

        result = get_pull_request_refs("real-token", "https://github.com/octocat/hello-world", 42)

        self.assertEqual(result, {
            "number": 42,
            "title": "Fix the thing",
            "body": "Because reasons.",
            "author_login": "octocat",
            "created_at": "2026-01-15T10:30:00Z",
            "state": "open",
            "base_sha": "base" + "0" * 36,
            "base_ref": "main",
            "head_sha": "head" + "0" * 36,
            "head_ref": "feature-branch",
        })

    @patch("src.github.client.urllib.request.urlopen")
    def test_sends_a_bearer_authorization_header(self, mock_urlopen):
        mock_urlopen.return_value = _fake_response(_PR_PAYLOAD_WITH_SHAS)

        get_pull_request_refs("real-token", "https://github.com/octocat/hello-world", 42)

        request = mock_urlopen.call_args[0][0]
        self.assertEqual(request.get_header("Authorization"), "Bearer real-token")
        self.assertEqual(request.full_url, "https://api.github.com/repos/octocat/hello-world/pulls/42")

    @patch("src.github.client.urllib.request.urlopen")
    def test_non_github_url_raises_without_a_network_call(self, mock_urlopen):
        with self.assertRaises(GitHubApiError):
            get_pull_request_refs("real-token", "https://gitlab.com/octocat/hello-world", 42)

        mock_urlopen.assert_not_called()

    @patch("src.github.client.urllib.request.urlopen")
    def test_a_private_repo_the_token_cannot_see_raises_with_the_real_404_status(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://api.github.com/repos/octocat/private-repo/pulls/7",
            code=404, msg="Not Found", hdrs=None, fp=None,
        )

        with self.assertRaises(GitHubApiError) as ctx:
            get_pull_request_refs("real-token", "https://github.com/octocat/private-repo", 7)

        self.assertEqual(ctx.exception.status_code, 404)

    @patch("src.github.client.urllib.request.urlopen")
    def test_an_invalid_or_revoked_token_raises_with_the_real_401_status(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://api.github.com/repos/octocat/hello-world/pulls/42",
            code=401, msg="Unauthorized", hdrs=None, fp=None,
        )

        with self.assertRaises(GitHubApiError) as ctx:
            get_pull_request_refs("revoked-token", "https://github.com/octocat/hello-world", 42)

        self.assertEqual(ctx.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()

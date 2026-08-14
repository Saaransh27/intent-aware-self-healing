import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.git.git_client import GitClient
from src.github.client import GitHubApiError
from src.pipeline.orchestrator import CommitResolutionError, run_pipeline_for_commit, run_pipeline_for_pr

_GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test Author",
    "GIT_AUTHOR_EMAIL": "author@example.com",
    "GIT_COMMITTER_NAME": "Test Author",
    "GIT_COMMITTER_EMAIL": "author@example.com",
}


def _run_git(args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, env=_GIT_ENV, text=True)


def _build_synthetic_repo(repo_dir):
    _run_git(["init"], cwd=repo_dir)
    (Path(repo_dir) / "pkg").mkdir()
    (Path(repo_dir) / "pkg" / "module.py").write_text("def greet():\n    return 'hi'\n")
    _run_git(["add", "."], cwd=repo_dir)
    _run_git(["commit", "-m", "initial commit"], cwd=repo_dir)

    (Path(repo_dir) / "pkg" / "module.py").write_text(
        "def greet():\n    return 'hi'\n\n\ndef farewell():\n    return 'bye'\n"
    )
    _run_git(["add", "."], cwd=repo_dir)
    _run_git(["commit", "-m", "add farewell function"], cwd=repo_dir)

    return subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_dir, check=True, capture_output=True, text=True
    ).stdout.strip()


def _stub_execute(system_prompt, user_prompt):
    return "### Verdict\nfine\n\n### What changed and why\nadded a function\n\n" \
           "### What deserves attention, ranked\nnothing\n\n### Open questions\nnone\n\n### Minor notes\nnone"


class RunPipelineForCommitTests(unittest.TestCase):
    def test_full_chain_against_a_real_local_repo_with_stubbed_execute(self):
        with tempfile.TemporaryDirectory() as repo_dir:
            latest_hash = _build_synthetic_repo(repo_dir)

            result = run_pipeline_for_commit(repo_dir, None, execute=_stub_execute)

        self.assertEqual(result["repository_url"], repo_dir)
        self.assertEqual(result["commit_hash"], latest_hash)
        self.assertIn("system_prompt", result["prompt"])
        self.assertIn("user_prompt", result["prompt"])
        self.assertEqual(result["adapter_result"]["state"], "success")
        self.assertIn("farewell", result["prompt"]["user_prompt"])
        self.assertEqual(result["review_result"]["outcome"], "evaluated")
        self.assertEqual(result["review_result"]["response"], result["adapter_result"]["response"])

        # review_context/observations are real pipeline data, computed
        # before the LLM ever runs — confirm they come back correctly from
        # an actual git repo, not just from a mocked orchestrator result.
        self.assertIn("pkg/module.py", result["review_context"]["commit_summary"]["modified_files"])
        self.assertEqual(result["observations"]["file_classification"]["pkg/module.py"], "Source")
        self.assertEqual(result["observations"]["change_statistics"]["files_modified"], 1)

        # get_diff_stats against REAL git output, not a mock. Verified by
        # hand against this exact synthetic commit before writing this
        # assertion (`git diff --numstat HEAD~1 HEAD` -> "4\t0\tpkg/module.py"):
        # 2 original lines unchanged, 4 new lines appended (two blank lines
        # plus the two-line farewell function), 0 deletions.
        diff_stats = result["observations"]["diff_stats"]
        self.assertEqual(diff_stats["files"]["pkg/module.py"], {"insertions": 4, "deletions": 0})
        self.assertEqual(diff_stats["total_insertions"], 4)
        self.assertEqual(diff_stats["total_deletions"], 0)

    def test_explicit_commit_hash_is_used_instead_of_latest(self):
        # The target commit must not be the repository's root commit — see
        # test_root_commit_is_a_known_pre_existing_limitation below.
        with tempfile.TemporaryDirectory() as repo_dir:
            _run_git(["init"], cwd=repo_dir)
            (Path(repo_dir) / "a.py").write_text("x = 0\n")
            _run_git(["add", "."], cwd=repo_dir)
            _run_git(["commit", "-m", "root"], cwd=repo_dir)

            (Path(repo_dir) / "a.py").write_text("x = 1\n")
            _run_git(["add", "."], cwd=repo_dir)
            _run_git(["commit", "-m", "first"], cwd=repo_dir)
            first_hash = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=repo_dir, check=True, capture_output=True, text=True
            ).stdout.strip()

            (Path(repo_dir) / "a.py").write_text("x = 2\n")
            _run_git(["add", "."], cwd=repo_dir)
            _run_git(["commit", "-m", "second"], cwd=repo_dir)

            result = run_pipeline_for_commit(repo_dir, first_hash, execute=_stub_execute)

        self.assertEqual(result["commit_hash"], first_hash)

    def test_root_commit_is_a_known_pre_existing_limitation(self):
        # DatasetCollector._build_commit_semantic_analysis unconditionally
        # indexes get_parent_hashes(...)[0], which is empty for a root commit
        # (no parent to diff .py files against) and raises IndexError. This is
        # a real, pre-existing bug, not introduced by this milestone; per this
        # milestone's explicit "keep the existing pipeline completely
        # unchanged" instruction, it is documented here rather than fixed.
        # run_pipeline_for_commit's own exception handling around evidence
        # assembly happens to catch it and re-raise as CommitResolutionError
        # (a clean 404 at the API layer) rather than letting it crash
        # unhandled — a side effect, not a deliberate fix for this bug.
        with tempfile.TemporaryDirectory() as repo_dir:
            _run_git(["init"], cwd=repo_dir)
            (Path(repo_dir) / "a.py").write_text("x = 1\n")
            _run_git(["add", "."], cwd=repo_dir)
            _run_git(["commit", "-m", "root"], cwd=repo_dir)

            with self.assertRaises(CommitResolutionError):
                run_pipeline_for_commit(repo_dir, None, execute=_stub_execute)

    def test_unresolvable_repository_raises_commit_resolution_error(self):
        with self.assertRaises(CommitResolutionError):
            run_pipeline_for_commit("/not/a/real/path/at/all", None, execute=_stub_execute)

    def test_unresolvable_commit_hash_raises_commit_resolution_error(self):
        with tempfile.TemporaryDirectory() as repo_dir:
            _run_git(["init"], cwd=repo_dir)
            (Path(repo_dir) / "a.py").write_text("x = 1\n")
            _run_git(["add", "."], cwd=repo_dir)
            _run_git(["commit", "-m", "first"], cwd=repo_dir)

            with self.assertRaises(CommitResolutionError):
                run_pipeline_for_commit(repo_dir, "0000000000000000000000000000000000dead", execute=_stub_execute)

    def test_repository_with_no_commits_raises_commit_resolution_error(self):
        with tempfile.TemporaryDirectory() as repo_dir:
            _run_git(["init"], cwd=repo_dir)

            with self.assertRaises(CommitResolutionError):
                run_pipeline_for_commit(repo_dir, None, execute=_stub_execute)


def _build_pr_fixture_repo(repo_dir):
    # trunk: one commit establishing pkg/module.py, pkg/obsolete.py,
    # docs/old_name.md. feature branches off it with TWO commits (the PR
    # combines both). trunk then moves on with an unrelated commit AFTER
    # the fork point -- proving three-dot semantics matter: that trunk
    # commit must never appear in the PR's diff.
    _run_git(["init"], cwd=repo_dir)
    _run_git(["checkout", "-b", "trunk"], cwd=repo_dir)
    (Path(repo_dir) / "pkg").mkdir()
    (Path(repo_dir) / "pkg" / "module.py").write_text("def greet():\n    return 'hi'\n")
    (Path(repo_dir) / "pkg" / "obsolete.py").write_text("LEGACY_FLAG = True\nDEPRECATED = True\n")
    (Path(repo_dir) / "docs").mkdir()
    (Path(repo_dir) / "docs" / "old_name.md").write_text("# Docs\n")
    _run_git(["add", "."], cwd=repo_dir)
    _run_git(["commit", "-m", "initial"], cwd=repo_dir)

    _run_git(["checkout", "-b", "feature"], cwd=repo_dir)
    (Path(repo_dir) / "pkg" / "module.py").write_text(
        "def greet():\n    return 'hi'\n\n\ndef farewell():\n    return 'bye'\n"
    )
    (Path(repo_dir) / "pkg" / "new_file.py").write_text("NEW = True\n")
    _run_git(["add", "."], cwd=repo_dir)
    _run_git(["commit", "-m", "PR commit 1: add farewell + new_file"], cwd=repo_dir)

    (Path(repo_dir) / "pkg" / "module.py").write_text(
        "def greet():\n    return 'hi there'\n\n\ndef farewell():\n    return 'bye'\n"
    )
    _run_git(["rm", "pkg/obsolete.py"], cwd=repo_dir)
    _run_git(["mv", "docs/old_name.md", "docs/new_name.md"], cwd=repo_dir)
    _run_git(["add", "."], cwd=repo_dir)
    _run_git(["commit", "-m", "PR commit 2: tweak greet, drop obsolete, rename docs"], cwd=repo_dir)
    head_sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_dir, check=True, capture_output=True, text=True
    ).stdout.strip()

    _run_git(["checkout", "trunk"], cwd=repo_dir)
    (Path(repo_dir) / "unrelated.txt").write_text("trunk moved on after the PR forked\n")
    _run_git(["add", "."], cwd=repo_dir)
    _run_git(["commit", "-m", "unrelated trunk change after fork"], cwd=repo_dir)
    base_sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo_dir, check=True, capture_output=True, text=True
    ).stdout.strip()

    return base_sha, head_sha


def _stub_resolve_pr(base_sha, head_sha):
    def resolve(repository_url, pr_number):
        return {
            "number": pr_number,
            "title": "Add farewell and clean up",
            "body": "Adds a farewell function and a new module, drops an obsolete file, renames docs.",
            "author_login": "octocat",
            "created_at": "2026-01-15T10:30:00Z",
            "state": "open",
            "base_sha": base_sha,
            "base_ref": "trunk",
            "head_sha": head_sha,
            "head_ref": "feature",
        }
    return resolve


class RunPipelineForPRTests(unittest.TestCase):
    def test_full_chain_reviews_the_complete_pr_diff_with_three_dot_semantics(self):
        with tempfile.TemporaryDirectory() as repo_dir:
            base_sha, head_sha = _build_pr_fixture_repo(repo_dir)

            result = run_pipeline_for_pr(
                repo_dir, 7, execute=_stub_execute, resolve_pr=_stub_resolve_pr(base_sha, head_sha)
            )

        self.assertEqual(result["repository_url"], repo_dir)
        self.assertEqual(result["pr_number"], 7)
        self.assertEqual(result["base_sha"], base_sha)
        self.assertEqual(result["head_sha"], head_sha)
        self.assertEqual(result["adapter_result"]["state"], "success")
        self.assertEqual(result["review_result"]["outcome"], "evaluated")

        commit_summary = result["review_context"]["commit_summary"]
        changed_files = set(commit_summary["changed_files"])

        # Both PR commits' changes are present -- not merely the latest one.
        self.assertIn("pkg/module.py", changed_files)
        self.assertIn("pkg/new_file.py", changed_files)
        self.assertIn("docs/new_name.md", changed_files)

        # trunk's post-fork commit must NOT leak into the PR's diff -- this
        # is exactly what three-dot (not two-dot) semantics guarantees.
        self.assertNotIn("unrelated.txt", changed_files)

        self.assertIn("pkg/new_file.py", commit_summary["added_files"])
        self.assertIn("pkg/obsolete.py", commit_summary["deleted_files"])
        renamed = commit_summary["renamed_files"]
        self.assertEqual(len(renamed), 1)
        self.assertEqual(renamed[0]["old_path"], "docs/old_name.md")
        self.assertEqual(renamed[0]["path"], "docs/new_name.md")

        self.assertEqual(result["observations"]["change_statistics"]["files_added"], 1)
        self.assertEqual(result["observations"]["change_statistics"]["files_deleted"], 1)
        self.assertEqual(result["observations"]["change_statistics"]["files_renamed"], 1)

        # The prompt reflects the whole PR's combined diff, and nothing
        # from trunk's unrelated, post-fork commit.
        self.assertIn("farewell", result["prompt"]["user_prompt"])
        self.assertNotIn("unrelated", result["prompt"]["user_prompt"])

    def test_unresolvable_pr_raises_commit_resolution_error(self):
        def _failing_resolve(repository_url, pr_number):
            raise RuntimeError("PR not found")

        with tempfile.TemporaryDirectory() as repo_dir:
            _run_git(["init"], cwd=repo_dir)
            (Path(repo_dir) / "a.py").write_text("x = 1\n")
            _run_git(["add", "."], cwd=repo_dir)
            _run_git(["commit", "-m", "root"], cwd=repo_dir)

            with self.assertRaises(CommitResolutionError):
                run_pipeline_for_pr(repo_dir, 999, execute=_stub_execute, resolve_pr=_failing_resolve)

    def test_unresolvable_repository_raises_commit_resolution_error(self):
        with self.assertRaises(CommitResolutionError):
            run_pipeline_for_pr(
                "/not/a/real/path/at/all", 1, execute=_stub_execute,
                resolve_pr=_stub_resolve_pr("deadbeef", "deadbeef"),
            )


class RunPipelineForPRWithAuthTests(unittest.TestCase):
    """Milestone 3A: access_token is optional and, when provided, must
    reach exactly clone_repository and both fetch_ref calls -- the only
    three points that actually talk to a remote over the network. A
    local-path repository_url doesn't need real credentials to work (git
    ignores an HTTP header on a filesystem remote), so these prove the
    plumbing/wiring is correct without needing a real private GitHub
    repo, which does not exist in this environment -- named explicitly
    in this milestone's report, not silently assumed equivalent."""

    def _spy_on_auth_args(self):
        original = GitClient._auth_args
        recorded = []

        def spy(self, access_token):
            recorded.append(access_token)
            return original(self, access_token)

        return recorded, patch.object(GitClient, "_auth_args", spy)

    def test_no_token_means_every_git_call_gets_no_auth_header(self):
        recorded, patcher = self._spy_on_auth_args()
        with tempfile.TemporaryDirectory() as repo_dir:
            base_sha, head_sha = _build_pr_fixture_repo(repo_dir)

            with patcher:
                run_pipeline_for_pr(
                    repo_dir, 7, execute=_stub_execute,
                    resolve_pr=_stub_resolve_pr(base_sha, head_sha),
                )

        # clone + fetch(base) + fetch(head) = 3 real git calls that go
        # through _auth_args; every one must see no token.
        self.assertEqual(recorded, [None, None, None])

    def test_authenticated_public_pr_review_threads_the_token_to_every_git_call(self):
        recorded, patcher = self._spy_on_auth_args()
        with tempfile.TemporaryDirectory() as repo_dir:
            base_sha, head_sha = _build_pr_fixture_repo(repo_dir)

            with patcher:
                result = run_pipeline_for_pr(
                    repo_dir, 7, execute=_stub_execute,
                    resolve_pr=_stub_resolve_pr(base_sha, head_sha),
                    access_token="real-session-token-abc",
                )

        self.assertEqual(recorded, ["real-session-token-abc"] * 3)
        # the token doesn't corrupt anything downstream -- same real
        # review as the unauthenticated case in RunPipelineForPRTests above.
        self.assertEqual(result["adapter_result"]["state"], "success")
        self.assertIn("pkg/new_file.py", result["review_context"]["commit_summary"]["added_files"])

    def test_authenticated_private_pr_review_path_reaches_clone_and_both_fetches(self):
        # "Private" is simulated: no real private GitHub repo exists in
        # this environment. What's proven for real is the exact mechanism
        # a private repo depends on -- clone_repository and fetch_ref both
        # receiving the real token -- against a real (local) git remote.
        recorded, patcher = self._spy_on_auth_args()
        with tempfile.TemporaryDirectory() as repo_dir:
            base_sha, head_sha = _build_pr_fixture_repo(repo_dir)

            with patcher:
                run_pipeline_for_pr(
                    repo_dir, 7, execute=_stub_execute,
                    resolve_pr=_stub_resolve_pr(base_sha, head_sha),
                    access_token="private-repo-token",
                )

        clone_call, fetch_base_call, fetch_head_call = recorded
        self.assertEqual(clone_call, "private-repo-token")
        self.assertEqual(fetch_base_call, "private-repo-token")
        self.assertEqual(fetch_head_call, "private-repo-token")

    def test_unauthenticated_review_of_a_repo_requiring_auth_is_rejected_cleanly(self):
        # Simulates the real failure a private repo produces with no
        # credentials: git itself refuses the clone.
        with patch.object(
            GitClient, "clone_repository",
            side_effect=subprocess.CalledProcessError(128, ["git", "clone", "..."], stderr="fatal: could not read Username"),
        ):
            with self.assertRaises(CommitResolutionError) as ctx:
                run_pipeline_for_pr(
                    "https://github.com/octocat/a-private-repo", 7,
                    execute=_stub_execute, resolve_pr=_stub_resolve_pr("base", "head"),
                    access_token=None,
                )

        # The rejection is clean and does not echo git's own stderr.
        self.assertNotIn("fatal:", str(ctx.exception))

    def test_git_authentication_failure_with_a_real_but_rejected_token_is_rejected_cleanly(self):
        # Simulates GitHub rejecting a real (revoked/expired) token at the
        # git transport level -- the token itself must never appear in the
        # exception this project constructs and eventually returns as an
        # HTTP error detail.
        token = "revoked-token-should-never-leak-1234567890"
        with patch.object(
            GitClient, "clone_repository",
            side_effect=subprocess.CalledProcessError(
                128, ["git", "-c", f"http.extraHeader=Authorization: Bearer {token}", "clone"],
                stderr="fatal: Authentication failed",
            ),
        ):
            with self.assertRaises(CommitResolutionError) as ctx:
                run_pipeline_for_pr(
                    "https://github.com/octocat/a-private-repo", 7,
                    execute=_stub_execute, resolve_pr=_stub_resolve_pr("base", "head"),
                    access_token=token,
                )

        self.assertNotIn(token, str(ctx.exception))

    def test_github_api_authentication_failure_during_resolve_is_rejected_cleanly(self):
        def failing_resolve(repository_url, pr_number):
            raise GitHubApiError("GitHub API returned 401 for /repos/octocat/a-private-repo/pulls/7", status_code=401)

        with self.assertRaises(CommitResolutionError):
            run_pipeline_for_pr(
                "https://github.com/octocat/a-private-repo", 7,
                execute=_stub_execute, resolve_pr=failing_resolve, access_token="revoked-token",
            )


if __name__ == "__main__":
    unittest.main()

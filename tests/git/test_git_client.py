import subprocess
import tempfile
import unittest
from pathlib import Path

from src.git.git_client import GitClient


def _run(args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


class GetFileHistoryFollowTests(unittest.TestCase):
    """Covers Milestone 19's Blocker 2: get_file_history must follow renames
    (git log --follow) so a renamed file is not reported as a first
    appearance, while a file that was never renamed is unaffected."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo_path = Path(self._tmp.name)
        _run(["init"], self.repo_path)
        _run(["config", "user.email", "test@example.com"], self.repo_path)
        _run(["config", "user.name", "Test"], self.repo_path)
        _run(["config", "commit.gpgsign", "false"], self.repo_path)
        self.client = GitClient()

    def tearDown(self):
        self._tmp.cleanup()

    def _commit(self, message):
        _run(["commit", "-m", message], self.repo_path)
        return self.client.get_commit_hashes(self.repo_path, max_count=1)[0]

    def test_renamed_file_is_not_reported_as_first_appearance(self):
        (self.repo_path / "old_name.py").write_text("content\n")
        _run(["add", "old_name.py"], self.repo_path)
        self._commit("add old_name.py")

        _run(["mv", "old_name.py", "new_name.py"], self.repo_path)
        _run(["add", "-A"], self.repo_path)
        latest = self._commit("rename to new_name.py")

        history = self.client.get_file_history(self.repo_path, latest, "new_name.py")
        self.assertEqual(history["total_commit_count"], 2)
        self.assertFalse(history["is_first_appearance"])

    def test_never_renamed_file_still_reports_first_appearance(self):
        (self.repo_path / "only_file.py").write_text("content\n")
        _run(["add", "only_file.py"], self.repo_path)
        latest = self._commit("add only_file.py")

        history = self.client.get_file_history(self.repo_path, latest, "only_file.py")
        self.assertEqual(history["total_commit_count"], 1)
        self.assertTrue(history["is_first_appearance"])

    def test_never_renamed_file_with_multiple_edits_reports_full_history(self):
        target = self.repo_path / "stable_name.py"
        target.write_text("v1\n")
        _run(["add", "stable_name.py"], self.repo_path)
        self._commit("add stable_name.py")

        target.write_text("v2\n")
        _run(["add", "stable_name.py"], self.repo_path)
        latest = self._commit("edit stable_name.py")

        history = self.client.get_file_history(self.repo_path, latest, "stable_name.py")
        self.assertEqual(history["total_commit_count"], 2)
        self.assertFalse(history["is_first_appearance"])


class GetDiffStatsTests(unittest.TestCase):
    """get_diff_stats wraps `git diff --numstat` — real, objective per-file
    line counts. The two behaviors that matter: correct counts for a plain
    text change, and None (not 0) for a binary file, where git itself
    reports "-" to mean "not applicable," a different fact than "zero
    lines changed." Both expected values here were verified by hand against
    real `git diff --numstat` output before being written into assertions,
    not assumed."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo_path = Path(self._tmp.name)
        _run(["init"], self.repo_path)
        _run(["config", "user.email", "test@example.com"], self.repo_path)
        _run(["config", "user.name", "Test"], self.repo_path)
        _run(["config", "commit.gpgsign", "false"], self.repo_path)
        self.client = GitClient()

    def tearDown(self):
        self._tmp.cleanup()

    def _commit(self, message):
        _run(["commit", "-m", message], self.repo_path)
        return self.client.get_commit_hashes(self.repo_path, max_count=1)[0]

    def test_text_file_reports_real_insertion_and_deletion_counts(self):
        target = self.repo_path / "module.py"
        target.write_text("def greet():\n    return 'hi'\n")
        _run(["add", "."], self.repo_path)
        self._commit("initial")

        # Verified by hand: `git diff --numstat` on this exact change
        # reports "4\t0\tmodule.py" — 4 lines appended, 0 removed.
        target.write_text("def greet():\n    return 'hi'\n\n\ndef farewell():\n    return 'bye'\n")
        _run(["add", "."], self.repo_path)
        latest = self._commit("add farewell")

        stats = self.client.get_diff_stats(self.repo_path, latest)
        self.assertEqual(stats, [{"path": "module.py", "insertions": 4, "deletions": 0}])

    def test_binary_file_reports_none_not_zero(self):
        target = self.repo_path / "module.py"
        target.write_text("placeholder\n")
        _run(["add", "."], self.repo_path)
        self._commit("initial")

        # A real binary file (a null byte forces git's own binary
        # detection) — verified by hand: `git diff --numstat` reports
        # "-\t-\tasset.bin" for this exact change, not "0\t0\t...".
        (self.repo_path / "asset.bin").write_bytes(bytes([0x89, 0x50, 0x4E, 0x47, 0x00, 0x01, 0x02, 0x00]))
        _run(["add", "."], self.repo_path)
        latest = self._commit("add binary asset")

        stats = self.client.get_diff_stats(self.repo_path, latest)
        binary_entry = next(entry for entry in stats if entry["path"] == "asset.bin")
        self.assertIsNone(binary_entry["insertions"])
        self.assertIsNone(binary_entry["deletions"])


class GetCoChangeHistoryFollowTests(unittest.TestCase):
    """Covers Milestone 22A's release blocker: get_co_change_history must
    follow renames (git log --follow), the same defect class already fixed
    in get_file_history, so a renamed file doesn't lose its pre-rename
    co-change history, while non-renamed files are unaffected."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo_path = Path(self._tmp.name)
        _run(["init"], self.repo_path)
        _run(["config", "user.email", "test@example.com"], self.repo_path)
        _run(["config", "user.name", "Test"], self.repo_path)
        _run(["config", "commit.gpgsign", "false"], self.repo_path)
        self.client = GitClient()

    def tearDown(self):
        self._tmp.cleanup()

    def _commit(self, message):
        _run(["commit", "-m", message], self.repo_path)
        return self.client.get_commit_hashes(self.repo_path, max_count=1)[0]

    def test_renamed_file_retains_co_change_history_from_before_the_rename(self):
        (self.repo_path / "old_name.py").write_text("content\n")
        (self.repo_path / "sibling.py").write_text("content\n")
        _run(["add", "old_name.py", "sibling.py"], self.repo_path)
        self._commit("add old_name.py alongside sibling.py")

        _run(["mv", "old_name.py", "new_name.py"], self.repo_path)
        _run(["add", "-A"], self.repo_path)
        latest = self._commit("rename to new_name.py")

        co_change = self.client.get_co_change_history(self.repo_path, latest, "new_name.py")
        changed_paths = {path for commit_files in co_change for path in commit_files}
        self.assertIn("sibling.py", changed_paths)

    def test_never_renamed_file_co_change_history_is_unchanged(self):
        (self.repo_path / "stable_name.py").write_text("v1\n")
        (self.repo_path / "sibling.py").write_text("content\n")
        _run(["add", "stable_name.py", "sibling.py"], self.repo_path)
        self._commit("add stable_name.py alongside sibling.py")

        (self.repo_path / "stable_name.py").write_text("v2\n")
        _run(["add", "stable_name.py"], self.repo_path)
        latest = self._commit("edit stable_name.py")

        co_change = self.client.get_co_change_history(self.repo_path, latest, "stable_name.py")
        changed_paths = {path for commit_files in co_change for path in commit_files}
        self.assertIn("sibling.py", changed_paths)


class GetPrDiffAndMergeBaseTests(unittest.TestCase):
    """get_pr_diff must use real three-dot (base...head) semantics: the diff
    against the merge-base of the two refs, not a direct two-dot diff
    against base's current tip. The fixture below makes the two diverge
    from what a naive two-dot diff would show — the base branch gets a
    commit AFTER the feature branch forks off, and that commit must not
    appear in the PR's diff."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo_path = Path(self._tmp.name)
        _run(["init"], self.repo_path)
        _run(["checkout", "-b", "trunk"], self.repo_path)
        _run(["config", "user.email", "test@example.com"], self.repo_path)
        _run(["config", "user.name", "Test"], self.repo_path)
        _run(["config", "commit.gpgsign", "false"], self.repo_path)
        self.client = GitClient()

    def tearDown(self):
        self._tmp.cleanup()

    def _commit(self, message):
        _run(["commit", "-m", message], self.repo_path)
        return self.client.get_commit_hashes(self.repo_path, max_count=1)[0]

    def _build_diverged_pr_fixture(self):
        (self.repo_path / "a.py").write_text("v1\n")
        _run(["add", "."], self.repo_path)
        fork_point = self._commit("initial")

        _run(["checkout", "-b", "feature"], self.repo_path)
        (self.repo_path / "a.py").write_text("v2\n")
        _run(["add", "."], self.repo_path)
        head_sha = self._commit("feature change")

        _run(["checkout", "trunk"], self.repo_path)
        (self.repo_path / "unrelated.txt").write_text("trunk moved on after the PR forked\n")
        _run(["add", "."], self.repo_path)
        base_sha = self._commit("unrelated trunk change after fork")

        return fork_point, head_sha, base_sha

    def test_merge_base_finds_the_real_fork_point_not_bases_current_tip(self):
        fork_point, head_sha, base_sha = self._build_diverged_pr_fixture()
        self.assertEqual(self.client.get_merge_base(self.repo_path, base_sha, head_sha), fork_point)

    def test_pr_diff_excludes_bases_post_fork_commit(self):
        _, head_sha, base_sha = self._build_diverged_pr_fixture()
        diff = self.client.get_pr_diff(self.repo_path, base_sha, head_sha)
        self.assertIn("a.py", diff)
        self.assertNotIn("unrelated.txt", diff)

    def test_pr_diff_includes_the_feature_side_change(self):
        _, head_sha, base_sha = self._build_diverged_pr_fixture()
        diff = self.client.get_pr_diff(self.repo_path, base_sha, head_sha)
        self.assertIn("-v1", diff)
        self.assertIn("+v2", diff)


class FetchRefTests(unittest.TestCase):
    """fetch_ref must actually retrieve an object from a real remote — a
    PR's head commit (especially from a fork) is not guaranteed to already
    be present in an initial clone."""

    def setUp(self):
        self._source_tmp = tempfile.TemporaryDirectory()
        self._clone_tmp = tempfile.TemporaryDirectory()
        self.source_path = Path(self._source_tmp.name)
        self.clone_path = Path(self._clone_tmp.name)
        _run(["init"], self.source_path)
        _run(["config", "user.email", "test@example.com"], self.source_path)
        _run(["config", "user.name", "Test"], self.source_path)
        _run(["config", "commit.gpgsign", "false"], self.source_path)
        (self.source_path / "a.py").write_text("v1\n")
        _run(["add", "."], self.source_path)
        _run(["commit", "-m", "initial"], self.source_path)
        self.client = GitClient()

    def tearDown(self):
        self._source_tmp.cleanup()
        self._clone_tmp.cleanup()

    def test_fetches_a_commit_created_in_the_remote_after_the_initial_clone(self):
        self.client.clone_repository(str(self.source_path), str(self.clone_path))

        (self.source_path / "a.py").write_text("v2\n")
        _run(["add", "."], self.source_path)
        _run(["commit", "-m", "added after the clone was made"], self.source_path)
        new_sha = self.client.get_commit_hashes(self.source_path, max_count=1)[0]

        with self.assertRaises(subprocess.CalledProcessError):
            _run(["cat-file", "-e", new_sha], self.clone_path)

        self.client.fetch_ref(self.clone_path, new_sha)

        _run(["cat-file", "-e", new_sha], self.clone_path)


class AuthArgsTests(unittest.TestCase):
    """_auth_args is the one place a private-repo access_token turns into
    a real git invocation detail (Milestone 3A) -- a header, not a
    token-embedded URL, so repo_url stays clean everywhere else."""

    def setUp(self):
        self.client = GitClient()

    def test_no_token_produces_no_extra_args(self):
        self.assertEqual(self.client._auth_args(None), [])

    def test_empty_token_produces_no_extra_args(self):
        self.assertEqual(self.client._auth_args(""), [])

    def test_real_token_produces_a_bearer_auth_header_config_flag(self):
        args = self.client._auth_args("real-token-abc")

        self.assertEqual(args, ["-c", "http.extraHeader=Authorization: Bearer real-token-abc"])


class AuthenticatedCloneAndFetchTests(unittest.TestCase):
    """A token-bearing clone/fetch against a real (local, non-HTTP) remote
    -- proves the extra -c flag doesn't corrupt a normal git invocation.
    Confirming it actually authenticates against a real private GitHub
    repo is out of scope here (no such repo exists in this environment);
    that gap is named explicitly in this milestone's report."""

    def setUp(self):
        self._source_tmp = tempfile.TemporaryDirectory()
        self._clone_tmp = tempfile.TemporaryDirectory()
        self.source_path = Path(self._source_tmp.name)
        self.clone_path = Path(self._clone_tmp.name)
        _run(["init"], self.source_path)
        _run(["config", "user.email", "test@example.com"], self.source_path)
        _run(["config", "user.name", "Test"], self.source_path)
        _run(["config", "commit.gpgsign", "false"], self.source_path)
        (self.source_path / "a.py").write_text("v1\n")
        _run(["add", "."], self.source_path)
        _run(["commit", "-m", "initial"], self.source_path)
        self.client = GitClient()

    def tearDown(self):
        self._source_tmp.cleanup()
        self._clone_tmp.cleanup()

    def test_clone_with_a_token_still_succeeds_against_a_local_remote(self):
        self.client.clone_repository(str(self.source_path), str(self.clone_path), access_token="fake-token-xyz")

        self.assertTrue((self.clone_path / "a.py").exists())

    def test_fetch_with_a_token_still_succeeds_against_a_local_remote(self):
        self.client.clone_repository(str(self.source_path), str(self.clone_path))

        (self.source_path / "a.py").write_text("v2\n")
        _run(["add", "."], self.source_path)
        _run(["commit", "-m", "second"], self.source_path)
        new_sha = self.client.get_commit_hashes(self.source_path, max_count=1)[0]

        self.client.fetch_ref(self.clone_path, new_sha, access_token="fake-token-xyz")

        _run(["cat-file", "-e", new_sha], self.clone_path)


if __name__ == "__main__":
    unittest.main()

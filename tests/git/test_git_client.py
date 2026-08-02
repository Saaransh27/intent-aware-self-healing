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


if __name__ == "__main__":
    unittest.main()

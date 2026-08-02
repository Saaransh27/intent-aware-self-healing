import subprocess
import tempfile
import unittest
from pathlib import Path

from src.pipeline.orchestrator import CommitResolutionError, run_pipeline_for_commit

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


if __name__ == "__main__":
    unittest.main()

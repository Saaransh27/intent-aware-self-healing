import json
import tempfile
from pathlib import Path

from src.git.git_client import GitClient


class DatasetCollector:
    def __init__(self, repository_url, output_directory, commit_count):
        self.repository_url = repository_url
        self.output_directory = Path(output_directory)
        self.commit_count = commit_count
        self.git_client = GitClient()

    def collect(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_path = Path(temp_dir)
            self.git_client.clone_repository(self.repository_url, str(repo_path))

            commit_hashes = self.git_client.get_non_merge_commit_hashes(repo_path, self.commit_count)
            if not commit_hashes:
                raise ValueError("no non-merge commits found in repository")

            for commit_hash in commit_hashes:
                metadata = self.git_client.get_commit_metadata(repo_path, commit_hash)
                diff = self.git_client.get_commit_diff(repo_path, commit_hash)

                commit_dir = self._commit_directory(commit_hash)
                self._save_metadata(commit_dir, metadata)
                self._save_diff(commit_dir, diff)

        return commit_hashes

    def _repository_name(self):
        name = self.repository_url.rstrip("/").rsplit("/", 1)[-1]
        if name.endswith(".git"):
            name = name[:-4]
        return name

    def _commit_directory(self, commit_hash):
        commit_dir = self.output_directory / self._repository_name() / "commits" / commit_hash
        commit_dir.mkdir(parents=True, exist_ok=True)
        return commit_dir

    def _save_metadata(self, commit_dir, metadata):
        with open(commit_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

    def _save_diff(self, commit_dir, diff):
        with open(commit_dir / "diff.patch", "w") as f:
            f.write(diff)

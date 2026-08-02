import json
import tempfile
from pathlib import Path

from src.git.git_client import GitClient
from src.utils.build_system_detector import detect_build_system
from src.utils.co_change_detector import rank_co_changed_files
from src.utils.file_classifier import classify_file, is_build_file
from src.utils.language_detector import detect_languages
from src.utils.layout_detector import detect_layout
from src.utils.module_context_detector import get_local_module_files
from src.utils.signal_detector import detect_repository_signals
from src.semantic.python.symbol_extractor import extract_symbol_semantics


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

            self._save_repository_metadata(self._fetch_repository_metadata(repo_path))

            commit_hashes = self.git_client.get_non_merge_commit_hashes(repo_path, self.commit_count)
            if not commit_hashes:
                raise ValueError("no non-merge commits found in repository")

            for commit_hash in commit_hashes:
                metadata = self.git_client.get_commit_metadata(repo_path, commit_hash)
                diff = self.git_client.get_commit_diff(repo_path, commit_hash)

                commit_dir = self._commit_directory(commit_hash)
                artifacts_dir = self._artifacts_directory(commit_dir)
                self._save_metadata(artifacts_dir, metadata)
                self._save_diff(artifacts_dir, diff)

        return commit_hashes

    def _repository_name(self):
        name = self.repository_url.rstrip("/").rsplit("/", 1)[-1]
        if name.endswith(".git"):
            name = name[:-4]
        return name

    def _fetch_repository_metadata(self, repo_path):
        tracked_files = self.git_client.get_tracked_files(repo_path)
        return {
            "repository_url": self.repository_url,
            "default_branch": self.git_client.get_default_branch(repo_path),
            "commit_count": self.git_client.get_commit_count(repo_path),
            "first_commit_date": self.git_client.get_first_commit_date(repo_path),
            "last_commit_date": self.git_client.get_last_commit_date(repo_path),
            "contributors": self.git_client.get_contributors(repo_path, max_count=20),
            **detect_languages(tracked_files),
            **detect_build_system(repo_path, tracked_files),
            **detect_layout(tracked_files),
            **detect_repository_signals(tracked_files),
        }

    def _save_repository_metadata(self, metadata):
        repo_dir = self.output_directory / self._repository_name()
        repo_dir.mkdir(parents=True, exist_ok=True)
        with open(repo_dir / "repository.json", "w") as f:
            json.dump(metadata, f, indent=2)

    def _build_commit_identity(self, repo_path, commit_hash):
        return {
            "hash": commit_hash,
            "parent_hashes": self.git_client.get_parent_hashes(repo_path, commit_hash),
            "repository": self.repository_url,
        }

    def _build_commit_metadata(self, repo_path, commit_hash):
        commit_metadata = self.git_client.get_commit_metadata(repo_path, commit_hash)
        message = commit_metadata["subject"]
        if commit_metadata["body"]:
            message += "\n\n" + commit_metadata["body"]
        return {
            "author": {
                "name": commit_metadata["author_name"],
                "email": commit_metadata["author_email"],
            },
            "date": commit_metadata["date"],
            "message": message,
        }

    def _build_commit_change_set(self, repo_path, commit_hash):
        changed_files = self.git_client.get_changed_files(repo_path, commit_hash)

        added_files = []
        deleted_files = []
        renamed_files = []
        modified_files = []

        for entry in changed_files:
            status = entry["status"]
            if status.startswith("A"):
                added_files.append(entry["path"])
            elif status.startswith("D"):
                deleted_files.append(entry["path"])
            elif status.startswith("R"):
                renamed_files.append({"old_path": entry["old_path"], "path": entry["path"]})
            elif status.startswith("M"):
                modified_files.append(entry["path"])

        return {
            "changed_files": [entry["path"] for entry in changed_files],
            "added_files": added_files,
            "deleted_files": deleted_files,
            "renamed_files": renamed_files,
            "modified_files": modified_files,
        }

    def _build_commit_observations(self, change_set):
        changed_files = change_set["changed_files"]
        file_classification = {file_path: classify_file(file_path) for file_path in changed_files}
        classified_categories = set(file_classification.values())

        unknown_files = [
            file_path for file_path, category in file_classification.items()
            if category == "Unknown"
        ]
        unsupported_extensions = sorted({
            extension for file_path in unknown_files
            if (extension := Path(file_path).suffix.lower())
        })

        return {
            "touched_directories": detect_layout(changed_files)["directories"],
            "file_classification": file_classification,
            "change_statistics": {
                "files_added": len(change_set["added_files"]),
                "files_deleted": len(change_set["deleted_files"]),
                "files_modified": len(change_set["modified_files"]),
                "files_renamed": len(change_set["renamed_files"]),
            },
            "change_categories": {
                "touches_tests": "Test" in classified_categories,
                "touches_documentation": "Documentation" in classified_categories,
                "touches_dependencies": "Dependency" in classified_categories,
                "touches_build_files": any(is_build_file(fp) for fp in changed_files),
                "touches_ci": "CI/CD" in classified_categories,
                "touches_config": "Configuration" in classified_categories,
            },
            "extraction_confidence": {
                "unknown_file_count": len(unknown_files),
                "unsupported_extensions": unsupported_extensions,
                "skipped_binary_file_count": sum(
                    1 for category in file_classification.values() if category == "Binary"
                ),
            },
        }

    def _build_commit_file_history(self, repo_path, commit_hash, change_set, metadata):
        author_email = metadata["author"]["email"]
        return {
            file_path: self.git_client.get_file_history(
                repo_path, commit_hash, file_path, author_email=author_email
            )
            for file_path in change_set["changed_files"]
        }

    def _build_commit_co_change(self, repo_path, commit_hash, change_set):
        co_change = {}
        for file_path in change_set["changed_files"]:
            historical_file_lists = self.git_client.get_co_change_history(
                repo_path, commit_hash, file_path
            )
            co_change[file_path] = rank_co_changed_files(file_path, historical_file_lists)
        return co_change

    def _build_commit_local_module_context(self, repo_path, commit_hash, change_set):
        tracked_files = self.git_client.get_tracked_files(repo_path, commit_hash)
        changed_files = change_set["changed_files"]
        return {
            file_path: get_local_module_files(file_path, tracked_files, changed_files)
            for file_path in changed_files
        }

    def _build_commit_repository_signals(self, change_set):
        return detect_repository_signals(change_set["changed_files"])["repository_signals"]

    def _build_commit_semantic_analysis(self, repo_path, commit_hash, change_set):
        parent_hash = self.git_client.get_parent_hashes(repo_path, commit_hash)[0]
        files = []

        for file_path in change_set["added_files"]:
            if Path(file_path).suffix.lower() != ".py":
                continue
            new_source = self.git_client.get_file_content_at_commit(repo_path, commit_hash, file_path)
            files.append(extract_symbol_semantics(None, new_source, file_path))

        for file_path in change_set["deleted_files"]:
            if Path(file_path).suffix.lower() != ".py":
                continue
            old_source = self.git_client.get_file_content_at_commit(repo_path, parent_hash, file_path)
            files.append(extract_symbol_semantics(old_source, None, file_path))

        for file_path in change_set["modified_files"]:
            if Path(file_path).suffix.lower() != ".py":
                continue
            old_source = self.git_client.get_file_content_at_commit(repo_path, parent_hash, file_path)
            new_source = self.git_client.get_file_content_at_commit(repo_path, commit_hash, file_path)
            files.append(extract_symbol_semantics(old_source, new_source, file_path))

        for entry in change_set["renamed_files"]:
            old_path, new_path = entry["old_path"], entry["path"]
            if Path(old_path).suffix.lower() != ".py" and Path(new_path).suffix.lower() != ".py":
                continue
            old_source = self.git_client.get_file_content_at_commit(repo_path, parent_hash, old_path)
            new_source = self.git_client.get_file_content_at_commit(repo_path, commit_hash, new_path)
            result = extract_symbol_semantics(old_source, new_source, new_path)
            result["old_path"] = old_path
            result["change_type"] = "renamed"
            files.append(result)

        return {"files": files}

    def _build_commit_artifacts(self):
        return {
            "diff": "artifacts/diff.patch",
            "metadata": "artifacts/metadata.json",
        }

    def _commit_directory(self, commit_hash):
        commit_dir = self.output_directory / self._repository_name() / "commits" / commit_hash
        commit_dir.mkdir(parents=True, exist_ok=True)
        return commit_dir

    def _artifacts_directory(self, commit_dir):
        artifacts_dir = commit_dir / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        return artifacts_dir

    def _save_metadata(self, artifacts_dir, metadata):
        with open(artifacts_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

    def _save_diff(self, artifacts_dir, diff):
        with open(artifacts_dir / "diff.patch", "w") as f:
            f.write(diff)

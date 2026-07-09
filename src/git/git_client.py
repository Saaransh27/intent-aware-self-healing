import subprocess

EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"


class GitClient:

    def run_git_command(self, args, cwd=None):
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    def clone_repository(self, repo_url, destination, shallow=False):
        args = ["clone"]
        if shallow:
            args += ["--depth", "1"]
        args += [repo_url, destination]
        self.run_git_command(args)
        return None

    def get_commit_hashes(self, repo_path, max_count=None):
        args = ["log", "--format=%H"]
        if max_count:
            args.append(f"--max-count={max_count}")
        output = self.run_git_command(args, cwd=repo_path)
        return output.splitlines()

    def get_non_merge_commit_hashes(self, repo_path, max_count=None):
        args = ["log", "--no-merges", "--format=%H"]
        if max_count:
            args.append(f"--max-count={max_count}")
        output = self.run_git_command(args, cwd=repo_path)
        return output.splitlines()

    def get_commit_metadata(self, repo_path, commit_hash):
        fmt = "%H\x1f%an\x1f%ae\x1f%ad\x1f%P\x1f%s\x1f%b"
        args = ["show", "-s", f"--format={fmt}", "--date=iso-strict", commit_hash]
        output = self.run_git_command(args, cwd=repo_path).rstrip("\n")
        commit_hash_full, author_name, author_email, date, parents, subject, body = output.split("\x1f", 6)
        return {
            "hash": commit_hash_full,
            "author_name": author_name,
            "author_email": author_email,
            "date": date,
            "parents": parents.split() if parents else [],
            "subject": subject,
            "body": body,
        }

    def get_parent_hashes(self, repo_path, commit_hash):
        output = self.run_git_command(["log", "-1", "--format=%P", commit_hash], cwd=repo_path)
        return output.strip().split()

    def get_commit_diff(self, repo_path, commit_hash):
        parents = self.get_parent_hashes(repo_path, commit_hash)
        parent_hash = parents[0] if parents else EMPTY_TREE_HASH
        return self.run_git_command(["diff", parent_hash, commit_hash], cwd=repo_path)

    def get_changed_files(self, repo_path, commit_hash, parent_hash=None):
        if parent_hash is None:
            parents = self.get_parent_hashes(repo_path, commit_hash)
            parent_hash = parents[0] if parents else EMPTY_TREE_HASH
        output = self.run_git_command(
            ["diff", "--name-status", parent_hash, commit_hash], cwd=repo_path
        )
        changed_files = []
        for line in output.splitlines():
            fields = line.split("\t")
            if len(fields) == 2:
                status, file_path = fields
                changed_files.append({"status": status, "path": file_path})
            else:
                status, old_path, new_path = fields
                changed_files.append({"status": status, "old_path": old_path, "path": new_path})
        return changed_files

    def get_file_content_at_commit(self, repo_path, commit_hash, file_path):
        return self.run_git_command(["show", f"{commit_hash}:{file_path}"], cwd=repo_path)

    def checkout_commit(self, repo_path, commit_hash):
        self.run_git_command(["checkout", commit_hash], cwd=repo_path)

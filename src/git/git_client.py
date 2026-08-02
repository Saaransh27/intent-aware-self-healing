import subprocess
from datetime import datetime

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

    def get_default_branch(self, repo_path):
        return self.run_git_command(["rev-parse", "--abbrev-ref", "HEAD"], cwd=repo_path).strip()

    def get_commit_count(self, repo_path):
        return int(self.run_git_command(["rev-list", "--count", "HEAD"], cwd=repo_path).strip())

    def get_first_commit_date(self, repo_path):
        output = self.run_git_command(
            ["log", "--reverse", "--format=%ad", "--date=iso-strict"], cwd=repo_path
        )
        return output.splitlines()[0]

    def get_last_commit_date(self, repo_path):
        return self.run_git_command(
            ["log", "-1", "--format=%ad", "--date=iso-strict"], cwd=repo_path
        ).strip()

    def get_contributors(self, repo_path, max_count=None):
        output = self.run_git_command(["shortlog", "-sne", "HEAD"], cwd=repo_path)
        contributors = []
        for line in output.splitlines():
            count_str, rest = line.split("\t", 1)
            name, email = rest.rsplit(" <", 1)
            contributors.append({
                "name": name,
                "email": email.rstrip(">"),
                "commit_count": int(count_str.strip()),
            })
        return contributors[:max_count]

    def get_tracked_files(self, repo_path, commit_hash=None):
        if commit_hash:
            output = self.run_git_command(["ls-tree", "-r", "--name-only", commit_hash], cwd=repo_path)
        else:
            output = self.run_git_command(["ls-files"], cwd=repo_path)
        return output.splitlines()

    def get_file_history(self, repo_path, commit_hash, file_path, recent_window_days=30, author_email=None):
        output = self.run_git_command(
            ["log", commit_hash, "--follow", "--format=%ad\x1f%ae", "--date=iso-strict", "--", file_path],
            cwd=repo_path,
        )
        entries = [line.split("\x1f") for line in output.splitlines()]
        dates = [entry[0] for entry in entries]

        recent_commit_count = 0
        if len(dates) > 1:
            reference_date = datetime.fromisoformat(dates[0])
            recent_commit_count = sum(
                1
                for date in dates[1:]
                if (reference_date - datetime.fromisoformat(date)).days <= recent_window_days
            )

        history = {
            "total_commit_count": len(dates),
            "first_commit_date": dates[-1] if dates else None,
            "previous_commit_date": dates[1] if len(dates) > 1 else None,
            "is_first_appearance": len(dates) <= 1,
            "recent_commit_count": recent_commit_count,
        }

        if author_email is not None:
            author_commit_count = sum(1 for entry in entries[1:] if entry[1] == author_email)
            history["author_commit_count"] = author_commit_count
            history["is_first_touch_by_author"] = author_commit_count == 0

        return history

    def get_co_change_history(self, repo_path, commit_hash, file_path, max_history=50):
        output = self.run_git_command(
            ["log", commit_hash, "--follow", f"--max-count={max_history + 1}", "--format=%H", "--", file_path],
            cwd=repo_path,
        )
        historical_hashes = output.splitlines()[1:]
        return [
            [entry["path"] for entry in self.get_changed_files(repo_path, historical_hash)]
            for historical_hash in historical_hashes
        ]

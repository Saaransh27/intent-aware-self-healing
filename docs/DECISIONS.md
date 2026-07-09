ADR-001

Title:
Use native Git CLI as the primary Git interface.

Status:
Accepted

Context:
The project relies heavily on Git operations for building benchmark datasets.

Decision:
Use native Git commands wrapped inside a GitClient abstraction.

Rationale:
- Full feature parity with Git.
- Easier to reproduce manually.
- Better long-term flexibility.
- No dependency on wrapper limitations.
- Developers can directly map code to Git documentation.

Trade-offs:
- Need to parse command output.
- Slightly more implementation effort.

Revisit When:
If Git command parsing becomes complex or error-prone enough to outweigh these benefits.

---

ADR-002

Title:
Git commit-graph semantics (e.g. merge detection) live in GitClient, never in callers.

Status:
Accepted

Context:
DatasetCollector originally found the latest non-merge commit itself: it walked
GitClient.get_commit_hashes() and checked len(get_parent_hashes(...)) <= 1 for each one,
relying on get_commit_hashes returning newest-first order and on knowing that a merge
commit is defined as "more than one parent." That put Git domain knowledge inside the
collector and required one subprocess call per commit inspected.

Decision:
Add GitClient.get_latest_non_merge_commit_hash(repo_path), backed by a single
`git log --no-merges -1` call. DatasetCollector now only asks for the commit it wants;
it holds no knowledge of what makes a commit a merge commit or what order history comes in.

Rationale:
- Keeps GitClient as the sole owner of Git semantics; callers stay Git-agnostic.
- One subprocess call instead of one per commit walked — avoids an O(n)-subprocess
  bottleneck if this is ever run against a repository with many merge commits at HEAD.
- Makes DatasetCollector easier to point at a different git-access implementation later,
  since its contract with GitClient is now "give me a commit hash," not "give me commit
  data I then reason about."

Trade-offs:
- One more method on GitClient's public surface.

Revisit When:
If DatasetCollector needs commit-selection logic that isn't a single git-native filter
(e.g. "latest commit touching path X that isn't a merge") — at that point, decide whether
GitClient grows more specialized finder methods or exposes a more general query primitive.
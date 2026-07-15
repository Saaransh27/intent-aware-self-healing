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

---

ADR-003

Title:
Raw per-commit artifacts (metadata.json, diff.patch) live under an artifacts/ subfolder,
not directly in the commit directory.

Status:
Accepted

Context:
Milestone 4A introduces a structured commit.json per commit, made of five sections
(identity, metadata, change_set, artifacts, collection). Until now, metadata.json and
diff.patch were written directly at commits/<hash>/. Writing commit.json into that same
directory alongside them would leave two different kinds of file (one structured index,
two raw git outputs) flatly mixed together with no visual/structural distinction.

Decision:
metadata.json and diff.patch move to commits/<hash>/artifacts/metadata.json and
commits/<hash>/artifacts/diff.patch. commit.json's own artifacts section records their
location as relative paths ("artifacts/diff.patch", "artifacts/metadata.json") rather
than duplicating their content inline.

Rationale:
- commit.json becomes the single entry point for a commit; raw git outputs are reachable
  from it by reference, not duplicated.
- Keeps commits/<hash>/ readable at a glance: one JSON index file, one artifacts/ folder.
- Confirmed with the user before moving physical file locations (an actual behavior
  change, not just new data) rather than assuming this was in scope.

Trade-offs:
- One more level of directory nesting for every commit.
- Any external tooling or manual scripts already pointed at
  commits/<hash>/metadata.json directly (outside this codebase) would break silently —
  there are none known today.

Revisit When:
If commit.json ends up needing to duplicate the raw metadata/diff content inline instead
of referencing it (e.g. for tooling that can't resolve relative paths), or if more
artifact types are added and warrant their own subfolder structure within artifacts/.

---

ADR-004

Title:
Per-commit evidence extractors must scope file-tree queries to the target commit itself,
never the current checkout.

Status:
Accepted

Context:
While validating the full pipeline against a real, previously-untested repository
(pallets/flask), `_build_commit_local_module_context` was found to return 0 siblings for
two files that actually had 10 real siblings at the time of the commit. The cause:
`GitClient.get_tracked_files(repo_path)` runs `git ls-files`, which lists whatever is
currently checked out — the repo's present-day HEAD, not the target commit's point in
time. Flask's `requirements/` directory (12 files as of the 2023 commit under test) has
since been removed entirely from current HEAD, so the query silently returned nothing
for those files. This is the same class of bug the `--reverse -1` and "future leakage"
issues caught earlier belong to: an operation implicitly scoped to the wrong point in
git history, discovered only by testing against a repository whose history has visibly
moved since Milestone 3's fastapi-only testing.

Decision:
`GitClient.get_tracked_files` now takes an optional `commit_hash` — when given, it uses
`git ls-tree -r --name-only <commit_hash>` instead of `git ls-files`, returning the tree
exactly as it existed at that commit. `_build_commit_local_module_context` now passes
`commit_hash` through. The repository-level caller (`_fetch_repository_metadata`, for
`repository.json`) intentionally omits it, since that file is meant to describe the
repo's current state, not any single commit's.

Rationale:
- Every per-commit extractor operates on "the repository as of this commit," not "the
  repository as it is today" — this was already true by construction for
  `get_file_history` and `get_co_change_history` (both take `commit_hash` directly), but
  `get_tracked_files` was the one place that broke the pattern, because its original
  caller (`repository.json`) genuinely wanted current-HEAD semantics and nobody
  re-examined that assumption when it gained a second caller.
- Backward compatible: `commit_hash` defaults to `None`, so the existing
  repository-level call needed no changes.
- Found through testing against a *different* real repository, not the ones already
  exercised repeatedly (fastapi, tcx_nogrunt-1) — a concrete argument for periodically
  validating against fresh repos rather than only ever re-testing the same ones.

Trade-offs:
- One more conditional branch inside `get_tracked_files` rather than two separate
  methods — chosen to keep the method count small; revisit if the two code paths
  diverge further.

Revisit When:
If another `GitClient` method is added that lists something tree-wide (not commit- or
path-specific) — check up front whether it needs the same optional `commit_hash` scoping
rather than discovering the gap through a real bug again.
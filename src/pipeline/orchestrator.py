import tempfile
from pathlib import Path

from src.adapter.llm_adapter import run_adapter
from src.collector.dataset_collector import DatasetCollector
from src.fusion.evidence_fusion import fuse_evidence
from src.git.git_client import GitClient
from src.prompt.prompt_builder import build_prompt
from src.reasoning.registry import run_reasoning
from src.reasoning.synthesizer import synthesize
from src.review.context_builder import build_review_context
from src.review_engine.review_engine import run_review_engine


class CommitResolutionError(Exception):
    """Raised when the repository or the target commit cannot be resolved."""


def _build_evidence(collector, repo_path, commit_hash):
    metadata = collector._build_commit_metadata(repo_path, commit_hash)
    change_set = collector._build_commit_change_set(repo_path, commit_hash)

    # diff_stats (real `git diff --numstat` line counts) is merged into
    # observations rather than kept as its own evidence category — it's a
    # commit-level fact bundle alongside file_classification/change_statistics,
    # not a claim source any reasoning module consumes.
    observations = {
        **collector._build_commit_observations(change_set),
        "diff_stats": collector._build_commit_diff_stats(repo_path, commit_hash),
    }

    evidence = {
        "metadata": metadata,
        "change_set": change_set,
        "repository_signals": collector._build_commit_repository_signals(change_set),
        "observations": observations,
        "file_history": collector._build_commit_file_history(repo_path, commit_hash, change_set, metadata),
        "co_change": collector._build_commit_co_change(repo_path, commit_hash, change_set),
        "local_module_context": collector._build_commit_local_module_context(repo_path, commit_hash, change_set),
        "semantic_analysis": collector._build_commit_semantic_analysis(repo_path, commit_hash, change_set),
    }
    return evidence, metadata, change_set


def run_pipeline_for_commit(repository_url, commit_hash, execute):
    """Runs the full pipeline for one commit: clone -> evidence -> fusion ->
    reasoning -> review context -> prompt -> adapter -> review engine.

    `commit_hash` may be None, in which case the repository's most recent
    non-merge commit is used. `execute` is passed straight through to
    `run_adapter` — this function has no knowledge of any specific provider.

    Returns {"repository_url", "commit_hash", "prompt", "adapter_result",
    "review_result", "review_context", "observations"}. `review_context` and
    `observations` are the same real, deterministic data already computed to
    build the prompt — returned here too so the API can expose them directly,
    rather than the model having to re-describe them in prose. Raises
    CommitResolutionError if the repository or the target commit cannot be
    resolved.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        repo_path = Path(temp_dir)
        git_client = GitClient()

        try:
            git_client.clone_repository(repository_url, str(repo_path))
        except Exception as exc:
            raise CommitResolutionError(f"could not clone repository: {repository_url}") from exc

        collector = DatasetCollector(repository_url, str(repo_path), commit_count=1)
        collector.git_client = git_client

        resolved_commit_hash = commit_hash
        if resolved_commit_hash is None:
            try:
                commit_hashes = git_client.get_non_merge_commit_hashes(repo_path, 1)
            except Exception as exc:
                raise CommitResolutionError("could not list commits in repository") from exc
            if not commit_hashes:
                raise CommitResolutionError("no non-merge commits found in repository")
            resolved_commit_hash = commit_hashes[0]

        try:
            evidence, metadata, change_set = _build_evidence(collector, repo_path, resolved_commit_hash)
            diff_text = git_client.get_commit_diff(repo_path, resolved_commit_hash)
        except Exception as exc:
            raise CommitResolutionError(f"could not resolve commit: {resolved_commit_hash}") from exc

        fused = fuse_evidence(evidence)
        module_outputs = run_reasoning(fused)
        synthesized = synthesize(module_outputs)

        review_context = build_review_context(
            synthesized, metadata, change_set, diff_text, resolved_commit_hash
        )
        prompt = build_prompt(review_context)

        adapter_result = run_adapter(prompt, execute)
        review_result = run_review_engine(adapter_result)

    return {
        "repository_url": repository_url,
        "commit_hash": resolved_commit_hash,
        "prompt": prompt,
        "adapter_result": adapter_result,
        "review_result": review_result,
        "review_context": review_context,
        "observations": evidence["observations"],
    }


# --- PR review -------------------------------------------------------------
#
# A PR is treated as one synthetic diff (base...head, git's own three-dot
# semantics — the diff against the merge-base, not a raw two-dot diff
# against base's current tip) rather than as N separate per-commit reviews.
# This is the smallest change that lets the entire downstream chain below
# (fuse_evidence onward) run completely unmodified: it already only cares
# about "an evidence dict shaped like the commit flow's," never about
# whether that evidence came from one commit or a range.
#
# Known, deliberate limitation: _build_commit_file_history/_build_commit_co_change
# treat their commit_hash argument as "this one entry is the current commit,
# everything before it in the log is history." For a PR whose OWN commits
# touch the same file more than once, only the head commit is excluded from
# "history" — the PR's other commits are (incorrectly) counted as historical
# churn. Fixing this needs those two methods to exclude a *set* of commits,
# not one; deferred rather than risking their tested single-commit behavior
# for a secondary signal. Single-commit PRs are unaffected.

def _pr_metadata(pr_info):
    message = pr_info["title"]
    if pr_info.get("body"):
        message += "\n\n" + pr_info["body"]
    created_at = pr_info["created_at"]
    if created_at.endswith("Z"):
        created_at = created_at[:-1] + "+00:00"
    return {
        "author": {"name": pr_info["author_login"], "email": None},
        "date": created_at,
        "message": message,
    }


def _build_pr_evidence(collector, repo_path, base_sha, head_sha):
    merge_base = collector.git_client.get_merge_base(repo_path, base_sha, head_sha)
    change_set = collector._build_commit_change_set(repo_path, head_sha, parent_hash=merge_base)

    observations = {
        **collector._build_commit_observations(change_set),
        "diff_stats": collector._build_commit_diff_stats(repo_path, head_sha, parent_hash=merge_base),
    }

    # author_email is deliberately None: a PR's GitHub author login has no
    # reliable public git-commit email, and get_file_history/historical_risk
    # already treat a missing author_email as "skip the author-touch claim,"
    # not "assume unfamiliar" — passing "" instead would falsely match every
    # file's real author_commit_count of zero against an empty string.
    no_author_metadata = {"author": {"email": None}}

    evidence = {
        "change_set": change_set,
        "repository_signals": collector._build_commit_repository_signals(change_set),
        "observations": observations,
        "file_history": collector._build_commit_file_history(
            repo_path, head_sha, change_set, no_author_metadata
        ),
        "co_change": collector._build_commit_co_change(repo_path, head_sha, change_set),
        "local_module_context": collector._build_commit_local_module_context(repo_path, head_sha, change_set),
        "semantic_analysis": collector._build_commit_semantic_analysis(
            repo_path, head_sha, change_set, parent_hash=merge_base
        ),
    }
    return evidence, change_set


def run_pipeline_for_pr(repository_url, pr_number, execute, resolve_pr, access_token=None):
    """PR analogue of run_pipeline_for_commit: reviews a PR's complete
    base...head diff (every commit in the PR combined, not just its latest
    one) through the exact same downstream chain (fuse_evidence -> ... ->
    ReviewEngine), unmodified.

    `resolve_pr` is injected the same way `execute` is — production wiring
    passes the real GitHub API resolver (src.github.pr_resolver.
    resolve_pull_request, or Milestone 3A's authenticated
    src.github.client.get_pull_request_refs, chosen by the caller); tests
    pass a stub against a real local repo fixture, no network involved
    either way.

    `access_token` (Milestone 3A) is optional and defaults to None,
    preserving Milestone 1's exact unauthenticated behavior when omitted
    — it is passed only to this function's own git operations
    (clone/fetch), enabling access to a private repository the token can
    see. It is never passed to `resolve_pr` — the caller already chose
    (and, if needed, closed over the token in) the right resolver for
    that.

    Returns {"repository_url", "pr_number", "base_sha", "head_sha", "prompt",
    "adapter_result", "review_result", "review_context", "observations"}.
    Raises CommitResolutionError if the repository, the PR, or its refs
    cannot be resolved — the same exception run_pipeline_for_commit raises,
    so the API layer's existing 404 handling covers both without change.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        repo_path = Path(temp_dir)
        git_client = GitClient()

        try:
            git_client.clone_repository(repository_url, str(repo_path), access_token=access_token)
        except Exception as exc:
            raise CommitResolutionError(f"could not clone repository: {repository_url}") from exc

        try:
            pr_info = resolve_pr(repository_url, pr_number)
        except Exception as exc:
            raise CommitResolutionError(f"could not resolve pull request #{pr_number}") from exc

        base_sha, head_sha = pr_info["base_sha"], pr_info["head_sha"]

        try:
            git_client.fetch_ref(repo_path, base_sha, access_token=access_token)
            git_client.fetch_ref(repo_path, head_sha, access_token=access_token)
        except Exception as exc:
            raise CommitResolutionError(
                f"could not fetch refs for pull request #{pr_number}"
            ) from exc

        collector = DatasetCollector(repository_url, str(repo_path), commit_count=1)
        collector.git_client = git_client

        try:
            evidence, change_set = _build_pr_evidence(collector, repo_path, base_sha, head_sha)
            diff_text = git_client.get_pr_diff(repo_path, base_sha, head_sha)
        except Exception as exc:
            raise CommitResolutionError(
                f"could not resolve pull request diff for #{pr_number}"
            ) from exc

        evidence["metadata"] = _pr_metadata(pr_info)

        fused = fuse_evidence(evidence)
        module_outputs = run_reasoning(fused)
        synthesized = synthesize(module_outputs)

        review_context = build_review_context(
            synthesized, evidence["metadata"], change_set, diff_text, head_sha
        )
        prompt = build_prompt(review_context)

        adapter_result = run_adapter(prompt, execute)
        review_result = run_review_engine(adapter_result)

    return {
        "repository_url": repository_url,
        "pr_number": pr_number,
        "base_sha": base_sha,
        "head_sha": head_sha,
        "prompt": prompt,
        "adapter_result": adapter_result,
        "review_result": review_result,
        "review_context": review_context,
        "observations": evidence["observations"],
    }

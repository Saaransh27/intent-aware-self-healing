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

    evidence = {
        "metadata": metadata,
        "change_set": change_set,
        "repository_signals": collector._build_commit_repository_signals(change_set),
        "observations": collector._build_commit_observations(change_set),
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
    "review_result"}. Raises CommitResolutionError if the repository or the
    target commit cannot be resolved.
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
    }

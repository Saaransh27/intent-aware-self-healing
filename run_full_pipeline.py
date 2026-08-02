import json
import sys

from src.pipeline.gemini_execute import call_gemini
from src.pipeline.orchestrator import CommitResolutionError, run_pipeline_for_commit


def main():
    repository_url = sys.argv[1] if len(sys.argv) > 1 else "https://github.com/pallets/click"
    commit_hash = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"Cloning {repository_url} ...")
    try:
        result = run_pipeline_for_commit(repository_url, commit_hash, execute=call_gemini)
    except CommitResolutionError as exc:
        print(f"Could not resolve a commit to review: {exc}")
        sys.exit(1)

    print(f"Selected commit: {result['commit_hash']}")

    prompt = result["prompt"]
    print("\n--- Generated prompt (system) ---")
    print(prompt["system_prompt"][:500] + "\n...[truncated]...")
    print("\n--- Generated prompt (user, first 1000 chars) ---")
    print(prompt["user_prompt"][:1000] + "\n...[truncated]...")

    adapter_result = result["adapter_result"]
    print("\n--- Adapter result ---")
    print(json.dumps({**adapter_result, "response": (adapter_result["response"] or "")[:2000]}, indent=2))

    review_result = result["review_result"]
    print("\n--- Review Engine result ---")
    print(json.dumps({**review_result, "response": (review_result["response"] or "")[:2000]}, indent=2))


if __name__ == "__main__":
    main()

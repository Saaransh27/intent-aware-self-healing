from datetime import datetime

from src.reasoning.contracts import claim, gap, file_scope

NAME = "historical_risk"
CONSUMES = ["file_history", "metadata"]
PRODUCES = [
    "history.first_appearance",
    "history.hot_file",
    "history.long_dormant_reactivated",
    "history.rapid_iteration",
    "history.high_recent_churn",
    "history.first_author_touch",
]
LIMITATIONS = [
    "hot_file (>=50 total commits), long_dormant_reactivated (>=180 days since "
    "previous touch), rapid_iteration (<=1 hour since previous touch), and "
    "high_recent_churn (>=5 commits in the last 30 days, per file_history's own "
    "recent_commit_count) are all fixed default thresholds, not validated tuning.",
    "long_dormant_reactivated and rapid_iteration both need file_history and metadata "
    "for the same file; if metadata is unavailable, those claims are skipped and "
    "reported as a gap rather than guessed from file_history alone.",
    "high_recent_churn depends on file_history's recent_commit_count, which — like "
    "total_commit_count — inherits GitClient.get_file_history's missing --follow: a "
    "renamed file's recent history resets to zero at the rename boundary.",
    "first_author_touch depends on file_history's author_commit_count/"
    "is_first_touch_by_author, which are only present when the file_history entry was "
    "built with an author_email — if a caller didn't provide one, these keys are "
    "simply absent and the claim is silently skipped, not reported as a gap.",
    "first_author_touch states a fact (this author's first commit touching this "
    "file), not an interpretation — it does not mean the author is unfamiliar with "
    "the code, only that no prior commit under this exact email touched this exact "
    "path. Renamed-file history resets at the rename boundary (inherits "
    "get_file_history's missing --follow, same as total_commit_count); identity is "
    "by exact email match, so the same person committing as bob@gmail.com and "
    "bob@company.com is read as two different authors, by design.",
]

HOT_FILE_THRESHOLD = 50
DORMANT_DAYS_THRESHOLD = 180
RAPID_ITERATION_HOURS = 1
RECENT_CHURN_THRESHOLD = 5


def _days_between(iso_a, iso_b):
    return abs((datetime.fromisoformat(iso_a) - datetime.fromisoformat(iso_b)).days)


def _hours_between(iso_a, iso_b):
    return abs((datetime.fromisoformat(iso_a) - datetime.fromisoformat(iso_b)).total_seconds()) / 3600


def reason(evidence):
    claims = []
    gaps = []

    metadata_entry = evidence["commit"].get("metadata", {"status": "not_collected"})
    commit_date = metadata_entry["evidence"]["date"] if metadata_entry["status"] == "ok" else None

    for file_bundle in evidence["files"]:
        file_path = file_bundle["file_path"]
        scope = file_scope(file_path)
        history_entry = file_bundle.get("file_history", {"status": "not_collected"})

        if history_entry["status"] != "ok":
            gaps.append(gap("cannot_assess_history", scope, ["file_history"]))
            continue

        history = history_entry["evidence"]

        if history["is_first_appearance"]:
            claims.append(claim("history.first_appearance", scope, "observed", ["file_history"]))

        if history["total_commit_count"] >= HOT_FILE_THRESHOLD:
            claims.append(claim("history.hot_file", scope, "inferred", ["file_history"]))

        if history["previous_commit_date"]:
            if commit_date:
                if _days_between(commit_date, history["previous_commit_date"]) >= DORMANT_DAYS_THRESHOLD:
                    claims.append(claim(
                        "history.long_dormant_reactivated", scope, "inferred",
                        ["file_history", "metadata"],
                    ))
                if _hours_between(commit_date, history["previous_commit_date"]) <= RAPID_ITERATION_HOURS:
                    claims.append(claim(
                        "history.rapid_iteration", scope, "inferred",
                        ["file_history", "metadata"],
                    ))
            else:
                gaps.append(gap("cannot_assess_dormancy", scope, ["metadata"]))

        if history["recent_commit_count"] >= RECENT_CHURN_THRESHOLD:
            claims.append(claim("history.high_recent_churn", scope, "inferred", ["file_history"]))

        if history.get("is_first_touch_by_author") and not history["is_first_appearance"]:
            claims.append(claim("history.first_author_touch", scope, "observed", ["file_history"]))

    return {"module": NAME, "claims": claims, "gaps": gaps}

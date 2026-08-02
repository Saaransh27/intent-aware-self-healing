from src.reasoning.contracts import claim, gap, commit_scope, file_scope

NAME = "verification_coverage"
CONSUMES = ["file_classification", "semantic_analysis"]
PRODUCES = [
    "verification.test_files_changed",
    "verification.no_test_files_changed",
    "verification.public_change_without_tests",
]
LIMITATIONS = [
    "Determines test presence purely from file_classification categories, not from a "
    "naming-convention or co-change cross-reference — a test file this classifier "
    "doesn't recognize would be silently invisible to this module.",
    "public_change_without_tests only fires for Python files with semantic_analysis "
    "data; a public contract change in a non-Python file cannot be assessed here.",
]


def reason(evidence):
    claims = []
    gaps = []

    classifications = {}
    for file_bundle in evidence["files"]:
        entry = file_bundle.get("file_classification", {"status": "not_collected"})
        if entry["status"] == "ok":
            classifications[file_bundle["file_path"]] = entry["evidence"]
        else:
            gaps.append(gap("cannot_classify_file", file_scope(file_bundle["file_path"]), ["file_classification"]))

    if classifications:
        if "Test" in classifications.values():
            claims.append(claim("verification.test_files_changed", commit_scope(), "observed", ["file_classification"]))
        else:
            claims.append(claim("verification.no_test_files_changed", commit_scope(), "observed", ["file_classification"]))

    tests_present = "Test" in classifications.values()

    for file_bundle in evidence["files"]:
        file_path = file_bundle["file_path"]
        if classifications.get(file_path) == "Test":
            continue

        semantic_entry = file_bundle.get("semantic_analysis", {"status": "not_collected"})
        if semantic_entry["status"] != "ok":
            continue

        has_public_signature_change = any(
            symbol["visibility"] == "public" and symbol["signature_changed"]
            for symbol in semantic_entry["evidence"]["symbols"]
        )

        if has_public_signature_change and not tests_present:
            claims.append(claim(
                "verification.public_change_without_tests", file_scope(file_path),
                "corroborated", ["semantic_analysis", "file_classification"],
            ))

    return {"module": NAME, "claims": claims, "gaps": gaps}

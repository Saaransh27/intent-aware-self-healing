from src.reasoning.contracts import claim, gap, commit_scope

NAME = "change_shape"
CONSUMES = [
    "change_set",
    "touched_directories",
    "change_statistics",
    "change_categories",
    "extraction_confidence",
    "file_classification",
]
PRODUCES = [
    "shape.wide_change",
    "shape.narrow_change",
    "shape.heterogeneous_categories",
    "shape.homogeneous_categories",
    "shape.touches_tests",
    "shape.touches_documentation",
    "shape.touches_dependencies",
    "shape.touches_build_files",
    "shape.touches_ci",
    "shape.touches_config",
    "shape.low_extraction_confidence",
]
LIMITATIONS = [
    "wide_change (>10 files) is a fixed default threshold, not validated tuning.",
    "'observations' (the pre-Fusion section name) is consumed here as its constituent "
    "Fusion bundle keys — touched_directories/change_statistics/change_categories/ "
    "extraction_confidence (commit-level) plus file_classification (file-level) — "
    "since Fusion never nested them under one 'observations' key.",
]

WIDE_CHANGE_THRESHOLD = 10


def reason(evidence):
    claims = []
    gaps = []
    scope = commit_scope()

    change_set_entry = evidence["commit"].get("change_set", {"status": "not_collected"})
    if change_set_entry["status"] != "ok":
        gaps.append(gap("cannot_assess_size", scope, ["change_set"]))
    else:
        change_set = change_set_entry["evidence"]
        total_files = len(change_set["changed_files"])
        if total_files > WIDE_CHANGE_THRESHOLD:
            claims.append(claim("shape.wide_change", scope, "inferred", ["change_set"]))
        else:
            claims.append(claim("shape.narrow_change", scope, "inferred", ["change_set"]))

    classifications = [
        file_bundle["file_classification"]["evidence"]
        for file_bundle in evidence["files"]
        if file_bundle.get("file_classification", {"status": "not_collected"})["status"] == "ok"
    ]
    if classifications:
        if len(set(classifications)) > 1:
            claims.append(claim("shape.heterogeneous_categories", scope, "observed", ["file_classification"]))
        else:
            claims.append(claim("shape.homogeneous_categories", scope, "observed", ["file_classification"]))
    else:
        gaps.append(gap("cannot_assess_categories", scope, ["file_classification"]))

    categories_entry = evidence["commit"].get("change_categories", {"status": "not_collected"})
    if categories_entry["status"] != "ok":
        gaps.append(gap("cannot_assess_categories", scope, ["change_categories"]))
    else:
        booleans = categories_entry["evidence"]
        flag_to_claim = {
            "touches_tests": "shape.touches_tests",
            "touches_documentation": "shape.touches_documentation",
            "touches_dependencies": "shape.touches_dependencies",
            "touches_build_files": "shape.touches_build_files",
            "touches_ci": "shape.touches_ci",
            "touches_config": "shape.touches_config",
        }
        for flag_name, claim_id in flag_to_claim.items():
            if booleans.get(flag_name):
                claims.append(claim(claim_id, scope, "observed", ["change_categories"]))

    confidence_entry = evidence["commit"].get("extraction_confidence", {"status": "not_collected"})
    if confidence_entry["status"] != "ok":
        gaps.append(gap("cannot_assess_extraction_confidence", scope, ["extraction_confidence"]))
    elif confidence_entry["evidence"]["unknown_file_count"] > 0:
        claims.append(claim("shape.low_extraction_confidence", scope, "observed", ["extraction_confidence"]))

    return {"module": NAME, "claims": claims, "gaps": gaps}

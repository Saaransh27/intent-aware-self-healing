def _envelope(status, evidence=None):
    return {"status": status, "evidence": evidence}


def _resolve_metadata(evidence):
    if "metadata" not in evidence:
        return _envelope("not_collected")
    return _envelope("ok", evidence["metadata"])


def _resolve_change_set(evidence):
    if "change_set" not in evidence:
        return _envelope("not_collected")
    return _envelope("ok", evidence["change_set"])


def _resolve_repository_signals(evidence):
    if "repository_signals" not in evidence:
        return _envelope("not_collected")
    return _envelope("ok", evidence["repository_signals"])


def _resolve_observations_field(evidence, field_name):
    if "observations" not in evidence:
        return _envelope("not_collected")
    observations = evidence["observations"]
    if field_name not in observations:
        return _envelope("not_applicable")
    return _envelope("ok", observations[field_name])


def _resolve_file_change_status(evidence, file_path):
    if "change_set" not in evidence:
        return _envelope("not_collected")
    change_set = evidence["change_set"]

    if file_path in change_set.get("added_files", []):
        return _envelope("ok", {"file_status": "added", "old_path": None})
    if file_path in change_set.get("deleted_files", []):
        return _envelope("ok", {"file_status": "deleted", "old_path": None})
    if file_path in change_set.get("modified_files", []):
        return _envelope("ok", {"file_status": "modified", "old_path": None})
    for entry in change_set.get("renamed_files", []):
        if entry["path"] == file_path:
            return _envelope("ok", {"file_status": "renamed", "old_path": entry["old_path"]})
    return _envelope("not_applicable")


def _resolve_file_classification(evidence, file_path):
    if "observations" not in evidence:
        return _envelope("not_collected")
    classification = evidence["observations"].get("file_classification", {})
    if file_path not in classification:
        return _envelope("not_applicable")
    return _envelope("ok", classification[file_path])


def _resolve_per_file_section(evidence, section_name, file_path):
    if section_name not in evidence:
        return _envelope("not_collected")
    section = evidence[section_name]
    if file_path not in section:
        return _envelope("not_applicable")
    return _envelope("ok", section[file_path])


def _resolve_semantic_analysis(evidence, file_path):
    if "semantic_analysis" not in evidence:
        return _envelope("not_collected")
    files = evidence["semantic_analysis"].get("files", [])
    match = next((entry for entry in files if entry["file_path"] == file_path), None)
    if match is None:
        return _envelope("not_applicable")
    return _envelope("ok", match)


def _build_commit_bundle(evidence):
    return {
        "metadata": _resolve_metadata(evidence),
        "change_set": _resolve_change_set(evidence),
        "repository_signals": _resolve_repository_signals(evidence),
        "touched_directories": _resolve_observations_field(evidence, "touched_directories"),
        "change_statistics": _resolve_observations_field(evidence, "change_statistics"),
        "change_categories": _resolve_observations_field(evidence, "change_categories"),
        "extraction_confidence": _resolve_observations_field(evidence, "extraction_confidence"),
    }


def _build_file_bundle(evidence, file_path):
    return {
        "file_path": file_path,
        "change_set": _resolve_file_change_status(evidence, file_path),
        "file_classification": _resolve_file_classification(evidence, file_path),
        "file_history": _resolve_per_file_section(evidence, "file_history", file_path),
        "co_change": _resolve_per_file_section(evidence, "co_change", file_path),
        "local_module_context": _resolve_per_file_section(evidence, "local_module_context", file_path),
        "semantic_analysis": _resolve_semantic_analysis(evidence, file_path),
    }


def fuse_evidence(evidence):
    file_paths = evidence.get("change_set", {}).get("changed_files", [])
    return {
        "commit": _build_commit_bundle(evidence),
        "files": [_build_file_bundle(evidence, file_path) for file_path in file_paths],
    }

import copy
import re

COLLAPSE_CANDIDATE_CLAIM_IDS = {"shape.wide_change", "shape.homogeneous_categories"}
RISK_BEARING_MODULES = {"contract_stability", "reach"}
RISK_BEARING_CLAIM_IDS = {
    "verification.public_change_without_tests",
    "history.first_author_touch",
    "history.hot_file",
}

LIMITATIONS = [
    "Evidence Units are split per-file only, never per-hunk — ADR-011 names per-hunk "
    "splitting as conditional ('where warranted') without defining the trigger, so "
    "inventing one here would be adding architecture the ADR doesn't specify.",
    "A collapse group is only formed when at least two files are eligible — collapsing "
    "a single file has no volume benefit, so a lone eligible file is always rendered "
    "'full'.",
    "File paths are read preferentially from a diff block's '+++ b/<path>' or "
    "'--- a/<path>' line rather than the 'diff --git a/X b/Y' header, to avoid "
    "ambiguity when git quotes paths containing spaces or special characters — a path "
    "git escapes unusually could still be parsed incorrectly.",
    "change_set['changed_files'] is the sole source of truth for which files exist in "
    "this commit; a file present there but absent from the diff text (e.g. a mode-only "
    "change) still gets an Evidence Unit, with no line range and no diff text.",
]


def _split_diff_by_file(diff_text):
    if not diff_text:
        return {}

    blocks = {}
    raw_blocks = re.split(r"(?=^diff --git )", diff_text, flags=re.MULTILINE)

    for raw_block in raw_blocks:
        if not raw_block.startswith("diff --git "):
            continue

        file_path = _extract_file_path(raw_block)
        if file_path is None:
            continue

        start_line, end_line = _hunk_line_range(raw_block)
        blocks[file_path] = {
            "text": raw_block.rstrip("\n"),
            "start_line": start_line,
            "end_line": end_line,
        }

    return blocks


def _extract_file_path(raw_block):
    new_path_match = re.search(r"^\+\+\+ b/(.+)$", raw_block, flags=re.MULTILINE)
    if new_path_match:
        return new_path_match.group(1).strip()

    old_path_match = re.search(r"^--- a/(.+)$", raw_block, flags=re.MULTILINE)
    if old_path_match:
        return old_path_match.group(1).strip()

    header_match = re.search(r"^diff --git a/.+ b/(.+)$", raw_block, flags=re.MULTILINE)
    if header_match:
        return header_match.group(1).strip()

    return None


def _hunk_line_range(raw_block):
    is_deleted_file = "\n+++ /dev/null" in raw_block or raw_block.startswith("+++ /dev/null")

    hunk_headers = re.findall(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", raw_block, flags=re.MULTILINE)
    if not hunk_headers:
        return None, None

    starts = []
    ends = []
    for old_start, old_count, new_start, new_count in hunk_headers:
        if is_deleted_file:
            start = int(old_start)
            count = int(old_count) if old_count else 1
        else:
            start = int(new_start)
            count = int(new_count) if new_count else 1
        starts.append(start)
        ends.append(start + max(count - 1, 0))

    return min(starts), max(ends)


def _is_risk_bearing_claim(claim_entry):
    return claim_entry["module"] in RISK_BEARING_MODULES or claim_entry["claim"] in RISK_BEARING_CLAIM_IDS


def _file_is_risk_bearing(file_path, file_claims, symbol_claims):
    if any(_is_risk_bearing_claim(entry) for entry in file_claims.get(file_path, [])):
        return True

    prefix = f"{file_path}::"
    for key, entries in symbol_claims.items():
        if key.startswith(prefix) and any(_is_risk_bearing_claim(entry) for entry in entries):
            return True

    return False


def _is_collapse_candidate_commit(commit_claims):
    return any(entry["claim"] in COLLAPSE_CANDIDATE_CLAIM_IDS for entry in commit_claims)


def _eligible_files(changed_files, commit_claims, file_claims, symbol_claims):
    if not _is_collapse_candidate_commit(commit_claims):
        return []
    return [
        file_path for file_path in changed_files
        if not _file_is_risk_bearing(file_path, file_claims, symbol_claims)
    ]


def _build_commit_summary(metadata, change_set):
    return {
        "message": metadata["message"],
        "changed_files": change_set["changed_files"],
        "added_files": change_set["added_files"],
        "deleted_files": change_set["deleted_files"],
        "modified_files": change_set["modified_files"],
        "renamed_files": change_set["renamed_files"],
    }


def _evidence_unit(file_path, tag, diff_block):
    if diff_block is None:
        return {
            "address": {"file_path": file_path, "start_line": None, "end_line": None},
            "tag": tag,
            "diff_text": None,
        }
    return {
        "address": {
            "file_path": file_path,
            "start_line": diff_block["start_line"],
            "end_line": diff_block["end_line"],
        },
        "tag": tag,
        "diff_text": diff_block["text"] if tag == "full" else None,
    }


def _build_coverage_ledger(eligible, commit_claims, representative):
    if len(eligible) < 2:
        return []

    justifying_claims = [
        {"claim": entry["claim"], "scope": entry["scope"]}
        for entry in commit_claims
        if entry["claim"] in COLLAPSE_CANDIDATE_CLAIM_IDS
    ]

    return [{
        "collapsed_group_files": eligible,
        "collapsed_count": len(eligible),
        "representative_file": representative,
        "justifying_claims": justifying_claims,
    }]


def build_review_context(synthesized, metadata, change_set, diff_text, commit_hash):
    commit_claims = synthesized["commit_claims"]
    file_claims = synthesized["file_claims"]
    symbol_claims = synthesized["symbol_claims"]

    changed_files = change_set["changed_files"]
    diff_blocks = _split_diff_by_file(diff_text)

    eligible = _eligible_files(changed_files, commit_claims, file_claims, symbol_claims)
    representative = eligible[0] if len(eligible) >= 2 else None
    collapsed_files = set(eligible) if representative else set()

    evidence_units = []
    for file_path in changed_files:
        block = diff_blocks.get(file_path)
        if file_path in collapsed_files and file_path != representative:
            evidence_units.append(_evidence_unit(file_path, "collapsed", block))
        else:
            evidence_units.append(_evidence_unit(file_path, "full", block))

    return {
        "commit_hash": commit_hash,
        "commit_summary": _build_commit_summary(metadata, change_set),
        "commit_claims": copy.deepcopy(commit_claims),
        "file_claims": copy.deepcopy(file_claims),
        "symbol_claims": copy.deepcopy(symbol_claims),
        "gaps": copy.deepcopy(synthesized["gaps"]),
        "evidence_units": evidence_units,
        "coverage_ledger": _build_coverage_ledger(eligible, commit_claims, representative),
    }

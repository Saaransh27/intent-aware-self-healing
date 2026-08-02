def filter_evidence(fused_evidence, consumes):
    commit = fused_evidence.get("commit", {})
    filtered_commit = {key: commit[key] for key in consumes if key in commit}

    filtered_files = []
    for file_bundle in fused_evidence.get("files", []):
        filtered_file = {"file_path": file_bundle["file_path"]}
        for key in consumes:
            if key in file_bundle:
                filtered_file[key] = file_bundle[key]
        filtered_files.append(filtered_file)

    return {"commit": filtered_commit, "files": filtered_files}


def commit_scope():
    return {"level": "commit", "file_path": None, "qualified_name": None}


def file_scope(file_path):
    return {"level": "file", "file_path": file_path, "qualified_name": None}


def symbol_scope(file_path, qualified_name):
    return {"level": "symbol", "file_path": file_path, "qualified_name": qualified_name}


def claim(claim_id, scope, confidence, basis):
    return {"claim": claim_id, "scope": scope, "confidence": confidence, "basis": basis}


def gap(reason, scope, missing):
    return {"reason": reason, "scope": scope, "missing": missing}

def _symbol_key(file_path, qualified_name):
    return f"{file_path}::{qualified_name}"


def synthesize(module_outputs):
    commit_claims = []
    file_claims = {}
    symbol_claims = {}
    commit_gaps = []
    file_gaps = {}

    for output in module_outputs:
        module_name = output["module"]

        for entry in output["claims"]:
            tagged = {**entry, "module": module_name}
            scope = entry["scope"]
            if scope["level"] == "commit":
                commit_claims.append(tagged)
            elif scope["level"] == "file":
                file_claims.setdefault(scope["file_path"], []).append(tagged)
            elif scope["level"] == "symbol":
                key = _symbol_key(scope["file_path"], scope["qualified_name"])
                symbol_claims.setdefault(key, []).append(tagged)

        for entry in output["gaps"]:
            tagged = {**entry, "module": module_name}
            scope = entry["scope"]
            if scope["level"] == "commit":
                commit_gaps.append(tagged)
            else:
                file_gaps.setdefault(scope["file_path"], []).append(tagged)

    return {
        "commit_claims": commit_claims,
        "file_claims": file_claims,
        "symbol_claims": symbol_claims,
        "gaps": {"commit": commit_gaps, "files": file_gaps},
    }

from src.reasoning.contracts import claim, gap, symbol_scope

NAME = "contract_stability"
CONSUMES = ["semantic_analysis"]
PRODUCES = [
    "contract.public_signature_changed",
    "contract.public_symbol_removed",
    "contract.decorator_changed",
]
LIMITATIONS = [
    "Python-only, matching semantic_analysis's own scope — non-Python files always "
    "produce a gap here, never a claim.",
    "Consumes exactly one evidence category, so no claim from this module can ever be "
    "'corroborated' or 'conflicting' — those states require two or more independent "
    "sources, which this module never has by contract.",
]


def reason(evidence):
    claims = []
    gaps = []

    for file_bundle in evidence["files"]:
        file_path = file_bundle["file_path"]
        entry = file_bundle.get("semantic_analysis", {"status": "not_collected"})

        if entry["status"] != "ok":
            gaps.append(gap("cannot_assess_contract", {"level": "file", "file_path": file_path, "qualified_name": None}, ["semantic_analysis"]))
            continue

        for symbol in entry["evidence"]["symbols"]:
            scope = symbol_scope(file_path, symbol["qualified_name"])

            if symbol["visibility"] == "public" and symbol["signature_changed"]:
                claims.append(claim("contract.public_signature_changed", scope, "observed", ["semantic_analysis"]))

            if symbol["visibility"] == "public" and symbol["change_type"] == "removed":
                claims.append(claim("contract.public_symbol_removed", scope, "observed", ["semantic_analysis"]))

            if symbol["decorators_changed"]:
                claims.append(claim("contract.decorator_changed", scope, "observed", ["semantic_analysis"]))

    return {"module": NAME, "claims": claims, "gaps": gaps}

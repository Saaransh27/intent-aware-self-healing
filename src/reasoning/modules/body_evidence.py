from src.reasoning.contracts import claim, gap, symbol_scope

NAME = "body_evidence"
CONSUMES = ["semantic_analysis"]
PRODUCES = [
    "interaction.callees_changed",
    "error_handling.exceptions_raised_changed",
    "error_handling.exceptions_caught_changed",
    "resource_management.context_managers_changed",
    "documentation.deprecation_marker_added",
    "structure.internal_symbol_added",
]
LIMITATIONS = [
    "Python-only, matching semantic_analysis's own scope — non-Python files always "
    "produce a gap here, never a claim.",
    "Consumes exactly one evidence category, so no claim from this module can ever be "
    "'corroborated' or 'conflicting' — those states require two or more independent "
    "sources, which this module never has by contract.",
    "Reasons only about a symbol's own body — a change confined to a callee's "
    "implementation (not this symbol's call sites, exception vocabulary, or resource "
    "usage) produces no claim here.",
    "callees/context_managers are syntactic call-target text (via ast.unparse), never "
    "resolved to a definition — no call graph, no cross-file reference resolution.",
    "structure.internal_symbol_added requires a pre-existing symbol in the same file "
    "to also be modified — a new private symbol in an otherwise-unmodified file (a "
    "standalone addition, not restructuring) produces no claim here.",
]


def reason(evidence):
    claims = []
    gaps = []

    for file_bundle in evidence["files"]:
        file_path = file_bundle["file_path"]
        entry = file_bundle.get("semantic_analysis", {"status": "not_collected"})

        if entry["status"] != "ok":
            gaps.append(gap("cannot_assess_body_evidence", {"level": "file", "file_path": file_path, "qualified_name": None}, ["semantic_analysis"]))
            continue

        symbols = entry["evidence"]["symbols"]
        has_modified_symbol = any(candidate["change_type"] == "modified" for candidate in symbols)

        for symbol in symbols:
            scope = symbol_scope(file_path, symbol["qualified_name"])
            body_evidence = symbol["body_evidence"]

            if symbol["visibility"] == "private" and symbol["change_type"] == "added" and has_modified_symbol:
                claims.append(claim("structure.internal_symbol_added", scope, "observed", ["semantic_analysis"]))

            callees = body_evidence["interaction_changes"]["callees"]
            if callees["added"] or callees["removed"]:
                claims.append(claim("interaction.callees_changed", scope, "observed", ["semantic_analysis"]))

            exceptions_raised = body_evidence["error_handling_changes"]["exceptions_raised"]
            if exceptions_raised["added"] or exceptions_raised["removed"]:
                claims.append(claim("error_handling.exceptions_raised_changed", scope, "observed", ["semantic_analysis"]))

            exceptions_caught = body_evidence["error_handling_changes"]["exceptions_caught"]
            if exceptions_caught["added"] or exceptions_caught["removed"]:
                claims.append(claim("error_handling.exceptions_caught_changed", scope, "observed", ["semantic_analysis"]))

            context_managers = body_evidence["resource_management_changes"]["context_managers"]
            if context_managers["added"] or context_managers["removed"]:
                claims.append(claim("resource_management.context_managers_changed", scope, "observed", ["semantic_analysis"]))

            if body_evidence["documentation_changes"]["deprecation_marker_added"]:
                claims.append(claim("documentation.deprecation_marker_added", scope, "observed", ["semantic_analysis"]))

    return {"module": NAME, "claims": claims, "gaps": gaps}

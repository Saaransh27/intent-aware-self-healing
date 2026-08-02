from src.reasoning.contracts import claim, gap, file_scope

NAME = "reach"
CONSUMES = ["co_change", "local_module_context"]
PRODUCES = [
    "reach.high_historical_coupling",
    "reach.no_historical_coupling",
    "reach.large_neighborhood",
    "reach.isolated_module",
    "reach.corroborated_wide_reach",
    "reach.expected_co_change_partner_missing",
]
LIMITATIONS = [
    "Both consumed sources are explicitly proxies for reach (co-change correlation, "
    "directory neighborhood), never real call/import graph data — this module cannot "
    "know who actually calls or imports the changed file.",
    "high_historical_coupling (co_change_count >= 10) and large_neighborhood "
    "(>15 siblings) are fixed default thresholds, not validated tuning.",
    "expected_co_change_partner_missing only checks a file's historically strong "
    "(>= HIGH_COUPLING_THRESHOLD) partners against this commit's own changed-file "
    "set — it cannot know whether the partner's absence is actually a mistake, only "
    "that the historical pattern didn't hold this time.",
]

HIGH_COUPLING_THRESHOLD = 10
LARGE_NEIGHBORHOOD_THRESHOLD = 15


def reason(evidence):
    claims = []
    gaps = []

    changed_paths = {file_bundle["file_path"] for file_bundle in evidence["files"]}

    for file_bundle in evidence["files"]:
        file_path = file_bundle["file_path"]
        scope = file_scope(file_path)

        co_change_entry = file_bundle.get("co_change", {"status": "not_collected"})
        neighborhood_entry = file_bundle.get("local_module_context", {"status": "not_collected"})

        high_coupling = False
        large_neighborhood = False

        if co_change_entry["status"] != "ok":
            gaps.append(gap("cannot_assess_coupling", scope, ["co_change"]))
        else:
            co_change = co_change_entry["evidence"]
            if not co_change:
                claims.append(claim("reach.no_historical_coupling", scope, "observed", ["co_change"]))
            else:
                if co_change[0]["co_change_count"] >= HIGH_COUPLING_THRESHOLD:
                    high_coupling = True
                    claims.append(claim("reach.high_historical_coupling", scope, "inferred", ["co_change"]))

                strong_partners_missing = any(
                    partner["co_change_count"] >= HIGH_COUPLING_THRESHOLD
                    and partner["path"] not in changed_paths
                    for partner in co_change
                )
                if strong_partners_missing:
                    claims.append(claim(
                        "reach.expected_co_change_partner_missing", scope, "inferred", ["co_change"],
                    ))

        if neighborhood_entry["status"] != "ok":
            gaps.append(gap("cannot_assess_neighborhood", scope, ["local_module_context"]))
        else:
            neighborhood = neighborhood_entry["evidence"]
            if not neighborhood:
                claims.append(claim("reach.isolated_module", scope, "observed", ["local_module_context"]))
            elif len(neighborhood) > LARGE_NEIGHBORHOOD_THRESHOLD:
                large_neighborhood = True
                claims.append(claim("reach.large_neighborhood", scope, "inferred", ["local_module_context"]))

        if high_coupling and large_neighborhood:
            claims.append(claim(
                "reach.corroborated_wide_reach", scope, "corroborated",
                ["co_change", "local_module_context"],
            ))

    return {"module": NAME, "claims": claims, "gaps": gaps}

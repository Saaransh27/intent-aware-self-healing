import json
import re
import unittest

from src.reasoning.contracts import claim, commit_scope, file_scope
from src.review.context_builder import build_review_context
from src.prompt.prompt_builder import SYSTEM_PROMPT, build_prompt

COMMIT_HASH = "36be8c9a7c07a351ccfa1d935fa3a88cbff43133"


def _tagged_claim(claim_id, scope, module):
    entry = claim(claim_id, scope, "observed", [])
    entry["module"] = module
    return entry


def _review_context(commit_claims=None, file_claims=None, evidence_units=None,
                     coverage_ledger=None, gaps=None, commit_summary=None):
    return {
        "commit_hash": COMMIT_HASH,
        "commit_summary": commit_summary or {
            "message": "fix: correct off-by-one in step explosion",
            "changed_files": ["a.py"],
            "added_files": [],
            "deleted_files": [],
            "modified_files": ["a.py"],
            "renamed_files": [],
        },
        "commit_claims": commit_claims or [],
        "file_claims": file_claims or {},
        "symbol_claims": {},
        "gaps": gaps or {"commit": [], "files": {}},
        "evidence_units": evidence_units if evidence_units is not None else [
            {"address": {"file_path": "a.py", "start_line": 10, "end_line": 12},
             "tag": "full", "diff_text": "diff --git a/a.py b/a.py\n@@ -10,3 +10,3 @@\n-old\n+new\n"},
        ],
        "coverage_ledger": coverage_ledger or [],
    }


def _extract_json_block(prompt, label):
    match = re.search(rf"## {re.escape(label)}\n```json\n(.*?)\n```", prompt, flags=re.DOTALL)
    return json.loads(match.group(1))


def _normalized(text):
    return re.sub(r"\s+", " ", text).strip()


class SystemPromptContentTests(unittest.TestCase):
    def test_contains_all_four_uncertainty_terms(self):
        for term in ("Confirmed", "Likely", "Worth checking", "Unknown"):
            self.assertIn(term, SYSTEM_PROMPT)

    def test_contains_all_five_output_sections(self):
        for section in ("Verdict", "What changed and why", "What deserves attention",
                         "Open questions", "Minor notes"):
            self.assertIn(section, SYSTEM_PROMPT)

    def test_contains_precedence_and_decline_and_objective_concepts(self):
        self.assertIn("precedence", SYSTEM_PROMPT.lower())
        self.assertIn("decline", SYSTEM_PROMPT.lower())
        self.assertIn("justified trust", SYSTEM_PROMPT.lower())

    def test_does_not_request_numeric_confidence(self):
        lowered = SYSTEM_PROMPT.lower()
        self.assertNotIn("confidence score", lowered)
        self.assertNotIn("scale of 1", lowered)
        self.assertIn("no numeric confidence", lowered)

    def test_does_not_use_persona_inflation(self):
        self.assertNotIn("you are a senior engineer", SYSTEM_PROMPT.lower())
        self.assertNotIn("decades of experience", SYSTEM_PROMPT.lower())

    def test_contains_adr013_quoted_example_verbatim(self):
        self.assertIn(
            "this function's public signature changed with no accompanying test "
            "update — since it's a public api, callers may break silently if "
            "they're not updated too.",
            _normalized(SYSTEM_PROMPT).lower(),
        )

    def test_reasoning_step_four_does_not_import_research_wording(self):
        lowered = SYSTEM_PROMPT.lower()
        self.assertNotIn("falsifiable", lowered)
        self.assertNotIn("how the change could fail", lowered)
        self.assertIn("held strictly apart from step 5", lowered)

    def test_verdict_exclusions_present(self):
        self.assertIn("not a claim inventory, not style detail", _normalized(SYSTEM_PROMPT).lower())

    def test_what_changed_and_why_exclusions_present(self):
        self.assertIn(
            "not line-by-line detail, not raw diff text reproduced wholesale",
            _normalized(SYSTEM_PROMPT).lower(),
        )

    def test_message_diff_disagreement_not_resolved_silently_present(self):
        self.assertIn(
            "not something to resolve silently in either direction",
            _normalized(SYSTEM_PROMPT).lower(),
        )

    def test_third_usefulness_principle_present(self):
        self.assertIn("defect, not a virtue", SYSTEM_PROMPT.lower())

    def test_does_not_pressure_decisiveness_over_honesty(self):
        self.assertNotIn("always give a clear answer", SYSTEM_PROMPT.lower())

    def test_is_a_fixed_constant_not_recomputed(self):
        context = _review_context()
        first = build_prompt(context)["system_prompt"]
        second = build_prompt(context)["system_prompt"]
        self.assertEqual(first, second)
        self.assertIs(first, SYSTEM_PROMPT)


class UserPromptContentTests(unittest.TestCase):
    def test_commit_message_appears_verbatim(self):
        context = _review_context()
        prompt = build_prompt(context)["user_prompt"]
        self.assertIn(context["commit_summary"]["message"], prompt)

    def test_commit_summary_round_trips_exactly(self):
        context = _review_context()
        prompt = build_prompt(context)["user_prompt"]
        self.assertEqual(_extract_json_block(prompt, "Commit Summary"), context["commit_summary"])

    def test_claims_round_trip_exactly(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        file_claims = {"a.py": [_tagged_claim("reach.isolated_module", file_scope("a.py"), "reach")]}
        context = _review_context(commit_claims=commit_claims, file_claims=file_claims)

        prompt = build_prompt(context)["user_prompt"]
        claims_block = _extract_json_block(prompt, "Claims")

        self.assertEqual(claims_block["commit_claims"], commit_claims)
        self.assertEqual(claims_block["file_claims"], file_claims)
        self.assertEqual(claims_block["symbol_claims"], {})

    def test_gaps_round_trip_exactly(self):
        gaps = {"commit": [{"reason": "cannot_assess_size", "scope": commit_scope(), "missing": ["change_set"]}], "files": {}}
        context = _review_context(gaps=gaps)

        prompt = build_prompt(context)["user_prompt"]
        self.assertEqual(_extract_json_block(prompt, "Gaps"), gaps)

    def test_full_evidence_unit_diff_text_appears_verbatim(self):
        context = _review_context()
        prompt = build_prompt(context)["user_prompt"]
        diff_text = context["evidence_units"][0]["diff_text"]
        decoded_units = _extract_json_block(prompt, "Evidence Units")
        self.assertEqual(decoded_units[0]["diff_text"], diff_text)

    def test_evidence_units_round_trip_exactly(self):
        evidence_units = [
            {"address": {"file_path": "a.py", "start_line": 1, "end_line": 2}, "tag": "full", "diff_text": "diff content"},
            {"address": {"file_path": "b.py", "start_line": None, "end_line": None}, "tag": "collapsed", "diff_text": None},
        ]
        context = _review_context(evidence_units=evidence_units)

        prompt = build_prompt(context)["user_prompt"]
        self.assertEqual(_extract_json_block(prompt, "Evidence Units"), evidence_units)

    def test_coverage_ledger_round_trips_exactly(self):
        coverage_ledger = [{
            "collapsed_group_files": ["a.py", "b.py"],
            "collapsed_count": 2,
            "representative_file": "a.py",
            "justifying_claims": [{"claim": "shape.wide_change", "scope": commit_scope()}],
        }]
        context = _review_context(coverage_ledger=coverage_ledger)

        prompt = build_prompt(context)["user_prompt"]
        self.assertEqual(_extract_json_block(prompt, "Coverage Ledger"), coverage_ledger)

    def test_commit_hash_never_appears_in_prompt(self):
        context = _review_context()
        result = build_prompt(context)

        self.assertNotIn(COMMIT_HASH, result["system_prompt"])
        self.assertNotIn(COMMIT_HASH, result["user_prompt"])

    def test_empty_sections_still_rendered_not_omitted(self):
        context = _review_context(commit_claims=[], file_claims={}, evidence_units=[], coverage_ledger=[])
        prompt = build_prompt(context)["user_prompt"]

        self.assertEqual(_extract_json_block(prompt, "Claims")["commit_claims"], [])
        self.assertEqual(_extract_json_block(prompt, "Evidence Units"), [])
        self.assertEqual(_extract_json_block(prompt, "Coverage Ledger"), [])

    def test_section_order_is_fixed(self):
        context = _review_context()
        prompt = build_prompt(context)["user_prompt"]

        positions = [prompt.index(f"## {label}") for label in
                     ("Commit Summary", "Claims", "Gaps", "Evidence Units", "Coverage Ledger")]
        self.assertEqual(positions, sorted(positions))

    def test_deterministic_across_repeated_calls(self):
        context = _review_context()
        first = build_prompt(context)
        second = build_prompt(context)
        self.assertEqual(first, second)


class IntegrationWithReviewContextBuilderTests(unittest.TestCase):
    def test_builds_prompt_from_a_real_build_review_context_output(self):
        synthesized = {
            "commit_claims": [_tagged_claim("shape.narrow_change", commit_scope(), "change_shape")],
            "file_claims": {},
            "symbol_claims": {},
            "gaps": {"commit": [], "files": {}},
        }
        metadata = {"message": "fix bug", "author": {"name": "x", "email": "x@x.com"}, "date": "2026-01-01T00:00:00Z"}
        change_set = {"changed_files": ["a.py"], "added_files": [], "deleted_files": [],
                       "modified_files": ["a.py"], "renamed_files": []}
        diff_text = "diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1,1 +1,1 @@\n-old\n+new\n"

        review_context = build_review_context(synthesized, metadata, change_set, diff_text, COMMIT_HASH)
        prompt = build_prompt(review_context)

        self.assertIn("fix bug", prompt["user_prompt"])
        self.assertEqual(_extract_json_block(prompt["user_prompt"], "Claims")["commit_claims"], synthesized["commit_claims"])


if __name__ == "__main__":
    unittest.main()

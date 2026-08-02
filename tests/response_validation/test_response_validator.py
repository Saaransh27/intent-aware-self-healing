import unittest

from src.response_validation.response_validator import validate_response

VALID_RESPONSE = """\
### Verdict
This is a low-risk, well-tested change with no functional impact.

### What changed and why
The commit adjusts internal formatting for consistency with the rest of
the codebase, matching the author's stated intent exactly.

### What deserves attention, ranked
1. Nothing here actually needs the reviewer's attention.

### Open questions
There are no unresolved questions for this commit.

### Minor notes
None.
"""


def _rule_names(result):
    return [f["rule"] for f in result["findings"]]


def _findings_for(result, rule):
    return [f for f in result["findings"] if f["rule"] == rule]


class ValidResponseTests(unittest.TestCase):
    def test_well_formed_response_is_clean(self):
        result = validate_response(VALID_RESPONSE)
        self.assertEqual(result, {"outcome": "clean", "findings": []})

    def test_result_is_deterministic_across_repeated_calls(self):
        first = validate_response(VALID_RESPONSE)
        second = validate_response(VALID_RESPONSE)
        self.assertEqual(first, second)

    def test_does_not_mutate_or_return_the_input_text(self):
        original = VALID_RESPONSE
        result = validate_response(original)
        self.assertNotIn("response", result)
        self.assertEqual(original, VALID_RESPONSE)


class InputHandlingTests(unittest.TestCase):
    def test_none_input_is_treated_as_entirely_missing(self):
        result = validate_response(None)
        self.assertEqual(result["outcome"], "invalid")
        self.assertEqual(len(_findings_for(result, "missing_section")), 5)

    def test_non_string_input_is_treated_as_entirely_missing(self):
        result = validate_response(12345)
        self.assertEqual(result["outcome"], "invalid")
        self.assertEqual(len(_findings_for(result, "missing_section")), 5)

    def test_empty_string_is_treated_as_entirely_missing(self):
        result = validate_response("")
        self.assertEqual(result["outcome"], "invalid")
        self.assertEqual(len(_findings_for(result, "missing_section")), 5)

    def test_whitespace_only_string_is_treated_as_entirely_missing(self):
        result = validate_response("   \n\n   ")
        self.assertEqual(result["outcome"], "invalid")
        self.assertEqual(len(_findings_for(result, "missing_section")), 5)

    def test_never_raises_on_unusual_input_types(self):
        for bad_input in (None, 123, 1.5, [], {}, object()):
            try:
                validate_response(bad_input)
            except Exception as exc:  # pragma: no cover - defensive
                self.fail(f"validate_response raised on {bad_input!r}: {exc}")


class MissingSectionTests(unittest.TestCase):
    def _without(self, heading_text):
        return "\n\n".join(
            block for block in VALID_RESPONSE.split("\n\n")
            if not block.startswith(f"### {heading_text}")
        )

    def test_missing_verdict(self):
        result = validate_response(self._without("Verdict"))
        self.assertIn("missing_section", _rule_names(result))
        self.assertTrue(any("Verdict" in f["message"] for f in _findings_for(result, "missing_section")))

    def test_missing_what_changed_and_why(self):
        result = validate_response(self._without("What changed and why"))
        self.assertTrue(any("What changed and why" in f["message"] for f in _findings_for(result, "missing_section")))

    def test_missing_what_deserves_attention(self):
        result = validate_response(self._without("What deserves attention, ranked"))
        self.assertTrue(any("What deserves attention" in f["message"] for f in _findings_for(result, "missing_section")))

    def test_missing_open_questions(self):
        result = validate_response(self._without("Open questions"))
        self.assertTrue(any("Open questions" in f["message"] for f in _findings_for(result, "missing_section")))

    def test_missing_minor_notes(self):
        result = validate_response(self._without("Minor notes"))
        self.assertTrue(any("Minor notes" in f["message"] for f in _findings_for(result, "missing_section")))

    def test_missing_section_is_error_severity(self):
        result = validate_response(self._without("Minor notes"))
        finding = _findings_for(result, "missing_section")[0]
        self.assertEqual(finding["severity"], "ERROR")

    def test_missing_section_makes_outcome_invalid(self):
        result = validate_response(self._without("Verdict"))
        self.assertEqual(result["outcome"], "invalid")

    def test_partial_five_of_five_present_is_not_flagged_as_missing(self):
        result = validate_response(VALID_RESPONSE)
        self.assertNotIn("missing_section", _rule_names(result))


class DuplicateSectionTests(unittest.TestCase):
    def test_duplicated_heading_is_flagged(self):
        text = VALID_RESPONSE + "\n### Verdict\nA second verdict block.\n"
        result = validate_response(text)
        findings = _findings_for(result, "duplicate_section_heading")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "WARNING")
        self.assertIn("2 times", findings[0]["message"])

    def test_triplicated_heading_reports_correct_count(self):
        text = VALID_RESPONSE + "\n### Verdict\nSecond.\n\n### Verdict\nThird.\n"
        result = validate_response(text)
        findings = _findings_for(result, "duplicate_section_heading")
        self.assertEqual(len(findings), 1)
        self.assertIn("3 times", findings[0]["message"])

    def test_duplicate_alone_does_not_make_outcome_invalid(self):
        text = VALID_RESPONSE + "\n### Verdict\nA second verdict block.\n"
        result = validate_response(text)
        self.assertEqual(result["outcome"], "flagged")


class OrderTests(unittest.TestCase):
    def test_sections_in_correct_order_are_not_flagged(self):
        result = validate_response(VALID_RESPONSE)
        self.assertNotIn("sections_out_of_order", _rule_names(result))

    def test_swapped_sections_are_flagged(self):
        text = """\
### What changed and why
Something changed.

### Verdict
Low risk.

### What deserves attention, ranked
Nothing.

### Open questions
None.

### Minor notes
None.
"""
        result = validate_response(text)
        self.assertIn("sections_out_of_order", _rule_names(result))
        finding = _findings_for(result, "sections_out_of_order")[0]
        self.assertEqual(finding["severity"], "WARNING")

    def test_order_check_ignores_missing_sections(self):
        text = """\
### Verdict
Low risk.

### Open questions
None.
"""
        result = validate_response(text)
        self.assertNotIn("sections_out_of_order", _rule_names(result))


class UnknownHeadingTests(unittest.TestCase):
    def test_unexpected_heading_is_flagged(self):
        text = VALID_RESPONSE + "\n### Summary\nAn extra section.\n"
        result = validate_response(text)
        findings = _findings_for(result, "unknown_heading")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "WARNING")
        self.assertIn("Summary", findings[0]["message"])

    def test_unknown_heading_alone_does_not_make_outcome_invalid(self):
        text = VALID_RESPONSE + "\n### Summary\nAn extra section.\n"
        result = validate_response(text)
        self.assertEqual(result["outcome"], "flagged")

    def test_heading_matching_is_case_insensitive(self):
        text = VALID_RESPONSE.replace("### Verdict", "### VERDICT")
        result = validate_response(text)
        self.assertNotIn("unknown_heading", _rule_names(result))
        self.assertNotIn("missing_section", _rule_names(result))


class EmptySectionBodyTests(unittest.TestCase):
    def test_empty_section_body_is_flagged(self):
        text = """\
### Verdict
Low risk.

### What changed and why


### What deserves attention, ranked
Nothing.

### Open questions
None.

### Minor notes
None.
"""
        result = validate_response(text)
        findings = _findings_for(result, "empty_section_body")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "WARNING")
        self.assertIn("What changed and why", findings[0]["message"])

    def test_non_empty_sections_are_not_flagged(self):
        result = validate_response(VALID_RESPONSE)
        self.assertNotIn("empty_section_body", _rule_names(result))


class DuplicatedParagraphTests(unittest.TestCase):
    def test_identical_paragraph_across_sections_is_flagged(self):
        shared = "This exact sentence is repeated verbatim across two different sections of the review."
        text = f"""\
### Verdict
{shared}

### What changed and why
Something else entirely, unrelated to the shared sentence above.

### What deserves attention, ranked
{shared}

### Open questions
None.

### Minor notes
None.
"""
        result = validate_response(text)
        findings = _findings_for(result, "duplicated_paragraph")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "WARNING")

    def test_short_incidental_repeats_are_not_flagged(self):
        text = """\
### Verdict
None.

### What changed and why
Something changed.

### What deserves attention, ranked
None.

### Open questions
None.

### Minor notes
None.
"""
        result = validate_response(text)
        self.assertNotIn("duplicated_paragraph", _rule_names(result))

    def test_unique_paragraphs_are_not_flagged(self):
        result = validate_response(VALID_RESPONSE)
        self.assertNotIn("duplicated_paragraph", _rule_names(result))


class ClaimIdLeakTests(unittest.TestCase):
    def _with_leak(self, token):
        return VALID_RESPONSE.replace(
            "Nothing here actually needs the reviewer's attention.",
            f"Flagged because of {token} in the evidence.",
        )

    def test_shape_prefix_is_detected(self):
        result = validate_response(self._with_leak("shape.wide_change"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_history_prefix_is_detected(self):
        result = validate_response(self._with_leak("history.hot_file"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_reach_prefix_is_detected(self):
        result = validate_response(self._with_leak("reach.large_neighborhood"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_verification_prefix_is_detected(self):
        result = validate_response(self._with_leak("verification.no_test_files_changed"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_contract_prefix_is_detected(self):
        result = validate_response(self._with_leak("contract.public_signature_changed"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_interaction_prefix_is_detected(self):
        result = validate_response(self._with_leak("interaction.callees_changed"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_error_handling_prefix_is_detected(self):
        result = validate_response(self._with_leak("error_handling.exceptions_raised_changed"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_resource_management_prefix_is_detected(self):
        result = validate_response(self._with_leak("resource_management.context_managers_changed"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_documentation_prefix_is_detected(self):
        result = validate_response(self._with_leak("documentation.deprecation_marker_added"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_structure_prefix_is_detected(self):
        result = validate_response(self._with_leak("structure.internal_symbol_added"))
        self.assertIn("literal_claim_id_leak", _rule_names(result))

    def test_leak_is_error_severity_and_invalidates_outcome(self):
        result = validate_response(self._with_leak("shape.wide_change"))
        finding = _findings_for(result, "literal_claim_id_leak")[0]
        self.assertEqual(finding["severity"], "ERROR")
        self.assertEqual(result["outcome"], "invalid")

    def test_real_code_reference_numpy_pad_is_not_flagged(self):
        result = validate_response(self._with_leak("numpy.pad"))
        self.assertNotIn("literal_claim_id_leak", _rule_names(result))

    def test_real_code_reference_self_attribute_is_not_flagged(self):
        result = validate_response(self._with_leak("self.band.id"))
        self.assertNotIn("literal_claim_id_leak", _rule_names(result))

    def test_documentation_md_filename_is_not_flagged(self):
        result = validate_response(self._with_leak("docs/documentation.md"))
        self.assertNotIn("literal_claim_id_leak", _rule_names(result))

    def test_structure_py_filename_is_not_flagged(self):
        result = validate_response(self._with_leak("src/structure.py"))
        self.assertNotIn("literal_claim_id_leak", _rule_names(result))

    def test_ordinary_prose_is_not_flagged(self):
        result = validate_response(VALID_RESPONSE)
        self.assertNotIn("literal_claim_id_leak", _rule_names(result))

    def test_multiple_distinct_leaks_are_each_reported(self):
        text = self._with_leak("shape.wide_change history.hot_file")
        result = validate_response(text)
        self.assertEqual(len(_findings_for(result, "literal_claim_id_leak")), 2)


class ReservedTierSelfTaggingTests(unittest.TestCase):
    def _with_tag(self, phrase):
        return VALID_RESPONSE.replace(
            "1. Nothing here actually needs the reviewer's attention.",
            f"1. Something changed ({phrase}).",
        )

    def test_observed_is_flagged(self):
        result = validate_response(self._with_tag("Observed interaction change"))
        self.assertIn("reserved_confidence_tier_self_tagging", _rule_names(result))

    def test_corroborated_is_flagged(self):
        result = validate_response(self._with_tag("Corroborated by wide reach"))
        self.assertIn("reserved_confidence_tier_self_tagging", _rule_names(result))

    def test_inferred_is_flagged(self):
        result = validate_response(self._with_tag("Inferred from context"))
        self.assertIn("reserved_confidence_tier_self_tagging", _rule_names(result))

    def test_conflicting_is_flagged(self):
        result = validate_response(self._with_tag("Conflicting with prior note"))
        self.assertIn("reserved_confidence_tier_self_tagging", _rule_names(result))

    def test_is_error_severity_and_invalidates_outcome(self):
        result = validate_response(self._with_tag("Observed interaction change"))
        finding = _findings_for(result, "reserved_confidence_tier_self_tagging")[0]
        self.assertEqual(finding["severity"], "ERROR")
        self.assertEqual(result["outcome"], "invalid")

    def test_allowed_uncertainty_terms_are_never_flagged_by_this_rule(self):
        for term in ("Confirmed", "Likely", "Worth checking", "Unknown"):
            with self.subTest(term=term):
                result = validate_response(self._with_tag(term))
                self.assertNotIn("reserved_confidence_tier_self_tagging", _rule_names(result))

    def test_reserved_word_outside_parentheses_is_not_flagged(self):
        text = self._with_tag("plain text").replace(
            "(plain text)", "the evidence was inferred from context"
        )
        result = validate_response(text)
        self.assertNotIn("reserved_confidence_tier_self_tagging", _rule_names(result))


class ModuleJargonLeakTests(unittest.TestCase):
    def _with_phrase(self, phrase):
        return VALID_RESPONSE.replace(
            "1. Nothing here actually needs the reviewer's attention.",
            f"1. {phrase}.",
        )

    def test_symbol_claim_is_flagged(self):
        result = validate_response(self._with_phrase("The symbol claim shows a change"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_symbol_level_claims_is_flagged(self):
        result = validate_response(self._with_phrase("Per the symbol-level claims"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_semantic_analysis_claim_is_flagged(self):
        result = validate_response(self._with_phrase("Per the semantic analysis claim"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_contract_stability_is_flagged(self):
        result = validate_response(self._with_phrase("Checked against contract stability"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_body_evidence_is_flagged(self):
        result = validate_response(self._with_phrase("No body evidence available"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_coverage_ledger_is_flagged(self):
        result = validate_response(self._with_phrase("See the coverage ledger"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_evidence_units_is_flagged(self):
        result = validate_response(self._with_phrase("Based on the evidence units"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_the_claims_indicate_is_flagged(self):
        result = validate_response(self._with_phrase("The claims indicate a change"))
        self.assertIn("module_jargon_leak", _rule_names(result))

    def test_is_warning_severity_only(self):
        result = validate_response(self._with_phrase("The symbol claim shows a change"))
        finding = _findings_for(result, "module_jargon_leak")[0]
        self.assertEqual(finding["severity"], "WARNING")

    def test_warning_alone_does_not_invalidate_outcome(self):
        result = validate_response(self._with_phrase("The symbol claim shows a change"))
        self.assertEqual(result["outcome"], "flagged")

    def test_ordinary_use_of_the_word_claim_is_not_flagged(self):
        result = validate_response(
            self._with_phrase("The commit's claim that this fixes the bug appears accurate")
        )
        self.assertNotIn("module_jargon_leak", _rule_names(result))


class MalformedMarkdownTests(unittest.TestCase):
    def test_balanced_bold_is_not_flagged(self):
        result = validate_response(VALID_RESPONSE)
        self.assertNotIn("malformed_markdown", _rule_names(result))

    def test_unbalanced_bold_is_flagged(self):
        text = VALID_RESPONSE.replace("low-risk", "**low-risk")
        result = validate_response(text)
        self.assertIn("malformed_markdown", _rule_names(result))
        finding = _findings_for(result, "malformed_markdown")[0]
        self.assertEqual(finding["severity"], "WARNING")

    def test_balanced_code_fence_is_not_flagged(self):
        text = VALID_RESPONSE + "\n```python\nx = 1\n```\n"
        result = validate_response(text)
        self.assertNotIn("unclosed_code_fence", _rule_names(result))

    def test_unclosed_code_fence_is_flagged_as_error(self):
        text = VALID_RESPONSE + "\n```python\nx = 1\n"
        result = validate_response(text)
        findings = _findings_for(result, "unclosed_code_fence")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "ERROR")
        self.assertEqual(result["outcome"], "invalid")

    def test_unclosed_fence_swallows_subsequent_headings_as_missing(self):
        text = """\
### Verdict
Some text
```python
def f():
    pass

### What changed and why
This text is inside the fence and must not be seen as a real heading.

### What deserves attention, ranked
Also inside.

### Open questions
Also inside.

### Minor notes
Also inside.
"""
        result = validate_response(text)
        self.assertEqual(len(_findings_for(result, "missing_section")), 4)
        self.assertIn("unclosed_code_fence", _rule_names(result))

    def test_heading_shaped_line_inside_a_closed_fence_is_not_a_real_heading(self):
        text = VALID_RESPONSE + "\n```\n### Not A Real Heading\n```\n"
        result = validate_response(text)
        self.assertNotIn("unknown_heading", _rule_names(result))


class CombinedFindingsTests(unittest.TestCase):
    def test_multiple_simultaneous_violations_are_all_reported(self):
        text = """\
### What changed and why
Text mentioning shape.wide_change directly, plus the symbol claim shows
something (Observed interaction change).

### Verdict
Low risk.

### What deserves attention, ranked
Nothing.

### Minor notes
None.
"""
        result = validate_response(text)
        rules = set(_rule_names(result))
        self.assertIn("missing_section", rules)
        self.assertIn("sections_out_of_order", rules)
        self.assertIn("literal_claim_id_leak", rules)
        self.assertIn("reserved_confidence_tier_self_tagging", rules)
        self.assertIn("module_jargon_leak", rules)
        self.assertEqual(result["outcome"], "invalid")

    def test_outcome_is_invalid_if_any_error_present_regardless_of_warnings(self):
        text = VALID_RESPONSE + "\n### Verdict\nDuplicate.\n"
        text = text.replace("low-risk", "shape.wide_change")
        result = validate_response(text)
        severities = {f["severity"] for f in result["findings"]}
        self.assertIn("ERROR", severities)
        self.assertIn("WARNING", severities)
        self.assertEqual(result["outcome"], "invalid")

    def test_outcome_is_flagged_if_only_warnings_present(self):
        text = VALID_RESPONSE + "\n### Summary\nExtra.\n"
        result = validate_response(text)
        self.assertTrue(all(f["severity"] == "WARNING" for f in result["findings"]))
        self.assertEqual(result["outcome"], "flagged")


class FindingShapeTests(unittest.TestCase):
    def test_every_finding_has_exactly_the_required_keys(self):
        text = VALID_RESPONSE.replace("low-risk", "shape.wide_change")
        result = validate_response(text)
        self.assertTrue(result["findings"])
        for finding in result["findings"]:
            self.assertEqual(set(finding.keys()), {"rule", "severity", "message", "location"})

    def test_severity_is_always_error_or_warning(self):
        text = VALID_RESPONSE.replace("low-risk", "shape.wide_change") + "\n### Summary\nExtra.\n"
        result = validate_response(text)
        for finding in result["findings"]:
            self.assertIn(finding["severity"], ("ERROR", "WARNING"))

    def test_outcome_is_always_one_of_three_values(self):
        for text in (VALID_RESPONSE, "", "not a review at all"):
            result = validate_response(text)
            self.assertIn(result["outcome"], ("clean", "flagged", "invalid"))


if __name__ == "__main__":
    unittest.main()

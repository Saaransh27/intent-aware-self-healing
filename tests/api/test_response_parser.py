import unittest

from src.api.response_parser import parse_review_sections

REAL_GEMINI_RESPONSE = """\
### Verdict
Low attention needed: this commit is a routine cleanup.

### What changed and why
The commit reconciles release notes and docstrings.

### What deserves attention, ranked
1. Source file modifications in core modules without test updates
   - Concern: something.

### Open questions
- Documentation rendering and contract validation

### Minor notes
- Standardized Sphinx versioning directives
"""


class ParseReviewSectionsTests(unittest.TestCase):
    def test_parses_all_five_sections_in_instructed_order(self):
        sections = parse_review_sections(REAL_GEMINI_RESPONSE)

        self.assertIsNotNone(sections)
        self.assertEqual(set(sections), {
            "verdict",
            "what_changed_and_why",
            "what_deserves_attention_ranked",
            "open_questions",
            "minor_notes",
        })
        self.assertIn("routine cleanup", sections["verdict"])
        self.assertIn("Sphinx versioning", sections["minor_notes"])

    def test_content_is_isolated_to_its_own_section(self):
        sections = parse_review_sections(REAL_GEMINI_RESPONSE)

        self.assertNotIn("Sphinx versioning", sections["verdict"])
        self.assertNotIn("routine cleanup", sections["minor_notes"])

    def test_headings_out_of_order_still_parse(self):
        shuffled = "\n\n".join([
            "### Minor notes\nnote text",
            "### Verdict\nverdict text",
            "### Open questions\nquestion text",
            "### What deserves attention, ranked\nattention text",
            "### What changed and why\nchanged text",
        ])

        sections = parse_review_sections(shuffled)

        self.assertIsNotNone(sections)
        self.assertEqual(sections["verdict"], "verdict text")
        self.assertEqual(sections["minor_notes"], "note text")

    def test_missing_one_section_returns_none(self):
        missing_minor_notes = "\n\n".join([
            "### Verdict\nv",
            "### What changed and why\nw",
            "### What deserves attention, ranked\na",
            "### Open questions\nq",
        ])

        self.assertIsNone(parse_review_sections(missing_minor_notes))

    def test_empty_string_returns_none(self):
        self.assertIsNone(parse_review_sections(""))
        self.assertIsNone(parse_review_sections("   \n  "))

    def test_non_string_returns_none(self):
        self.assertIsNone(parse_review_sections(None))
        self.assertIsNone(parse_review_sections(12345))

    def test_prose_with_no_headings_returns_none(self):
        self.assertIsNone(parse_review_sections("just a plain sentence with no structure at all."))

    def test_heading_matching_is_case_insensitive(self):
        text = "\n\n".join([
            "### verdict\nv",
            "### WHAT CHANGED AND WHY\nw",
            "### What Deserves Attention, Ranked\na",
            "### open questions\nq",
            "### Minor Notes\nn",
        ])

        sections = parse_review_sections(text)

        self.assertIsNotNone(sections)
        self.assertEqual(sections["verdict"], "v")


if __name__ == "__main__":
    unittest.main()

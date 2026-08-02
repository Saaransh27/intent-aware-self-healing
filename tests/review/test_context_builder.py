import unittest

from src.reasoning.contracts import claim, commit_scope, file_scope, symbol_scope
from src.review.context_builder import build_review_context

COMMIT_HASH = "36be8c9a7c07a351ccfa1d935fa3a88cbff43133"


def _tagged_claim(claim_id, scope, module, confidence="observed", basis=None):
    entry = claim(claim_id, scope, confidence, basis or [])
    entry["module"] = module
    return entry


def _metadata():
    return {
        "author": {"name": "Saaransh27", "email": "saaranshjain2709@gmail.com"},
        "date": "2026-07-07T11:49:04+05:30",
        "message": "move step explosion endpoint to step_visualizer router",
    }


def _change_set(changed_files, added=None, deleted=None, modified=None, renamed=None):
    return {
        "changed_files": changed_files,
        "added_files": added or [],
        "deleted_files": deleted or [],
        "modified_files": modified or changed_files,
        "renamed_files": renamed or [],
    }


def _synthesized(commit_claims=None, file_claims=None, symbol_claims=None, gaps=None):
    return {
        "commit_claims": commit_claims or [],
        "file_claims": file_claims or {},
        "symbol_claims": symbol_claims or {},
        "gaps": gaps or {"commit": [], "files": {}},
    }


def _build(synthesized, change_set, diff_text, metadata=None, commit_hash=COMMIT_HASH):
    return build_review_context(synthesized, metadata or _metadata(), change_set, diff_text, commit_hash)


MODIFIED_DIFF = """diff --git a/a.py b/a.py
index b8a1ad3..5d16478 100644
--- a/a.py
+++ b/a.py
@@ -10,3 +10,3 @@ def f():
-old line
+new line
 context
"""

TWO_FILE_DIFF = """diff --git a/a.py b/a.py
index b8a1ad3..5d16478 100644
--- a/a.py
+++ b/a.py
@@ -10,3 +10,3 @@ def f():
-old line
+new line
 context
diff --git a/b.py b/b.py
index aaa1111..bbb2222 100644
--- a/b.py
+++ b/b.py
@@ -1,2 +1,2 @@
-old b
+new b
 context b
"""


class CommitIdentityTests(unittest.TestCase):
    def test_commit_hash_travels_alongside_the_five_sections(self):
        context = _build(_synthesized(), _change_set(["a.py"]), MODIFIED_DIFF)
        self.assertEqual(context["commit_hash"], COMMIT_HASH)


class CommitSummaryTests(unittest.TestCase):
    def test_reflects_message_and_change_set_verbatim(self):
        change_set = _change_set(["a.py"])
        context = _build(_synthesized(), change_set, MODIFIED_DIFF)

        self.assertEqual(context["commit_summary"]["message"], _metadata()["message"])
        self.assertEqual(context["commit_summary"]["changed_files"], ["a.py"])

    def test_author_and_date_are_not_part_of_commit_summary(self):
        context = _build(_synthesized(), _change_set(["a.py"]), MODIFIED_DIFF)

        self.assertNotIn("author", context["commit_summary"])
        self.assertNotIn("date", context["commit_summary"])


class ClaimsAndGapsRelayTests(unittest.TestCase):
    def test_claims_and_gaps_pass_through_unmodified(self):
        commit_claims = [_tagged_claim("shape.narrow_change", commit_scope(), "change_shape")]
        file_claims = {"a.py": [_tagged_claim("reach.isolated_module", file_scope("a.py"), "reach")]}
        symbol_claims = {"a.py::f": [_tagged_claim("contract.decorator_changed", symbol_scope("a.py", "f"), "contract_stability")]}
        gaps = {"commit": [], "files": {"a.py": []}}
        synthesized = _synthesized(commit_claims, file_claims, symbol_claims, gaps)

        context = _build(synthesized, _change_set(["a.py"]), MODIFIED_DIFF)

        self.assertEqual(context["commit_claims"], commit_claims)
        self.assertEqual(context["file_claims"], file_claims)
        self.assertEqual(context["symbol_claims"], symbol_claims)
        self.assertEqual(context["gaps"], gaps)

    def test_review_context_owns_independent_copies_not_aliases(self):
        commit_claims = [_tagged_claim("shape.narrow_change", commit_scope(), "change_shape")]
        file_claims = {"a.py": [_tagged_claim("reach.isolated_module", file_scope("a.py"), "reach")]}
        gaps = {"commit": [], "files": {}}
        synthesized = _synthesized(commit_claims, file_claims, gaps=gaps)

        context = _build(synthesized, _change_set(["a.py"]), MODIFIED_DIFF)

        context["commit_claims"][0]["confidence"] = "conflicting"
        context["file_claims"]["a.py"][0]["confidence"] = "conflicting"
        context["gaps"]["commit"].append({"reason": "mutated"})

        self.assertEqual(synthesized["commit_claims"][0]["confidence"], "observed")
        self.assertEqual(synthesized["file_claims"]["a.py"][0]["confidence"], "observed")
        self.assertEqual(synthesized["gaps"]["commit"], [])


class CollapseCandidacyTests(unittest.TestCase):
    def test_narrow_change_never_collapses(self):
        commit_claims = [_tagged_claim("shape.narrow_change", commit_scope(), "change_shape")]
        synthesized = _synthesized(commit_claims)
        change_set = _change_set(["a.py", "b.py"])

        context = _build(synthesized, change_set, TWO_FILE_DIFF)

        self.assertEqual(context["coverage_ledger"], [])
        self.assertTrue(all(unit["tag"] == "full" for unit in context["evidence_units"]))

    def test_wide_change_collapses_non_risk_bearing_files(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        synthesized = _synthesized(commit_claims)
        change_set = _change_set(["a.py", "b.py"])

        context = _build(synthesized, change_set, TWO_FILE_DIFF)

        self.assertEqual(len(context["coverage_ledger"]), 1)
        ledger_entry = context["coverage_ledger"][0]
        self.assertEqual(ledger_entry["collapsed_group_files"], ["a.py", "b.py"])
        self.assertEqual(ledger_entry["collapsed_count"], 2)
        self.assertEqual(ledger_entry["representative_file"], "a.py")
        self.assertEqual([c["claim"] for c in ledger_entry["justifying_claims"]], ["shape.wide_change"])

        units_by_path = {unit["address"]["file_path"]: unit for unit in context["evidence_units"]}
        self.assertEqual(units_by_path["a.py"]["tag"], "full")
        self.assertIsNotNone(units_by_path["a.py"]["diff_text"])
        self.assertEqual(units_by_path["b.py"]["tag"], "collapsed")
        self.assertIsNone(units_by_path["b.py"]["diff_text"])

    def test_representative_is_first_in_diff_order_not_alphabetical(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        synthesized = _synthesized(commit_claims)
        diff_text = """diff --git a/z.py b/z.py
index aaa1111..bbb2222 100644
--- a/z.py
+++ b/z.py
@@ -1,1 +1,1 @@
-old z
+new z
diff --git a/a.py b/a.py
index ccc0000..ddd1111 100644
--- a/a.py
+++ b/a.py
@@ -1,1 +1,1 @@
-old a
+new a
"""
        change_set = _change_set(["z.py", "a.py"])

        context = _build(synthesized, change_set, diff_text)

        ledger_entry = context["coverage_ledger"][0]
        self.assertEqual(ledger_entry["representative_file"], "z.py")
        self.assertEqual(ledger_entry["collapsed_group_files"], ["z.py", "a.py"])

    def test_homogeneous_categories_also_triggers_collapse_candidacy(self):
        commit_claims = [_tagged_claim("shape.homogeneous_categories", commit_scope(), "change_shape")]
        synthesized = _synthesized(commit_claims)
        change_set = _change_set(["a.py", "b.py"])

        context = _build(synthesized, change_set, TWO_FILE_DIFF)

        self.assertEqual(len(context["coverage_ledger"]), 1)

    def test_single_eligible_file_is_not_collapsed(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        file_claims = {"b.py": [_tagged_claim("reach.high_historical_coupling", file_scope("b.py"), "reach")]}
        synthesized = _synthesized(commit_claims, file_claims)
        change_set = _change_set(["a.py", "b.py"])

        context = _build(synthesized, change_set, TWO_FILE_DIFF)

        self.assertEqual(context["coverage_ledger"], [])
        self.assertTrue(all(unit["tag"] == "full" for unit in context["evidence_units"]))


class RiskBearingExemptionTests(unittest.TestCase):
    def test_file_scoped_reach_claim_exempts_file_from_collapse(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        file_claims = {"b.py": [_tagged_claim("reach.high_historical_coupling", file_scope("b.py"), "reach")]}
        synthesized = _synthesized(commit_claims, file_claims)
        change_set = _change_set(["a.py", "b.py", "c.py"])
        diff_text = TWO_FILE_DIFF + """diff --git a/c.py b/c.py
index ccc0000..ddd1111 100644
--- a/c.py
+++ b/c.py
@@ -1,1 +1,1 @@
-old c
+new c
"""

        context = _build(synthesized, change_set, diff_text)

        ledger_entry = context["coverage_ledger"][0]
        self.assertNotIn("b.py", ledger_entry["collapsed_group_files"])
        self.assertEqual(ledger_entry["collapsed_group_files"], ["a.py", "c.py"])

    def test_symbol_scoped_contract_stability_claim_exempts_file_from_collapse(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        symbol_claims = {
            "b.py::f": [_tagged_claim("contract.public_signature_changed", symbol_scope("b.py", "f"), "contract_stability")],
        }
        synthesized = _synthesized(commit_claims, symbol_claims=symbol_claims)
        change_set = _change_set(["a.py", "b.py"])

        context = _build(synthesized, change_set, TWO_FILE_DIFF)

        self.assertEqual(context["coverage_ledger"], [])

    def test_history_first_author_touch_exempts_file_from_collapse(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        file_claims = {"a.py": [_tagged_claim("history.first_author_touch", file_scope("a.py"), "historical_risk")]}
        synthesized = _synthesized(commit_claims, file_claims)
        change_set = _change_set(["a.py", "b.py", "c.py"])
        diff_text = TWO_FILE_DIFF + """diff --git a/c.py b/c.py
index ccc0000..ddd1111 100644
--- a/c.py
+++ b/c.py
@@ -1,1 +1,1 @@
-old c
+new c
"""
        context = _build(synthesized, change_set, diff_text)

        ledger_entry = context["coverage_ledger"][0]
        self.assertEqual(ledger_entry["collapsed_group_files"], ["b.py", "c.py"])

    def test_non_named_historical_risk_claim_does_not_exempt(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        file_claims = {"a.py": [_tagged_claim("history.rapid_iteration", file_scope("a.py"), "historical_risk")]}
        synthesized = _synthesized(commit_claims, file_claims)
        change_set = _change_set(["a.py", "b.py"])

        context = _build(synthesized, change_set, TWO_FILE_DIFF)

        ledger_entry = context["coverage_ledger"][0]
        self.assertEqual(ledger_entry["collapsed_group_files"], ["a.py", "b.py"])


class EvidenceUnitAddressingTests(unittest.TestCase):
    def test_line_range_spans_multiple_hunks(self):
        diff_text = """diff --git a/a.py b/a.py
index b8a1ad3..5d16478 100644
--- a/a.py
+++ b/a.py
@@ -10,2 +10,2 @@ def f():
-old
+new
@@ -50,3 +50,4 @@ def g():
-old2
+new2
+extra
 context
"""
        context = _build(_synthesized(), _change_set(["a.py"]), diff_text)
        address = context["evidence_units"][0]["address"]

        self.assertEqual(address["start_line"], 10)
        self.assertEqual(address["end_line"], 53)

    def test_binary_file_has_no_line_range_but_keeps_diff_text(self):
        diff_text = """diff --git a/image.png b/image.png
index aaa1111..bbb2222 100644
Binary files a/image.png and b/image.png differ
"""
        context = _build(_synthesized(), _change_set(["image.png"]), diff_text)
        unit = context["evidence_units"][0]

        self.assertIsNone(unit["address"]["start_line"])
        self.assertIsNone(unit["address"]["end_line"])
        self.assertIsNotNone(unit["diff_text"])

    def test_deleted_file_uses_old_side_line_range(self):
        diff_text = """diff --git a/gone.py b/gone.py
deleted file mode 100644
index b8a1ad3..0000000
--- a/gone.py
+++ /dev/null
@@ -1,4 +0,0 @@
-line one
-line two
-line three
-line four
"""
        context = _build(_synthesized(), _change_set(["gone.py"], deleted=["gone.py"]), diff_text)
        address = context["evidence_units"][0]["address"]

        self.assertEqual(address["start_line"], 1)
        self.assertEqual(address["end_line"], 4)

    def test_added_file_uses_new_side_line_range(self):
        diff_text = """diff --git a/new.py b/new.py
new file mode 100644
index 0000000..b8a1ad3
--- /dev/null
+++ b/new.py
@@ -0,0 +1,3 @@
+line one
+line two
+line three
"""
        context = _build(_synthesized(), _change_set(["new.py"], added=["new.py"]), diff_text)
        address = context["evidence_units"][0]["address"]

        self.assertEqual(address["start_line"], 1)
        self.assertEqual(address["end_line"], 3)

    def test_file_missing_from_diff_still_produces_unit(self):
        change_set = _change_set(["a.py", "missing_from_diff.py"])
        context = _build(_synthesized(), change_set, MODIFIED_DIFF)

        units_by_path = {unit["address"]["file_path"]: unit for unit in context["evidence_units"]}
        self.assertIn("missing_from_diff.py", units_by_path)
        self.assertIsNone(units_by_path["missing_from_diff.py"]["diff_text"])
        self.assertEqual(units_by_path["missing_from_diff.py"]["tag"], "full")

    def test_empty_diff_text_produces_content_less_units_without_crash(self):
        change_set = _change_set(["a.py"])
        context = _build(_synthesized(), change_set, "")

        self.assertEqual(len(context["evidence_units"]), 1)
        self.assertIsNone(context["evidence_units"][0]["diff_text"])


class StableOrderingTests(unittest.TestCase):
    def test_evidence_units_follow_changed_files_order(self):
        change_set = _change_set(["z.py", "a.py", "m.py"])
        context = _build(_synthesized(), change_set, "")

        ordered_paths = [unit["address"]["file_path"] for unit in context["evidence_units"]]
        self.assertEqual(ordered_paths, ["z.py", "a.py", "m.py"])

    def test_coverage_ledger_uses_the_same_canonical_order_as_evidence_units(self):
        commit_claims = [_tagged_claim("shape.wide_change", commit_scope(), "change_shape")]
        synthesized = _synthesized(commit_claims)
        change_set = _change_set(["z.py", "a.py", "m.py"])
        diff_text = ""

        context = _build(synthesized, change_set, diff_text)

        evidence_order = [unit["address"]["file_path"] for unit in context["evidence_units"]]
        ledger_order = context["coverage_ledger"][0]["collapsed_group_files"]
        self.assertEqual(evidence_order, ledger_order)


if __name__ == "__main__":
    unittest.main()

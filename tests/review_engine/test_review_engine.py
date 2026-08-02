import unittest
from unittest.mock import patch

from src.adapter.llm_adapter import (
    STATE_ADAPTER_BOUNDARY_FAILURE,
    STATE_EXECUTION_BOUNDARY_FAILURE,
    STATE_SUCCESS,
)
from src.review_engine.review_engine import (
    OUTCOME_EVALUATED,
    OUTCOME_NO_ARTIFACT,
    _evaluate_response,
    run_review_engine,
)


def _adapter_result(state, response=None):
    return {"state": state, "response": response}


class EvaluateResponseTests(unittest.TestCase):
    def test_empty_catalogue_produces_no_findings_for_any_input(self):
        for value in ("some review text", "", "unicode: café, — em dash"):
            self.assertEqual(_evaluate_response(value), [])


class NoArtifactTests(unittest.TestCase):
    def test_adapter_boundary_failure_produces_no_artifact(self):
        result = run_review_engine(_adapter_result(STATE_ADAPTER_BOUNDARY_FAILURE))
        self.assertEqual(result, {
            "outcome": OUTCOME_NO_ARTIFACT,
            "adapter_state": STATE_ADAPTER_BOUNDARY_FAILURE,
            "response": None,
            "findings": [],
        })

    def test_execution_boundary_failure_produces_no_artifact_with_distinct_adapter_state(self):
        result = run_review_engine(_adapter_result(STATE_EXECUTION_BOUNDARY_FAILURE))
        self.assertEqual(result["outcome"], OUTCOME_NO_ARTIFACT)
        self.assertEqual(result["adapter_state"], STATE_EXECUTION_BOUNDARY_FAILURE)
        self.assertIsNone(result["response"])
        self.assertEqual(result["findings"], [])

    def test_the_two_failure_kinds_remain_distinguishable(self):
        adapter_boundary = run_review_engine(_adapter_result(STATE_ADAPTER_BOUNDARY_FAILURE))
        execution_boundary = run_review_engine(_adapter_result(STATE_EXECUTION_BOUNDARY_FAILURE))
        self.assertNotEqual(adapter_boundary["adapter_state"], execution_boundary["adapter_state"])

    def test_evaluate_response_is_never_called_for_either_failure_kind(self):
        with patch(
            "src.review_engine.review_engine._evaluate_response",
            side_effect=AssertionError("_evaluate_response must not be called when no artifact exists"),
        ):
            run_review_engine(_adapter_result(STATE_ADAPTER_BOUNDARY_FAILURE))
            run_review_engine(_adapter_result(STATE_EXECUTION_BOUNDARY_FAILURE))


class EvaluatedTests(unittest.TestCase):
    def test_success_with_non_empty_response_is_evaluated(self):
        result = run_review_engine(_adapter_result(STATE_SUCCESS, "here is the review text"))
        self.assertEqual(result, {
            "outcome": OUTCOME_EVALUATED,
            "adapter_state": STATE_SUCCESS,
            "response": "here is the review text",
            "findings": [],
        })

    def test_response_preserved_exactly_including_unicode(self):
        text = "unicode: café, — em dash, \n\nnewlines preserved"
        result = run_review_engine(_adapter_result(STATE_SUCCESS, text))
        self.assertEqual(result["response"], text)

    def test_empty_string_response_is_still_evaluated_not_no_artifact(self):
        result = run_review_engine(_adapter_result(STATE_SUCCESS, ""))
        self.assertEqual(result["outcome"], OUTCOME_EVALUATED)
        self.assertEqual(result["response"], "")


class ResultShapeTests(unittest.TestCase):
    def test_output_key_set_is_uniform_and_never_carries_a_certifying_field(self):
        expected_keys = {"outcome", "adapter_state", "response", "findings"}
        for result in (
            run_review_engine(_adapter_result(STATE_ADAPTER_BOUNDARY_FAILURE)),
            run_review_engine(_adapter_result(STATE_EXECUTION_BOUNDARY_FAILURE)),
            run_review_engine(_adapter_result(STATE_SUCCESS, "text")),
        ):
            self.assertEqual(set(result.keys()), expected_keys)


class DeterminismAndAdditivityTests(unittest.TestCase):
    def test_repeated_calls_with_same_input_produce_identical_results(self):
        adapter_result = _adapter_result(STATE_SUCCESS, "stable response")
        first = run_review_engine(adapter_result)
        second = run_review_engine(adapter_result)
        self.assertEqual(first, second)

    def test_original_adapter_result_is_not_mutated(self):
        adapter_result = _adapter_result(STATE_SUCCESS, "original response")
        snapshot = dict(adapter_result)
        run_review_engine(adapter_result)
        self.assertEqual(adapter_result, snapshot)


if __name__ == "__main__":
    unittest.main()

import unittest

from src.adapter.llm_adapter import (
    STATE_ADAPTER_BOUNDARY_FAILURE,
    STATE_EXECUTION_BOUNDARY_FAILURE,
    STATE_SUCCESS,
    _invalid_execution_result_reason,
    _invalid_prompt_reason,
    run_adapter,
)

VALID_PROMPT = {"system_prompt": "be helpful", "user_prompt": "review this commit"}


def _never_called(system_prompt, user_prompt):
    raise AssertionError("execute must not be called when the prompt is invalid")


def _returns(value):
    def _execute(system_prompt, user_prompt):
        return value
    return _execute


def _raises(exc):
    def _execute(system_prompt, user_prompt):
        raise exc
    return _execute


class InvalidPromptReasonTests(unittest.TestCase):
    def test_valid_prompt_has_no_reason(self):
        self.assertIsNone(_invalid_prompt_reason(VALID_PROMPT))

    def test_extra_keys_are_allowed_and_ignored(self):
        prompt = dict(VALID_PROMPT, commit_hash="abc123", extra="anything")
        self.assertIsNone(_invalid_prompt_reason(prompt))

    def test_non_dict_prompt(self):
        self.assertEqual(_invalid_prompt_reason("not a dict"), "prompt must be a dict")
        self.assertEqual(_invalid_prompt_reason(None), "prompt must be a dict")
        self.assertEqual(_invalid_prompt_reason(["system_prompt", "user_prompt"]), "prompt must be a dict")

    def test_missing_system_prompt(self):
        prompt = {"user_prompt": "x"}
        self.assertEqual(_invalid_prompt_reason(prompt), "system_prompt is required")

    def test_system_prompt_wrong_type(self):
        prompt = {"system_prompt": 123, "user_prompt": "x"}
        self.assertEqual(_invalid_prompt_reason(prompt), "system_prompt must be a str")

    def test_missing_user_prompt(self):
        prompt = {"system_prompt": "x"}
        self.assertEqual(_invalid_prompt_reason(prompt), "user_prompt is required")

    def test_user_prompt_wrong_type(self):
        prompt = {"system_prompt": "x", "user_prompt": ["not", "a", "str"]}
        self.assertEqual(_invalid_prompt_reason(prompt), "user_prompt must be a str")


class InvalidExecutionResultReasonTests(unittest.TestCase):
    def test_str_has_no_reason(self):
        self.assertIsNone(_invalid_execution_result_reason("anything"))
        self.assertIsNone(_invalid_execution_result_reason(""))

    def test_none_has_a_reason(self):
        self.assertEqual(_invalid_execution_result_reason(None), "execute must return a str, got NoneType")

    def test_int_has_a_reason(self):
        self.assertEqual(_invalid_execution_result_reason(7), "execute must return a str, got int")

    def test_list_has_a_reason(self):
        self.assertEqual(_invalid_execution_result_reason(["response"]), "execute must return a str, got list")

    def test_dict_has_a_reason(self):
        self.assertEqual(_invalid_execution_result_reason({"text": "response"}), "execute must return a str, got dict")


class SuccessTests(unittest.TestCase):
    def test_non_empty_response_is_success(self):
        result = run_adapter(VALID_PROMPT, _returns("here is the review"))
        self.assertEqual(result, {"state": STATE_SUCCESS, "response": "here is the review"})

    def test_response_preserved_exactly_including_unicode(self):
        text = "unicode: café, — em dash, \n\nnewlines preserved"
        result = run_adapter(VALID_PROMPT, _returns(text))
        self.assertEqual(result["response"], text)

    def test_empty_string_response_is_still_success(self):
        result = run_adapter(VALID_PROMPT, _returns(""))
        self.assertEqual(result, {"state": STATE_SUCCESS, "response": ""})

    def test_extra_prompt_keys_do_not_block_success(self):
        prompt = dict(VALID_PROMPT, commit_hash="abc123")
        result = run_adapter(prompt, _returns("ok"))
        self.assertEqual(result["state"], STATE_SUCCESS)


class ExecutionBoundaryFailureTests(unittest.TestCase):
    def test_execute_raising_is_execution_boundary_failure(self):
        result = run_adapter(VALID_PROMPT, _raises(RuntimeError("boom")))
        self.assertEqual(result, {"state": STATE_EXECUTION_BOUNDARY_FAILURE, "response": None})

    def test_different_exception_types_all_collapse_to_the_same_state(self):
        for exc in (RuntimeError("a"), ValueError("b"), TimeoutError("c")):
            result = run_adapter(VALID_PROMPT, _raises(exc))
            self.assertEqual(result["state"], STATE_EXECUTION_BOUNDARY_FAILURE)

    def test_none_return_is_execution_boundary_failure_not_success(self):
        result = run_adapter(VALID_PROMPT, _returns(None))
        self.assertEqual(result, {"state": STATE_EXECUTION_BOUNDARY_FAILURE, "response": None})

    def test_non_str_return_types_are_execution_boundary_failure(self):
        for bad_value in (7, ["a"], {"a": 1}, 3.14, object()):
            result = run_adapter(VALID_PROMPT, _returns(bad_value))
            self.assertEqual(result, {"state": STATE_EXECUTION_BOUNDARY_FAILURE, "response": None})


class AdapterBoundaryFailureTests(unittest.TestCase):
    def test_invalid_prompt_never_calls_execute(self):
        result = run_adapter({"system_prompt": "x"}, _never_called)
        self.assertEqual(result, {"state": STATE_ADAPTER_BOUNDARY_FAILURE, "response": None})

    def test_non_dict_prompt_never_calls_execute(self):
        result = run_adapter("not a prompt", _never_called)
        self.assertEqual(result, {"state": STATE_ADAPTER_BOUNDARY_FAILURE, "response": None})

    def test_wrong_type_values_never_call_execute(self):
        result = run_adapter({"system_prompt": 1, "user_prompt": "x"}, _never_called)
        self.assertEqual(result, {"state": STATE_ADAPTER_BOUNDARY_FAILURE, "response": None})

    def test_extra_keys_do_not_mask_a_real_validation_failure(self):
        prompt = {"system_prompt": "x", "commit_hash": "abc123"}
        result = run_adapter(prompt, _never_called)
        self.assertEqual(result["state"], STATE_ADAPTER_BOUNDARY_FAILURE)


class ResultShapeTests(unittest.TestCase):
    def test_all_three_terminal_states_share_the_same_two_key_shape(self):
        results = [
            run_adapter(VALID_PROMPT, _returns("ok")),
            run_adapter(VALID_PROMPT, _raises(RuntimeError())),
            run_adapter({"system_prompt": "x"}, _never_called),
        ]
        for result in results:
            self.assertEqual(set(result.keys()), {"state", "response"})

    def test_failures_never_fabricate_a_response(self):
        for result in (
            run_adapter(VALID_PROMPT, _raises(RuntimeError())),
            run_adapter(VALID_PROMPT, _returns(None)),
            run_adapter({"system_prompt": "x"}, _never_called),
        ):
            self.assertIsNone(result["response"])


class DeterminismTests(unittest.TestCase):
    def test_repeated_calls_with_same_inputs_produce_identical_results(self):
        first = run_adapter(VALID_PROMPT, _returns("stable response"))
        second = run_adapter(VALID_PROMPT, _returns("stable response"))
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()

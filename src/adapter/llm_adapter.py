STATE_ADAPTER_BOUNDARY_FAILURE = "adapter_boundary_failure"
STATE_EXECUTION_BOUNDARY_FAILURE = "execution_boundary_failure"
STATE_SUCCESS = "success"


def _invalid_prompt_reason(prompt):
    if not isinstance(prompt, dict):
        return "prompt must be a dict"
    if "system_prompt" not in prompt:
        return "system_prompt is required"
    if not isinstance(prompt["system_prompt"], str):
        return "system_prompt must be a str"
    if "user_prompt" not in prompt:
        return "user_prompt is required"
    if not isinstance(prompt["user_prompt"], str):
        return "user_prompt must be a str"
    return None


def _invalid_execution_result_reason(result):
    if not isinstance(result, str):
        return f"execute must return a str, got {type(result).__name__}"
    return None


def _failure(state):
    return {"state": state, "response": None}


def _success(response):
    return {"state": STATE_SUCCESS, "response": response}


def run_adapter(prompt, execute):
    if _invalid_prompt_reason(prompt) is not None:
        return _failure(STATE_ADAPTER_BOUNDARY_FAILURE)

    try:
        result = execute(prompt["system_prompt"], prompt["user_prompt"])
    except Exception:
        return _failure(STATE_EXECUTION_BOUNDARY_FAILURE)

    if _invalid_execution_result_reason(result) is not None:
        return _failure(STATE_EXECUTION_BOUNDARY_FAILURE)

    return _success(result)

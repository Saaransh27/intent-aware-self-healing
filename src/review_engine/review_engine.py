from src.adapter.llm_adapter import STATE_SUCCESS

OUTCOME_NO_ARTIFACT = "no_artifact"
OUTCOME_EVALUATED = "evaluated"


def _evaluate_response(response):
    return []


def _build_result(outcome, adapter_state, response, findings):
    return {
        "outcome": outcome,
        "adapter_state": adapter_state,
        "response": response,
        "findings": findings,
    }


def run_review_engine(adapter_result):
    if adapter_result["state"] == STATE_SUCCESS:
        response = adapter_result["response"]
        findings = _evaluate_response(response)
        return _build_result(OUTCOME_EVALUATED, adapter_result["state"], response, findings)
    return _build_result(OUTCOME_NO_ARTIFACT, adapter_result["state"], None, [])

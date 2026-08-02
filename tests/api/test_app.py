import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.api import app as app_module
from src.pipeline.orchestrator import CommitResolutionError

PARSEABLE_RESPONSE = (
    "### Verdict\nv\n\n"
    "### What changed and why\nw\n\n"
    "### What deserves attention, ranked\na\n\n"
    "### Open questions\nq\n\n"
    "### Minor notes\nn"
)


def _pipeline_result(state, response, outcome, findings=None):
    return {
        "repository_url": "https://github.com/pallets/click",
        "commit_hash": "0f4738d",
        "prompt": {"system_prompt": "sys", "user_prompt": "usr"},
        "adapter_result": {"state": state, "response": response},
        "review_result": {
            "outcome": outcome,
            "adapter_state": state,
            "response": response,
            "findings": findings or [],
        },
    }


def _runner_returning(result):
    def runner(repository_url, commit_hash):
        return result
    return runner


def _runner_raising(exc):
    def runner(repository_url, commit_hash):
        raise exc
    return runner


def _runner_sleeping(seconds, result):
    def runner(repository_url, commit_hash):
        time.sleep(seconds)
        return result
    return runner


class ReviewApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        app_module.app.dependency_overrides.clear()

    def _override(self, runner):
        app_module.app.dependency_overrides[app_module.get_pipeline_runner] = lambda: runner

    def test_health(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_review_success_with_parseable_response(self):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_returning(result))

        response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["outcome"], "evaluated")
        self.assertEqual(body["adapter_state"], "success")
        self.assertTrue(body["review"]["parsed"])
        self.assertEqual(body["review"]["sections"]["verdict"], "v")
        self.assertEqual(body["review"]["raw"], PARSEABLE_RESPONSE)
        self.assertEqual(body["findings"], [])

    def test_review_success_with_unparseable_response_is_not_an_error(self):
        unparseable = "just some prose the model wrote with no section headings at all."
        result = _pipeline_result("success", unparseable, "evaluated")
        self._override(_runner_returning(result))

        response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["review"]["parsed"])
        self.assertIsNone(body["review"]["sections"])
        self.assertEqual(body["review"]["raw"], unparseable)

    def test_review_preserves_raw_response_exactly(self):
        raw = PARSEABLE_RESPONSE + "\n\ntrailing prose the parser ignores"
        result = _pipeline_result("success", raw, "evaluated")
        self._override(_runner_returning(result))

        response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.json()["review"]["raw"], raw)

    def test_adapter_boundary_failure_maps_to_500(self):
        result = _pipeline_result("adapter_boundary_failure", None, "no_artifact")
        self._override(_runner_returning(result))

        response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.status_code, 500)

    def test_execution_boundary_failure_maps_to_502(self):
        result = _pipeline_result("execution_boundary_failure", None, "no_artifact")
        self._override(_runner_returning(result))

        response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.status_code, 502)

    def test_commit_resolution_error_maps_to_404(self):
        self._override(_runner_raising(CommitResolutionError("no non-merge commits found in repository")))

        response = self.client.post("/review", json={"repository_url": "https://github.com/does-not-exist"})

        self.assertEqual(response.status_code, 404)

    def test_pipeline_timeout_maps_to_504(self):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_sleeping(0.2, result))

        with patch.object(app_module, "REQUEST_TIMEOUT_SECONDS", 0.01):
            response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.status_code, 504)

    def test_missing_repository_url_is_rejected_before_pipeline_runs(self):
        called = []
        self._override(lambda repository_url, commit_hash: called.append(True))

        response = self.client.post("/review", json={})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(called, [])

    def test_commit_hash_defaults_to_none_when_omitted(self):
        seen = {}

        def runner(repository_url, commit_hash):
            seen["commit_hash"] = commit_hash
            return _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")

        self._override(runner)

        self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertIsNone(seen["commit_hash"])


class ResponseValidationIntegrationTests(unittest.TestCase):
    """Milestone 17B: the validator runs after the parser, on every
    successful response, before it reaches the caller."""

    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        app_module.app.dependency_overrides.clear()

    def _override(self, runner):
        app_module.app.dependency_overrides[app_module.get_pipeline_runner] = lambda: runner

    def _post(self):
        return self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

    # --- clean ---

    def test_clean_response_omits_validation_field(self):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["validation"])

    def test_clean_response_behavior_is_otherwise_unchanged(self):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(body["review"]["parsed"])
        self.assertEqual(body["review"]["sections"]["verdict"], "v")
        self.assertEqual(body["review"]["raw"], PARSEABLE_RESPONSE)

    # --- flagged (warning-only findings) ---

    def test_flagged_response_returns_200_with_findings_attached(self):
        flagged = PARSEABLE_RESPONSE.replace("\na\n\n", "\nThe symbol claim shows this is fine.\n\n")
        result = _pipeline_result("success", flagged, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(body["validation"])
        self.assertEqual(body["validation"]["outcome"], "flagged")
        rules = [f["rule"] for f in body["validation"]["findings"]]
        self.assertIn("module_jargon_leak", rules)

    def test_flagged_response_does_not_alter_the_raw_review_text(self):
        flagged = PARSEABLE_RESPONSE.replace("\na\n\n", "\nThe symbol claim shows this is fine.\n\n")
        result = _pipeline_result("success", flagged, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()

        self.assertEqual(response.json()["review"]["raw"], flagged)

    # --- invalid, category A: parseability-related, preserved 14B behavior ---

    def test_missing_sections_still_returns_200_with_parsed_false(self):
        unparseable = "just some prose the model wrote with no section headings at all."
        result = _pipeline_result("success", unparseable, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(body["review"]["parsed"])
        self.assertEqual(body["review"]["raw"], unparseable)

    def test_missing_sections_findings_are_still_attached(self):
        unparseable = "just some prose the model wrote with no section headings at all."
        result = _pipeline_result("success", unparseable, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()
        body = response.json()

        self.assertIsNotNone(body["validation"])
        self.assertEqual(body["validation"]["outcome"], "invalid")
        rules = [f["rule"] for f in body["validation"]["findings"]]
        self.assertIn("missing_section", rules)

    def test_unclosed_code_fence_alone_does_not_get_rejected(self):
        text = PARSEABLE_RESPONSE + "\n```python\nx = 1\n"
        result = _pipeline_result("success", text, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()

        self.assertEqual(response.status_code, 200)

    # --- invalid, category B: genuine contract violations, rejected ---

    def test_literal_claim_id_leak_is_rejected(self):
        leaking = PARSEABLE_RESPONSE.replace("\na\n\n", "\nFlagged due to shape.wide_change.\n\n")
        result = _pipeline_result("success", leaking, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()

        self.assertEqual(response.status_code, 502)

    def test_reserved_tier_self_tagging_is_rejected(self):
        leaking = PARSEABLE_RESPONSE.replace("\na\n\n", "\nSomething changed (Observed interaction change).\n\n")
        result = _pipeline_result("success", leaking, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()

        self.assertEqual(response.status_code, 502)

    def test_rejected_response_never_returns_a_review_body(self):
        leaking = PARSEABLE_RESPONSE.replace("\na\n\n", "\nFlagged due to shape.wide_change.\n\n")
        result = _pipeline_result("success", leaking, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()

        self.assertNotIn("review", response.json())

    def test_contract_violation_takes_precedence_over_missing_sections(self):
        both = "This mentions shape.wide_change but has no real section structure at all."
        result = _pipeline_result("success", both, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()

        self.assertEqual(response.status_code, 502)

    # --- validator invocation and failure propagation ---

    def test_validator_is_invoked_with_the_exact_raw_response_text(self):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_returning(result))

        with patch.object(
            app_module, "validate_response", wraps=app_module.validate_response
        ) as spy:
            self._post()

        spy.assert_called_once_with(PARSEABLE_RESPONSE)

    def test_validator_exception_propagates_as_a_server_error(self):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_returning(result))
        strict_client = TestClient(app_module.app, raise_server_exceptions=False)

        with patch.object(app_module, "validate_response", side_effect=RuntimeError("boom")):
            response = strict_client.post(
                "/review", json={"repository_url": "https://github.com/pallets/click"}
            )

        self.assertEqual(response.status_code, 500)

    # --- backwards compatibility ---

    def test_existing_response_fields_are_unchanged_in_shape_and_value(self):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_returning(result))

        body = self._post().json()

        self.assertEqual(
            set(body.keys()),
            {"repository_url", "commit_hash", "outcome", "adapter_state", "review", "findings", "validation"},
        )
        self.assertEqual(body["outcome"], "evaluated")
        self.assertEqual(body["adapter_state"], "success")
        self.assertEqual(body["findings"], [])


if __name__ == "__main__":
    unittest.main()

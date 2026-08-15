import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.api import app as app_module
from src.api.session_store import SESSION_COOKIE_NAME, clear_all_sessions, create_session
from src.github.client import GitHubApiError
from src.github.oauth import OAuthError
from src.pipeline.orchestrator import CommitResolutionError

PARSEABLE_RESPONSE = (
    "### Verdict\nv\n\n"
    "### What changed and why\nw\n\n"
    "### What deserves attention, ranked\na\n\n"
    "### Open questions\nq\n\n"
    "### Minor notes\nn"
)


def _fake_review_context():
    return {
        "commit_summary": {
            "message": "test commit",
            "changed_files": ["src/foo.py"],
            "added_files": [],
            "deleted_files": [],
            "modified_files": ["src/foo.py"],
            "renamed_files": [],
        },
        "commit_claims": [],
        "file_claims": {},
        "gaps": {"commit": [], "files": {}},
        "coverage_ledger": [],
    }


def _fake_observations():
    return {
        "touched_directories": {"source": ["src/"], "tests": [], "documentation": [], "examples": [], "scripts": []},
        "file_classification": {"src/foo.py": "Source"},
        "change_statistics": {"files_added": 0, "files_deleted": 0, "files_modified": 1, "files_renamed": 0},
        "change_categories": {
            "touches_tests": False,
            "touches_documentation": False,
            "touches_dependencies": False,
            "touches_build_files": False,
            "touches_ci": False,
            "touches_config": False,
        },
        "extraction_confidence": {"unknown_file_count": 0, "unsupported_extensions": [], "skipped_binary_file_count": 0},
        "diff_stats": {
            "total_insertions": 4,
            "total_deletions": 1,
            "files": {"src/foo.py": {"insertions": 4, "deletions": 1}},
        },
    }


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
        "review_context": _fake_review_context(),
        "observations": _fake_observations(),
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

    # --- invalid, category B: internal-terminology leaks, no longer
    # rejected. Discarding an otherwise-useful review over one rare,
    # LLM-non-deterministic slip cost more in lost reviews than it gained
    # in message purity; an A/B test against a real repo's commit history
    # found a targeted prompt fix didn't move the failure rate outside
    # noise, so this now degrades the same way every other ERROR/WARNING
    # finding does: reported in `validation.findings`, never a 502. ---

    def test_literal_claim_id_leak_no_longer_rejects_the_response(self):
        leaking = PARSEABLE_RESPONSE.replace("\na\n\n", "\nFlagged due to shape.wide_change.\n\n")
        result = _pipeline_result("success", leaking, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertIn("review", body)
        self.assertTrue(body["review"]["parsed"])
        # Not auto-stripped (see sanitize_response's docstring) — still
        # visible in the returned text, and still flagged for anyone
        # inspecting validation.findings.
        self.assertIn("shape.wide_change", body["review"]["raw"])
        rules = [f["rule"] for f in body["validation"]["findings"]]
        self.assertIn("literal_claim_id_leak", rules)

    def test_reserved_tier_self_tagging_is_sanitized_instead_of_rejected(self):
        leaking = PARSEABLE_RESPONSE.replace("\na\n\n", "\nSomething changed (Observed interaction change).\n\n")
        result = _pipeline_result("success", leaking, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(body["review"]["parsed"])
        # The self-tag pattern is mechanically safe to strip, so it's gone
        # from the returned text entirely, not just tolerated.
        self.assertNotIn("(Observed", body["review"]["raw"])
        self.assertIn("Something changed.", body["review"]["raw"])
        # Nothing else was wrong with this response, so once the one
        # strippable artifact is gone, there's nothing left to flag.
        self.assertIsNone(body["validation"])

    def test_missing_sections_with_a_claim_id_leak_still_returns_parsed_false(self):
        both = "This mentions shape.wide_change but has no real section structure at all."
        result = _pipeline_result("success", both, "evaluated")
        self._override(_runner_returning(result))

        response = self._post()
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(body["review"]["parsed"])
        rules = [f["rule"] for f in body["validation"]["findings"]]
        self.assertIn("missing_section", rules)
        self.assertIn("literal_claim_id_leak", rules)

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

    def test_response_fields_are_the_full_current_shape(self):
        # review_context/observations are a deliberate, real contract
        # expansion (the deterministic claim/gap ledger, previously
        # discarded after building the prompt) — this asserts the CURRENT
        # full shape, not literal backwards-compatibility with the pre-
        # expansion contract.
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_runner_returning(result))

        body = self._post().json()

        self.assertEqual(
            set(body.keys()),
            {
                "repository_url", "commit_hash", "outcome", "adapter_state", "review",
                "findings", "validation", "review_context", "observations",
            },
        )
        self.assertEqual(body["outcome"], "evaluated")
        self.assertEqual(body["adapter_state"], "success")
        self.assertEqual(body["findings"], [])


class ReviewContextExposureTests(unittest.TestCase):
    """review_context/observations are real, already-computed pipeline
    data (the deterministic claim/gap ledger built to construct the
    prompt) — this exercises the actual pass-through logic with realistic,
    non-trivial data, not just the minimal fixture every other test uses."""

    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        app_module.app.dependency_overrides.clear()

    def _override(self, runner):
        app_module.app.dependency_overrides[app_module.get_pipeline_runner] = lambda: runner

    def _post(self):
        return self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

    def _result_with(self, review_context, observations):
        result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        result["review_context"] = review_context
        result["observations"] = observations
        return result

    def test_real_shaped_claims_and_gaps_round_trip_correctly(self):
        review_context = {
            "commit_summary": {
                "message": "widen dependency pin",
                "changed_files": ["pyproject.toml", "src/app.py"],
                "added_files": [],
                "deleted_files": [],
                "modified_files": ["pyproject.toml", "src/app.py"],
                "renamed_files": [],
            },
            "commit_claims": [
                {
                    "claim": "shape.narrow_change",
                    "scope": {"level": "commit", "file_path": None, "qualified_name": None},
                    "confidence": "inferred",
                    "basis": ["change_set"],
                    "module": "change_shape",
                },
            ],
            "file_claims": {
                "src/app.py": [
                    {
                        "claim": "contract.public_signature_changed",
                        "scope": {"level": "file", "file_path": "src/app.py", "qualified_name": None},
                        "confidence": "observed",
                        "basis": ["semantic_analysis"],
                        "module": "contract_stability",
                    },
                ],
            },
            "gaps": {
                "commit": [],
                "files": {
                    "pyproject.toml": [
                        {
                            "reason": "cannot_assess_contract",
                            "scope": {"level": "file", "file_path": "pyproject.toml", "qualified_name": None},
                            "missing": ["semantic_analysis"],
                            "module": "contract_stability",
                        },
                    ],
                },
            },
            "coverage_ledger": [],
        }
        observations = _fake_observations()

        self._override(_runner_returning(self._result_with(review_context, observations)))
        body = self._post().json()

        self.assertEqual(body["review_context"]["commit_summary"]["changed_files"], ["pyproject.toml", "src/app.py"])
        self.assertEqual(body["review_context"]["commit_claims"][0]["claim"], "shape.narrow_change")
        self.assertEqual(
            body["review_context"]["file_claims"]["src/app.py"][0]["claim"],
            "contract.public_signature_changed",
        )
        self.assertEqual(
            body["review_context"]["gaps"]["files"]["pyproject.toml"][0]["reason"],
            "cannot_assess_contract",
        )

    def test_coverage_ledger_round_trips_correctly(self):
        review_context = _fake_review_context()
        review_context["coverage_ledger"] = [
            {
                "collapsed_group_files": ["a.md", "b.md"],
                "collapsed_count": 2,
                "representative_file": "a.md",
                "justifying_claims": [
                    {
                        "claim": "shape.homogeneous_categories",
                        "scope": {"level": "commit", "file_path": None, "qualified_name": None},
                    },
                ],
            },
        ]

        self._override(_runner_returning(self._result_with(review_context, _fake_observations())))
        body = self._post().json()

        ledger = body["review_context"]["coverage_ledger"][0]
        self.assertEqual(ledger["collapsed_count"], 2)
        self.assertEqual(ledger["representative_file"], "a.md")
        self.assertEqual(ledger["justifying_claims"][0]["claim"], "shape.homogeneous_categories")

    def test_observations_round_trip_correctly(self):
        observations = {
            "touched_directories": {"source": ["src/"], "tests": ["tests/"], "documentation": [], "examples": [], "scripts": []},
            "file_classification": {"src/app.py": "Source", "tests/test_app.py": "Test"},
            "change_statistics": {"files_added": 1, "files_deleted": 0, "files_modified": 1, "files_renamed": 0},
            "change_categories": {
                "touches_tests": True,
                "touches_documentation": False,
                "touches_dependencies": False,
                "touches_build_files": False,
                "touches_ci": False,
                "touches_config": False,
            },
            "extraction_confidence": {"unknown_file_count": 0, "unsupported_extensions": [], "skipped_binary_file_count": 0},
            # Fixed, made-up numbers — this test isolates the API layer's
            # serialization only (does whatever goes in come back out
            # unchanged), not the real `git diff --numstat` logic. That's
            # covered separately, against real git output, in
            # tests/git/test_git_client.py's GetDiffStatsTests and
            # tests/pipeline/test_orchestrator.py's real end-to-end test.
            "diff_stats": {
                "total_insertions": 42,
                "total_deletions": 7,
                "files": {
                    "src/app.py": {"insertions": 40, "deletions": 7},
                    # None ("not applicable"), never coerced to 0.
                    "assets/logo.png": {"insertions": None, "deletions": None},
                },
            },
        }

        self._override(_runner_returning(self._result_with(_fake_review_context(), observations)))
        body = self._post().json()

        self.assertEqual(body["observations"]["file_classification"]["tests/test_app.py"], "Test")
        self.assertTrue(body["observations"]["change_categories"]["touches_tests"])
        self.assertEqual(body["observations"]["diff_stats"]["total_insertions"], 42)
        self.assertEqual(body["observations"]["diff_stats"]["total_deletions"], 7)
        self.assertIsNone(body["observations"]["diff_stats"]["files"]["assets/logo.png"]["insertions"])
        self.assertEqual(body["observations"]["change_statistics"]["files_added"], 1)

    def test_review_context_and_observations_are_present_even_when_response_is_unparseable(self):
        # These are computed BEFORE the LLM call — an unparseable model
        # response must not hide real, already-known pipeline data.
        result = self._result_with(_fake_review_context(), _fake_observations())
        result["review_result"]["response"] = "no headings here at all"
        self._override(_runner_returning(result))

        body = self._post().json()

        self.assertFalse(body["review"]["parsed"])
        self.assertIsNotNone(body["review_context"])
        self.assertIsNotNone(body["observations"])


def _pr_pipeline_result(state, response, outcome, findings=None):
    return {
        "repository_url": "https://github.com/pallets/click",
        "pr_number": 42,
        "base_sha": "base" + "0" * 36,
        "head_sha": "head" + "0" * 36,
        "prompt": {"system_prompt": "sys", "user_prompt": "usr"},
        "adapter_result": {"state": state, "response": response},
        "review_result": {
            "outcome": outcome,
            "adapter_state": state,
            "response": response,
            "findings": findings or [],
        },
        "review_context": _fake_review_context(),
        "observations": _fake_observations(),
    }


def _pr_runner_returning(result):
    def runner(repository_url, pr_number):
        return result
    return runner


def _pr_runner_raising(exc):
    def runner(repository_url, pr_number):
        raise exc
    return runner


class PRReviewApiTests(unittest.TestCase):
    """POST /review/pr — Milestone 1. A separate endpoint from POST /review;
    these tests never touch app_module.get_pipeline_runner, and the last
    test below confirms overriding one endpoint's runner doesn't affect
    the other."""

    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        app_module.app.dependency_overrides.clear()

    def _override(self, runner):
        app_module.app.dependency_overrides[app_module.get_pr_pipeline_runner] = lambda: runner

    def _post(self, pr_number=42):
        return self.client.post(
            "/review/pr", json={"repository_url": "https://github.com/pallets/click", "pr_number": pr_number}
        )

    def test_pr_review_success_includes_pr_identity_and_the_full_review_shape(self):
        result = _pr_pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_pr_runner_returning(result))

        response = self._post()

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["pr_number"], 42)
        self.assertEqual(body["base_sha"], "base" + "0" * 36)
        self.assertEqual(body["head_sha"], "head" + "0" * 36)
        self.assertEqual(body["commit_hash"], "head" + "0" * 36)
        self.assertTrue(body["review"]["parsed"])
        self.assertEqual(body["review"]["sections"]["verdict"], "v")
        self.assertIsNotNone(body["review_context"])
        self.assertIsNotNone(body["observations"])

    def test_pr_review_response_is_the_commit_review_shape_plus_pr_identity_only(self):
        result = _pr_pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_pr_runner_returning(result))

        body = self._post().json()

        commit_review_fields = {
            "repository_url", "commit_hash", "outcome", "adapter_state", "review",
            "findings", "validation", "review_context", "observations",
        }
        self.assertTrue(commit_review_fields.issubset(body.keys()))
        self.assertEqual(body.keys() - commit_review_fields, {"pr_number", "base_sha", "head_sha"})

    def test_commit_resolution_error_maps_to_404(self):
        self._override(_pr_runner_raising(CommitResolutionError("could not resolve pull request #999")))

        response = self._post(pr_number=999)

        self.assertEqual(response.status_code, 404)

    def test_execution_boundary_failure_maps_to_502(self):
        result = _pr_pipeline_result("execution_boundary_failure", None, "no_artifact")
        self._override(_pr_runner_returning(result))

        self.assertEqual(self._post().status_code, 502)

    def test_missing_pr_number_is_rejected_before_pipeline_runs(self):
        called = []
        self._override(lambda repository_url, pr_number: called.append(True))

        response = self.client.post("/review/pr", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(called, [])

    def test_existing_commit_review_endpoint_is_unaffected_by_the_pr_endpoint(self):
        pr_result = _pr_pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        self._override(_pr_runner_returning(pr_result))

        commit_result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        app_module.app.dependency_overrides[app_module.get_pipeline_runner] = lambda: _runner_returning(commit_result)

        commit_response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})
        pr_response = self._post()

        self.assertEqual(commit_response.status_code, 200)
        self.assertNotIn("pr_number", commit_response.json())
        self.assertEqual(pr_response.status_code, 200)
        self.assertEqual(pr_response.json()["pr_number"], 42)


_OAUTH_ENV = {
    "GITHUB_CLIENT_ID": "client-id-123",
    "GITHUB_CLIENT_SECRET": "client-secret-456",
    "GITHUB_OAUTH_REDIRECT_URI": "http://localhost:8020/github/callback",
}

_MISSING_OAUTH_ENV = {"GITHUB_CLIENT_ID": "", "GITHUB_CLIENT_SECRET": "", "GITHUB_OAUTH_REDIRECT_URI": ""}


class GithubLoginTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)

    @patch.dict("os.environ", _OAUTH_ENV, clear=False)
    def test_redirects_to_github_authorize_with_state_and_sets_oauth_state_cookie(self):
        response = self.client.get("/github/login", follow_redirects=False)

        self.assertEqual(response.status_code, 307)
        location = response.headers["location"]
        self.assertTrue(location.startswith("https://github.com/login/oauth/authorize?"))
        self.assertIn("client_id=client-id-123", location)
        self.assertIn("oauth_state", response.cookies)

    @patch.dict("os.environ", _MISSING_OAUTH_ENV, clear=False)
    def test_missing_oauth_configuration_returns_500_not_a_crash(self):
        strict_client = TestClient(app_module.app, raise_server_exceptions=False)

        response = strict_client.get("/github/login", follow_redirects=False)

        self.assertEqual(response.status_code, 500)


class GithubCallbackTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        clear_all_sessions()

    def _get_callback(self, code, state, oauth_state_cookie):
        self.client.cookies.clear()
        if oauth_state_cookie is not None:
            self.client.cookies.set("oauth_state", oauth_state_cookie)
        return self.client.get(
            "/github/callback", params={"code": code, "state": state}, follow_redirects=False
        )

    def test_valid_callback_creates_a_session_and_redirects_to_frontend(self):
        with patch.object(app_module, "exchange_code_for_token", return_value="real-token-xyz"):
            response = self._get_callback("real-code", "matching-state", "matching-state")

        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["location"], app_module.FRONTEND_URL)
        self.assertIn(SESSION_COOKIE_NAME, response.cookies)

    def test_state_mismatch_returns_400_and_creates_no_session(self):
        with patch.object(app_module, "exchange_code_for_token") as mock_exchange:
            response = self._get_callback("real-code", "attacker-supplied-state", "real-state")

        self.assertEqual(response.status_code, 400)
        mock_exchange.assert_not_called()
        self.assertNotIn(SESSION_COOKIE_NAME, response.cookies)

    def test_missing_oauth_state_cookie_returns_400(self):
        response = self._get_callback("real-code", "some-state", None)

        self.assertEqual(response.status_code, 400)

    def test_token_exchange_failure_returns_400_and_creates_no_session(self):
        with patch.object(app_module, "exchange_code_for_token", side_effect=OAuthError("bad code")):
            response = self._get_callback("stale-code", "matching-state", "matching-state")

        self.assertEqual(response.status_code, 400)
        self.assertNotIn(SESSION_COOKIE_NAME, response.cookies)


class GithubLogoutTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        clear_all_sessions()

    def test_logout_clears_a_real_session(self):
        from src.api.session_store import get_access_token

        session_id = create_session("real-token")
        self.client.cookies.set(SESSION_COOKIE_NAME, session_id)

        response = self.client.post("/github/logout")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(get_access_token(session_id))

    def test_logout_without_a_session_does_not_raise(self):
        response = self.client.post("/github/logout")

        self.assertEqual(response.status_code, 200)


class GithubDiscoveryAuthBoundaryTests(unittest.TestCase):
    """Every discovery route must require a valid session -- none of them
    should ever fall back to an unauthenticated GitHub call."""

    def setUp(self):
        self.client = TestClient(app_module.app)

    def test_me_without_a_session_returns_401(self):
        self.assertEqual(self.client.get("/github/me").status_code, 401)

    def test_repos_without_a_session_returns_401(self):
        self.assertEqual(self.client.get("/github/repos").status_code, 401)

    def test_repo_pulls_without_a_session_returns_401(self):
        self.assertEqual(self.client.get("/github/repos/octocat/hello-world/pulls").status_code, 401)

    def test_repo_pull_detail_without_a_session_returns_401(self):
        self.assertEqual(self.client.get("/github/repos/octocat/hello-world/pulls/42").status_code, 401)

    def test_forged_session_cookie_also_returns_401(self):
        self.client.cookies.set(SESSION_COOKIE_NAME, "forged-session-id")

        response = self.client.get("/github/me")

        self.assertEqual(response.status_code, 401)


class GithubMeTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)
        self.session_id = create_session("real-token-for-user-a")
        self.client.cookies.set(SESSION_COOKIE_NAME, self.session_id)

    def tearDown(self):
        clear_all_sessions()

    def test_returns_the_real_identity_for_the_sessions_token(self):
        with patch.object(app_module, "get_authenticated_user", return_value={
            "login": "octocat", "name": "The Octocat", "avatar_url": "https://example.com/a.png",
        }) as mock_get_user:
            response = self.client.get("/github/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["login"], "octocat")
        mock_get_user.assert_called_once_with("real-token-for-user-a")

    def test_upstream_github_failure_propagates_the_real_status_code(self):
        with patch.object(app_module, "get_authenticated_user", side_effect=GitHubApiError("boom", status_code=502)):
            response = self.client.get("/github/me")

        self.assertEqual(response.status_code, 502)


class GithubReposTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        clear_all_sessions()

    def test_returns_the_real_repo_list_for_the_sessions_token(self):
        session_id = create_session("real-token")
        self.client.cookies.set(SESSION_COOKIE_NAME, session_id)
        repo = {
            "full_name": "octocat/hello-world", "name": "hello-world", "owner": "octocat",
            "private": True, "default_branch": "main", "html_url": "https://github.com/octocat/hello-world",
            "updated_at": "2026-01-01T00:00:00Z",
        }
        with patch.object(app_module, "list_repositories", return_value=[repo]):
            response = self.client.get("/github/repos")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [repo])

    def test_two_sessions_see_results_scoped_to_their_own_token(self):
        session_a = create_session("token-a")
        session_b = create_session("token-b")

        def fake_list_repositories(token):
            return [{
                "full_name": f"{token}/repo", "name": "repo", "owner": token, "private": False,
                "default_branch": "main", "html_url": "https://example.com", "updated_at": "2026-01-01T00:00:00Z",
            }]

        with patch.object(app_module, "list_repositories", side_effect=fake_list_repositories):
            self.client.cookies.set(SESSION_COOKIE_NAME, session_a)
            response_a = self.client.get("/github/repos")

            self.client.cookies.set(SESSION_COOKIE_NAME, session_b)
            response_b = self.client.get("/github/repos")

        self.assertEqual(response_a.json()[0]["full_name"], "token-a/repo")
        self.assertEqual(response_b.json()[0]["full_name"], "token-b/repo")


class GithubRepoPullsTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)
        self.session_id = create_session("real-token")
        self.client.cookies.set(SESSION_COOKIE_NAME, self.session_id)

    def tearDown(self):
        clear_all_sessions()

    def test_returns_real_open_pull_requests(self):
        pr = {
            "number": 42, "title": "Fix the thing", "author_login": "octocat",
            "created_at": "2026-01-15T10:30:00Z", "updated_at": "2026-01-16T09:00:00Z",
            "head_ref": "feature", "base_ref": "main",
            "html_url": "https://github.com/octocat/hello-world/pull/42", "draft": False,
            "state": "open", "head_sha": "abc123def456abc123def456abc123def456abc",
            # Milestone 4: real GitHub fields, but absent on the list
            # endpoint -- None here, not fabricated zeros.
            "additions": None, "deletions": None, "changed_files": None,
        }
        with patch.object(app_module, "list_open_pull_requests", return_value=[pr]) as mock_list:
            response = self.client.get("/github/repos/octocat/hello-world/pulls")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [pr])
        mock_list.assert_called_once_with("real-token", "octocat", "hello-world")

    def test_a_repo_the_user_cannot_see_returns_the_real_404(self):
        with patch.object(
            app_module, "list_open_pull_requests", side_effect=GitHubApiError("not found", status_code=404)
        ):
            response = self.client.get("/github/repos/octocat/private-repo/pulls")

        self.assertEqual(response.status_code, 404)


class GithubRepoPullDetailTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)
        self.session_id = create_session("real-token")
        self.client.cookies.set(SESSION_COOKIE_NAME, self.session_id)

    def tearDown(self):
        clear_all_sessions()

    def test_returns_real_pr_detail_including_body(self):
        pr_detail = {
            "number": 42, "title": "Fix the thing", "author_login": "octocat",
            "created_at": "2026-01-15T10:30:00Z", "updated_at": "2026-01-16T09:00:00Z",
            "head_ref": "feature", "base_ref": "main",
            "html_url": "https://github.com/octocat/hello-world/pull/42", "draft": False,
            "state": "open", "head_sha": "abc123def456abc123def456abc123def456abc",
            "body": "Because reasons.",
        }
        with patch.object(app_module, "get_pull_request", return_value=pr_detail) as mock_get:
            response = self.client.get("/github/repos/octocat/hello-world/pulls/42")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["body"], "Because reasons.")
        mock_get.assert_called_once_with("real-token", "octocat", "hello-world", 42)


class GithubCorsCredentialsTests(unittest.TestCase):
    """The one shared-infrastructure change this milestone required: a
    credentialed request needs a specific origin, not "*"."""

    def setUp(self):
        self.client = TestClient(app_module.app)

    def test_configured_frontend_origin_is_allowed_with_credentials(self):
        response = self.client.options(
            "/github/me",
            headers={"Origin": app_module.FRONTEND_URL, "Access-Control-Request-Method": "GET"},
        )

        self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")
        self.assertEqual(response.headers.get("access-control-allow-origin"), app_module.FRONTEND_URL)

    def test_an_unlisted_origin_is_not_granted_cors_access(self):
        response = self.client.options(
            "/github/me",
            headers={"Origin": "https://not-an-allowed-origin.example.com", "Access-Control-Request-Method": "GET"},
        )

        self.assertNotEqual(response.headers.get("access-control-allow-origin"), "https://not-an-allowed-origin.example.com")

    def test_null_origin_is_not_granted_cors_access(self):
        # Milestone 5: "null" was removed from the allowlist -- a browser
        # sends this same Origin value for a sandboxed iframe with no
        # allow-same-origin, not just a legacy file://-opened page, so
        # allowlisting it let an attacker-controlled page read a
        # credentialed cross-origin response.
        response = self.client.options(
            "/github/me",
            headers={"Origin": "null", "Access-Control-Request-Method": "GET"},
        )

        self.assertNotEqual(response.headers.get("access-control-allow-origin"), "null")


class GetPrPipelineRunnerAuthTests(unittest.TestCase):
    """Milestone 3A: get_pr_pipeline_runner's resolver-selection logic,
    tested as a plain function -- it's a regular Python function with a
    Depends() default, callable directly without going through FastAPI's
    injection or a real HTTP request."""

    def _minimal_pipeline_result(self):
        return {
            "repository_url": "https://github.com/octocat/hello-world", "pr_number": 42,
            "base_sha": "b" * 40, "head_sha": "h" * 40,
            "adapter_result": {"state": "success", "response": PARSEABLE_RESPONSE},
            "review_result": {"outcome": "evaluated", "response": PARSEABLE_RESPONSE, "findings": []},
            "review_context": _fake_review_context(), "observations": _fake_observations(),
        }

    def test_no_token_selects_the_unauthenticated_resolver(self):
        with patch.object(app_module, "run_pipeline_for_pr", return_value=self._minimal_pipeline_result()) as mock_run:
            runner = app_module.get_pr_pipeline_runner(access_token=None)
            runner("https://github.com/octocat/hello-world", 42)

        kwargs = mock_run.call_args.kwargs
        self.assertIs(kwargs["resolve_pr"], app_module.resolve_pull_request)
        self.assertIsNone(kwargs["access_token"])

    def test_a_real_token_is_passed_through_to_the_pipeline(self):
        with patch.object(app_module, "run_pipeline_for_pr", return_value=self._minimal_pipeline_result()) as mock_run:
            runner = app_module.get_pr_pipeline_runner(access_token="real-token-abc")
            runner("https://github.com/octocat/private-repo", 7)

        self.assertEqual(mock_run.call_args.kwargs["access_token"], "real-token-abc")

    def test_a_real_token_selects_a_resolver_bound_to_that_token(self):
        with patch.object(app_module, "run_pipeline_for_pr", return_value=self._minimal_pipeline_result()) as mock_run, \
             patch.object(app_module, "get_pull_request_refs") as mock_get_refs:
            mock_get_refs.return_value = {"base_sha": "b" * 40, "head_sha": "h" * 40}

            runner = app_module.get_pr_pipeline_runner(access_token="real-token-abc")
            runner("https://github.com/octocat/private-repo", 7)

            resolve_pr = mock_run.call_args.kwargs["resolve_pr"]
            self.assertIsNot(resolve_pr, app_module.resolve_pull_request)
            resolve_pr("https://github.com/octocat/private-repo", 7)

        mock_get_refs.assert_called_once_with("real-token-abc", "https://github.com/octocat/private-repo", 7)


class PRReviewSessionBehaviorTests(unittest.TestCase):
    """HTTP-level: exercises the REAL get_optional_access_token dependency
    (a real cookie is parsed), with only run_pipeline_for_pr itself
    mocked out to avoid a real git/network call."""

    def setUp(self):
        self.client = TestClient(app_module.app)

    def tearDown(self):
        clear_all_sessions()

    def _minimal_pipeline_result(self):
        return {
            "repository_url": "https://github.com/octocat/hello-world", "pr_number": 42,
            "base_sha": "b" * 40, "head_sha": "h" * 40,
            "adapter_result": {"state": "success", "response": PARSEABLE_RESPONSE},
            "review_result": {"outcome": "evaluated", "response": PARSEABLE_RESPONSE, "findings": []},
            "review_context": _fake_review_context(), "observations": _fake_observations(),
        }

    def _post(self, pr_number=42):
        return self.client.post(
            "/review/pr", json={"repository_url": "https://github.com/octocat/hello-world", "pr_number": pr_number}
        )

    def test_no_session_cookie_reviews_unauthenticated_exactly_as_milestone_1(self):
        with patch.object(app_module, "run_pipeline_for_pr", return_value=self._minimal_pipeline_result()) as mock_run:
            response = self._post()

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(mock_run.call_args.kwargs["access_token"])

    def test_valid_session_review_uses_the_real_stored_token(self):
        session_id = create_session("real-token-xyz")
        self.client.cookies.set(SESSION_COOKIE_NAME, session_id)

        with patch.object(app_module, "run_pipeline_for_pr", return_value=self._minimal_pipeline_result()) as mock_run:
            response = self._post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_run.call_args.kwargs["access_token"], "real-token-xyz")

    def test_forged_or_expired_session_cookie_falls_back_to_unauthenticated_not_a_401(self):
        self.client.cookies.set(SESSION_COOKIE_NAME, "forged-session-id-never-created")

        with patch.object(app_module, "run_pipeline_for_pr", return_value=self._minimal_pipeline_result()) as mock_run:
            response = self._post()

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(mock_run.call_args.kwargs["access_token"])

    def test_git_or_github_authentication_failure_maps_to_404_not_a_crash(self):
        session_id = create_session("revoked-token")
        self.client.cookies.set(SESSION_COOKIE_NAME, session_id)

        with patch.object(
            app_module, "run_pipeline_for_pr",
            side_effect=CommitResolutionError("could not clone repository: https://github.com/octocat/hello-world"),
        ):
            response = self._post()

        self.assertEqual(response.status_code, 404)

    def test_existing_commit_review_is_unaffected_by_a_valid_session_cookie(self):
        session_id = create_session("real-token-xyz")
        self.client.cookies.set(SESSION_COOKIE_NAME, session_id)

        commit_result = _pipeline_result("success", PARSEABLE_RESPONSE, "evaluated")
        app_module.app.dependency_overrides[app_module.get_pipeline_runner] = lambda: _runner_returning(commit_result)

        response = self.client.post("/review", json={"repository_url": "https://github.com/pallets/click"})

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("pr_number", response.json())
        self.assertEqual(response.json()["commit_hash"], "0f4738d")


if __name__ == "__main__":
    unittest.main()

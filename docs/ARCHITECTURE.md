# Architecture

## Current flow (Milestone 2 + Milestone 3 step 1 + Milestones 4A/4B/5A/6/7/8 in progress)

```
main.py <repository_url> <commit_count>
  -> DatasetCollector.collect()
       -> GitClient.clone_repository()             (once, into a temp dir)
       -> GitClient.get_default_branch/get_commit_count/
          get_first_commit_date/get_last_commit_date/get_contributors/get_tracked_files()
       -> language_detector.detect_languages()      (classifies tracked file paths)
       -> build_system_detector.detect_build_system()  (lock files / pyproject.toml / configs)
       -> layout_detector.detect_layout()            (classifies top-level directories)
       -> signal_detector.detect_repository_signals()  (doc/build/container/CI marker files)
       -> writes benchmark/<repo>/repository.json
       -> GitClient.get_non_merge_commit_hashes()   (up to commit_count, newest-first)
       -> for each commit hash:
            -> GitClient.get_commit_metadata()
            -> GitClient.get_commit_diff()
            -> writes benchmark/<repo>/commits/<hash>/artifacts/{metadata.json, diff.patch}
```

Not shown above (not wired into `collect()` yet): nine private builder methods —
`_build_commit_identity`, `_build_commit_metadata`, `_build_commit_change_set`,
`_build_commit_observations`, `_build_commit_file_history`, `_build_commit_co_change`,
`_build_commit_local_module_context`, `_build_commit_repository_signals`,
`_build_commit_artifacts` — each verified standalone, in preparation for a structured
`commit.json` once its sixth section (`collection`) is specified. See
`docs/modules/dataset_collector.md` and `MILESTONES.md` (Milestones 4A/4B/5A).

## Layering

Three layers, one strict rule between them:

- **`GitClient`** (`src/git/`) — the only place that knows how git works. Owns command
  construction, output parsing, and git-domain semantics (e.g. "a merge commit has more
  than one parent"). Nothing above it should ever reason about git internals directly.
- **`src/utils/`** — small, self-contained, git-agnostic helpers. `language_detector.py`
  classifies file paths by extension; `build_system_detector.py` classifies package
  manager from marker files (reading `pyproject.toml`'s content directly off the already
  checked-out clone when needed); `layout_detector.py` classifies top-level directories;
  `signal_detector.py` flags well-known files/dirs that could influence future patch
  reasoning (docs, build config, containerization, CI) — generic enough to reuse
  unmodified for both repo-wide and single-commit scoping; `file_classifier.py`
  classifies a single changed file by path/extension into 9 categories (Source/Test/
  Documentation/Configuration/Dependency/CI-CD/Infrastructure/Binary/Unknown);
  `co_change_detector.py` ranks a file's historical co-change partners from raw
  historical file-lists (pure counting, no git access itself — the history walk that
  produces its input lives in `GitClient`); `module_context_detector.py` lists a file's
  siblings in its own immediate directory. None of them know anything about git or the
  benchmark format — they take paths/strings/lists in, return a dict or list out.
  `file_classifier.py` imports `language_detector.EXTENSION_LANGUAGES` to avoid
  duplicating the extension list — the first (and so far only) cross-import between two
  `src/utils` modules; still no dependency on git or `DatasetCollector`.
- **`src/semantic/`** — a new layer added in Milestone 6 (ADR-005), sibling to
  `src/utils/` and `src/git/`. Deliberately kept separate from `src/utils/`:
  everything under `utils/` is structural/historical and language-agnostic, while this
  layer extracts symbol-level facts directly from source code and is necessarily
  language-coupled. Each language gets its own subpackage —
  `src/semantic/python/symbol_extractor.py` is the first and, so far, only one. Its
  public function, `extract_symbol_semantics`, is called from
  `DatasetCollector._build_commit_semantic_analysis` — all 6 ADR-005 stages complete,
  verified against real commits in `pallets/flask` and `tcx_nogrunt-1` (including a
  non-trivial, content-changing rename), but not yet wired into `collect()`, same
  status as every other evidence-extractor orchestration method. Milestone 8.5A (ADR-008)
  extended it with per-symbol `body_evidence` — callees, exceptions raised/caught, and
  context managers, each set-diffed old vs. new and grouped into five reviewer-facing
  categories — closing the "Function Body Blindness" gap named by the 10-batch
  reasoning evaluation: a symbol whose only change is one of these facts now correctly
  produces a `modified` diff entry instead of being silently skipped. See
  `docs/modules/symbol_extractor.md` and `MILESTONES.md` (Milestones 6, 9).
- **`src/fusion/`** — a new layer added in Milestone 7 (ADR-006), sibling to
  `src/git/`, `src/utils/`, and `src/semantic/`. The second module whose input is
  structured evidence rather than repo/git state (after `src/semantic/`), but the
  first with zero coupling to `GitClient` or `DatasetCollector` at all — it takes a
  plain dict shaped like the extraction sections and returns entity-centric bundles,
  copying values out rather than referencing them, so it is the only code in the
  project that needs to know any section's internal shape (dict-keyed-by-path vs.
  list-of-dicts vs. flat lists). Not persisted — called on demand, not written to disk.
  See `docs/modules/evidence_fusion.md` and `MILESTONES.md` (Milestone 7).
- **`src/reasoning/`** — the deterministic reasoning layer added in Milestone 8
  (ADR-007), sibling to `src/fusion/`. Its only input is `evidence_fusion.fuse_evidence`'s
  output — no dependency on `GitClient`, `DatasetCollector`, or the raw extraction
  sections. Six independent modules (`change_shape`, `historical_risk`, `reach`,
  `verification_coverage`, `contract_stability`, `body_evidence`) each declare an
  explicit `CONSUMES` list, enforced by `registry.run_reasoning` filtering the
  evidence before invoking a module — a module cannot read a field it didn't declare.
  `body_evidence` (Milestone 8.5A, ADR-008) is a sibling to `contract_stability`, not a
  merge into it — it reasons about a symbol's body (interaction/error-handling/
  resource-management/documentation/structure facts), a different reviewer question
  from `contract_stability`'s external-contract facts (signature/decorators/removal).
  Milestone 8.5B (ADR-009) added three more claims to the existing `reach` and
  `historical_risk` modules — no new module, no new extraction for two of the three
  (a cross-reference of `co_change`'s existing partner list against the commit's own
  changed files, and a threshold flip on `long_dormant_reactivated`'s existing
  fields) and one small extension to `GitClient.get_file_history` for the third.
  Milestone 8.5C (ADR-010) — the final deterministic capability before Milestone 9 —
  added one more claim to `historical_risk` the same way: one more optional
  parameter on `get_file_history`'s existing git call (`author_email`, enriching the
  same query rather than adding a new one), no new module, no new `CONSUMES`, no
  Evidence Fusion changes at all (the existing per-file passthrough already exposes
  whatever fields the dict carries). A `synthesizer` collects and groups their
  Claims/Gaps by scope without adding any reasoning of its own. See
  `docs/modules/reasoning.md` and `MILESTONES.md` (Milestones 8, 8.5A, 8.5B, 8.5C).
- **Milestone 9 (Semantic Reasoning)** — architecture frozen across four ADRs
  (2026-07-24). ADR-011 (Review Context) and ADR-014 (Prompt Builder Contract) are
  now implemented, as Milestones 10A and 10B — see below. ADR-012 (LLM's role —
  triage, not review — and reasoning contract) and ADR-013 (human-facing review's
  five-section output shape) remain architecture only — no LLM Adapter or
  ReviewEngine exists to actually apply them to a model call, though both are
  restated as fixed instructions inside the Prompt Builder's system prompt. None of
  these four introduce a new dependency direction or touch any existing module's
  `CONSUMES`/`PRODUCES` — each is additive, sitting downstream of the frozen
  deterministic layer exactly the way `src/fusion/` sits downstream of raw
  extraction and `src/reasoning/` sits downstream of `src/fusion/`. See
  `docs/DECISIONS.md` (ADR-011 through ADR-014) and `MILESTONES.md` (Milestone 9).
- **Milestone 10C (LLM Adapter)** — architecture frozen as ADR-015 (2026-07-26).
  Its responsibility is transport plus *structural* normalization only (a stable
  representation of whatever resulted, and an explicit presence/absence
  distinction) — never semantic normalization, the same structure-never-meaning
  discipline ADR-011 gave `ReviewContextBuilder`, carried one boundary further.
  See `docs/DECISIONS.md` (ADR-015) and `MILESTONES.md` (Milestone 10C) for the
  full contract, including its two-kind failure taxonomy and five-state model.
  **This completed the Milestone 10 architecture.**
- **`src/adapter/`** (Milestone 11A, implementing ADR-015) — a new layer, sibling
  to `src/review/` and `src/prompt/`, consuming only `src/prompt/prompt_builder.
  build_prompt`'s output — the first component in this project whose job requires
  an actual model to run, and therefore the first deliberate exception to the
  full-pipeline determinism every ADR since ADR-006 has held, named explicitly
  rather than left implicit. One public function, `llm_adapter.run_adapter(prompt,
  execute)`, returns a plain dict (`{"state", "response"}`) — the project's
  established data-contract convention, same as every other layer. `execute` is an
  injected, deliberately opaque callable standing in for an actual model call,
  whose own implementation is out of scope here, per ADR-015's deferral of "which
  model... is not decided by this ADR." An implementation-time conflict with
  ADR-015's frozen transition table (whether a malformed `execute` return should
  be classified as Adapter-boundary or Execution-boundary failure) was found,
  reported, and resolved in favor of the ADR's literal text rather than silently
  designed around — see `docs/modules/llm_adapter.md`. Not wired into any
  pipeline entrypoint yet; `execute`'s real implementation remains future work.
  See `MILESTONES.md` (Milestone 11A).
- **`src/review_engine/`** (Milestone 12, implementing ADR-016) — a new layer,
  sibling to `src/adapter/`, consuming only `run_adapter`'s output. One public
  function, `review_engine.run_review_engine(adapter_result)`, returns a plain
  dict with two possible outcomes — `no_artifact` (the Adapter reported either
  failure kind; no evaluation attempted) and `evaluated` (the Adapter reported
  success; the response is checked against whatever category-1 properties are
  actually checkable, producing zero or more independent findings). Unlike the
  Adapter, no dependency is injected — evaluation has no external process to
  cross, so determinism resumes at this layer rather than extending the
  Adapter's one deliberate exception. `_evaluate_response`'s actual catalogue
  (which specific ADR-012/013 properties are checkable) is deliberately left
  empty, per ADR-016's own explicit deferral, not implemented here. Trusts the
  Adapter's result unconditionally, on architectural grounds established
  in ADR-016 rather than by re-validating it. Not wired into any pipeline
  entrypoint yet; the category-1 catalogue and whatever consumes this result
  both remain future work. See `docs/modules/review_engine.md` and
  `MILESTONES.md` (Milestone 12).
- **`src/review/`** (Milestone 10A, implementing ADR-011) — a new layer, sibling
  to `src/fusion/` and `src/reasoning/`, consuming only `src/reasoning/
  synthesizer.synthesize`'s output plus the commit's `metadata`/`change_set`/raw
  diff/`commit_hash` — no dependency on `GitClient`, `DatasetCollector`, or
  Evidence Fusion directly. One public function, `context_builder.
  build_review_context(...)`, returns a plain dict (`ReviewContext`) — the
  project's established data-contract convention (dicts, not classes), same as
  Claims/Gaps/Fusion bundles/Synthesizer output. Splits the raw diff into
  addressable per-file Evidence Units, relays Claims/Gaps as independent copies
  (never the same objects as the Synthesizer's own output), and collapses
  low-risk files in wide/homogeneous commits into a single representative plus a
  Coverage Ledger — using only facts the Reasoning Layer already concluded, never
  a new heuristic. Not persisted, not wired into any pipeline entrypoint yet. See
  `docs/modules/context_builder.md` and `MILESTONES.md` (Milestone 10A).
- **`src/prompt/`** (Milestone 10B, implementing ADR-014) — a new layer, sibling
  to `src/review/`, consuming only `ReviewContext` directly with no adapter (ADR-011
  built it specifically to be the one object anything downstream receives). One
  public function, `prompt_builder.build_prompt(review_context)`, returns a plain
  dict (`{"system_prompt", "user_prompt"}`) — a fixed system prompt restating
  ADR-012/013's frozen content, and a per-commit user prompt rendering the
  `ReviewContext`'s five sections as verbatim JSON, in fixed order, with no
  hand-formatting and no cross-referencing between sections (left to the model).
  Not persisted, not wired into any pipeline entrypoint yet. `SYSTEM_PROMPT`
  gained three additive calibration sentences in Milestone 15B (length
  should track complexity/risk; "nothing requires special attention" is a
  valid outcome; a relevance gate on Open Questions), then one further
  additive refinement in Milestone 15D gating "nothing requires special
  attention" on the reasoning sequence actually having run and found every
  concern already covered by the Verdict/What-changed sections — no
  existing wording removed either time, no ADR-013 section added or
  changed. **`SYSTEM_PROMPT` is now frozen as Prompt v1** (Milestone 15E,
  2026-07-31), under the same discipline this project applies to every ADR:
  frozen until evidence justifies revision. A future revision requires all
  four of: observed in real usage/production evaluation; repeatable across
  multiple commits; a systematic failure, not expected model variance; and
  a proposed fix demonstrably verified not to introduce a larger
  regression. See `docs/modules/prompt_builder.md` and `MILESTONES.md`
  (Milestones 10B, 15B, 15C, 15D, 15E).
- **`src/pipeline/`** (Milestone 14B) — the reusable orchestration layer,
  sibling to `src/api/`, extracted from Milestone 13's original script so both
  the CLI and the API share one implementation. `orchestrator.py`:
  `run_pipeline_for_commit(repository_url, commit_hash, execute) -> dict`
  clones a repo, assembles evidence via `DatasetCollector`'s existing private
  builder methods (no `src/collector/` code was changed; `collect()` itself
  still does not perform this assembly), and runs the full Fusion → Reasoning
  → ReviewContextBuilder → PromptBuilder → LLMAdapter → ReviewEngine chain.
  `execute` is a required parameter with no default — the orchestrator has no
  knowledge of any specific provider, mirroring `run_adapter`'s own signature
  discipline. Raises `CommitResolutionError` when the repository or target
  commit can't be resolved. `gemini_execute.py`: `call_gemini(system_prompt,
  user_prompt)`, the real `execute` implementation first built in Milestone
  13 (unchanged logic, stdlib `urllib.request` against Google's Generative
  Language API, reading `GEMINI_API_KEY` from the environment only) —
  relocated here, rather than left in the root-level script, specifically so
  the API layer can import it without inverting this project's established
  dependency direction (`src/` never imports from a root-level script).
  `run_full_pipeline.py` (root-level, sibling to `main.py`) is now a thin CLI
  wrapper around `run_pipeline_for_commit`, the same thinness `main.py` has
  around `DatasetCollector`. See `docs/MILESTONES.md` (Milestones 13, 14B)
  and `docs/CHANGELOG.md` for the real end-to-end execution Milestone 13
  produced, including the two environment obstacles found (no local SSL CA
  trust store; per-model quota exhaustion) and one real model-behavior
  finding (a raw internal claim id leaking into the model's prose, classified
  via ADR-014's own bug-vs-mistake test as a model mistake, not a pipeline
  defect). `shakti_execute.py` (Milestone 16B): `call_shakti(system_prompt,
  user_prompt)`, a second real `execute` implementation calling Shakti
  Studio's OpenAI-compatible API. Originally pointed at Llama 3.3 70B
  Instruct for the Milestone 16B multi-model benchmark only; as of the
  Milestone 16B full-execution round it points at `openai/gpt-oss-120b` and
  **is `src/api/app.py`'s default `execute`** — Gemini is no longer called
  anywhere in the API path. `run_full_pipeline.py` still hardcodes
  `execute=call_gemini` and has not been updated to match; the two entry
  points currently call two different models (see `docs/CURRENT_STATE.md`,
  Milestone 16B full-execution and Milestone 20 sections).
- **`src/api/`** (Milestone 14B) — the first real consumer of
  `run_review_engine`'s result, sibling to `src/pipeline/`. `app.py`: a
  FastAPI app exposing exactly `GET /health` and `POST /review`; the latter
  resolves a pipeline-runner through a `Depends()` seam (overridden in tests,
  never touching the network), bounds the call with a
  `concurrent.futures.ThreadPoolExecutor` timeout, and maps outcomes to HTTP
  status codes — `CommitResolutionError` → 404, `adapter_boundary_failure` →
  500, `execution_boundary_failure` → 502 (deliberately one uniform response
  for timeout/rate-limit/provider-error/malformed-response together, since
  `run_adapter` collapses them indistinguishably by ADR-015's own frozen
  Explicit Absence/No Fabrication invariants — this layer does not, and
  architecturally cannot, tell them apart). `response_parser.py`:
  `parse_review_sections`, splitting a response into ADR-013's five sections
  by literal heading match, living outside the Review Engine entirely, per
  explicit instruction — ADR-016 is untouched, and a response that doesn't
  parse is `parsed: false`, not an error. `models.py`: the Pydantic
  request/response schema. This milestone added this project's first-ever
  runtime dependencies (`fastapi`, `uvicorn`, `httpx`) — everything upstream
  of `src/api/` remains dependency-free. `app.py` gained `CORSMiddleware`
  (Milestone 16A, `allow_origins=["*"]`) so a static page opened from a
  `file://` origin can reach it — a transport-level permission, not a new
  route or new logic; the endpoint surface is still exactly `GET /health`
  and `POST /review`. As of Milestone 17B, `app.py` also calls
  `validate_response` (see below) immediately after `parse_review_sections`,
  on the same `response` string returned in `review.raw`. The pipeline order
  is now `run_adapter` → `run_review_engine` → `parse_review_sections` →
  `validate_response` → API response. Findings are split into two
  categories with different consequences, a distinction owned entirely by
  `app.py`, not by the validator itself: Category A (`missing_section`,
  `unclosed_code_fence`) is exactly the condition Milestone 14B's
  `parsed: false` already represents, so it is never rejected — `200`,
  `parsed`/`raw` unchanged from 14B, findings attached alongside; Category B
  (`literal_claim_id_leak`, `reserved_confidence_tier_self_tagging`) is a
  genuine contract violation 14B never addressed, so it is rejected with
  `502` — the first case in this project where a generated response is
  never returned to a client. Category B takes precedence when both fire
  together. See `docs/MILESTONES.md` (Milestones 14, 14B, 16A, 17B) for the
  full architectural reasoning behind this split.
- **`src/response_validation/`** (Milestone 17A, implementing the design in
  `docs/research/response_validation_layer_design.md`; integrated into
  `src/api/app.py` in Milestone 17B) — a deterministic, side-effect-free,
  LLM-independent check on response text only, sibling to `src/api/`. One
  public function, `response_validator.validate_response(response_text) ->
  dict`, returning `{"outcome", "findings"}` where each finding is
  `{"rule", "severity", "message", "location"}`. Covers Formatting
  (missing/duplicate/out-of-order/unknown sections), Internal terminology
  (literal claim-id leaks anchored on the 10 real prefixes
  `src/reasoning/modules/*.py` emits; reserved confidence-tier self-tagging;
  module-name soft jargon), and Structural well-formedness (empty sections,
  duplicated paragraphs, malformed markdown, unclosed code fences). Never
  logs, mutates, sanitizes, or raises — detection only; `app.py` alone
  decides what to do with its report. Reuses `src/api/response_parser.py`'s
  already-public `SECTION_KEYS` without any change to that module; the
  Review Engine, Adapter, and Prompt Builder remain untouched, and
  `response_validator.py` itself was not modified during integration. See
  `docs/MILESTONES.md` (Milestones 17, 17A, 17B).
- **`playground/`** (Milestone 16A) — a single static HTML/CSS/vanilla-JS
  file, `index.html`, with no framework, no build step, and no Python code
  of its own; it consumes `POST /review` exactly as it exists, rendering
  `review.sections` when `parsed: true` and falling back to `review.raw`
  otherwise. Not part of `src/` — a thin, disposable consumer, not a new
  architectural layer. See `docs/MILESTONES.md` (Milestone 16A).
- **`DatasetCollector`** (`src/collector/`) — orchestration and I/O only. It asks
  `GitClient`/`src/utils` for things ("give me the tracked files," "classify these paths")
  and treats the answers as opaque values to persist. It owns the benchmark output layout
  (`benchmark/<repo>/commits/<hash>/...`) and repo-name parsing, since that's
  benchmark-format knowledge, not git knowledge.

This split was deliberate, not accidental — see ADR-002 for the specific refactor that
enforced it (moving merge-commit detection out of `DatasetCollector` and into
`GitClient`).

## Dependency direction

`main.py` → `DatasetCollector` → `GitClient` → `git` (subprocess). Strictly one
direction; `GitClient` has zero knowledge of `DatasetCollector` or the benchmark output
format.

## Not yet built

No embeddings, no context graphs, no evaluation pipeline. As of Milestone 14B, a
minimal API (`src/api/app.py`) exposes the pipeline over HTTP — but
`DatasetCollector.collect()` itself still does not assemble the full evidence
dict, the real `execute` implementation is hardcoded to one provider/model with
no configuration surface, the Review Engine's category-1 validation catalogue is
still empty, and there is no auth, persistence, retries, caching, or deployment
configuration, all by explicit design. As of Milestone 17B, a deterministic
Response Validation Layer (`src/response_validation/`) is wired into
`POST /review` — genuine contract violations (internal-terminology leaks) are
rejected with `502`, but there is still no sanitization, automatic repair, or
regeneration; a rejection only denies the response. See `MILESTONES.md` and
`PROJECT.md` for what's intentionally deferred.

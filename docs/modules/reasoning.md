# reasoning (Milestone 8; extended Milestones 8.5A, 8.5B, 8.5C)

`src/reasoning/`

## Purpose

The deterministic reasoning layer, consuming only `src/fusion/evidence_fusion.py`'s
output. Independent modules each reason about one bounded question using an explicitly
declared subset of the evidence bundle, producing namespaced Claims and Gaps. A
Synthesizer collects and groups those outputs without adding any reasoning of its own.
See `docs/DECISIONS.md` (ADR-007) for the five design revisions that shaped the
original layer, ADR-008 for the sixth module (`body_evidence`) added in Milestone 8.5A,
ADR-009 for the three claims (`reach`×1, `historical_risk`×2) added in Milestone 8.5B,
and ADR-010 for the one claim (`historical_risk`) added in Milestone 8.5C — the final
capability before the deterministic layer freezes ahead of Milestone 9.

## Public API

- `src/reasoning/registry.run_reasoning(fused_evidence) -> list[dict]` — runs every
  registered module against its own filtered view of the evidence, returns one
  `{"module": ..., "claims": [...], "gaps": [...]}` dict per module.
- `src/reasoning/synthesizer.synthesize(module_outputs) -> dict` — aggregates those
  into `{"commit_claims": [...], "file_claims": {...}, "symbol_claims": {...}, "gaps":
  {"commit": [...], "files": {...}}}`.

## The enforced contract

`src/reasoning/contracts.filter_evidence(fused_evidence, consumes)` builds a reduced
copy of the evidence bundle containing only the keys a module declared, at both the
commit level and per file. `registry.run_reasoning` calls this before invoking each
module — a module cannot read a bundle field it didn't declare in `CONSUMES`, because
it is never given it. This is enforced structurally, not by convention.

Every module file exports four plain constants — `NAME`, `CONSUMES`, `PRODUCES`,
`LIMITATIONS` — inspectable without reading the reasoning function itself, and one
function, `reason(evidence) -> {"module": NAME, "claims": [...], "gaps": [...]}`.

## Claim and Gap shape

```
claim: {"claim": "<namespace>.<id>", "scope": {"level": ..., "file_path": ...,
        "qualified_name": ...}, "confidence": "observed"|"corroborated"|"inferred"|
        "conflicting", "basis": [...]}
gap:   {"reason": ..., "scope": {...}, "missing": [...]}
```

Confidence is computed per claim from that claim's own basis, never from a
pre-declared ranking of evidence categories — `observed` (a direct restatement of one
already-computed fact), `inferred` (a threshold or single-category derived
computation), `corroborated` (two or more of the module's own declared categories
independently agree), `conflicting` (two or more disagree). A module consuming exactly
one category can structurally never reach `corroborated`/`conflicting` — not by
ranking, but because corroboration requires two independent sources by definition.

## The six registered modules

- **`change_shape`** — `change_set` + the Fusion keys `observations` maps to
  (`touched_directories`, `change_statistics`, `change_categories`,
  `extraction_confidence`, `file_classification`). Commit-scoped claims: change size
  (`wide_change`/`narrow_change`, >10 files), category spread
  (`heterogeneous_categories`/`homogeneous_categories`), the `change_categories`
  booleans re-emitted as individual claims, and `low_extraction_confidence`.
- **`historical_risk`** — `file_history`, `metadata`. Per-file: `first_appearance`,
  `hot_file` (>=50 total commits), `long_dormant_reactivated` (>=180 days between
  `metadata.date` and the file's `previous_commit_date` — the one claim needing both
  declared categories together, via date arithmetic, not agreement). Milestone 8.5B
  (ADR-009) adds `rapid_iteration` (<=1 hour since `previous_commit_date` — the exact
  structural counterpart to `long_dormant_reactivated`, same two fields, opposite
  threshold direction) and `high_recent_churn` (`file_history.recent_commit_count >=
  5`, `file_history` alone). Milestone 8.5C (ADR-010) adds `first_author_touch` —
  `file_history.is_first_touch_by_author == True` and `file_history.is_first_appearance
  == False` (the file has real prior history, just not from this commit's author) —
  `file_history` alone, no new `CONSUMES` entry, since `metadata` was already declared
  for the existing dormancy/rapid-iteration claims and this new claim doesn't need it:
  the author comparison already happened during extraction, not at reasoning time.
- **`reach`** — `co_change`, `local_module_context`. Per-file: `high_historical_coupling`
  / `no_historical_coupling` (from `co_change` alone), `large_neighborhood`/
  `isolated_module` (from `local_module_context` alone), and
  `corroborated_wide_reach` when both independently indicate wide reach — the module's
  one genuine `corroborated` claim, verified with real data (see below). Milestone
  8.5B (ADR-009) adds `expected_co_change_partner_missing`: for any of a file's
  `co_change` partners meeting `HIGH_COUPLING_THRESHOLD`, if that partner's path
  isn't among the current commit's own changed files, the claim fires — needs no new
  extraction, just the first cross-reference of `co_change`'s partner list against
  the commit's actual file set (previously `reach` only ever checked the strongest
  partner's *count*, never whether it showed up).
- **`verification_coverage`** — `file_classification`, `semantic_analysis`. Commit-scoped
  `test_files_changed`/`no_test_files_changed` from `file_classification` alone;
  per-file `public_change_without_tests` when a file has a public signature change
  (`semantic_analysis`) and no file anywhere in the commit is classified `Test`
  (`file_classification`) — `corroborated`, using both declared categories together.
- **`contract_stability`** — `semantic_analysis` only. Per-symbol:
  `public_signature_changed`, `public_symbol_removed`, `decorator_changed`. Structurally
  always `observed` — single-category by contract.
- **`body_evidence`** (Milestone 8.5A, ADR-008) — `semantic_analysis` only, same
  single-category ceiling as `contract_stability`; a sibling module, not a merge into
  it, since it reasons about a symbol's *body* (a different reviewer question from
  `contract_stability`'s external-contract facts). Per-symbol: `interaction.
  callees_changed`, `error_handling.exceptions_raised_changed`, `error_handling.
  exceptions_caught_changed`, `resource_management.context_managers_changed`,
  `documentation.deprecation_marker_added` (each from `symbol_extractor`'s new
  `body_evidence` field — see `docs/modules/symbol_extractor.md`), and
  `structure.internal_symbol_added` for a newly-added `visibility: "private"` symbol,
  but only when at least one other, pre-existing symbol in the same file was also
  `modified` in this diff — a standalone new private symbol in an otherwise-untouched
  file produces no claim, since that reads as a normal addition, not restructuring.
  This claim needs no `body_evidence` data at all — it surfaces `_diff_symbol_tables`'s
  pre-existing added/private detection plus a same-file modified check, for the added
  case only; signature/removal changes on existing private symbols remain the
  separate, still-open policy question from Batch 4.

## Verified against real data

Built the full evidence dict via `DatasetCollector`'s existing builder methods (no new
git calls), ran it through `fuse_evidence`, then `run_reasoning`/`synthesize`, against
two real commits already used to validate Milestones 6/7:

- **`pallets/flask` (`06ea505c`)** — `reach.corroborated_wide_reach` fired for real on
  `src/flask/ctx.py` and `tests/test_reqctx.py` (both genuinely have high `co_change`
  counts and large `local_module_context` lists) — the one designed corroboration case,
  confirmed with real data, not constructed. `contract_stability` produced exactly 22
  claims for `tests/test_reqctx.py`'s real test rewrite — hand-counted against the raw
  `semantic_analysis` symbols (10 symbols, several with more than one true flag) to
  confirm no double-processing.
- **`tcx_nogrunt-1` (`d99f6cb`)** — `not_collected` propagation confirmed by dropping
  `semantic_analysis` entirely: `contract_stability` correctly produced zero claims and
  24 gaps, one per file, each correctly attributing `missing: ["semantic_analysis"]`.

**A real, previously-undiscovered upstream gap surfaced by this validation, not by
inspection:** every one of the 20 files renamed in `d99f6cb` — including the
content-changing `backend/main.py` → `router.py` rename already validated in
Milestones 6/7 — produced `history.first_appearance`, which is wrong; that file
demonstrably has real prior history under its old path. Root cause is in
`GitClient.get_file_history` (Milestone 5A), not this layer: its `git log <commit> --
<file_path>` has no `--follow`, so it stops at the rename boundary and only sees the
new path's own (empty) history. `historical_risk` correctly reported exactly what
`file_history` told it — this is an extraction-layer gap the reasoning layer's
aggregation made visible, not a reasoning bug. Flagged here, not fixed, matching this
project's standing practice of surfacing a found gap rather than silently patching an
upstream module mid-milestone.

**`body_evidence` (Milestone 8.5A)** was verified separately, against two real,
independently-selected commits in `pallets/click` (not `flask`/`tcx_nogrunt-1`, to get
a genuinely fresh sample rather than re-reading the same fixtures): `c2ed414` — the
exact commit that originally surfaced the `warnings.warn` design question — correctly
produced `interaction.callees_changed` (for the new `warnings.warn` call) and
`documentation.deprecation_marker_added` on `CliRunner.isolated_filesystem`, with no
bespoke handling of either. `555fa9b` — `Context.__exit__` and `Context.close` change
their callee from `self.close`/`self._exit_stack.close` to a new
`self._close_with_exception_info` method, with signature/decorators/docstring
unchanged on both; previously these two symbols would have produced no diff entry at
all (the exact Function Body Blindness failure mode), and now both correctly surface
as `modified` with `interaction.callees_changed`. The new method itself correctly
fires `structure.internal_symbol_added` — confirmed both directions with a
hand-constructed pair: a new private helper added alongside an unrelated modified
symbol in the same file fires the claim; the same new private helper added to a file
where nothing else changed does not.

**Milestone 8.5B's three claims** were verified against real commits in
`pallets/click`: `rapid_iteration` and `high_recent_churn` both fired correctly on
`src/click/core.py` at a real commit (`c040135a`) sitting inside a genuine
~28-minute-apart commit cluster with 15 touches in the preceding 30 days.
`expected_co_change_partner_missing` fired correctly on a real commit (`3495fba1`)
that changed `core.py` without its 27-historical-count partner `CHANGES.rst`, and
correctly did **not** fire on a different real commit (`82f377c`) that changed
`core.py` alongside all of its strong historical partners (`CHANGES.rst`,
`tests/test_options.py`) together — both the positive and negative case confirmed
on real, not hand-constructed, data.

**Milestone 8.5C's `first_author_touch`** was verified against four real cases in
`pallets/flask`, matching every case ADR-010 required: (1) a genuine first-time
touch — `philip.graham.jones@googlemail.com`'s first-ever commit to
`src/flask/templating.py` (`77237093da`) correctly fires the claim; (2) a frequent
maintainer — `davidism@gmail.com`'s 15th touch to the same file (`daca74d93a`, 14
prior commits) correctly stays silent; (3) a brand-new file —
`src/flask/debughelpers.py`'s addition commit (`ca278a8694`) correctly computes
`is_first_touch_by_author: true` but the claim does **not** fire, because
`is_first_appearance` is also true; (4) alternating-author exclusion — a real,
naturally-occurring history on `src/flask/templating.py` alternating between
`davidism@gmail.com` and `philip.graham.jones@googlemail.com` confirmed
`author_commit_count` computes to exactly the hand-counted value (3, cross-verified
directly against `git log --format=%ae`) with no off-by-one from including the
current commit itself.

## Dependencies

Python stdlib only (`datetime` in `historical_risk`). No dependency on `GitClient`,
`DatasetCollector`, or `evidence_fusion` beyond the shape of its output.

## Future Improvements

- All modules' thresholds (10 files, 50 commits, coupling >=10, neighborhood >15,
  180 days, and Milestone 8.5B's 1-hour rapid-iteration window and 5-commit recent-churn
  threshold) are fixed defaults, not validated tuning — same honesty already applied to
  `co_change_detector`'s `top_n=10`.
- `long_dormant_reactivated` was implemented and unit-verified for date parsing, but
  not exercised by either real commit used in this validation pass — neither had a
  large enough gap. Flagged rather than claimed as real-data-verified.
- `GitClient.get_file_history`'s missing `--follow` (found above) should be fixed
  before this project relies on `is_first_appearance`/lineage claims for renamed files
  in any real analysis — not yet scheduled as its own milestone.
- No cross-module conflict surfacing exists, by design (ADR-007) — a human or future
  consumer comparing e.g. `reach.corroborated_wide_reach` against
  `verification.no_test_files_changed` for the same file has to do that comparison
  themselves; this layer won't do it for them.
- `body_evidence` reasons only about a symbol's own body — a change confined entirely
  to a callee's own implementation (not this symbol's call sites, exception
  vocabulary, or resource usage) produces no claim. `callees`/`context_managers` are
  syntactic call-target text only, never resolved to a definition — no call graph, by
  design (ADR-008).
- `structure.internal_symbol_added` requires only that *some* pre-existing symbol in
  the same file was modified, not that the new private symbol's `enclosing_scope`
  specifically matches a symbol that changed — a private helper added anywhere in a
  file where an unrelated symbol also changed still fires. Tightening to
  `enclosing_scope`-level matching is a possible future refinement if this proves too
  loose in practice; not done here, no real data yet suggests it's needed.
- `reach.expected_co_change_partner_missing` (Milestone 8.5B) shares `HIGH_COUPLING_THRESHOLD`
  with `high_historical_coupling` rather than having its own independent threshold —
  if real data shows this firing as noise (e.g. in repos with weak/inconsistent
  co-change patterns), give it its own threshold rather than continuing to share.
  It also cannot know *why* a partner is absent — a deliberate, correct decision to
  leave a file out is indistinguishable from a genuine oversight.
- `history.high_recent_churn` (Milestone 8.5B) inherits `get_file_history`'s existing
  `--follow` gap: a renamed file's recent-churn count resets to zero at the rename
  boundary, same as `total_commit_count` already does.
- **Update (Milestone 8.5C, ADR-010):** author familiarity — flagged above as one of
  the two highest-value remaining historical-evidence candidates from the
  first-principles review behind ADR-009 — is now built, as `first_author_touch`.
  Ownership concentration (distinct-author count / "bus factor") remains the one
  candidate from that same review still not built; it would need repo-wide,
  cross-file author aggregation, a different shape of question than this
  single-file, single-commit claim.
- `history.first_author_touch` (Milestone 8.5C) inherits `get_file_history`'s
  existing `--follow` gap identically to `total_commit_count`/`recent_commit_count`
  — a renamed file's author-specific count also resets to zero at the rename
  boundary. Identity is exact-email-match, not person-match: the same real author
  committing under two different emails (e.g. a personal and a work address) reads
  as two unrelated identities, by design, not normalized. The claim is silently
  skipped (no gap) if a `file_history` entry lacks the author fields entirely — that
  happens when the caller building it didn't provide `author_email` to
  `get_file_history`, a possibility distinct from `file_history` itself being
  unavailable.
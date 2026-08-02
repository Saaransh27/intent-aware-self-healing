# review context builder (Milestone 10A)

`src/review/context_builder.py`

## Purpose

The deterministic bridge between the Reasoning Layer's Synthesizer output and
everything downstream (the not-yet-built LLM Reasoning layer). Implements ADR-011
exactly: separates raw Input Sources (Synthesizer Claims/Gaps, the commit message,
the raw diff) from a constructed `ReviewContext` — the only object anything past this
point ever receives. Owns no reasoning of its own; every transformation it performs
(collapse, reorder, summarize, annotate, enrich) is justified purely by facts the
Reasoning Layer already concluded.

## Public API

- `src/review/context_builder.build_review_context(synthesized, metadata, change_set,
  diff_text, commit_hash) -> dict` — the only public function. Takes the
  Synthesizer's output (`{"commit_claims", "file_claims", "symbol_claims", "gaps"}`),
  the commit's `metadata` dict (only `"message"` is read), its `change_set` dict
  (`{"changed_files", "added_files", "deleted_files", "modified_files",
  "renamed_files"}`), the raw unified diff text, and the commit hash — ADR-011's
  required "minimal commit-identity reference," travelling alongside the five
  sections for addressing purposes only, not as evidence (same exclusion ADR-006
  already applied to Evidence Fusion's `identity`/`artifacts`). Returns a plain
  dict — no new class — matching this project's existing convention that data
  contracts are dicts (`claim()`/`gap()`/`fuse_evidence()`/`synthesize()` all return
  dicts, not objects).

## ReviewContext shape

```
{
  "commit_hash": str,
  "commit_summary": {"message", "changed_files", "added_files", "deleted_files",
                      "modified_files", "renamed_files"},
  "commit_claims": [...],      # deep-copied from Synthesizer, content unmodified
  "file_claims": {...},        # deep-copied from Synthesizer, content unmodified
  "symbol_claims": {...},      # deep-copied from Synthesizer, content unmodified
  "gaps": {"commit": [...], "files": {...}},   # deep-copied, content unmodified
  "evidence_units": [
    {"address": {"file_path", "start_line", "end_line"}, "tag": "full"|"collapsed",
     "diff_text": <str>|None}
  ],
  "coverage_ledger": [
    {"collapsed_group_files": [...], "collapsed_count": int,
     "representative_file": str, "justifying_claims": [{"claim", "scope"}]}
  ],
}
```

This maps directly onto ADR-011's five owned sections plus its required
commit-identity reference: Commit Summary, Claims (the three `*_claims` keys), Gaps,
Evidence Units, Coverage Ledger, `commit_hash`. Claims and Gaps are relayed with zero
content transformation — same keys, same nesting, same values the Synthesizer
already produced, since they are "already individually addressable by their existing
`claim`/`gap` id and `scope`," per ADR-011 — but as independent deep copies, not the
same objects, so a downstream consumer mutating the `ReviewContext` in place can
never corrupt the Synthesizer's own output.

`coverage_ledger[]["collapsed_group_files"]` lists every file in the collapse group,
**including the representative** (which is itself tagged `"full"`, not
`"collapsed"`, in `evidence_units`) — named `collapsed_group_files` rather than
`collapsed_files` specifically because it is not a list of files each individually
tagged `"collapsed"`.

## Internal data flow

1. `_split_diff_by_file(diff_text)` splits the raw unified diff on `diff --git`
   boundaries, extracts each file's path (preferring the `+++ b/<path>`/`--- a/<path>`
   line over the `diff --git` header, to sidestep git's path-quoting for unusual
   filenames) and its line range from `@@ -a,b +c,d @@` hunk headers — new-side
   numbers normally, old-side numbers when the file was deleted (`+++ /dev/null`).
   A file's range spans the min start to max end across all its hunks.
2. `_is_collapse_candidate_commit(commit_claims)` checks whether `shape.wide_change`
   or `shape.homogeneous_categories` fired at commit scope — collapse candidacy is
   commit-wide, per ADR-011.
3. `_file_is_risk_bearing(file_path, file_claims, symbol_claims)` checks a file's own
   claims (both file-scoped, e.g. `reach.*`/`verification.public_change_without_tests`/
   `history.first_author_touch`/`history.hot_file`, and symbol-scoped, e.g.
   `contract_stability`'s three claims, which land in `symbol_claims` under
   `"<file_path>::<qualified_name>"` keys) against the fixed risk-bearing set named in
   ADR-011 verbatim: any `contract_stability` claim, any `reach` claim,
   `verification.public_change_without_tests`, `history.first_author_touch`,
   `history.hot_file`. No other claim exempts a file from collapsing.
4. Files that are candidates and not risk-bearing are "eligible," in
   `change_set["changed_files"]`'s own order (never re-sorted). If two or more are
   eligible, the **first in that same diff order** becomes the representative (kept
   `"full"`); the rest become `"collapsed"` (address retained, `diff_text` dropped)
   and a single Coverage Ledger entry records exactly which files, the count, the
   representative, and every commit-level claim that justified the collapse. A lone
   eligible file is never collapsed — collapsing one file has no volume benefit.
5. Every file in `change_set["changed_files"]` gets exactly one Evidence Unit, in that
   list's own order (Stable Ordering), whether or not a matching diff block was found
   — a file with no diff block still gets a unit with `diff_text: None` (Completeness:
   no changed file is ever silently dropped). `coverage_ledger[]["collapsed_group_files"]`
   uses this identical order — one canonical sequence, applied consistently across
   every section of the `ReviewContext`, per the Stable Ordering invariant.

## Integration with the existing Synthesizer

Consumes `src/reasoning/synthesizer.synthesize`'s output directly, unmodified — no new
method added to `synthesizer.py`, no change to its output shape. The Builder is a new
sibling package to `src/fusion/` and `src/reasoning/`, not a modification to either.

## Unit-testing strategy

`tests/review/test_context_builder.py`, Python stdlib `unittest` (no new dependency —
`requirements.txt` stays empty). Fixtures use `src.reasoning.contracts.claim`/
`commit_scope`/`file_scope`/`symbol_scope` directly, so test claims are shaped exactly
like real reasoning-module output, plus a `module` key (added by the real
`synthesizer.synthesize`, reproduced by hand in the fixtures). Grouped by concern:
commit-identity presence, commit summary construction (including that `author`/`date`
are explicitly absent), verbatim claims/gaps relay plus non-aliasing (mutating the
returned `ReviewContext`'s claims/gaps must never affect the `synthesized` object
passed in), collapse candidacy (narrow vs. wide vs. homogeneous, single-eligible-file
non-collapse, representative chosen by diff order rather than alphabetically),
risk-bearing exemption (file-scoped `reach`, symbol-scoped `contract_stability`, the
two named `historical_risk` claims, and confirming a *non*-named `historical_risk`
claim does NOT exempt), evidence-unit addressing (multi-hunk range, binary files,
added files, deleted files, a file missing from the diff, empty diff text), and
stable ordering (including that `coverage_ledger`'s file order matches
`evidence_units`'s order exactly). 22 tests, all deterministic, no filesystem or git
access. Additionally validated against two real `diff.patch` files already on disk
(`benchmark/fastapi/...`, `benchmark/tcx_nogrunt-1/...`) to confirm line-range
extraction against actual `git diff` output, not only hand-written fixtures.

## Edge cases explicitly handled

- Binary files (`Binary files a/x and b/x differ`, no `@@` hunks) — unit keeps its
  diff text but gets `start_line`/`end_line: None`.
- Renamed files with no content change (no hunks) — same as binary: no line range.
- Deleted files (`+++ /dev/null`) — line range computed from the old side.
- A changed file with no matching `diff --git` block at all — still gets a unit
  (`diff_text: None`), never silently dropped.
- Empty diff text — every file gets a content-less unit; no crash.
- A commit firing both `shape.wide_change` and `shape.homogeneous_categories` —
  `justifying_claims` lists both, no arbitrary pick between them.
- Exactly one eligible (candidate, non-risk-bearing) file — never collapsed.
- A risk-bearing claim landing in `symbol_claims` (`contract_stability`) rather than
  `file_claims` — checked explicitly via the `"<file_path>::"` key prefix, not missed.
- A `historical_risk` claim other than `first_author_touch`/`hot_file` (e.g.
  `rapid_iteration`) — does not exempt a file, matching ADR-011's specific
  enumeration rather than "any `historical_risk` claim."
- Mutating the returned `ReviewContext`'s claims or gaps must never affect the
  `synthesized` object passed in — enforced by deep-copying, not by convention.
- `coverage_ledger`'s file ordering must match `evidence_units`'s ordering exactly —
  one canonical sequence (diff order), not two.

## Dependencies

Python stdlib only (`re`, `copy`).

## Explicit decisions and open questions

Raised by a critical review of this implementation against ADR-011's literal text
(2026-07-25) and deliberately left as-is, per instruction not to redesign the
architecture or the Claim contract while fixing the five confirmed defects above:

- **Public-contract exemption breadth (open question, not changed).** ADR-011 names
  "a public contract change" as one risk-bearing category. This implementation
  treats *any* `contract_stability` claim as risk-bearing, including
  `contract.decorator_changed`, which — unlike `public_signature_changed`/
  `public_symbol_removed` — is not gated on `visibility == "public"` in
  `contract_stability.py` and can fire on a private symbol. Left unchanged because
  narrowing it would be a reinterpretation of ADR-011's wording, not a bug fix; the
  question of whether "a public contract change" should mean the whole module or
  only its two visibility-gated claims is open, to be settled by a future ADR
  revision if real usage shows it matters, not by implementation-time judgment.
- **Per-hunk Evidence Units (explicit decision, not implemented).** ADR-011 names
  per-hunk splitting as conditional ("where warranted") without defining the
  trigger. This implementation deliberately splits per-file only. Inventing a
  per-hunk trigger now would be adding architecture ADR-011 itself doesn't specify;
  this is a decision to wait for real Milestone 9 output to reveal what "warranted"
  should mean, not an oversight.
- **The Synthesizer's `"module"` key (explicit decision, Claim contract not
  redesigned).** `_is_risk_bearing_claim` depends on every claim carrying a
  `"module"` key, which `synthesizer.synthesize` does attach in practice but which
  is not part of the documented Claim shape in `docs/modules/reasoning.md`
  (`{"claim", "scope", "confidence", "basis"}`). This implementation does not touch
  `contracts.py` or `synthesizer.py` to formalize that field, per instruction not to
  redesign the Claim contract. Left as an open maintenance note: if a future change
  to the Reasoning Layer ever removes or renames that key, `context_builder.py`'s
  risk-bearing check will raise `KeyError` rather than degrade gracefully — worth
  revisiting if/when the Claim contract itself is next touched, not before.

## Future Improvements

- File-path extraction falls back to the `diff --git a/X b/Y` header line if neither
  a `+++`/`---` line is found; git's own path-quoting for filenames containing
  spaces or special characters could still defeat this in rare cases — not
  encountered in real data used for validation, not specifically handled.

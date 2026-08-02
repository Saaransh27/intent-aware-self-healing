# Structured Evaluation Workflow (Milestone 16B)

**Status: design only — not yet executed.** This document defines how a
future ~20-30 commit evaluation should be run, recorded, and acted on. It
does not itself run that evaluation. Per Milestone 15E, Prompt v1 is frozen;
this workflow exists so that if a future revision is ever considered, it is
justified by the same kind of evidence this document requires, not by
reasoning or an isolated output.

## Why this exists

The Milestone 15 evaluation (10 commits, 4 repos) was effective but ad hoc:
commit selection, scoring, and comparison were all done conversationally,
with no persisted schema and no fixed corpus a third run could reuse without
re-deriving it from a chat transcript. This workflow formalizes that same
methodology so it can be repeated identically, aggregated across rounds, and
directly mapped onto Milestone 15E's four-condition freeze test.

## 1. Sample design

**Size**: 24 commits (within the requested 20-30 range) — 12 categories × 2
commits per category. Two per category, not one, because Milestone 15's
single-instance-per-category sample could not distinguish "this category is
inherently fine" from "this one commit happened to be easy."

**Categories**: the original 10 from Milestone 15 (documentation-only, bug
fix, feature addition, refactor, dependency update, test-only,
rename/reorganization, large multi-file, small focused, mixed
documentation+code), plus two not previously covered:
- **Revert/rollback commit** — tests whether the model correctly reasons
  about a commit whose entire "intent" is undoing prior work, where the
  diff alone looks like an unexplained deletion.
- **Security-sensitive fix** — tests whether the model's attention-ranking
  correctly escalates a security-relevant change even when the diff itself
  is small (the opposite failure mode from Milestone 15's dependency-update
  finding, where a small diff was over-elevated).

**Repository diversity**: at least 7-8 distinct repositories, not the same 4
(`click`/`flask`/`pytest`/`requests`) reused for every category — repeating
the same 4 risks the evaluation measuring "does this work well on
Pallets-project style commits" rather than general commit understanding.
Concretely: keep 1 commit per category from an existing repo (for direct
comparability to Milestone 15's baseline where the category overlaps) and
source the second from a new repository each time (candidates: `django`,
`numpy`, `fastapi`, `psf/black`, `sqlalchemy`, `poetry`, `httpx`,
`python-poetry/poetry` — final selection happens at execution time, not
here).

**Freeze the list before running anything.** Exactly as Milestone 15C's own
rule ("do not replace any commits, do not add additional commits"), the
24-commit list must be chosen and committed to a file *before* the first
evaluation round, and reused unchanged for every subsequent round. A corpus
that can be swapped mid-cycle cannot support Milestone 15E's condition 2
("repeatable across multiple commits") or condition 4 ("verified not to
introduce a larger regression") — both require comparing the same inputs
across time.

## 2. Recording format

One structured record per commit per evaluation round, persisted as JSON
(not prose), so rounds can be diffed mechanically rather than re-read by
hand:

```json
{
  "round_id": "2026-XX-XX-baseline",
  "prompt_version": "v1",
  "repository": "pallets/click",
  "commit_hash": "0f4738d...",
  "category": "bug_fix",
  "scores": {
    "overall_usefulness": 4,
    "correctness": 5,
    "signal_to_noise": 4,
    "actionability": 4
  },
  "hallucination": "none",
  "missed_important_issue": { "present": false, "note": null },
  "internal_terminology_leaked": { "present": false, "quote": null },
  "would_keep": true,
  "failure_tags": [],
  "notes": "one or two sentences, not a full narrative"
}
```

`failure_tags` is the one new field beyond what Milestones 15/15C/15D
already used conversationally — a fixed, closed vocabulary
(`over_warning`, `under_warning`, `semantic_padding`, `verbosity`,
`hallucination`, `terminology_leak`, `missed_issue`, `other`) so tags can be
counted across the sample instead of re-derived from prose every time this
runs.

## 3. Metrics collected

Unchanged from the rubric Milestones 15/15C/15D already validated as
useful: overall usefulness, correctness, signal-to-noise, actionability
(each 1-5), hallucination severity (none/minor/major), a missed-issue flag,
a terminology-leak flag, and a keep/discard call — every one of these
already proved discriminating (they're what separated the one weak review
in Milestone 15 from the other nine). The only addition is the
`failure_tags` field above, which doesn't add a new judgment — it just
labels a judgment already being made, so it can be aggregated.

## 4. How observations feed future iterations

1. **Aggregate, don't narrate.** After a round, compute per-tag counts
   across the 24 commits and per-repository breakdowns. A tag appearing on
   a single commit is noise; Milestone 15E's condition 3 ("systematic
   behavioral failure, not expected model variance") is only satisfied when
   a tag recurs on **3 or more commits spanning at least 2 different
   repositories** — the repository-spread requirement exists specifically
   to rule out "this is just how one project writes changelogs" as a false
   positive.
2. **Only then is a prompt-revision candidate raised**, and only against
   the specific tag that crossed the threshold — never as a general
   "let's improve the prompt" prompt (sic) the way Milestone 15's original
   three issues were found. This directly satisfies Milestone 15E's
   condition 1 (real, observed pattern) and condition 2 (repeatable).
3. **Any proposed wording change must be re-validated against the same
   frozen 24-commit corpus**, before/after, exactly as Milestones 15B→15C
   and 15D's re-validation did — this is condition 4, non-negotiable. A
   wording change is not accepted on the strength of its reasoning alone.
4. **Cadence**: this workflow is not run on a timer. It runs when either
   (a) real playground usage (Milestone 16A) or other production signal
   surfaces a suspected pattern worth checking, or (b) a future milestone
   explicitly asks for another baseline round. Running it speculatively,
   looking for problems, is exactly what Milestone 15E's freeze decision
   said not to do.

## Explicitly not addressed here

Executing this workflow (actually running the pipeline against 24 commits)
is a future milestone, not this one. This document also does not specify
tooling to automate scoring — every score above is still a human (or
model-as-evaluator) judgment call, the same as Milestones 15/15C/15D; only
the recording format and the aggregation rule are new.

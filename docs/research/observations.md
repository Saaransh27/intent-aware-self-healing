# Observations: synthesis of the 20-commit evidence evaluation

Full per-commit evaluations: `docs/research/experiments.md`. This is the cross-commit
synthesis — patterns that only become visible by comparing all 20, not any single one.

**Average overall usefulness: 6.4/10** (range 4-9, across 20 real commits spanning 4
repositories of very different size/maturity). Read that number as "this evidence is a
solid, honest supporting layer, not yet a replacement for reading the commit message or
diff" — which matches what the individual evaluations show directly.

## What was consistently strong

- **Change Set** was rated highly in nearly every commit, regardless of size or type. It
  never misrepresented what happened, and for wide/homogeneous commits (Commits 6, 17,
  20) it was often the single most load-bearing field.
- **Co-change**, when a real historical pattern exists, produced the two strongest single
  findings in the whole experiment: `fastapi/__init__.py` ↔ `release-notes.md` at count
  50 (Commit 3) and `CHANGES.rst` ↔ `pyproject.toml` at count 19 (Commit 9) — both
  release-mechanics patterns, both correctly and strongly surfaced. It also correctly
  produced thin/empty results on cold-start repos (Commits 18-20, `Triple`), which is the
  *honest* answer, not a failure.
- **Observations** (`file_classification`/`change_categories`/`extraction_confidence`)
  handled genuinely heterogeneous commits well — Commit 20's 16-file, 5-category spread
  was the clearest single demonstration of this, and `extraction_confidence` correctly
  self-reported every time something wasn't recognized (Commits 8, 16, 18 — never a
  silent miss).
- **File History**'s `is_first_appearance` flag cross-validated against `change_set`'s
  independently-computed `added_files` correctly, every time it was checked (verified
  directly for Commit 15) — a real, structural strength: two different code paths
  agreeing is stronger evidence than either alone.

## What was consistently weak

- **Module Context was the lowest-rated field in every single commit it appeared in** —
  never above a 2/5, usually a 1. The cap (added earlier this session, `max_results=20`)
  fixed the *size* problem but not the *relevance* problem: it returns the first N
  siblings by path order, which is almost never the N a reader actually wants. Co-change,
  computed from data already available at the same point in the pipeline, consistently
  produced a more useful "what else is related" answer for a fraction of the perceived
  value-per-token.
- **Wide, homogeneous commits produce heavily repetitive per-file evidence blocks.**
  Confirmed independently in Commits 6 (17 CI files) and 17 (12 deleted files, different
  repo): co-change and module-context both repeat near-identical results across every
  file in the commit, when the actual information content is "all N files are the same
  category and move together" — a single sentence, not N blocks.
- **A `.txt`/`.lock`-style dependency-file gap surfaced twice, independently, in
  unrelated repos** — `uv.lock` (Commit 8, flask) and `requirements_impactlens.txt`
  (Commit 16, tcx_nogrunt-1). Both were caught correctly by `extraction_confidence`
  rather than silently missed, but two independent hits in a 20-commit sample suggests
  this is a real, recurring pattern worth fixing, not a one-off edge case.
- **HTML template files classify as `Source`, indistinguishable from real application
  code.** This mattered most in Commits 13/14 — two security-flavored escaping fixes to
  server-rendered stream templates — where the distinction between "template" and
  "business logic" is exactly the kind of thing a reviewer cares about, and the evidence
  couldn't make it.

## The one finding that most changes how to think about this pipeline

**Commit 4** (`fastapi`, the `app.frontend()` dependency-injection feature) is the
clearest evidence that structural, git-only signals have a real ceiling. A ~300-line
internal refactor and a two-line typo fix can produce structurally similar evidence
(N files, some categories, some history) — the thing that actually distinguishes them is
almost entirely carried by the commit message, which this pipeline correctly collects
but doesn't (and, per this project's constraints, can't) independently verify or
supplement with code-level understanding. This isn't a defect to fix — it's the honest
boundary named in `context_design.md`'s research (real "Reach" needs semantic
parsing) — but seeing it happen on a real, current commit rather than in the abstract is
worth recording plainly.

## The one finding that's a genuine, unexpected discovery

**Commits 13 → 14** (`tcx_nogrunt-1`): the same escaping bug fixed in one file, then
fixed again one commit later in its near-identical sibling. Nothing in Commit 13's own
evidence hinted that a twin file needed the same fix — that's precisely the
"duplication/similarity relationship" flagged as a candidate in the earlier research
phase and left unbuilt as hard-to-make-deterministic. This is the first real,
concrete example (not a hypothetical) of that gap actually costing something: a second
commit was needed that better evidence might have anticipated in the first one.

## Recommendations, ranked by how strongly this experiment supports them

1. **Detect wide/homogeneous commits and summarize once instead of per-file.** Backed by
   two independent real examples (Commits 6, 17). Likely the highest value-per-effort
   fix available — it doesn't require new data, just different presentation of data
   already computed.
2. **Extend `file_classifier`'s `Dependency` matching to cover `.lock` files and
   non-canonical requirements filenames** (`uv.lock`, `requirements_*.txt`,
   `requirements/*.txt`). Backed by two independent hits across unrelated repos.
3. **Rethink `local_module_context`'s selection, not just its cap.** It was the weakest
   field in all 20 evaluations. Candidates worth considering later (not decided here):
   rank by co-change frequency with the siblings, or by recency of the sibling's own last
   edit — both already flagged in `module_context_detector.md`'s Future Improvements
   before this experiment, now backed by 20/20 corroborating data points instead of one.
4. **Consider a distinct classification for template/view files** (`.html` server
   templates specifically), separate from generic `Source` — surfaced concretely by the
   two security-fix commits where the distinction mattered for judging risk.
5. **Flag known repo-hygiene junk** (`.DS_Store`, stray `.pyc`) as a distinct signal
   rather than falling through to generic `Unknown`/`Binary` — a small, cheap addition
   surfaced by the one personal/messy repo in the sample, which is exactly why it was
   included.
6. **The duplication/similarity relationship from the earlier research phase** — still
   the hardest of these to make deterministic without drifting into fuzzy matching this
   project has been cautious about elsewhere, but Commits 13/14 are the first *real*
   (not hypothetical) evidence that it would have concretely helped. Worth revisiting the
   earlier "left unlikely to be worth building" judgement now that there's a real
   example, not just a theoretical one.

None of the above have been implemented — this document is findings only, per the
evaluation task. Prioritization and any resulting build work is a separate decision.

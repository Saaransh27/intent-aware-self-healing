# Reasoning Layer Evaluation: Cross-Batch Observations

Synthesis of `docs/research/reasoning_experiments.md`. Per-commit detail lives there;
this document is only what becomes visible by comparing across commits (and,
eventually, across batches) — patterns invisible from any single evaluation. Updated
as each new batch is added.

## Batch 1 — Mature Open Source Projects (`flask`, `fastapi`, `django`, `requests`,
`pandas` — 5 commits)

**Average overall usefulness: 4.8/10** (range 4-6). Read that as: a genuinely useful
supporting signal in every commit, but never yet the reason a review would go faster
on its own — consistent with how the Milestone 5A evidence-layer evaluation (`docs/
research/observations.md`, 6.4/10 average) also landed as "solid supporting layer, not
a replacement for reading the diff." Reasoning-layer usefulness in this batch trails
the evidence layer's own score, not because the modules misbehave, but because of one
specific, repeated blind spot (below) that a well-hygiened commit's own evidence can't
paper over.

## The one finding that recurs across nearly every commit in this batch

**Body-only changes to existing public symbols are invisible to `contract_stability`,
and by extension to the whole reasoning layer, in 4 of 5 commits** (flask, fastapi,
django, pandas — only requests' commit was small enough that this mattered less).
Every one of these real commits' *actual* fix lived entirely inside a function/method
body with an unchanged signature:

- flask: `.endswith()` → `.lower().endswith()` inside `select_jinja_autoescape`.
- fastapi: double-checked locking added inside `effective_routes`/
  `effective_low_priority_routes`.
- django: `_non_atomic_requests` changed from mutating-and-returning-the-same-object
  to returning a fresh wrapper.
- pandas: `maybe_downcast_numeric` gained range-checking and exception handling
  around a previously-unguarded cast — the highest-stakes example, a real
  silent-data-corruption fix.

In every one of these, `contract_stability` correctly produced no claim (per its own,
correctly narrow contract — signature/decorator/removal only), which is the right
behavior *given that contract*, but it means the reasoning layer's single most
symbol-precise module has nothing to say about the modification that mattered most in
80% of this batch. This is not a bug in any module; it's a real, structural gap in
what the current five-module registry covers, exactly the kind of thing ADR-007
anticipated when it said the registry is "explicitly provisional."

## A second, independent, recurring artifact: new symbols read as "contract changed"

In 4 of 5 commits (fastapi, django, requests, pandas), the only `contract.*` claims
produced were on **brand-new symbols** — mostly new test functions and their nested
helpers — because a symbol that didn't exist before trivially has "old signature:
none, new signature: something," which the schema reports identically to "an
existing public thing's shape changed." Every per-commit evaluation independently
flagged this as confusing or actively misleading (most severely in django, where a
private-in-spirit `wrapper` nested inside an underscore-prefixed function was
misclassified `public` for exactly this reason, compounding a real visibility-scoping
gap in Milestone 6's `symbol_extractor.py` — enclosing-scope privacy isn't
inherited). Two independent per-commit findings converging on the same root cause
across unrelated repositories is a strong signal this is systemic, not incidental.

## What was consistently strong

- **`verification.no_test_files_changed`**, when it actually had something to say
  (flask), was the single highest-value claim in the batch — directly actionable,
  exactly the first question an experienced reviewer asks about an untested logic fix.
- **`reach.corroborated_wide_reach`**, when both `co_change` and
  `local_module_context` genuinely agreed (fastapi's `routing.py`), correctly and
  believably identified real load-bearing infrastructure — the clearest working
  example of the corroboration mechanism ADR-007 designed, now confirmed twice with
  real data (once in Milestone 8's own build validation, once here independently).
- **`history.long_dormant_reactivated`** fired for the first time ever on real data in
  this batch (pandas' `test_combine.py`) — previously flagged in
  `docs/modules/reasoning.md` as implemented but unexercised; now confirmed working as
  designed, not just unit-tested in isolation.

## What was consistently weak

- **The commit-level `shape.*` claims** (`narrow_change`, `heterogeneous_categories`,
  `touches_tests`) were true, in nearly identical form, in all 5 commits — expected,
  since this batch was deliberately chosen for good hygiene, but it means these claims
  currently have close to zero discriminative value for exactly the population they
  were evaluated against. They may earn their keep more in a batch with less
  consistent hygiene (a useful thing to check in a future batch of messier repos),
  but for mature OSS specifically, they read as boilerplate.
- **`historical_risk`/`reach` claims on changelog/large test files** (e.g. `CHANGES.rst`
  being "hot," `tests/test_requests.py` having "high historical coupling") were
  technically correct but added nothing a reviewer didn't already know from the file's
  name alone — a specific instance of the general "correct but not discriminating"
  problem, distinct from the `shape.*` case above because it's about individual files
  rather than the whole commit.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Split `contract.public_signature_changed` into at least two distinct claim
   types**: one for a genuinely new symbol appearing, one for an existing public
   symbol's signature/decorators actually changing. Backed by 4 independent
   occurrences across unrelated repositories in a single 5-commit batch — likely the
   single highest-value fix available, and it's a correction to existing behavior, not
   a new feature.
2. **Add a claim for "existing public symbol's body changed, signature didn't"** —
   derivable today from `semantic_analysis`'s own `change_type: "modified"` combined
   with `signature_changed: false`/`decorators_changed: false`, no new evidence
   collection required. Backed by 4 of 5 commits in this batch having their most
   important change be exactly this shape, including the highest-stakes one (pandas).
3. **Fix enclosing-scope visibility in `src/semantic/python/symbol_extractor.py`** — a
   symbol nested inside a private (`_`-prefixed) function or class should inherit
   private status regardless of its own name. Found once, concretely, in django's
   `wrapper` case; worth checking whether it recurs in future batches before treating
   it as thoroughly understood.
4. **Consider whether the `shape.*` commit-level claims earn their keep against a
   messier commit population** — this batch alone can't tell you whether they're
   uniformly low-value or just low-value *for well-hygiened commits specifically*. A
   future batch of less disciplined repositories (personal projects, smaller
   commercial codebases) is the right test, not a design change made from this batch
   alone.

None of the above have been implemented — this document is findings only, matching
the evaluation task's own instruction not to propose AI/implementation solutions here.
Prioritization and any resulting build work is a separate future decision, same
discipline as `docs/research/observations.md`'s closing line for the evidence layer.

## Batch 2 — Personal Projects (`tcx_nogrunt-1` ×4, `~/Projects/Triple` ×1 — 5 commits)

**Average overall usefulness: 4.8/10** (range 3-7) — statistically identical to Batch
1's 4.8/10, but for a materially different reason: Batch 1's ceiling was capped by a
recurring blind spot inside otherwise well-tested, well-hygiened commits; Batch 2's
population includes commits with **zero** reasoning-layer output at all (two of five),
because this population's commits are more often small, isolated body-only edits with
no accompanying structural changes for any module to hook into.

**A genuine correctness bug was found, not just a usefulness gap**: `~/Projects/
Triple`'s actual root commit (`5841742`, confirmed zero parents) crashes
`_build_commit_semantic_analysis` with `IndexError`. No commit sampled across either
batch so far had exercised a true root commit with Python files — a real gap in what's
been validated, found only because this batch's sampling pulled from a small,
personal-scale repository's entire history rather than a curated slice of a huge one.

## The body-only-change blind spot, reconfirmed on non-OSS code

Two of five commits (`6a38e90`, `3944968`) — both real, distinct bug fixes to the
*same function*, one commit apart — produced byte-for-byte identical reasoning output,
because both fixes were entirely body-only. This is the same finding as Batch 1's
top-ranked recommendation, now confirmed on a completely different, non-OSS,
non-mature codebase — two independent populations converging on the same conclusion
is a much stronger signal than either alone.

## Two new findings, not visible in Batch 1

- **A real misclassification, not just a low-value truth.** `~/Projects/Triple`'s
  `test_cases*.txt` files are plain-text data describing test *scenarios* for the
  tool's own domain, not automated test code — yet `file_classifier`'s word-boundary
  Test-name rule correctly classifies them `Test`, producing `verification.
  test_files_changed` in a repository that has zero real tests. Batch 1 never
  surfaced this because mature-OSS `test_*.py` files essentially always really are
  tests; a QA-tooling personal project whose entire subject matter *is* testing
  breaks that assumption in a way this evaluation setup was specifically well-suited
  to catch.
- **The "new symbol reads as signature-changed" artifact from Batch 1 is asymmetric
  by symbol type.** A new class (`DetailedTestCase` in `3d20e2b`) produced no claim at
  all, because `symbol_extractor` never records a `signature` for a class (`None` on
  both sides of the diff), so the comparison that makes new *functions* trivially
  read as "changed" never fires for new classes. Worth correcting Batch 1's
  recommendation with this nuance: the fix belongs specifically to
  function/method-shaped symbols, not symbols generally.
- **Module-level documentation loss is invisible to the entire pipeline, not just one
  module.** `3d20e2b` deleted a 35-line module docstring in `deduplicate.py` with no
  code change — `symbol_extractor` never tracked module docstrings in the first place
  (a deliberate Stage-1 scoping decision, ADR-005), so this loss produced zero signal
  anywhere in `commit.json`, not just in `contract_stability`'s claims. Distinct from
  the body-only-change gap: that one is about *code* changing invisibly; this one is
  about *documentation* changing invisibly, at a granularity (module-level) the
  extraction layer was never scoped to see at all.

## The duplication/cross-file gap, reconfirmed at the reasoning layer

`~/Projects/Triple`'s `3f2615e` applied the identical one-line regex fix to two
different files' identically-named `parse_excel` function — the same "duplication
relationship" the original 20-commit evidence evaluation flagged after finding it in
`tcx_nogrunt-1` Commits 13/14, and left unbuilt as hard to make deterministic. Here it
reappears one layer up: even with full symbol-level evidence available for both
files, no reasoning module correlates "the same qualified name changed the same way
in two files this commit" — confirming the gap isn't just about detecting duplication
in raw evidence, it's equally absent from the reasoning layer built on top of it.

## What worked well, genuinely non-artifact this time

- `6b57b8e`'s two `contract.public_signature_changed` claims (a `Form(...)` default
  changing from 5 to 3 across two route handlers) is the strongest `contract_stability`
  result across both batches — a real contract change, correctly detected via the
  plain `signature_changed` fact, with no new-symbol artifact confusing the picture.
- `3d20e2b`'s `find_duplicate_groups.process` gaining a real new parameter
  (`use_xpath: bool`) is the first clean example in either batch of
  `public_signature_changed` firing for a genuinely modified (not newly created)
  symbol — worth remembering as the module's actual intended use case, distinct from
  the new-symbol noise that dominated Batch 1's examples of the same claim.

## Cross-batch: resolving Batch 1's open question about `shape.*` claims

Batch 1 explicitly left open whether the commit-level `shape.*` claims are
inherently low-value or just under-exercised by a narrow, well-hygiened commit
population. This batch answers it: `shape.heterogeneous_categories`/
`touches_config` genuinely differentiated `3f2615e` (a real, messy, 9-file,
multi-category commit) from every other commit evaluated so far across both
batches — the first time in ten total commits these claims said something other than
the same boilerplate triad. The module should not be deprioritized on Batch 1's
evidence alone; it needed a commit population with real size/category variance to
show its value, and personal projects supplied exactly that.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Fix `_build_commit_semantic_analysis`'s crash on root commits** — a real defect,
   not a usefulness nitpick, found directly by this batch's sampling. Ranked above
   every reasoning-quality recommendation below because it's a correctness bug, not a
   design tradeoff.
2. **Body-only-change detection** — now backed by two independent commit populations
   (9 of 10 total commits across both batches had this as their dominant or sole
   real change), the strongest-evidenced recommendation across the whole evaluation
   series so far.
3. **Cross-file "same symbol changed identically" correlation** — backed by concrete
   evidence in two unrelated repositories now (the original evidence-layer finding,
   and this batch's independent reasoning-layer reconfirmation).
4. **Distinguish "classified Test by filename" from "verified to contain real test
   code"** — backed by one concrete, repository-specific misclassification; worth
   watching for recurrence in a future batch before treating as systemic.
5. **Track module-level docstrings, or at least flag their removal** — a real,
   concrete loss-of-documentation case with zero current coverage anywhere in the
   pipeline, not just the reasoning layer.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 3 — Company/Internal Repositories (`react-app`, `api_nogrunt-1`,
`next-auto-llm-1` — 5 commits, JS/Java/TS, zero Python)

**Average overall usefulness: 2.6/10** (range 2-3) — the lowest of any batch so far,
and for a completely different, much more structural reason than either prior batch:
this is the first sample drawn from genuinely representative company code (a React
frontend, a Java backend, a Next.js frontend, real PR-based workflows, real distinct
contributors) rather than a Python-only benchmark repo, and it lands here because an
entire fifth of the reasoning registry (`contract_stability`) and half of another
(`verification_coverage`'s semantic-dependent claim) produced **zero** output for
**every single commit** in the batch.

## The Python-only ceiling, measured for the first time rather than named

Batches 1 and 2 were both effectively 100% Python, so this ceiling was invisible —
`contract_stability` merely looked occasionally silent within an otherwise-covered
commit. Batch 3, drawn from real company repositories that happen to be JS/Java/TS,
shows the ceiling is categorically larger: **`contract_stability` produced literally
zero claims across all five commits**, and every changed file produced a
`cannot_assess_contract` gap. This is not a new defect — ADR-005 explicitly named
Python-only coverage as a permanent, honest trade-off — but this batch is the first
time that trade-off has been measured against real, representative data instead of
stated as a caveat in a single commit's evaluation.

The most consequential single instance: `api_nogrunt-1`'s `8790717` added a new
`@Lob`/`LONGTEXT` column to a live JPA-mapped database entity — a real, live schema
change, conceptually identical to Batch 2's `TcxTestCase` removal (rated one of that
batch's best findings) — and it produced no signal anywhere, purely because the
entity is written in Java. The architecture predicted this outcome exactly; seeing it
land on a real, live schema change is still the starkest cost-of-scope-boundary
result across all three batches.

## What still worked, and why that matters

Not everything failed: `reach.corroborated_wide_reach` fired correctly on
`TestCaseService.java` (Java) — proof the `reach` module's corroboration mechanism is
genuinely language-agnostic, since `co_change`/`local_module_context` are both
git-only signals with no dependency on `semantic_analysis`. `change_shape`,
`historical_risk`, and `verification_coverage`'s `test_files_changed`/
`no_test_files_changed` claim all continued working normally too. The registry's own
design — modules declaring their own `CONSUMES`, rather than one monolithic
per-commit judgment — meant a non-Python repo lost exactly the modules coupled to
`semantic_analysis` and nothing else, a real, structural graceful-degradation
property worth confirming explicitly rather than assuming.

## The "can't distinguish two different real commits" pattern, now confirmed a third time

`next-auto-llm-1`'s `a21fd05` (implementing an edit-testcase flow) and `ae866e2` (one
commit earlier, wiring up a DB fetch) — two materially different changes to the same
file — produced byte-for-byte identical reasoning output. Same finding as Batch 2's
`tcx_nogrunt-1` `6a38e90`/`3944968`, now confirmed in a third, unrelated,
non-Python repository — this is no longer a Python-specific or even a
single-repository pattern; it is a structural property of relying on
`semantic_analysis` as the only source of body-level detail.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **A second `src/semantic/` language, JS/TS specifically** — the single
   highest-leverage next step surfaced by any batch so far, not a refinement to an
   existing module. Two of three repos in this batch were JS/TS-heavy; real company
   codebases are far more likely to be polyglot than the benchmark repos used in
   Batches 1-2. ADR-005 already designed for this (`src/semantic/javascript/` as a
   sibling package, same `semantic_analysis` output shape) — this batch is the first
   concrete, real-data case for prioritizing it.
2. **Body-only-change detection** — reconfirmed via the `next-auto-llm-1` pair, now
   backed by three independent populations (mature OSS, personal projects, company
   repos) rather than two.
3. **A JPA/ORM-annotation-aware detector, even narrower than full Java AST support**
   — would have caught the `@Lob`/`@Column` schema change specifically, without
   needing a general-purpose Java semantic layer, if a full second language proves
   too large a lift to prioritize immediately.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 4 — Active Startup Repositories (`langchain`, `crewAI`, `PostHog` — 5 commits,
all Python, deliberately to isolate "rapid change" from the language-coverage finding
Batch 3 already established)

**Average overall usefulness: 3.4/10** — the second-lowest of any batch, but unlike
Batch 3 (a structural, language-coverage ceiling), this batch's low score comes from
the *volume* at which an already-known blind spot recurs in a genuinely
high-test-discipline, fast-moving population.

## A new, distinct kind of miss — not body-only, not language, a scoping choice

`PostHog`'s `bf1c84d40` gave `_outer_events_prefilter` a real, required second
parameter — confirmed directly in the raw evidence
(`visibility: "private"`, `signature_changed: true`, `change_type: "modified"`) — and
it produced **zero** reasoning claims, because `contract_stability` only emits
`public_signature_changed`/`public_symbol_removed` when `visibility == "public"`.
This is categorically different from every prior miss in this evaluation series: the
body-only blind spot (Batches 1-4, repeatedly) is a case where the evidence layer
itself has nothing to say; this is a case where the evidence layer *correctly
computed the fact* and the reasoning layer *deliberately declined to surface it*, by
design. Worth naming precisely: this is a policy choice (should private-symbol
contract changes be reported at all?), not a coverage gap needing new extraction.

## Test-churn volume amplifies the body-only blind spot's cost

Every batch has now confirmed the body-only blind spot exists; this batch is the
first to show its *cost scales with commit test-discipline*. `crewAI`'s `3bb87532`
alone produced roughly 20 symbol claims, every one of them new-symbol test-noise, and
zero on the three real production files the actual fix touched — a volume of noise
larger than an entire commit's evidence bundle in Batches 2-3. Well-funded,
fast-iterating AI startups write substantially more test code per feature than the
personal/small-company repos sampled so far, which means the same underlying blind
spot produces proportionally more distracting noise here, not just an occasional gap.

## Reconfirmations, now with four (and in one case cross-commit) data points

- **Body-only changes invisible**: 3 of 5 commits in this batch (`langchain`
  `0a3bde64`, `crewai` `3bb87532`, `posthog` `bf1c84d40`) had their real fix live
  entirely inside existing function bodies — now confirmed in every one of four
  batches across mature OSS, personal projects, company repos, and startups.
- **New classes vs. new functions, a third confirmation**: `crewai`'s five new
  context dataclasses (`a194f386`) correctly showed only `decorator_changed`, never
  the misleading `public_signature_changed` artifact — consistent with Batch 2's
  `DetailedTestCase` finding, now a structural property rather than a one-off.
- **A genuine cross-commit corroboration a human would trust**: `crewai.crew.py`
  and `flow/runtime/__init__.py` both showed `reach.high_historical_coupling` in two
  related commits (`3bb87532`, `a194f386`) a week apart — the same real files
  correctly flagged as coupled twice, independently, which is exactly the kind of
  consistency that builds warranted trust in a reasoning tool over time.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Report private-symbol contract changes as a distinct, differently-named claim**
   (e.g. `contract.internal_signature_changed`) rather than silently excluding them —
   the smallest, most surgical fix carried by any batch so far: no new extraction,
   just a policy change over data already computed. Directly motivated by a real,
   concrete miss (`_outer_events_prefilter`).
2. **Body-only-change detection** — now confirmed in all four batches; the
   single most consistently-evidenced recommendation in this entire series.
3. **Distinguish new-symbol claims from real contract changes** — this batch adds a
   volume dimension to the existing recommendation: the fix matters more, not just
   more often, in high-test-discipline codebases.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 5 — Infrastructure / DevOps (`terraform-aws-eks`, `helm-charts`,
`starter-workflows`, `awesome-compose` ×2 — 5 commits, zero Python, sampled
specifically from `file_classifier`'s own target domain)

**Average overall usefulness: 4.0/10** (range 3-5) — higher than Batches 3-4's
non-Python samples, and for a reassuring reason: this is the first batch to sample
content from the exact domain `file_classifier`'s `Infrastructure`/`CI-CD` categories
were built for (Milestone 4B), and the core rules hold up correctly at real scale —
real `.tf` files and real `Dockerfile`s both classify `Infrastructure` correctly
across genuinely representative repositories. The gaps found are at the *edges* of
that original design, not in its foundations.

## Three new, concrete `file_classifier` gaps, all found by sampling the domain the classifier was built for

- **Helm/Kubernetes manifest templates classify as generic `Configuration`**, with no
  concept of a chart's `templates/` directory or a K8s manifest's shape at all — the
  most structurally significant of the three, since it's a missing *capability*
  (nothing attempts to recognize this content), not a missing name.
- **`compose.yaml`/`compose.yml` (Docker's now-recommended, un-prefixed Compose
  naming) is absent from `INFRASTRUCTURE_ROOT_FILES`** — confirmed directly in
  `src/utils/file_classifier.py`, which already lists the deprecated
  `docker-compose.yml`/`.yaml` names but never the newer convention. The smallest,
  most mechanical fix identified across all five batches: a one-line addition to an
  already-correct rule.
- **GitHub's Markdown-based "agentic workflow" files classify as `Documentation`** by
  extension alone — a second, independent confirmation (after Batch 2's
  `test_cases.txt`) that extension-based classification can't see a file's real
  purpose once it diverges from convention, this time in an unrelated domain.

All three are the same underlying shape of gap already seen in Batches 1-2 (the
`.lock`/non-canonical-`requirements.txt` misses) — a fixed name/extension list not
keeping pace with how an ecosystem's conventions evolve — now confirmed a third and
fourth time, in new categories (`Infrastructure`, `Documentation`) rather than just
`Dependency`. This is a recurring, systemic pattern across the whole classifier, not
isolated to any one category.

## The `shape.*` cross-batch question, further resolved

Two more clean, positive data points this batch: `terraform-aws-eks`'s 36-file
feature commit and `awesome-compose`'s 12-file hardening commit both produced
genuinely differentiating `shape.wide_change`/`heterogeneous_categories` claims,
matching real commit structure rather than reading as boilerplate — consistent with
Batch 2's `Triple` finding and further confirming these claims earn their keep
specifically on commits with real size/category variance, regardless of what kind of
repository (personal, company, infra) produces that variance.

## A genuinely positive, structural finding: the original design validates, at the edges

Unlike Batch 3's finding (an entire module, `contract_stability`, has zero coverage
for non-Python code — a structural ceiling in what's built), this batch's gaps are
all incremental — existing rules that need updating as ecosystems evolve, exactly
the kind of maintenance `extraction_confidence` already exists to surface honestly.
Worth stating plainly: sampling the domain a detector was built for is a distinct,
valuable evaluation move in its own right, separate from sampling broadly — it
answers "does the thing work where it's supposed to," which broader batches can't
directly test.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Add `compose.yaml`/`compose.yml` to `INFRASTRUCTURE_ROOT_FILES`** — the
   smallest, lowest-risk, most mechanically obvious fix identified in this entire
   evaluation series: one line, to an already-correct existing rule, with real,
   current-convention impact.
2. **Recognize Helm chart templates / Kubernetes manifest shape as `Infrastructure`**
   — a real missing capability, not just a missing name, but still a deterministic,
   path/content-shape rule consistent with how this project already works.
3. **Body-only-change detection** — reconfirmed implicitly (Terraform's variable
   additions, Helm's template deletions are visible in the diff but not reasoned
   about at the HCL/YAML-structure level); this batch adds "and this applies beyond
   Python, to any structured configuration language" as a new dimension to a
   recommendation already carried by every prior batch.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 6 — Library/API Repositories (`pydantic`, `httpx`, `click`, `attrs` ×2 — 5
commits, all Python, chosen specifically for public-API/semver-relevant content)

**Average overall usefulness: 2.8/10** — the lowest average of any batch, and
deliberately so: this batch targeted the exact population `contract_stability`
should matter most for (careful public APIs, real deprecations, real `__all__`
management), and found that the module's real coverage of that population's most
characteristic events — deprecation and export-surface changes — is currently zero.

## The floor of "invisible," found for the first time as three distinct degrees

Every prior batch found real body-only-change misses; this batch is the first to
reveal that "invisible" has gradations, all now confirmed with concrete examples in
one population:
1. **A real signature change, computed as evidence, excluded from claims by policy**
   (Batch 4's PostHog private-helper finding — the mildest degree).
2. **A real contract change, computed as evidence (`docstring_status: "changed"`),
   never consumed by any claim** — this batch's clearest new finding, in *two*
   separate commits: `click`'s formal `CliRunner.isolated_filesystem` deprecation
   (a real Sphinx `.. deprecated::` directive plus a `DeprecationWarning`) and
   `attrs`' `fields()` gaining real instance-argument support — both fully
   documented in a rewritten docstring, both entirely unsurfaced.
3. **A change the evidence layer never attends to at all** — `httpx`'s `__all__`
   list modification produced *zero* symbols and *zero* import changes in
   `semantic_analysis`, confirmed directly: `_build_symbol_table`'s AST walker only
   reacts to `ClassDef`/`FunctionDef`/`AsyncFunctionDef`, with no concept of a plain
   module-level assignment. This is the single most complete blind spot found across
   all six batches — not a reasoning-layer gap, an extraction-layer one.

These three degrees matter for prioritization, not just as a taxonomy: (2) is the
cheapest fix (a new claim over data already computed), (1) is nearly as cheap (a
policy change over existing data), and (3) is the only one requiring genuinely new
AST-extraction work.

## A new, population-specific extraction gap: `.pyi` type stubs

`attrs`' `src/attr/__init__.pyi` classified `Unknown`, confirmed via
`extraction_confidence.unsupported_extensions: [".pyi"]` — correctly, honestly
self-reported, not silently missed, but a real gap specific to exactly this batch's
population: well-typed public libraries lean heavily on type stubs to declare their
public surface, and neither `language_detector` nor `file_classifier` recognizes the
extension at all. The same shape of gap as Batch 5's `compose.yaml` miss — a fixed
extension/name list not covering a real, common convention in the specific ecosystem
being sampled.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Surface `docstring_status` as its own claim dimension in `contract_stability`**
   (e.g. `contract.symbol_deprecated` when a `.. deprecated::`-style pattern appears,
   or more generally whenever `docstring_status == "changed"` on an otherwise
   signature-stable public symbol) — no new extraction needed, purely a new claim
   over data already computed. This single change would have caught 2 of this
   batch's 5 commits' real, load-bearing contract changes. The single
   highest-value, lowest-cost recommendation produced by any batch so far.
2. **Track `__all__` list membership changes** — a deterministic, narrowly-scoped
   addition to `symbol_extractor` (recognize an `Assign` node targeting exactly
   `__all__`, diff its contents the way imports are already diffed). Real extraction
   work, unlike recommendation 1, but arguably a more authoritative signal of "is
   this actually public" than the leading-underscore convention alone provides.
3. **Recognize `.pyi` files** — the smallest, most mechanical fix in this batch,
   same shape as Batch 5's `compose.yaml` naming gap.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 7 — Refactoring-heavy Commits (`django` ×3, `flask`, `crewAI` — 5 commits,
sampled by commit-message pattern — Rename/Move/Extract/Refactor/Cleanup — rather
than by repository type)

**Average overall usefulness: 3.4/10** — and the reason is structural, not
incidental: every one of ADR-005's explicitly-named, deliberately-deferred
limitations (no rename tracking, no cross-file correlation, body-only invisibility,
the public/private scoping choice) concentrates hardest in exactly this population,
several in their cleanest form found anywhere in the series. A commit engineered to
preserve behavior while changing structure selects precisely for the properties this
reasoning layer was never built to track.

## The cross-file move/duplication gap, finally shown in its cleanest possible form

Django's `f970a98e` ("Moved `django_file_prefixes()` to `django.utils.warnings`")
is the least ambiguous real-world test case this gap could get: an explicit,
author-labeled move, one function, one clean rename-of-location. The result:
`contract.public_symbol_removed` in the old file, the new-symbol artifact in the
new file, zero correlation between them — exactly the same disconnected pattern
first found in Batch 2 (`tcx_nogrunt-1`'s duplicated fix) and Batch 4 (`langchain`),
now confirmed on the one kind of commit where a human reviewer would need
*zero* effort to understand what happened, and this layer needs the message to
tell it the same thing.

## A precise, previously-unquantified redundancy, visible only at real volume

`crewAI`'s `340d23ae` deleted three whole classes (~30 methods). Every removed
*function/method* fired both `public_symbol_removed` and `public_signature_changed`
together — confirmed as a structural certainty, not new information: a removed
class shows only `public_symbol_removed` (a class's `signature` field is always
`None`, so `None != None` is `False`), while a removed function's signature is a
real string, so `old != None` is trivially `True`. This means
`public_signature_changed` adds zero information whenever `public_symbol_removed`
already fired on a function — a small, precise, purely mechanical deduplication
opportunity, invisible in every prior batch because none had enough real removed
methods in one commit to make the pattern statistically obvious.

## A genuinely positive result, worth stating plainly

The same `crewAI` commit is also the **strongest `contract_stability` result found
in any of the seven batches** — every one of ~30 removed methods across three
deleted classes correctly, individually flagged, with real substance behind every
claim (unlike Batch 4's comparable claim volume, which was entirely test-scaffolding
noise). And Django's Extract commit (`3f912ee4`) is a rare case where the
"new symbol reads as changed" artifact and the real story align exactly — the
extracted method genuinely is new, deliberate public API. Not every population
this reasoning layer struggles with produces only negative findings; refactors that
happen to add or remove whole symbols, rather than quietly reshaping bodies or
relocating them, are handled well.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Same-commit cross-file symbol correlation** (a qualified name disappearing
   from one file's symbol table while a structurally-similar one appears in
   another's, within the same commit) — now motivated by the cleanest possible
   real-world case in the whole series, and it would make Extract/Move refactors
   read completely differently from unrelated add+remove pairs, exactly the
   distinction this batch's premise needs.
2. **Suppress `public_signature_changed` when `public_symbol_removed` already fired
   for the same symbol** — a precise, purely mechanical deduplication with zero
   information loss, found because this batch had enough real removal volume to
   make the redundancy statistically visible.
3. **Body-only-change detection** — reconfirmed on a commit whose own author-given
   label is literally "refactor" (`flask`'s `9822a035`), about as direct a hit on
   the single most consistently-evidenced recommendation across this whole series
   as any batch has produced.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 8 — Bug Fixes (`django` ×2, `requests` ×2, `pandas` — 5 commits, sampled by
commit-message pattern — Fix/Bug/Regression/Crash/Null/Exception)

**Average overall usefulness: 3.2/10** — but the average masks the batch's real
story: two commits (5/10, 4/10) show `contract_stability` working exactly as
intended on real, meaningful signature/dunder changes, while the other three show
the series' recurring gaps compounding on real, practically important fixes.

## The single strongest connective finding across any two batches in this series

Batch 7 found `Model._is_pk_set`'s helper invisible when renamed
(`_is_set`→`_is_unset`). This batch, selected by a completely unrelated search
criterion (bug-fix keywords, not refactor keywords), independently surfaced the
*same qualified name's introduction* three weeks earlier — as the literal root-cause
fix for a real crash (`a2348c85`). Confirmed directly: `visibility: "private"`,
`change_type: "added"`. Across this one symbol's entire visible lifecycle in this
project's sampling — created to fix a bug, later renamed for clarity — this
reasoning layer has had nothing to say, for the same structural reason both times.
This is the strongest available evidence that the public/private scoping policy in
`contract_stability` (first questioned in Batch 4) deserves reconsideration: this
is not a private helper incidental to some other change, it *is* the fix, twice.

## Two genuine confirmations that real signature/dunder changes are caught well

`QuerySet.aiterator`'s default changing from `2000` to `None` (Django) and
`JSONDecodeError` gaining a new `__reduce__` method (requests) were both correctly,
accurately flagged — the second and third independent confirmations (after Batch
2's Form-default finding) that genuine default-value changes and genuinely new
dunder methods are exactly the shape of change this module reliably catches. Not
every population produces only gaps; `contract_stability` performs precisely as
designed whenever the underlying change actually touches a signature.

## A new, narrower gap: which exception type gets raised

Two commits in this batch (`requests` ×2) were specifically about *which exception
type* a caller should expect — one fixed by adding `__reduce__` (caught, since it's
a new dunder), one fixed by changing which exception class gets raised inline in an
unchanged-signature function (invisible, the ordinary body-only gap). The second
case suggests a narrower, genuinely new claim type: detecting a change in which
exception class appears at a `raise` statement inside an otherwise-stable function —
a deterministic, AST-visible fact this project hasn't previously considered.

## The Cython case: a bug fix invisible for two compounding reasons at once

`pandas`' `06200bf2` is the first commit in the whole series where the two most-
repeated gaps (non-Python language coverage, body-only invisibility) apply to the
*same* fix simultaneously: the root-cause logic lives in Cython (correctly excluded,
honestly flagged via `extraction_confidence`), and the one real Python file touched
in support of it was itself a body-only change. A genuinely new, narrower "Cython
extraction" question is raised (distinct from the JS/TS recommendation carried
since Batch 3) but not prioritized above it — it serves a narrower,
scientific/performance-computing-specific population.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Report new *private* symbols as a distinct, lower-severity claim** — the
   sharpest possible motivation yet, since this batch's clearest miss *is* a real
   bug's actual fix, not an incidental implementation detail. Reuses the policy
   question already raised in Batch 4 rather than opening new work.
2. **Detect a changed exception type at an otherwise-unchanged `raise` site** — a
   new, narrow, deterministic claim directly motivated by this batch's two
   exception-focused commits.
3. **Body-only-change detection** — reconfirmed twice more (`requests`'
   `2d551768`, `pandas`' supporting Python change); the single most consistently
   evidenced recommendation across all eight batches now.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 9 — Feature Commits (`django`, `fastapi` ×2, `crewAI` ×2 — 5 commits,
deliberately spanning 45 to 2447 changed lines, explicitly testing whether reasoning
output scales sensibly with commit size)

**Average overall usefulness: 5.0/10** — the highest average across all nine
batches, and it comes with a genuinely important qualifier: this batch's own
explicit goal ("does reasoning scale with larger changes") turned out to have two
independent answers, not one.

## Two independent scaling axes, not one

Measured directly across the size range: **claim volume and wall-clock processing
time both scale roughly linearly with commit size** — no disproportionate cost or
slowdown found even at the largest commit tested (2447 lines, 20 files, under 5
seconds). That's a genuinely reassuring, practical finding this project had never
explicitly measured before. But **signal quality scales on a completely different,
independent axis: how much of a repository's own source tree is real shipped code
versus embedded documentation examples.** Two commits within 15% of each other in
raw line count (`fastapi`'s 1168-line streaming feature, `crewAI`'s 1200-line typed
schemas) landed at opposite ends of usefulness — one dominated by tutorial-script
noise, the other almost entirely real signal — for a reason that has nothing to do
with size and everything to do with which repository was sampled.

## The private-symbol blind spot, quantified for the first time

FastAPI's JSON-Lines streaming commit (`749cefde`) is the sharpest, most precisely
quantified demonstration yet of a cost only implied in Batches 4 and 8: of roughly
six new/changed symbols that actually constitute this real feature, only two are
visible (`get_request_handler`'s genuine signature change, `get_stream_item_type`'s
new public function) — the four private helper functions carrying the actual
streaming implementation (`_build_response_args`, `_async_stream_jsonl`,
`_async_stream_raw`, `_serialize_item`) are entirely invisible. This suggests a
structural relationship worth naming plainly: **the larger and better-engineered a
feature is, the more of its logic tends to live in newly-introduced private
helpers — meaning this specific blind spot's cost may grow, not shrink, exactly as
feature size increases**, even while raw claim volume grows too.

## A new, concrete, low-cost recommendation: package source vs. documentation-example source

FastAPI's `docs_src/` convention (real, runnable example scripts embedded in
documentation, already correctly classified `Source` per a deliberate decision from
Milestone 3) produced the majority of one commit's 43 symbol claims — real code,
correctly classified, but not part of the library's actual public interface a
consumer would ever import. This is a distinct, previously-unnamed axis from every
prior classification gap in this series (which were all about *miscategorization*):
here the category is already correct, the missing distinction is a different one
entirely — "ships with the package" vs. "exists to demonstrate the package" — and
it's derivable deterministically from path convention (`docs_src/` vs. the actual
package directory), not a new heuristic.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **A path-convention-based distinction between shipped package source and
   documentation-example source** — a new, concrete, low-cost recommendation this
   batch is the first to surface, directly motivated by a real, size-amplified
   dilution problem.
2. **Report new *private* symbols as a distinct claim** — reconfirmed with the
   sharpest quantitative motivation in the series: 4 of 6 meaningful new symbols in
   a real, large feature commit, invisible purely because they're private.
3. **Deduplicate the removed-function claim pairing** (Batch 7) — reconfirmed at
   its largest observed volume (3 instances in one commit), a small fix whose value
   scales directly with commit size.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

## Batch 10 — Edge Cases (9 commits, one per named category, explicit goal: break
the reasoning engine)

**Nothing crashed.** Nine deliberately adversarial inputs — including a real
two-parent merge commit fed directly through the builder methods, bypassing
`DatasetCollector`'s own non-merge filter for the first time in this entire ten-batch
series — all completed without an exception. That is a genuine, previously-untested
robustness finding, not an assumption confirmed in passing. But two of the nine
produced results worth treating as real findings precisely because nothing crashed
while something more structural went quietly wrong or slow.

## The single most significant finding across all ten batches

Feeding a real merge commit (`pallets/flask` `9fcd34c9`) directly through the
pipeline produced a **technically correct, internally consistent, and radically
incomplete** result: `change_set` reported exactly one changed file — verified
independently against `git diff <first-parent> <merge-commit>`, which shows exactly
that. But diffed against the *second* parent, the same merge represents 55 files
and 1877 insertions — the real content of what was actually merged in. Both are
legitimately "correct" depending on the question asked, and this pipeline silently
picks one without ever indicating a choice was made. The reason nothing downstream
can catch this: `identity` (which holds `parent_hashes`, and would show two parents
here) was deliberately excluded from Evidence Fusion's bundle in ADR-006, as
"bookkeeping, not evidence." That was reasonable on its own terms — this is the
first concrete demonstration of a real, unnamed side effect: excluding `identity`
doesn't just omit bookkeeping, it makes the fact that a commit *is* a merge
invisible to every module built on top of Evidence Fusion, with no substitute
signal anywhere else. This is arguably a more dangerous failure mode for a
review-assistance tool than a crash — a crash gets noticed; a confident, plausible,
incomplete answer does not.

## The `co_change` scaling cost, measured for the first time in real seconds

The largest commit tested in this entire series (`django/django`'s 3593-line,
47-file `0f581cd29`) took 16.4 seconds — profiling isolated 13.17 of those seconds
(80%) to `co_change` alone. This specific cost has been *qualitatively* flagged
since Milestone 5A and observed anecdotally in Batch 1 (a 17-file commit noted as
the "worst cost/value ratio measured"), but this is the first time it's been
measured in concrete seconds at a real, unexceptional size (47 files is not a
pathological extreme for an active project's larger PRs). The root cause: each
file's co-change history is independently re-walked via its own N+1 subprocess
pattern, with no sharing across files in the same commit even when their
historical co-change sets plausibly overlap.

## Everything else: genuinely reassuring baseline robustness

The remaining seven categories (pure file rename at multi-file scale, real
auto-generated Django migration files, a dependency bump, documentation-only,
test-only, a pure binary asset change, CI-only) all completed quickly and produced
accurate, sensibly-scoped output with no incident. This is worth stating as
plainly as the two findings above: this is not a null result, it's direct evidence
that the ordinary edge cases a real pipeline encounters daily are handled
correctly, and the two real findings this batch produced are genuinely rare,
specific structural gaps, not symptoms of broad fragility.

## Recommendations, ranked by how strongly this batch's evidence supports them

1. **Surface whether a commit has more than one parent somewhere in Evidence
   Fusion's output** — the cheapest possible fix for the single most consequential
   finding across all ten batches. Not a reversal of ADR-006, just restoring the
   one bit of `identity` whose absence has a now-demonstrated real consequence.
2. **Share co-change history lookups across files within the same commit** — a
   real, measured, avoidable computational cost at realistic commit sizes, not a
   pathological extreme.
3. **Decide, explicitly, what `DatasetCollector` should do if ever called on a
   merge commit outside its own `collect()` flow** — not resolved by this
   evaluation, but this batch is the first evidence the question is worth deciding
   deliberately rather than relying on one filter, in one caller, to make it moot.

None of the above have been implemented — findings only, same discipline as every
other section of this document.

# Reasoning Layer Evaluation: Per-Commit Experiments

Evaluator posture: acting as an experienced senior engineer reviewing a commit, shown
this reasoning output the way a code-review assistant would surface it *before*
opening the actual diff. The question being answered for every commit is not "is the
implementation correct" but "would this reasoning make me a faster, better reviewer."
Every commit here is real, pulled from the named repository's actual history, and the
evaluation is written after independently reading the real diff — the reasoning output
is judged against what is actually true about the commit, not against what it claims
about itself.

Prompt template, module list, and non-goals (no AI/LLM/prompt/implementation
suggestions) match `docs/DECISIONS.md` ADR-007 and `docs/modules/reasoning.md` exactly
— this document only evaluates usefulness of what was produced.

Cross-commit synthesis: `docs/research/reasoning_observations.md`.

---

## Batch 1 — Mature Open Source Projects

Chosen for commit hygiene, meaningful messages, and test discipline: `pallets/flask`,
`fastapi/fastapi`, `django/django`, `psf/requests`, `pandas-dev/pandas`. One real,
non-trivial commit from each, deliberately of moderate size (a handful of files, a
genuine logic change, not a one-line typo and not a sprawling refactor) — representative
of what an actual reviewer would open on a normal day, not a pathological edge case
chosen to make the tool look good or bad.

---

### Commit 1 — `pallets/flask` `9368fb3f` — "case-insensitive comparison"

**What actually changed:** `App.select_jinja_autoescape`'s body changed from
`filename.endswith(...)` to `filename.lower().endswith(...)` — a one-line real bug fix
(previously `.SVG`/`.HTML` uppercase extensions were wrongly excluded from
autoescaping). Docstring updated with a `versionchanged` note. Changelog updated. **No
test was added.** 2 files: `src/flask/sansio/app.py`, `CHANGES.rst`.

## Commit Overview

- Overall usefulness of the reasoning: **5/10**
- Would this help you review the commit faster? **Partially**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape
- Useful? Marginally. `shape.narrow_change` and `shape.touches_documentation` are
  correct but nearly tautological for a 2-file commit that touches a changelog — true
  of the overwhelming majority of well-hygiened commits in any mature project.
- Immediately valuable? No.
- Noisy/obvious? `shape.heterogeneous_categories` (Source + Documentation) reads as
  informative but is really just "this commit touched code and its changelog," which
  is the *default* shape of a good commit here, not a distinguishing fact.
- Rating: **4/10**

### Historical Risk
- Useful? No real signal. `history.hot_file` fired for `CHANGES.rst`, which is hot in
  every active project by construction — not informative about *this* change.
- Changed my understanding? No.
- Misleading? Not exactly misleading, just low-value — a changelog file being "hot"
  tells a reviewer nothing about the actual fix.
- Rating: **2/10**

### Reach
- Pointed toward files I'd actually inspect? No — `reach.high_historical_coupling` on
  both `CHANGES.rst` and `app.py` is expected for a core file and its changelog; it
  didn't surface anything I wouldn't have already opened.
- Believable? Yes, just not incremental information.
- Rating: **3/10**

### Verification Coverage
- Helped me think about testing? **Yes, genuinely.** `verification.no_test_files_changed`
  is exactly right and exactly the first thing an experienced reviewer would ask about
  a real logic fix: "where's the test?" This is the single most useful claim this
  commit produced.
- Actionable? Yes — it's a direct prompt to ask the author for a regression test.
- Rating: **8/10**

### Contract Stability
- Identified API/interface changes worth attention? **It identified nothing at all**,
  and that silence is itself the finding: `select_jinja_autoescape`'s signature and
  decorators didn't change, so this module correctly stayed silent — but the actual
  bug fix (the logic inside the method body) is completely invisible to it, and to
  every other module. The evidence layer *did* capture that this symbol's docstring
  changed (`docstring_status: "changed"`, confirmed directly in the raw
  `semantic_analysis` output), but no reasoning module surfaces that fact as a claim.
- Rating: **3/10** (correct behavior given its contract, but a real, findable gap in
  what the *registry* of modules currently covers)

## Overall Reasoning Quality

1. **Genuinely valuable:** `verification.no_test_files_changed` — directly actionable,
   correctly identifies a real gap in this specific commit.
2. **Technically correct but not useful:** `shape.narrow_change`,
   `shape.touches_documentation`, `history.hot_file` on `CHANGES.rst` — all true, none
   discriminating.
3. **Naturally ignored:** `reach.high_historical_coupling` on both files — expected,
   added nothing to my mental model.
4. **Repeated/redundant:** `reach.high_historical_coupling` fires on both files with
   no differentiation between "the changelog co-changes with everything" and "this
   specific method's file is genuinely coupled to other logic" — same claim ID, same
   confidence, very different meaning underneath.
5. **Misleading or overconfident:** No individual claim was wrong, but the *absence*
   of any contract-stability signal could read to a less careful reviewer as "nothing
   about this symbol's contract changed, move on" — when in fact the symbol's real
   behavior changed materially. Silence here is easy to misread as "nothing to see."

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:**
- A claim surfacing `docstring_status: "changed"` on a symbol whose signature didn't
  change — the evidence already exists in `semantic_analysis`, it's simply not
  consumed by any of the five current modules. This would have directly flagged the
  one symbol that actually matters in this commit.
- A claim linking "this file's public method changed" with "no test file touched" at
  the *symbol* level, not just the commit level — `verification_coverage` currently
  only checks for public *signature* changes when deciding
  `public_change_without_tests`; a body-only change to a public method with no test
  produces no such claim today, even though that's exactly this commit's situation.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:**
- *Why* `.lower()` was the correct fix (that Windows/some filesystems allow mixed-case
  extensions, or that a real user reported `.SVG` files not autoescaping) — this lives
  in the linked issue (`:issue:5895`-style reference in the changelog), not in git.
- Whether the one-line fix is behaviorally complete (are there other places in Flask
  doing the same case-sensitive comparison?) — requires either running the code or a
  repo-wide search a human/tool would do deliberately, not something derivable from
  this one commit's diff.

---

### Commit 2 — `fastapi/fastapi` `7fe315c21` — "Refactor router route building to make it thread-safe"

**What actually changed:** Adds a `threading.Lock` field to `_IncludedRouter`;
restructures `effective_routes()` and `effective_low_priority_routes()` to use
double-checked locking around cache rebuilding. No signature or decorator changes to
either method. A new, well-targeted concurrency test spins up 6 threads and asserts
they all observe the same cached result. 2 files: `fastapi/routing.py`,
`tests/test_router_include_context.py`.

## Commit Overview

- Overall usefulness of the reasoning: **6/10**
- Would this help you review the commit faster? **Partially**
- Would you keep this reasoning visible in a real review tool? **Yes**

## Module Evaluation

### Change Shape
- Useful? Same pattern as Commit 1 — `narrow_change`/`heterogeneous_categories`
  (Source + Test) are correct but generic.
- Immediately valuable? `shape.touches_tests` is a mild positive signal (confirms a
  test accompanies the change) but not surprising for this project's hygiene.
- Noisy? Same tautology concern as before.
- Rating: **4/10**

### Historical Risk
- Useful? `history.hot_file` on `fastapi/routing.py` is plausible and mildly useful —
  it correctly flags that this is core, frequently-touched infrastructure, which
  raises the stakes of any change here, concurrency-related or not.
- Changed my understanding? Slightly — reinforces "be careful, this is load-bearing."
- Misleading? No.
- Rating: **6/10**

### Reach
- Pointed toward files I'd actually inspect? **Yes, this is the strongest module for
  this commit.** `reach.corroborated_wide_reach` on `routing.py` — genuinely useful:
  this is exactly the kind of file where a concurrency bug has broad blast radius, and
  the tool independently arrived at "wide reach" from two unrelated signals
  (historical co-change and directory neighborhood size).
- Believable? Yes — matches what any FastAPI-familiar reviewer already knows about
  `routing.py`'s centrality.
- Rating: **7/10**

### Verification Coverage
- Helped me think about testing? Only at the coarse level (`test_files_changed`);
  it didn't add anything a reviewer wouldn't already see by glancing at the file list.
- Actionable? Not really — there's no interesting *gap* here to flag, since a test was
  added, so this module has nothing more specific to say.
- Rating: **4/10**

### Contract Stability
- Identified API/interface changes worth attention? **This is the most important
  finding of this evaluation.** Every single `contract.*` claim this module produced
  is about *newly added test functions* in `tests/test_router_include_context.py`
  (`test_included_router_candidate_cache_is_thread_safe`, its nested
  `build_candidates`/`read_item` helpers, and a second new test with its own nested
  helpers) — because a brand-new function trivially has "old signature: none, new
  signature: something," which our schema correctly, but confusingly, reports as
  `public_signature_changed`. **Zero contract claims exist for `fastapi/routing.py`
  itself**, where the actual, real, production-relevant change happened (`
  effective_routes`/`effective_low_priority_routes`'s bodies were substantially
  rewritten) — because neither method's signature changed. A reviewer skimming
  "contract stability: 6 claims" without opening the diff could easily conclude a
  public API changed, when in fact nothing production-facing did — the claims are all
  about test scaffolding.
- Rating: **3/10** — technically correct per the module's contract, but the labeling
  makes it read as more significant than it is, and it completely misses the file that
  actually mattered.

## Overall Reasoning Quality

1. **Genuinely valuable:** `reach.corroborated_wide_reach` on `routing.py` — real,
   independently-corroborated, matches ground truth about the file's importance.
2. **Technically correct but not useful:** `shape.narrow_change`,
   `shape.heterogeneous_categories`, `verification.test_files_changed`.
3. **Naturally ignored:** every `contract.*` claim in this commit, once I traced them
   and realized they were all about new test helper functions, not production code.
4. **Repeated/redundant:** the same `contract.public_signature_changed` pattern
   repeating six times, once per new test function/nested helper — same shape of
   noise as Commit 1's repeated `reach.high_historical_coupling`.
5. **Misleading or overconfident:** yes, this is the clearest case in the batch —
   `contract_stability`'s claims here are directionally deceptive about *where* the
   real change is, purely as a side effect of new-symbol detection being
   indistinguishable from "this existing public thing's shape changed."

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:**
- Distinguishing "a brand-new symbol was added" from "an existing public symbol's
  signature changed" as two different claim types — right now both produce
  `contract.public_signature_changed` via the same `signature_changed: true` fact,
  but they mean very different things to a reviewer and shouldn't share a claim ID.
- A claim surfacing "this method's *body* changed substantially with no signature
  change" — derivable today from `semantic_analysis`'s own `change_type: "modified"`
  facts on `effective_routes`/`effective_low_priority_routes`, just not currently
  turned into a claim by any module, since `contract_stability` only looks at
  signature/decorator/removal, never plain modification.
- Something recognizing `threading`/`Lock` as an added import in a file already
  flagged as high-reach — a purely mechanical correlation (`import` diff + reach
  claim) that would have made "this is a concurrency-safety change to a load-bearing
  file" explicit rather than something I had to infer myself.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:**
- Whether the double-checked locking pattern is actually correct (no data race, no
  deadlock) — requires either running the new thread-safety test or genuine code
  review judgment, not derivable from any diff-level fact.
- That this bug was "mainly relevant for tests running in parallel threads (uncommon)"
  per the commit's own title — that severity/context assessment came from the author,
  not from anything git-derivable.

---

### Commit 3 — `django/django` `bdbda29c3` — "Avoided mutating original view in non_atomic_requests()"

**What actually changed:** `_non_atomic_requests` previously mutated the passed-in
view function's `_non_atomic_requests` attribute directly and returned the *same*
object; now it computes the union of databases and returns a **new** wrapper (via
`functools.wraps`) instead, avoiding shared mutable state across repeated decorator
applications. Signature of `_non_atomic_requests` itself is unchanged. A real,
well-targeted test confirms `wrapped_twice is not wrapped_once`. 2 files:
`django/db/transaction.py`, `tests/handlers/tests.py`.

## Commit Overview

- Overall usefulness of the reasoning: **4/10**
- Would this help you review the commit faster? **Partially**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape
- Useful? Same recurring pattern — correct, generic.
- Immediately valuable? No.
- Noisy/obvious? Yes, identical shape of claims to Commits 1 and 2.
- Rating: **3/10**

### Historical Risk
- Useful? No claims fired at all for either file — neither crossed the hot-file or
  dormancy thresholds. This is an honest "nothing notable" result, not a bug (I
  confirmed both files simply didn't meet either threshold), but it also means this
  module contributed literally nothing to this review.
- Changed my understanding? No.
- Misleading? No — correctly silent.
- Rating: **3/10** (correct, but contributes nothing)

### Reach
- Pointed toward files I'd actually inspect? No — no claims fired here either, same
  reason (thresholds not met for either file).
- Believable? N/A, nothing was claimed.
- Rating: **2/10**

### Verification Coverage
- Helped me think about testing? Only the coarse "yes, tests changed" — a test exists
  and was correctly detected, but there's no deeper signal here (e.g. this module
  can't tell that the new test specifically exercises object-identity, which is the
  crux of this bug).
- Actionable? Marginally.
- Rating: **4/10**

### Contract Stability
- Identified API/interface changes worth attention? **Yes, but with a real,
  concrete inaccuracy worth flagging.** It correctly flagged the new nested `wrapper`
  function inside `_non_atomic_requests` as `contract.public_signature_changed` — but
  `wrapper` is **not actually public** in any meaningful sense; it's a private
  implementation detail nested inside a function whose own name starts with an
  underscore (`_non_atomic_requests`). The tool's visibility rule only looks at a
  symbol's own name, not its enclosing scope, so a plainly-named symbol nested inside
  a private function is misclassified as public. This is the single most important,
  concrete, previously-unknown finding from this batch.
- Rating: **4/10** — the underlying fact (a new inner function was added) is real and
  arguably worth surfacing, but labeling it "public" is actively wrong and would
  mislead a reviewer skimming claims without opening the diff.

## Overall Reasoning Quality

1. **Genuinely valuable:** none of this commit's claims were independently valuable —
   the real story here (mutation of shared state → returning a fresh wrapper) is a
   pure-body-logic change this reasoning layer structurally cannot see.
2. **Technically correct but not useful:** `shape.narrow_change`,
   `shape.heterogeneous_categories`, `verification.test_files_changed`.
3. **Naturally ignored:** the `wrapper` "public signature changed" claim, once I
   recognized it was a misclassified private helper.
4. **Repeated/redundant:** the same boilerplate commit-level shape claims as every
   other commit in this batch.
5. **Misleading or overconfident:** yes — `contract.public_signature_changed` on
   `wrapper` reads as "a public API changed" when nothing public actually did.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:**
- Visibility should account for enclosing scope, not just a symbol's own name — a
  symbol nested inside a private (`_`-prefixed) function or class should inherit
  private status regardless of its own name. This is a real, fixable gap in
  Milestone 6's `symbol_extractor.py`, found here for the first time.
- The actual point of this commit — "this function used to return the same object it
  was given; now it returns a different one" — is a genuine, structurally-observable
  fact (`change_type` plus a return-statement change) that no current module
  attempts to characterize, though it would require reasoning about return semantics,
  not just signatures.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:**
- *Why* mutating the original view was a real bug (it silently corrupted decorator
  stacking when the same view was wrapped for multiple databases) — that causal
  story lives in ticket #29303, not in the diff.
- Whether any other code in the Django codebase relies on the old (buggy) mutation
  behavior — requires either a full call-graph or genuine familiarity with the
  codebase, not obtainable from this commit alone.

---

### Commit 4 — `psf/requests` `6f205ff4` — "Fix `_encode_files` detection for `__getattr__`-based file wrappers"

**What actually changed:** `RequestEncodingMixin`'s file-encoding logic broadened an
`isinstance(fp, _SupportsRead)` check to also accept `hasattr(fp, "read")`, fixing
detection of duck-typed file-like objects (e.g. wrappers that proxy attributes via
`__getattr__`) that don't satisfy the structural-typing protocol check. One line
changed inside an existing method body — no signature change. A new, realistic test
(`test_post_named_tempfile`) exercises a real `NamedTemporaryFile`. 2 files:
`src/requests/models.py`, `tests/test_requests.py`.

## Commit Overview

- Overall usefulness of the reasoning: **4/10**
- Would this help you review the commit faster? **Partially**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape
- Useful? Same recurring, correct-but-generic pattern as every commit so far.
- Immediately valuable? No.
- Noisy/obvious? Yes.
- Rating: **3/10**

### Historical Risk
- Useful? `history.hot_file` on `tests/test_requests.py` is accurate (it's a large,
  frequently-touched test file) but says nothing about *this* fix specifically.
- Changed my understanding? No.
- Misleading? No.
- Rating: **3/10**

### Reach
- Pointed toward files I'd actually inspect? `reach.high_historical_coupling` on the
  test file and `reach.large_neighborhood` on `models.py` are both plausible, but
  neither pointed me toward anything beyond the two files already in the diff — no
  incremental information for a commit this small.
- Believable? Yes.
- Rating: **3/10**

### Verification Coverage
- Helped me think about testing? A test exists and was correctly detected — fine, but
  unremarkable for a commit this size.
- Actionable? No new information beyond what's already visible in the file list.
- Rating: **3/10**

### Contract Stability
- Identified API/interface changes worth attention? Only the new test function itself
  (`test_post_named_tempfile`) — same "new symbol reads as signature-changed" artifact
  seen in Commits 2 and 3. **The actual fix — broadening an `isinstance` check inside
  `_encode_files`'s body — is completely invisible**, since `_encode_files`'s
  signature never changed. This is the third time in four commits this exact pattern
  has appeared.
- Rating: **3/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** none, honestly — this is the weakest commit in the batch
   for reasoning value, mostly because the change itself is a single, small,
   self-contained body edit that doesn't touch anything structural.
2. **Technically correct but not useful:** essentially every claim produced.
3. **Naturally ignored:** the `contract.public_signature_changed` claim on the new
   test function, once recognized as an artifact rather than a real API change.
4. **Repeated/redundant:** yes, the exact same commit-level shape claims as every
   other commit in this batch, with nothing this commit's specifics added.
5. **Misleading or overconfident:** no individual claim was wrong, but the near-total
   absence of anything specific to *this* fix (versus generic hygiene facts) risks
   training a reviewer to stop reading the reasoning panel altogether.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:**
- Nothing new beyond what Commits 1-3 already surfaced: docstring-only/body-only
  change detection, and distinguishing new-symbol claims from modified-signature
  claims, would both have helped here too, in the same way.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:**
- *Why* this specific duck-typing gap mattered (a real user's custom file wrapper
  class failing silently) — that's issue/PR discussion, not git history.
- Whether `hasattr(fp, "read")` could now over-match objects that merely happen to
  expose a `.read` attribute without being real file-like objects — a correctness
  question requiring semantic/behavioral judgment, not something derivable from the
  diff.

---

### Commit 5 — `pandas-dev/pandas` `76bac9e3` — "BUG: setitem-with-expansion silently corrupting values above the integer bound"

**What actually changed:** Adds a new private helper `_floats_fit_integer_dtype` and
substantially rewrites `maybe_downcast_numeric`'s body to range-check float values
before casting to an integer dtype (previously silently platform-dependent/undefined
behavior for out-of-range casts) and to catch `OverflowError`/`ValueError` during the
cast rather than letting them escape. No signature changes to the modified function.
5 files: `pandas/core/dtypes/cast.py`, a whatsnew doc entry, and three test files
(`test_downcast.py`, `test_combine.py`, `test_setitem.py`) covering the bug from
multiple angles.

## Commit Overview

- Overall usefulness of the reasoning: **5/10**
- Would this help you review the commit faster? **Partially**
- Would you keep this reasoning visible in a real review tool? **Yes**

## Module Evaluation

### Change Shape
- Useful? Same recurring pattern, plus correctly flagged `touches_documentation` (the
  whatsnew entry) alongside `touches_tests` — an accurate, if unremarkable, summary of
  a well-hygiened bug-fix commit.
- Immediately valuable? Marginally more than other commits, since this one genuinely
  does touch four distinct categories (source, doc, three separate test files) and the
  claim correctly reflects that spread.
- Noisy/obvious? The individual booleans are still mostly expected for a project with
  pandas' rigor.
- Rating: **5/10**

### Historical Risk
- Useful? `history.hot_file` on `cast.py` is accurate and meaningfully raises the
  stakes ("this is core dtype-casting infrastructure"). `history.
  long_dormant_reactivated` fired on `test_combine.py` — a genuinely interesting,
  previously-unexercised-in-testing claim type, correctly computed from a real gap
  between this commit's date and that test file's previous touch.
- Changed my understanding? Somewhat — reinforces that `cast.py` is sensitive,
  foundational code where a subtle bug has wide implications.
- Misleading? No.
- Rating: **6/10**

### Reach
- Pointed toward files I'd actually inspect? `reach.high_historical_coupling` on
  `cast.py` and `test_setitem.py` is plausible and consistent with pandas' known
  internal coupling between casting and indexing code.
- Believable? Yes.
- Rating: **5/10**

### Verification Coverage
- Helped me think about testing? Only at the coarse commit level — it can't reflect
  that this commit is *unusually* well-tested (three separate test files, each
  covering a different angle of the same bug: downcast boundaries, `combine`, and
  `setitem` enlargement) — that nuance is invisible to a boolean.
- Actionable? Not particularly, since there's no gap to flag.
- Rating: **4/10**

### Contract Stability
- Identified API/interface changes worth attention? **No — and this is the most
  consequential miss in the entire batch.** The new `_floats_fit_integer_dtype`
  helper is correctly *not* flagged as public (its leading underscore is correctly
  read as private), which is right. But `maybe_downcast_numeric` — an existing,
  genuinely public function whose behavior changed in a way that matters a great deal
  (it now returns the original result instead of raising/corrupting on out-of-range
  floats) — produced **zero** claims, because its signature is untouched. This is the
  most safety-relevant change in the whole batch (a silent data-corruption bug fix)
  and it is entirely invisible to this module.
- Rating: **2/10** — lowest of the batch, precisely because the stakes of the missed
  change are highest here.

## Overall Reasoning Quality

1. **Genuinely valuable:** `history.long_dormant_reactivated` on `test_combine.py` —
   a real, previously-unexercised claim type firing correctly on real data;
   `history.hot_file`/`reach.high_historical_coupling` on `cast.py`, correctly
   reinforcing this is sensitive core infrastructure.
2. **Technically correct but not useful:** the commit-level shape booleans.
3. **Naturally ignored:** nothing to ignore here, precisely because so little fired
   for the file that actually mattered.
4. **Repeated/redundant:** the recurring commit-shape claims, same as every prior
   commit.
5. **Misleading or overconfident:** the *silence* around `maybe_downcast_numeric` is
   the closest thing to misleading in this batch — a reviewer trusting "no contract
   claims fired" as "nothing structurally important changed" would be badly wrong
   here; this is a real silent-data-corruption fix.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:**
- A claim characterizing "an existing function's body changed substantially" (e.g.
  based on `semantic_analysis`'s `change_type: "modified"` with no signature/decorator
  change) — this is the single clearest, most repeated gap across this entire batch
  (present in 4 of 5 commits), and this commit is the highest-stakes example of it.
- A claim recognizing that a new private helper was added *and* an existing public
  function in the same file was modified in the same commit — a purely structural
  co-occurrence fact, not a judgment about what the helper does.
- Something surfacing "this bug fix commit added exception handling
  (`try`/`except OverflowError, ValueError`) around a previously bare cast" —
  detectable from AST facts already collected (a `Try` node wrapping code that wasn't
  previously wrapped), not yet reasoned about by any module.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:**
- Whether the platform-dependent behavior described in the commit message (aarch64
  saturates, x86 wraps) is accurately characterized — requires actually running the
  cast on both architectures, not derivable from source.
- Whether the fix is complete (are there other call sites with the same unguarded
  cast pattern elsewhere in pandas?) — requires either a repo-wide search or genuine
  familiarity with the codebase.

---

## Batch 1 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| flask `9368fb3f` | 5/10 | Partially | Partially |
| fastapi `7fe315c21` | 6/10 | Partially | Yes |
| django `bdbda29c3` | 4/10 | Partially | Partially |
| requests `6f205ff4` | 4/10 | Partially | Partially |
| pandas `76bac9e3` | 5/10 | Partially | Yes |

## Final Verdict — Batch 1

**Top 3 most valuable reasoning outputs across the batch:**
1. `verification.no_test_files_changed` (Flask) — directly actionable, correctly
   identified a real, specific gap in that exact commit.
2. `reach.corroborated_wide_reach` on `fastapi/routing.py` — real corroboration
   (independent co-change and neighborhood signals agreeing) landing on a file that
   genuinely is high-stakes, load-bearing infrastructure.
3. `history.long_dormant_reactivated` on pandas' `test_combine.py` — the first
   real-data confirmation this claim type works as designed, and a genuinely
   interesting fact (a test file reactivated after a long gap, in a commit adding
   regression coverage for a bug).

**Top 3 weakest reasoning outputs across the batch:**
1. `contract.public_signature_changed` firing on brand-new test helper functions
   (FastAPI, Django, Requests, Pandas — present in 4 of 5 commits) — technically
   correct per the schema, consistently misleading about where a "contract change"
   actually happened.
2. The recurring, nearly-identical commit-level `shape.*` claims
   (`narrow_change`/`heterogeneous_categories`/`touches_tests`) — true in every single
   commit in this batch, discriminating between none of them.
3. Django's `wrapper` misclassified as `public` despite being a private helper nested
   inside an underscore-prefixed function — the one case in the batch where a claim
   was not just unhelpful but actively inaccurate.

**One concrete improvement to prioritize before adding any new reasoning modules:**
Give `contract_stability` (or a new, narrowly-scoped module) the ability to
distinguish three genuinely different situations that current share one claim ID or
produce no claim at all: (1) a **newly added symbol** existing at all — not
inherently a "contract change," (2) an **existing public symbol's signature/decorator
changing** — the real, current meaning of `contract.public_signature_changed`, and
(3) an **existing symbol's body changing with no signature change** — invisible today,
and, per this batch, the single most common real situation in mature-project bug
fixes (4 of 5 commits here had their most important change be exactly this, including
the highest-stakes one, pandas' silent-corruption fix). This is a bigger lever than
any new module would be, because it's currently producing *actively misleading*
output in the common case, not just missing coverage in a rare one.

---

## Batch 2 — Personal Projects

Two real sources: `tcx_nogrunt-1` (the user's own private, small-team project) and
`~/Projects/Triple` (a genuinely personal, 5-commit-total local repo — no test
infrastructure at all). Commits picked by scanning real history, not curated for
effect. One thing worth stating up front: **this batch surfaced a genuine, previously
unknown correctness bug**, not just a usefulness finding — `Triple`'s actual root
commit (`5841742`, zero parents, confirmed via `git rev-list --max-parents=0`) crashes
`DatasetCollector._build_commit_semantic_analysis` with `IndexError`, because it
unconditionally computes `parent_hash = get_parent_hashes(...)[0]` even when a commit
has none. No mature-OSS batch commit ever exercised a true root commit with Python
files in it, which is exactly why this stayed hidden through Milestones 6-8's own
validation. Flagged here, not fixed — substituted a different commit
(`3d20e2b`) to complete this batch's five evaluations.

---

### Commit 1 — `tcx_nogrunt-1` `6a38e90` — "fix: always increment clickcount and expose error details in batch TC create"

**What actually changed:** Inside `_run_batch_job`, the clickcount (`cc`) counter now
increments on every step outcome (success, HTTP error, exception, or "element not
found"), not only on success — fixing a bug where a failed step's clickcount was
reused by the next step, causing the downstream servlet to reject it. Also: response
bodies are now captured into `job["tcs"][...]["detail"]`/`"error"` on failure paths
that previously only stored a bare status code. No function signatures changed — this
is entirely a control-flow and logging fix inside one async function's body. 1 file:
`impact_lens/step_visualizer/router.py`. No test exists for this file in the repo at
all (confirmed: this repo has no test infrastructure).

## Commit Overview

- Overall usefulness of the reasoning: **3/10**
- Would this help you review the commit faster? **No**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape
- Useful? `shape.narrow_change`/`homogeneous_categories` are correct but say nothing
  about this being a real bugfix vs. a trivial edit.
- Immediately valuable? No.
- Noisy/obvious? Same boilerplate pattern as every Batch 1 commit.
- Rating: **3/10**

### Historical Risk
- No claims fired — `router.py`'s history didn't cross either threshold in this run.
- Rating: **2/10** (correct, contributes nothing)

### Reach
- No claims fired, same reason.
- Rating: **2/10**

### Verification Coverage
- `verification.no_test_files_changed` is correct and, in a repo with zero test
  infrastructure at all, close to a permanent fact rather than a signal specific to
  this commit — still technically the most useful single claim here, but its value is
  diluted by being true of literally every commit in this repository.
- Rating: **5/10**

### Contract Stability
- **Nothing fired at all**, and this is the clearest possible demonstration of the
  body-only-change blind spot from Batch 1: the entire bug (a counter increment moved
  outside a conditional) lives inside `_run_batch_job`'s body, its signature never
  changes, and there is exactly zero reasoning output describing what actually
  happened in this commit.
- Rating: **1/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** none.
2. **Technically correct but not useful:** all three commit-level claims.
3. **Naturally ignored:** nothing to ignore — there was almost nothing produced.
4. **Repeated/redundant:** the same triad of commit-shape claims, now seen identically
   across every commit in both batches.
5. **Misleading or overconfident:** not misleading, but the near-total silence on a
   commit whose entire content is a real, specific bug fix is a serious usefulness gap.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** a claim for
"existing function body modified, no signature change" (same recommendation as Batch
1, now reconfirmed on a completely different, non-OSS codebase) would have been the
single highest-value addition for this exact commit.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** the actual bug mechanism (a servlet rejecting a duplicate clickcount) is
domain knowledge about an external system (`STEPS_SERVLET`) this pipeline has no way
to know about, regardless of how much better the AST-level reasoning gets.

---

### Commit 2 — `tcx_nogrunt-1` `3944968` — "test case create fix"

**What actually changed:** Inside the same `_run_batch_job` function (one commit
later), the navigation-detection regex now also checks `step.element_label` when
`step.message` is empty, and the `fulldata_map` lookup gained four fallback variants
trying different leading-slash permutations of `step.xpath` before giving up. Despite
the message saying "test case," no test file exists anywhere in this repo — the
message's own vocabulary ("test case") refers to the domain concept the tool
processes, not to automated testing. 1 file, same as Commit 1.

## Commit Overview

- Overall usefulness of the reasoning: **3/10**
- Would this help you review the commit faster? **No**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape
- Same boilerplate triad as every commit so far.
- Rating: **3/10**

### Historical Risk
- No claims — same file as Commit 1, one commit later, still below both thresholds.
- Rating: **2/10**

### Reach
- No claims.
- Rating: **2/10**

### Verification Coverage
- `verification.no_test_files_changed` fired again, correctly, but note the message
  says "test case" — a reviewer skimming reasoning output alongside a commit message
  containing the word "test" could momentarily misread the *absence-of-tests* claim as
  contradicting the message, when actually both are correct and simply talking about
  different senses of "test."
- Rating: **4/10**

### Contract Stability
- Nothing fired — same body-only pattern as Commit 1, one function, two commits in a
  row, zero contract-layer signal for either.
- Rating: **1/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** none.
2. **Technically correct but not useful:** the commit-shape triad.
3. **Naturally ignored:** nothing distinct to ignore.
4. **Repeated/redundant:** identical claim set to Commit 1, despite being a
   meaningfully different fix (regex fallback logic vs. counter logic) — the reasoning
   output cannot distinguish these two commits from each other at all.
5. **Misleading or overconfident:** the "test case"/"no test files" naming collision
   noted above is a mild, real source of potential confusion, not a wrong claim.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** same as Commit 1
— body-only change detection. Additionally: this commit and Commit 1 touch the exact
same function in the exact same file one commit apart; nothing here surfaces "this
function was also touched very recently" as a lineage-adjacent fact, even though
`historical_risk` in principle has the data to say so once file-level thresholds are
crossed.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** whether the xpath-variant fallback actually covers every real-world
xpath format the upstream tool produces — a correctness question needing domain
knowledge of that upstream system, not derivable from this diff.

---

### Commit 3 — `tcx_nogrunt-1` `6b57b8e` — "Changed default value of check_steps to 3 from previous 5"

**What actually changed:** A FastAPI `Form(...)` parameter default,
`check_steps: int = Form(5)`, changed to `Form(3)`, in **two** route handlers
(`analyze_stepwise`, `analyze_stepwise_streaming`) in the same file, plus the matching
HTML input's default `value` attribute updated to stay consistent. 2 files:
`impact_lens/failureanalysis/router.py`, `impact_lens/failureanalysis/
failureanalysis_stream.html`.

## Commit Overview

- Overall usefulness of the reasoning: **7/10**
- Would this help you review the commit faster? **Yes**
- Would you keep this reasoning visible in a real review tool? **Yes**

## Module Evaluation

### Change Shape
- Same boilerplate triad, unremarkable for a 2-file commit.
- Rating: **3/10**

### Historical Risk
- No claims fired.
- Rating: **2/10**

### Reach
- No claims fired.
- Rating: **2/10**

### Verification Coverage
- `verification.public_change_without_tests` fired, `corroborated`, on
  `router.py` — and here it's genuinely earning its keep: a default value used by two
  public route handlers changed, and there is truly no test anywhere that would catch
  a regression if `3` turns out to be the wrong number for some callers. This is
  exactly the situation this claim exists to flag.
- Rating: **8/10**

### Contract Stability
- **This is the strongest showing of `contract_stability` across both batches so
  far.** It correctly fired `contract.public_signature_changed` on *both*
  `analyze_stepwise` and `analyze_stepwise_streaming` — and unlike the "new symbol"
  artifact seen repeatedly in Batch 1, this is a **real, meaningful signature change**:
  a default parameter value is part of a function's actual calling contract (any
  caller not passing `check_steps` explicitly now gets different behavior), and the
  module correctly detected it via the plain `signature_changed` fact with no special
  casing needed.
- Rating: **8/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** `contract.public_signature_changed` on both handlers, paired
   with `verification.public_change_without_tests` — together they tell a complete,
   accurate, actionable story: "a public default changed, in two places, untested."
2. **Technically correct but not useful:** the commit-shape triad.
3. **Naturally ignored:** nothing.
4. **Repeated/redundant:** none in this commit — this is the first commit in either
   batch where the non-boilerplate claims are the ones doing real work.
5. **Misleading or overconfident:** none.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** the HTML file's
matching `value="3"` change is invisible to every module (HTML isn't Python) — a
purely mechanical "this default also appears consistently updated in a non-Python
file" cross-check isn't something this pipeline can do without expanding scope beyond
its Python-only semantic layer, which was an explicit, deliberate limit (ADR-005).

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** *why* 3 is the right number instead of 5 (some empirical finding about
false-positive rates, presumably) — that reasoning lives entirely outside git.

---

### Commit 4 — `~/Projects/Triple` (local) `3f2615e` — "extra changes now triples iin secondary and primary"

**What actually changed:** A large, genuinely messy personal-project commit — 9 files,
6537 insertions. The Python-relevant part: `main.py` had its entire duplicate-analysis
subsystem deleted outright (`normalize_triple`, `triple_signature`,
`run_duplicate_analysis` — three whole functions gone), `infer_page_context`'s body
was reordered (comment/control-flow cleanup, no behavior or signature change), and the
exact same one-line regex fix was applied to **two different files'**
identically-named `parse_excel` function (`main.py` and `extra/main3.py`). No tests
exist in this repo.

## Commit Overview

- Overall usefulness of the reasoning: **5/10**
- Would this help you review the commit faster? **Partially**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape
- Useful? Here, unlike every prior commit in both batches, `shape.
  heterogeneous_categories` and `shape.touches_config` are genuinely informative — this
  commit really does span Source/Configuration/Test categories in one messy push, and
  the claims correctly reflect that spread rather than reading as boilerplate.
- Rating: **6/10** — the first commit where this module clearly differentiates itself
  from "every other commit's shape claims."

### Historical Risk
- `history.first_appearance` correctly fired for the two brand-new `test_cases2.txt`/
  `test_cases3.txt` files — accurate, low but real value.
- Rating: **4/10**

### Reach
- `reach.no_historical_coupling`/`isolated_module` fired honestly for the new/junk
  files — correct, unremarkable for a young, 5-commit-total repo.
- Rating: **3/10**

### Verification Coverage
- `verification.test_files_changed` fired — but **this is a real, concrete
  misclassification worth flagging directly**: `test_cases.txt`/`test_cases2.txt`/
  `test_cases3.txt` are plain-text *data* files describing test scenarios for this
  tool's own domain (step sequences, "Run:" headers, subject-predicate-object
  triples) — not automated test code. `file_classifier`'s word-boundary Test-name rule
  (matching "test" bounded by `_`/`.`) correctly avoided the false positive it was
  designed to avoid (`Test Studio.html`), but has no way to distinguish "this file
  literally is a test" from "this file's *name* references testing as its subject
  matter" — a distinction mature OSS repos rarely need, since `test_*.py` there really
  is almost always a test, but personal/QA-tooling projects can violate that
  convention entirely.
- Rating: **3/10** — technically a correct classification by the rule as written, but
  actively misleading about this repo's real test coverage (which is zero).

### Contract Stability
- Correctly caught all three removed functions
  (`normalize_triple`/`triple_signature`/`run_duplicate_analysis`) as
  `public_symbol_removed` — a real, valuable, accurate signal: an entire subsystem was
  deleted, and the reasoning layer said so plainly. But it **completely missed**
  `infer_page_context`'s body reorder (no signature change), and — more
  significantly — it produced **no correlation at all** between the identical
  `parse_excel` fix applied independently in two different files. This is the exact
  "duplication relationship" gap the original 20-commit evidence evaluation flagged
  after finding it in `tcx_nogrunt-1` Commits 13/14 — now reappearing at the
  *reasoning* layer, in a different repo, for the same underlying reason: nothing in
  this pipeline correlates two symbols with the same name changing identically in two
  files.
- Rating: **5/10** — a real, correct removal signal, undercut by a real, concrete miss
  of the single most interesting structural fact in the commit.

## Overall Reasoning Quality

1. **Genuinely valuable:** the three `public_symbol_removed` claims — accurate,
   meaningful, exactly the kind of "something substantial was deleted" signal a
   reviewer wants flagged automatically.
2. **Technically correct but not useful:** `reach`/`history` claims on the new/junk
   files.
3. **Naturally ignored:** none outright wrong, but `verification.test_files_changed`
   required real thought to realize it was misleading, not just low-value.
4. **Repeated/redundant:** none new here.
5. **Misleading or overconfident:** yes — `verification.test_files_changed` is the
   clearest case of a technically-correct-but-substantively-wrong claim found in
   either batch: this repo has literally zero real tests, and the claim implies
   otherwise.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:**
- Body-only change detection (`infer_page_context`) — same recurring finding.
- A cross-file "same qualified name changed in multiple files this commit" correlation
  — purely structural (comparing `semantic_analysis.files[*].symbols[*].qualified_name`
  across files in the same commit), not fuzzy matching, and would have caught the
  `parse_excel` duplication directly.
- A way to distinguish "classified Test by name pattern" from "verified to contain
  actual test code" (e.g. imports a test framework, defines test functions per
  `symbol_extractor`) — would have prevented the `test_cases*.txt` misclassification
  from reading as real test coverage.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** whether removing the duplicate-analysis subsystem entirely (vs. moving or
refactoring it) was intentional and safe — that's a design decision living in the
author's head, this being a solo personal project with no PR/issue trail at all.

---

### Commit 5 — `tcx_nogrunt-1` `3d20e2b` — "page identification and db fixes"

**What actually changed:** A real, substantive backend/schema change: the SQLAlchemy
model `TcxTestCase` is deleted outright and replaced with a new `DetailedTestCase`
model mapped onto a different, pre-existing table; `TcxStep.tc_id`'s foreign key is
repointed and its column type widened from `Integer` to `BigInteger`; `init_mysql_db`
gained raw `ALTER TABLE`/`DROP FOREIGN KEY` migration statements; `save_mapping_run`
and `edit_step` were rewritten to look up-or-create by title instead of always
inserting; `find_duplicate_groups` was substantially restructured (its matching
strategy changed from xpath-only/semantic-fallback to combined
xpath+fingerprint/fingerprint-only branches, and its inner `process` helper gained a
new `use_xpath` parameter); a 35-line module-level docstring in `deduplicate.py` was
deleted outright with no code change; `_map_page_to_file` gained a new branch for
3-digit numeric page IDs. 4 files, no tests (none exist in this repo).

## Commit Overview

- Overall usefulness of the reasoning: **6/10**
- Would this help you review the commit faster? **Partially**
- Would you keep this reasoning visible in a real review tool? **Yes**

## Module Evaluation

### Change Shape
- Same boilerplate triad — undersells how substantial this commit actually is (a real
  schema migration touching foreign keys and column types), since none of that is
  visible to a purely structural size/category check.
- Rating: **3/10**

### Historical Risk
- No claims — neither modified file crossed either threshold in this run.
- Rating: **2/10**

### Reach
- `reach.large_neighborhood` fired for both `mysql_database.py` and
  `step_deduplicator.py` — plausible, unremarkable.
- Rating: **3/10**

### Verification Coverage
- `verification.public_change_without_tests` fired, `corroborated`, on
  `step_deduplicator.py` — correct and meaningful: the duplicate-matching strategy
  changed substantially with zero test coverage anywhere in the repo.
- Rating: **6/10**

### Contract Stability
- **A genuinely strong, meaningful result this time.** `TcxTestCase` correctly shows
  `public_symbol_removed` — a whole database model deleted is exactly the kind of
  contract-level fact a reviewer needs flagged, especially given the accompanying raw
  `ALTER TABLE` statements make this a live schema migration, not just a code
  refactor. `find_duplicate_groups.process` correctly shows
  `public_signature_changed` — and this is a **real** signature change (a new
  `use_xpath: bool` parameter added to an existing nested function), not a
  new-symbol artifact this time. Two real, accurate, non-noise claims.
- Worth flagging as a distinct, new observation: **`DetailedTestCase` — the new
  replacement model — produced no claim at all**, for a structural reason worth
  understanding precisely: `symbol_extractor` never records a `signature` for a
  `class` (always `None`), so a brand-new class's "old vs. new signature" comparison
  is `None != None`, i.e. `False` — new classes never trigger the "new symbol reads as
  signature-changed" artifact that new *functions* reliably do (seen repeatedly in
  Batch 1). This asymmetry is worth knowing about explicitly rather than assuming the
  Batch 1 artifact applies uniformly to every symbol type.
- Rating: **7/10** — the best `contract_stability` showing in this batch, on real,
  non-artifact signals.

## Overall Reasoning Quality

1. **Genuinely valuable:** `TcxTestCase` removal, `find_duplicate_groups.process`'s
   real signature change, `verification.public_change_without_tests` on the
   deduplication rewrite — three accurate, meaningful, corroborating-in-spirit facts
   about the same underlying migration.
2. **Technically correct but not useful:** the commit-shape triad, `reach.
   large_neighborhood`.
3. **Naturally ignored:** none.
4. **Repeated/redundant:** none new.
5. **Misleading or overconfident:** none directly, but the total silence on the raw
   `ALTER TABLE` migration statements and the deleted 35-line module docstring (see
   below) risks a reviewer underweighting how live/risky this change actually is.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:**
- A claim recognizing raw SQL/schema-migration statements appearing in a `Try`/`with`
  block inside a function (`init_mysql_db`) — structurally detectable from the AST
  (string literals matching `ALTER TABLE`/`DROP`/`ADD CONSTRAINT` inside a database
  I/O call) without needing to understand SQL semantically.
- **A new, distinct finding, not previously surfaced in Batch 1:** the deleted
  35-line module-level docstring in `deduplicate.py` is invisible not just to
  `contract_stability` but to the *entire* pipeline — `symbol_extractor` explicitly
  does not track module-level docstrings at all (only function/class ones), a
  deliberate Stage-1 scoping decision (ADR-005) that this commit shows has a real
  cost: a genuine, substantial loss of documentation produced zero signal anywhere in
  `commit.json`.
- Same cross-file duplication-correlation gap as Commit 4, structurally.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** whether the raw `ALTER TABLE` migration is safe to run against a live
database with existing data (e.g. does `tcx_test_cases` have rows that need
migrating to `detailed_test_cases` first?) — a real operational risk question no
git-derived fact can answer.

---

## Batch 2 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| tcx `6a38e90` (clickcount) | 3/10 | No | Partially |
| tcx `3944968` (test case fix) | 3/10 | No | Partially |
| tcx `6b57b8e` (check_steps default) | 7/10 | Yes | Yes |
| Triple `3f2615e` (duplicate-analysis removal) | 5/10 | Partially | Partially |
| tcx `3d20e2b` (db schema migration) | 6/10 | Partially | Yes |

## Final Verdict — Batch 2

**Top 3 most valuable reasoning outputs across the batch:**
1. `contract.public_signature_changed` on both FastAPI route handlers in `6b57b8e` —
   a real, meaningful default-value contract change, correctly detected with no
   special-casing, paired accurately with `verification.public_change_without_tests`.
2. `contract.public_symbol_removed` on `TcxTestCase` in `3d20e2b` — a whole database
   model deletion, exactly the kind of structural fact worth automatic flagging,
   especially alongside a live schema migration.
3. `contract.public_symbol_removed` on all three deleted functions in `3f2615e` — an
   entire subsystem's removal correctly and completely surfaced.

**Top 3 weakest reasoning outputs across the batch:**
1. Total silence on `6a38e90`/`3944968` — two real, distinct bug fixes to the same
   function, one commit apart, producing byte-for-byte identical reasoning output —
   the clearest demonstration yet of the body-only-change blind spot costing real
   usefulness, not just theoretical coverage.
2. `verification.test_files_changed` on `3f2615e` — a genuine misclassification, not
   just a low-value truth: this repo has zero real tests, and the claim implies
   otherwise, distinct from Batch 1's "technically true but unhelpful" pattern.
3. Missing the `parse_excel` cross-file duplication in `3f2615e` — the same
   duplication/similarity gap the original 20-commit evidence evaluation flagged as a
   real (not hypothetical) cost, now shown a second time, at the reasoning layer, in a
   different repository.

**One concrete improvement to prioritize, given this batch specifically:** fix the
real defect found here before anything else — `_build_commit_semantic_analysis`
crashing on root commits (`IndexError` from an empty `parent_hashes` list). This
batch's commit population (small, personal, less curated) reached a code path five
mature-OSS commits never touched; a benchmark that's supposed to generalize across
repository types cannot silently fail on any repo whose sampled commits happen to
include its own root commit.

**Cross-batch note, resolving Batch 1's open question:** Batch 1's observations
flagged that `shape.*` commit-level claims might only look like boilerplate *because*
that batch was deliberately narrow/well-hygiened, and suggested checking a messier
population before concluding they're low-value in general. This batch answers that:
`shape.heterogeneous_categories`/`touches_config` genuinely differentiated `3f2615e`
(a real 9-file, multi-category commit) from every other commit in both batches so far
— confirming those claims are not inherently low-value, just under-exercised by a
narrow-commit-shape population. The `shape.*` module should not be deprioritized on
Batch 1's evidence alone.

---

## Batch 3 — Company/Internal Repositories

`tcx_nogrunt-1` (used for Batch 2) was deliberately not reused here — via real
authenticated access to the same private GitHub org
(`Nogrunt-Collaborations-Private-limited`), four other genuine internal company
repositories were discovered and used instead: `react-app` (a React/JS frontend, real
PR-merge workflow visible in its history), `api_nogrunt-1` (a Java Spring-style
backend), and `next-auto-llm-1` (a Next.js/TypeScript frontend). Five real commits
from real, distinct authors (`RKSriNidhi`, `Subhamkejriwal`, `kgc-exargen`) across
these three repos — deliberately **not** Python-heavy, since a real company's
codebase spanning frontend/backend/multiple languages is exactly the population this
project's Python-only semantic layer (ADR-005) was honest about not covering, and
this batch was the first chance to see what that actually costs in practice, at
scale, rather than as a single caveat in one commit.

---

### Commit 1 — `react-app` `8c9f2df1` — "fix: stop repeated analyze API calls on failure"

**What actually changed:** A React Query hook (`useAnalyzeReportQuery.js`) gained two
lines disabling automatic retry behavior after a failed analyze-report API call,
preventing the same failing request from firing repeatedly. One file, JS, no test
touched (this repo has no visible test infrastructure in its file listing either).

## Commit Overview

- Overall usefulness of the reasoning: **3/10**
- Would this help you review the commit faster? **No**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape
- Same boilerplate triad as every prior commit in both batches — correct, generic.
- Rating: **3/10**

### Historical Risk
- No claims fired.
- Rating: **2/10**

### Reach
- `reach.large_neighborhood` fired for the one changed file — plausible, unremarkable.
- Rating: **3/10**

### Verification Coverage
- `verification.no_test_files_changed` — correct, and here genuinely more informative
  than in the Python repos, since it's the *only* verification-related signal
  available at all (see Contract Stability below for why).
- Rating: **5/10**

### Contract Stability
- **Nothing fired — not because nothing changed, but because JavaScript is entirely
  outside this module's declared scope.** The gap explicitly says so
  (`cannot_assess_contract`, `missing: ["semantic_analysis"]`), which is the honest,
  correct behavior — but it means this module contributes literally zero information
  for this entire repository, not just this commit.
- Rating: **1/10** (correct behavior, zero coverage)

## Overall Reasoning Quality

1. **Genuinely valuable:** none.
2. **Technically correct but not useful:** the commit-shape triad, `reach.
   large_neighborhood`.
3. **Naturally ignored:** the gap itself, once its cause (non-Python) is understood.
4. **Repeated/redundant:** same pattern as every commit in this batch — see the
   batch-level synthesis for why this is the dominant finding here.
5. **Misleading or overconfident:** no — the gap is honestly and correctly reported,
   not silently omitted.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** everything
`contract_stability` would provide for a Python file — this hook's function
signature, whether `retry` was already a parameter or newly added — is fully knowable
from the JS source, just outside this project's currently-implemented language
coverage (ADR-005 named this trade-off explicitly; this is it materializing on real
data).

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** whether disabling retries entirely (vs. limiting retry count) is the
right tradeoff for this specific failure mode — a product decision, not a git fact.

---

### Commit 2 — `react-app` `c02e2c29` — "fix: prevent infinite render loop in ConfigAiDialog blocking navigation"

**What actually changed:** Two real React-specific fixes to avoid unstable
references triggering unnecessary re-renders: `setConfigAiRows([])` only fires when
the array isn't already empty (avoiding a state update that was itself causing the
loop), and a `useQuery`'s `select` now returns a module-level constant empty array
instead of allocating a new one each render. 2 files, JSX + JS, no tests.

## Commit Overview

- Overall usefulness of the reasoning: **3/10**
- Would this help you review the commit faster? **No**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape — Rating: **3/10** (same boilerplate triad)
### Historical Risk — no claims fired. Rating: **2/10**
### Reach — `reach.large_neighborhood` on one of the two files. Rating: **3/10**
### Verification Coverage — `no_test_files_changed`, correct. Rating: **4/10**
### Contract Stability
- Nothing fired, same reason as Commit 1 — and here the miss is arguably more
  costly: this is precisely a "subtle bug in a hook's referential-stability
  contract" case, exactly the kind of thing a `contract_stability`-equivalent module
  for JS/TS would exist to catch, and it's the second commit in a row in this
  repository where that's true.
- Rating: **1/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** none.
2. **Technically correct but not useful:** the usual triad plus `reach`.
3. **Naturally ignored:** the gap, same as Commit 1.
4. **Repeated/redundant:** identical claim shape to Commit 1, again.
5. **Misleading or overconfident:** none.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** a JS/TS
equivalent of `symbol_extractor` would make this entire commit legible to
`contract_stability` — the underlying AST facts (function bodies changed, a new
module-level constant added, no exported signature changed) are exactly as
extractable from a JS AST as from a Python one; this project simply hasn't built that
extractor yet.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** confirming the infinite loop is actually fixed requires either running
the app or trusting the author's testing — no git-derived fact can verify a runtime
behavior claim.

---

### Commit 3 — `api_nogrunt-1` `8790717` — "Fix: Cost reducing method for test case generation API"

**What actually changed:** Two real, meaningfully different changes in one commit:
`Endpoint.java`, a JPA-mapped persistence entity, gains a new `@Lob`/`LONGTEXT`
`context` field — a real, live database schema change, conceptually identical to
Batch 2's `TcxTestCase`→`DetailedTestCase` migration but in Java/Hibernate instead of
SQLAlchemy. `CollectionGeneratorFlat.java` underwent a much larger rewrite: 489 lines
removed against 139 added — consistent with the "cost reducing" framing, a real
algorithmic simplification. 2 files, Java, no tests touched.

## Commit Overview

- Overall usefulness of the reasoning: **3/10**
- Would this help you review the commit faster? **No**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape — same boilerplate triad. Rating: **3/10**
### Historical Risk
- `history.hot_file` fired on `TestCaseService.java` — wait, note this file wasn't
  even one of the two changed in this specific commit's diff; it appears here because
  it's the *third* file returned in the commit's own file list from `git show`'s
  full scope (the diff view above was filtered to the two files discussed for
  brevity) — a reminder that `file_history`/`reach` operate on the full,
  unfiltered `change_set`, correctly, even when a human evaluator's own attention
  narrows to the two most interesting files.
- Rating: **4/10**

### Reach
- `reach.corroborated_wide_reach` fired on `TestCaseService.java` — genuinely
  meaningful: both `co_change` and `local_module_context` independently agree this is
  a heavily-coupled file, correctly flagging it as worth extra attention even though
  it wasn't the file this evaluation initially focused on.
- Rating: **6/10** — the strongest non-boilerplate signal in this batch.

### Verification Coverage — `no_test_files_changed`, correct, unremarkable. Rating: **4/10**

### Contract Stability
- **The most consequential miss across all three batches so far.** A new `@Lob
  LONGTEXT` column added to a live JPA entity is a genuine, live database schema
  change — precisely the kind of fact `contract_stability` exists to surface (Batch
  2's `TcxTestCase` removal was rated one of the best findings in that batch for
  exactly this reason) — and it is completely invisible here purely because the
  entity is written in Java, not Python. The tool's own architecture makes this
  miss entirely predictable (ADR-005), but seeing a real, live schema change go
  completely unflagged in a real company codebase is the starkest demonstration yet
  of what that architectural choice actually costs.
- Rating: **1/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** `reach.corroborated_wide_reach` on `TestCaseService.java`
   — correctly surfaced a high-stakes file the commit's own diff didn't obviously
   point to.
2. **Technically correct but not useful:** the commit-shape triad.
3. **Naturally ignored:** none — this commit's silence is a real cost, not noise.
4. **Repeated/redundant:** the recurring `cannot_assess_contract` gap.
5. **Misleading or overconfident:** the complete absence of any schema-change signal
   here risks the most serious form of false reassurance in this whole evaluation
   series — a live database migration with zero flags anywhere in the output.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** a Java-aware
semantic extractor (or even a narrower, JPA-annotation-specific detector) would catch
exactly this: a new `@Column`/`@Lob`-annotated field appearing on an existing
`@Entity`-annotated class is a mechanically detectable fact, language-specific but
not otherwise different in kind from what `symbol_extractor` already does for Python.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** whether the "cost reducing" rewrite of `CollectionGeneratorFlat.java`
preserves the original method's actual output for every input — a correctness
question needing either tests (none exist) or a human who understands the original
489 lines well enough to verify the replacement.

---

### Commit 4 — `next-auto-llm-1` `a21fd05` — "implemented edit testcase api"

**What actually changed:** A Next.js page component (`automation/page.tsx`) gained
new logic for editing an existing test case in place, roughly 26 new/changed lines
inside the component. TSX, one file, no tests.

## Commit Overview

- Overall usefulness of the reasoning: **2/10**
- Would this help you review the commit faster? **No**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape — boilerplate triad. Rating: **3/10**
### Historical Risk — no claims. Rating: **2/10**
### Reach — `reach.isolated_module` (this file's directory has no other tracked
siblings) — correct, mildly useful negative signal. Rating: **3/10**
### Verification Coverage — `no_test_files_changed`. Rating: **4/10**
### Contract Stability — nothing, same non-Python gap. Rating: **1/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** none.
2. **Technically correct but not useful:** the usual triad, `reach.isolated_module`.
3. **Naturally ignored:** the gap.
4. **Repeated/redundant:** identical pattern to every commit in this batch.
5. **Misleading or overconfident:** none.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** whether a new
exported function/component prop was added to this page — same TS/TSX-AST gap as
Commits 1-2.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** whether the edit flow correctly round-trips through whatever backend
API it calls — requires either running the app or reading the (separate, not
included in this diff) backend endpoint.

---

### Commit 5 — `next-auto-llm-1` `ae866e2` — "getting testcases from db"

**What actually changed:** The same `automation/page.tsx` file, one commit earlier,
gained ~27 changed lines wiring the page up to fetch test cases from a database
rather than (presumably) local/mock state. TSX, one file, no tests.

## Commit Overview

- Overall usefulness of the reasoning: **2/10**
- Would this help you review the commit faster? **No**
- Would you keep this reasoning visible in a real review tool? **Partially**

## Module Evaluation

### Change Shape — boilerplate triad. Rating: **3/10**
### Historical Risk — no claims. Rating: **2/10**
### Reach — `reach.isolated_module`, same as Commit 4 (same file). Rating: **3/10**
### Verification Coverage — `no_test_files_changed`. Rating: **4/10**
### Contract Stability — nothing. Rating: **1/10**

## Overall Reasoning Quality

1. **Genuinely valuable:** none.
2. **Technically correct but not useful:** the usual triad.
3. **Naturally ignored:** the gap.
4. **Repeated/redundant:** byte-for-byte identical claim shape to Commit 4, despite
   being a materially different change (data-fetching wiring vs. edit-flow logic) to
   the same file — the same "reasoning output can't distinguish two real, different
   commits" pattern already found in Batch 2 (`tcx_nogrunt-1`'s `6a38e90`/`3944968`),
   now confirmed a third time, in a third, unrelated repository.
5. **Misleading or overconfident:** none.

## Missing Reasoning

**Theoretically obtainable through future deterministic analysis:** same as Commit 4.

**Fundamentally requiring runtime behavior, business context, PR discussion, or human
knowledge:** whether the DB-fetch replaces or supplements the prior data source —
only knowable by reading the actual diff content, not from any evidence category
this pipeline collects regardless of language.

---

## Batch 3 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| react-app `8c9f2df1` (retry fix) | 3/10 | No | Partially |
| react-app `c02e2c29` (render loop) | 3/10 | No | Partially |
| api_nogrunt-1 `8790717` (Java schema+refactor) | 3/10 | No | Partially |
| next-auto-llm-1 `a21fd05` (edit testcase) | 2/10 | No | Partially |
| next-auto-llm-1 `ae866e2` (db fetch) | 2/10 | No | Partially |

## Final Verdict — Batch 3

**Top 3 most valuable reasoning outputs across the batch:**
1. `reach.corroborated_wide_reach` on `TestCaseService.java` — the one genuinely
   valuable, non-boilerplate signal in the entire batch, and proof the `reach`
   module's corroboration mechanism works identically well on Java as on Python,
   since it never touches `semantic_analysis` at all.
2. The `cannot_assess_contract` gaps themselves — every one correctly, honestly
   reported rather than silently omitted, which is real architectural value even
   though the underlying coverage is zero.
3. `verification.no_test_files_changed` — modest but consistently correct across
   every commit, and the only test-related signal available at all once
   `semantic_analysis`-dependent claims are unavailable.

**Top 3 weakest reasoning outputs across the batch:**
1. **Total silence on `api_nogrunt-1`'s live database schema change** (a new `@Lob`
   column on a JPA entity) — the single most consequential missed signal across all
   three batches, precisely because a schema change is exactly the kind of thing
   this reasoning layer is supposed to be good at catching, and it's invisible here
   purely due to language, not any flaw in the reasoning itself.
2. **Zero `contract_stability` output across the entire batch** — five real
   commits, five real code changes, zero symbol-level claims, because none of the
   five is Python. This is the single largest, cleanest demonstration of ADR-005's
   named trade-off materializing at real scale.
3. **Identical reasoning output for two materially different commits to the same
   file** (`next-auto-llm-1`'s `a21fd05`/`ae866e2`) — the same "can't distinguish
   two real changes" pattern from Batch 2, now confirmed a third time.

**One concrete improvement to prioritize, given this batch specifically:** this is
the first batch where the highest-leverage next step is not a refinement to an
existing module, but the *coverage boundary itself* — a second language for
`src/semantic/` (JS/TS being the most immediately valuable, given two of three
repos in this batch are JS/TS-heavy, and every real "company" is more likely to be
polyglot than the Python-only benchmark repos used in Batches 1-2). ADR-005 already
designed for this explicitly (`src/semantic/javascript/` as a sibling package,
feeding the same `semantic_analysis` shape) — this batch is the first concrete,
real-data argument for actually prioritizing it over further single-language
refinement.

## Cross-batch note: the Python-only ceiling, now measured, not just named

Batches 1 and 2 were both effectively 100% Python samples (mature OSS repos and
personal/company Python tooling), so `contract_stability`'s real ceiling was never
visible — it looked merely "sometimes silent on body-only changes." Batch 3, drawn
from a genuinely representative slice of real company repositories, shows the
ceiling is much larger than that: an entire module (`contract_stability`) and half of
another (`verification_coverage`'s `public_change_without_tests`) can go completely
unused for 100% of a batch, not occasionally within an otherwise-covered commit. Nine
of ten `semantic_analysis`-dependent claim opportunities across the batch's changed
files produced a `not_collected`-equivalent gap rather than a claim. This doesn't
contradict anything ADR-005 said — it was named as a permanent, honest limitation
there — but this is the first time it's been *measured* against real, representative
company data rather than stated as a caveat.

---

## Batch 4 — Active Startup Repositories

Three real, current, fast-moving, well-funded startup repositories, all Python-heavy
(deliberately, to get a fresh read on genuine "rapid change" characteristics rather
than re-measuring the language-coverage ceiling Batch 3 already established
thoroughly): `langchain-ai/langchain` (AI agent framework, ~3000 commits captured in
a shallow clone), `crewAIInc/crewAI` (AI agent orchestration, young enough that a
3000-commit shallow clone captured its actual root commit), and `PostHog/posthog`
(product analytics, similarly high-velocity). Five real, non-release, non-merge
commits — two features and one fix each from LangChain/crewAI, one fix from PostHog
— all genuinely well-tested, well-engineered commits, not curated for effect.

---

### Commit 1 — `langchain-ai/langchain` `0a3bde64` — "fix(langchain): only retry retryable exceptions in `ToolRetryMiddleware`"

**What actually changed:** In two near-identical code paths inside
`ToolRetryMiddleware` (sync and async), a non-retryable exception previously called
`self._handle_failure(...)` and returned a handled result; now it bare `raise`s
instead, letting the exception propagate — a real, meaningful behavior change (errors
that shouldn't be silently converted to a tool message now surface as real
exceptions). Both call sites are inside existing methods whose signatures never
change. 2 files: the middleware itself and its test file, both real, well-tested.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape (3/10):** the usual boilerplate triad — correct, generic.
**Historical Risk:** no claims fired. **(2/10)**
**Reach:** `reach.large_neighborhood` on both files, unremarkable. **(3/10)**
**Verification Coverage:** `test_files_changed`, correct, unremarkable. **(4/10)**
**Contract Stability:**
- **Zero claims on `tool_retry.py` itself** — the fourth consecutive batch to show
  this exact pattern on a real, meaningful, body-only fix. Every claim that did fire
  is on the test file's own new/modified test functions and closures
  (`test_tool_retry_non_retryable_exception_reraises`, its nested
  `runtime_error_tool`, etc.) — the by-now-familiar "new symbol reads as
  signature-changed" artifact, not real production signal.
- Rating: **1/10**

## Overall Reasoning Quality
1. Valuable: none. 2. Correct-not-useful: the triad. 3. Ignored: the test-noise
claims. 4. Redundant: same pattern as every body-only commit in every prior batch.
5. Misleading: the silence on `tool_retry.py`'s real semantic change (swallow →
re-raise) risks reading as "nothing changed here," when the actual error-handling
contract of the whole middleware changed.

## Missing Reasoning
**Obtainable:** body-only change detection (now the single most repeatedly-confirmed
recommendation across all four batches). **Fundamental:** whether re-raising instead
of handling breaks any downstream caller relying on the old handled-failure
behavior — a real compatibility question needing usage data this pipeline doesn't have.

---

### Commit 2 — `langchain-ai/langchain` `ceb1e4e6` — "feat(langchain): `ToolErrorMiddleware`"

**What actually changed:** A brand-new middleware class (`ToolErrorMiddleware`, with
`__init__`, `wrap_tool_call`, `awrap_tool_call`) added in a new file, plus a matching
new test file and one import added to the middleware package's `__init__.py`. A real,
substantial new public feature. 3 files.

## Commit Overview
- Overall usefulness: **4/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape (3/10):** boilerplate triad.
**Historical Risk:** `history.first_appearance` correctly fired for both new files. **(4/10)**
**Reach:** `reach.corroborated_wide_reach` fired on `middleware/__init__.py` — real
and meaningful: this package-level file genuinely has both high historical co-change
and a large neighborhood, correctly flagged as a file worth extra attention whenever
it's touched, which it was here (one import line). **(6/10)**
**Verification Coverage:** `test_files_changed`, correct. **(4/10)**
**Contract Stability:**
- `ToolErrorMiddleware.__init__`/`wrap_tool_call`/`awrap_tool_call` all correctly
  show `public_signature_changed` — but, as established since Batch 1, this is the
  new-symbol artifact (old signature `None`), not evidence of an *existing* contract
  changing. It's directionally correct here in spirit (a new public API surface was
  added, which is worth knowing) but for the same structural reason as an artifact,
  not because the module distinguishes "new" from "changed."
- Rating: **5/10** — correct information, arrived at by the artifact mechanism
  rather than deliberate design, same caveat as every batch so far.

## Overall Reasoning Quality
1. Valuable: `reach.corroborated_wide_reach` on the shared `__init__.py`.
2. Correct-not-useful: the triad, `history.first_appearance`.
3. Ignored: none outright.
4. Redundant: the new-symbol artifact, again.
5. Misleading: none directly, though a reader can't tell from the claims alone that
   these are new-symbol artifacts rather than a deliberately-designed "new public API"
   detector.

## Missing Reasoning
**Obtainable:** a dedicated `contract.new_public_api_added` claim, distinct from
`public_signature_changed`, so a new feature reads differently from a breaking
change to an existing one. **Fundamental:** whether this middleware's error-handling
semantics compose correctly with `ToolRetryMiddleware` from Commit 1 (both middlewares
touch tool-call error handling) — an integration question needing runtime behavior,
not git facts.

---

### Commit 3 — `crewAIInc/crewAI` `3bb87532` — "fix: dispatch execution_end hook on failed crew and flow executions"

**What actually changed:** A real, substantial bug fix: `execution_end` hooks
previously only fired after successful kickoffs, so consumers never learned about
failed runs. Existing methods in `crew.py`, `crews/utils.py`, and
`flow/runtime/__init__.py` were modified to dispatch the hook on failure paths too,
plus a documentation page and a large new conformance test file. 6 files total.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate triad, plus correctly fired `touches_documentation`
(the new `.mdx` doc page) — a small, real positive. **(4/10)**
**Historical Risk:** `history.hot_file` correctly fired on `crew.py` — real signal,
this is genuinely core, frequently-touched code. **(5/10)**
**Reach:** `reach.high_historical_coupling` fired on all three modified production
files — plausible and consistent. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct. **(4/10)**
**Contract Stability:**
- **Zero claims on any of the three real, modified production files** — the fix
  itself (existing methods gaining a new hook-dispatch call on failure paths) is
  entirely body-only, the fourth-consecutive-batch confirmation of the dominant
  finding across this whole evaluation series. Every one of the ~20 claims that did
  fire is on the new conformance test file's own test methods and closures. This
  batch produced the single largest volume of test-noise claims seen in any commit
  across all four batches — worth noting as a distinct, scale-specific
  characteristic (see the batch synthesis).
- Rating: **1/10**

## Overall Reasoning Quality
1. Valuable: `history.hot_file` on `crew.py`, `shape.touches_documentation`.
2. Correct-not-useful: `reach` on the three production files (true, generic).
3. Ignored: the ~20 test-noise symbol claims, once recognized as artifacts.
4. Redundant: body-only blind spot, again, on the actual bug fix.
5. Misleading: the sheer *volume* of symbol claims (20, all noise) next to zero
   claims on the three files that actually matter could read, at a glance, as "lots
   of contract activity here," when the opposite is true — the real change is
   invisible and the visible claims are all incidental.

## Missing Reasoning
**Obtainable:** body-only change detection, same recommendation, now backed by every
single batch run so far. **Fundamental:** whether dispatching `execution_end` on
failure paths could cause double-dispatch in some edge case (partial failure, retry)
— a correctness question the new conformance tests exist specifically to answer, but
answering it requires running them, not reading evidence about them.

---

### Commit 4 — `crewAIInc/crewAI` `a194f386` — "feat: wire execution-boundary interception points"

**What actually changed:** A real, substantial new feature: typed interception
contexts (`ExecutionStartContext`, `InputContext`, `OutputContext`,
`ExecutionEndContext`, plus a base `InterceptionContext`) added in a new file, wired
into both crew and flow execution via `dispatch.py`/`crew.py`/`utils.py`/
`flow/runtime/__init__.py`, with a large new test file. 6 files.

## Commit Overview
- Overall usefulness: **4/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** boilerplate triad. **(3/10)**
**Historical Risk:** `history.first_appearance` correctly fired for the new
`contexts.py` and test file. **(4/10)**
**Reach:** `reach.high_historical_coupling` on `crew.py`/`flow/runtime/__init__.py`,
consistent with Commit 3's finding on the same files one week earlier — a real,
useful cross-commit consistency check a human reviewer would find reassuring.
**(5/10)**
**Verification Coverage:** `test_files_changed`. **(4/10)**
**Contract Stability:**
- All five new context classes in `contexts.py` correctly show only
  `contract.decorator_changed`, never `public_signature_changed` — a clean, third
  confirmation (after Batch 2's `DetailedTestCase` and Batch 3's absence of any class
  data at all) that new *classes* never trigger the signature-based artifact, only
  the decorator-based one, since `symbol_extractor` never records a class's
  signature. This is a real, structural, consistent property, not a fluke.
- Every other claim is test-file noise, same pattern as every prior commit.
- Rating: **4/10** — the decorator-only signal on the new context classes is at
  least a clean, honest "these are new decorated classes" fact, better than the
  misleading new-function artifact.

## Overall Reasoning Quality
1. Valuable: `reach.high_historical_coupling` consistency with Commit 3.
2. Correct-not-useful: the triad, `history.first_appearance`.
3. Ignored: test-noise claims.
4. Redundant: same artifacts as every commit in this batch.
5. Misleading: none new.

## Missing Reasoning
**Obtainable:** same recommendations as Commits 1 and 3. **Fundamental:** whether the
new interception points cover every actual execution path (crew *and* flow, sync
*and* async) — the commit message's own follow-up fix (Commit 3, dispatched a week
later) suggests the answer was initially "no," which is exactly the kind of gap no
amount of better git-derived evidence could have caught in advance — it required
someone actually hitting the missing case in practice.

---

### Commit 5 — `PostHog/posthog` `bf1c84d40` — "fix(hogql): guard groups-join prefilter against group-type-name aliases"

**What actually changed:** A real, subtle correctness fix in PostHog's HogQL query
planner. Most importantly: `_outer_events_prefilter(node)` gained a required second
parameter, `_outer_events_prefilter(node, context)` — a genuine signature change to
an existing function — and a new helper `_guarded_events_aliases(context)` was added
to compute per-project group-type-name aliases dynamically instead of relying on a
static frozenset. Both symbols are private (leading underscore). One call site inside
`join_with_group_n_table` (an existing, unchanged-signature function) was updated to
pass the new argument — a body-only change to *that* function. 2 files.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate triad. **(3/10)**
**Historical Risk:** no claims fired. **(2/10)**
**Reach:** `reach.large_neighborhood` on both files, unremarkable. **(3/10)**
**Verification Coverage:** `test_files_changed`. **(4/10)**
**Contract Stability:**
- **Zero claims on `groups.py` — and this is a genuinely new, distinct kind of miss
  from every prior batch's finding.** `_outer_events_prefilter` gained a real,
  meaningful new required parameter — an actual signature change, correctly detected
  by `semantic_analysis` at the evidence layer (confirmed directly: `signature_changed:
  true` is present in the raw data) — but produces **no claim**, because
  `contract_stability` only emits `public_signature_changed` when
  `visibility == "public"`, and this symbol is private by the leading-underscore
  convention. This is not the body-only blind spot (the signature genuinely changed)
  and not the new-symbol artifact (the symbol already existed) — it's a third,
  distinct gap: **a real internal-contract change to a private helper is invisible by
  design**, because `contract_stability` was scoped to public contracts specifically.
  Whether that scoping choice is correct is a real, debatable tradeoff: private
  helpers are usually pure implementation detail, but in a codebase this size, a
  private function's signature changing still has real, in-repo caller impact — just
  never across a public API boundary.
- Only test-file noise claims fired, same pattern as every other commit.
- Rating: **1/10** — and arguably the most instructive miss in this whole batch,
  since it's the first time a real signature change was *correctly detected as
  evidence* but *deliberately excluded as a claim* by design, rather than simply not
  detected at all.

## Overall Reasoning Quality
1. Valuable: none.
2. Correct-not-useful: the triad.
3. Ignored: test-file noise.
4. Redundant: none new.
5. Misleading: the complete silence on a real signature change that the evidence
   layer *did* capture is the most misleading-by-omission result in this batch —
   worse than simply lacking the data, since the data existed and was deliberately
   not surfaced.

## Missing Reasoning
**Obtainable:** either widen `contract_stability` to also report private-symbol
signature changes (perhaps as a lower-severity or differently-named claim,
`contract.internal_signature_changed`, preserving the public/private distinction
rather than collapsing it) — this is purely a policy choice about an already-
computed fact, no new extraction needed. **Fundamental:** whether every call site of
`_outer_events_prefilter` was updated (the diff shows one; whether others exist
elsewhere in the codebase requires a real call-graph this project has explicitly
never built).

---

## Batch 4 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| langchain `0a3bde64` (tool retry fix) | 3/10 | No | Partially |
| langchain `ceb1e4e6` (ToolErrorMiddleware) | 4/10 | Partially | Yes |
| crewai `3bb87532` (execution_end on failure) | 3/10 | No | Partially |
| crewai `a194f386` (interception points) | 4/10 | Partially | Yes |
| posthog `bf1c84d40` (groups-join prefilter) | 3/10 | No | Partially |

## Final Verdict — Batch 4

**Top 3 most valuable reasoning outputs:**
1. `reach.corroborated_wide_reach`/`high_historical_coupling` consistency across
   `crewai`'s two related commits (Commits 3-4) on the same files a week apart — a
   real, cross-commit corroboration a human reviewer would find genuinely reassuring.
2. `history.hot_file` on `crew.py` — correctly flagged real, core, high-stakes code.
3. The decorator-only signal on new context classes (Commit 4) — a clean, honest,
   non-misleading fact, in contrast to the noisier new-function artifact.

**Top 3 weakest reasoning outputs:**
1. **Total silence on `_outer_events_prefilter`'s real signature change** — the
   first case across four batches where the evidence layer correctly captured a
   real fact and the reasoning layer deliberately excluded it by design (the
   public-only scoping choice), rather than simply lacking coverage.
2. **The largest test-noise volume seen in any batch** (crewai `3bb87532`: ~20
   symbol claims, all artifacts, zero on the three real production files) — the
   body-only blind spot's cost scales directly with how test-heavy a commit is, and
   these startups write a lot of tests per feature.
3. Zero contract signal on any of the three real body-only production fixes
   (Commits 1, 3, 5) — the fourth consecutive batch confirming this as the
   single most consistent finding across the entire evaluation series.

**One concrete improvement to prioritize, given this batch specifically:** extend
`contract_stability` to report private-symbol signature/removal changes as a
distinct, lower-severity claim rather than excluding them entirely. This is a
smaller, more surgical fix than either of the two structural recommendations already
carried from Batches 1-3 (body-only detection, a second language) — it requires no
new extraction, only a policy change over data `semantic_analysis` already computes
— and this batch is the first concrete evidence it matters: a real, required
parameter added to a real, actively-called private helper, invisible end to end.

## Cross-batch note: test-churn volume amplifies a known blind spot

Every batch so far has confirmed the body-only-change blind spot exists; this batch
is the first to show its *cost scales with how test-heavy a commit is*. Well-funded,
fast-moving AI startups apparently write substantially more test code per feature
than the personal/small-company repos in Batches 2-3 — Commit 3 alone produced
roughly as many test-noise symbol claims as an entire commit's evidence bundle in
earlier batches. The blind spot isn't new, but its *volume* in a genuinely
high-test-discipline, rapidly-iterating population is larger than any prior batch
demonstrated, which matters directly for how urgently the "distinguish new symbols
from real contract changes" fix (carried since Batch 1) should be prioritized.

---

## Batch 5 — Infrastructure / DevOps

Five real, current, non-Python commits chosen specifically to stress-test the one
part of this pipeline built exactly for this domain — `file_classifier`'s
`Infrastructure`/`CI-CD`/`Configuration` categories — against genuinely
representative content rather than an incidental slice of an application repo:
`terraform-aws-modules/terraform-aws-eks` (pure Terraform/HCL),
`prometheus-community/helm-charts` (real Helm charts, heavy YAML+templating),
`actions/starter-workflows` (GitHub's own official workflow templates), and
`docker/awesome-compose` (real Dockerfiles and Compose files, two commits). As
expected from Batches 3-4, `contract_stability` and the semantic half of
`verification_coverage` produce nothing anywhere in this batch (zero Python) — that
finding is not re-derived at length here; this batch's real value is in what
`file_classifier` gets right and wrong on its own home turf.

---

### Commit 1 — `terraform-aws-modules/terraform-aws-eks` `64558a4` — "feat: Support cluster `control_plane_egress_mode`"

**What actually changed:** A real Terraform module feature: a new input variable
added to `variables.tf`, `main.tf` updated to use it (11 lines), and a version
constraint bump propagated identically across 34 paired `README.md`/`versions.tf`
files spanning every example/module/test in the repo. 36 files total.

## Commit Overview
- Overall usefulness: **5/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** `shape.wide_change` (36 files, correct) and
`shape.heterogeneous_categories` both fired accurately — this is a genuinely wide,
multi-category commit (Infrastructure `.tf` files + Documentation `README.md`s), and
the claims correctly reflect that rather than reading as boilerplate. **(6/10)**
**Historical Risk:** `history.long_dormant_reactivated` fired twice, correctly and
meaningfully — the two `README.md` files that gained 37 new lines each (real content
additions to previously-stable docs) genuinely had been untouched for a long stretch.
**(6/10)**
**Reach:** `reach.high_historical_coupling` on the root `README.md` — plausible for a
widely-used module repo's main entry point. **(4/10)**
**Verification Coverage:** `verification.test_files_changed` — correctly detected,
because Terraform's own native testing convention (a `tests/` directory of test
fixture modules) is picked up by `file_classifier`'s directory-name Test rule, even
though nothing here is a `pytest`-style test. A genuine, correct cross-language
alignment: this project's Test-directory heuristic happens to generalize to
Terraform's own test convention without any Terraform-specific code. **(5/10)**
**Contract Stability:** nothing, no Python. **(N/A)**

## Overall Reasoning Quality
1. **Valuable:** `shape.wide_change`/`heterogeneous_categories` and
   `history.long_dormant_reactivated`, both genuinely earning their keep on a real,
   wide, structurally-varied commit — the clearest positive `shape.*` result since
   Batch 2's `Triple` commit.
2. **Correct-not-useful:** `reach` on the README.
3. **Ignored:** none.
4. **Redundant:** the 34 near-identical `README.md`/`versions.tf` pairs produced 32
   file-level claim sets, most near-identical (`history.hot_file`/`reach`
   repeating) — the exact "wide homogeneous commit, repetitive per-file evidence"
   pattern Batch 1 first flagged (Commits 6/17 there), now confirmed a third time,
   in Terraform instead of CI YAML or deletions.
5. **Misleading:** none — `.tf` correctly classified `Infrastructure` throughout.

## Missing Reasoning
**Obtainable:** whether the new `control_plane_egress_mode` variable has a sensible
default and validated allowed values is visible in the raw diff but not surfaced as
any claim — a Terraform-HCL-aware semantic layer (parsing `variable` blocks the way
`symbol_extractor` parses Python `def`s) could recognize "a new module input was
added" as a data-contract change, directly analogous to what this project already
does for Python function signatures. **Fundamental:** whether `control_plane_egress_mode`
is the correct AWS API value for this new EKS behavior — requires AWS
domain knowledge, not git facts.

---

### Commit 2 — `prometheus-community/helm-charts` `a292ec61` — "[kube-state-metrics] drop CiliumNetworkPolicy support"

**What actually changed:** A real feature removal: `ciliumnetworkpolicy.yaml` (a
Kubernetes NetworkPolicy template, Cilium-specific) deleted outright, its associated
`values.yaml` configuration block removed, `networkpolicy.yaml` adjusted, and
`Chart.yaml`'s version bumped. 5 files.

## Commit Overview
- Overall usefulness: **4/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** boilerplate-ish triad, though `shape.touches_config` correctly
reflects real content (all 4 non-doc files are Configuration). **(4/10)**
**Historical Risk:** `history.long_dormant_reactivated` fired on the deleted
template — a real, meaningful fact: this feature hadn't been touched in a long time
before being removed. **(5/10)**
**Reach:** `reach.large_neighborhood` on the two template files — plausible. **(3/10)**
**Verification Coverage:** `no_test_files_changed` — correct, and notably this repo
has no unit-test-style verification for chart templates at all (Helm's own testing
story is largely external, via `helm template`/`helm lint`/CI). **(4/10)**

## Overall Reasoning Quality
1. **Valuable:** `history.long_dormant_reactivated` correctly framing this as
   removing long-settled, not actively-iterated, functionality.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** **a real, concrete classification gap, worth naming precisely.**
   `ciliumnetworkpolicy.yaml`/`networkpolicy.yaml`/`values.yaml` all classify
   `Configuration` — technically correct per the current rules (generic `.yaml`
   extension match), but this collapses "a Kubernetes manifest template defining a
   real network-security policy" into the same bucket as any incidental lint config
   or editor setting. `file_classifier`'s `Infrastructure` category currently
   recognizes `Dockerfile`/`docker-compose`/`.tf` by name/extension, but has no
   concept of a Helm chart's `templates/` directory or Kubernetes manifest shape at
   all — a real, previously undocumented gap, found because this batch is the first
   to sample content from this category's actual domain.

## Missing Reasoning
**Obtainable:** recognizing a file under a chart's `templates/` directory (or
containing a K8s `kind:`/`apiVersion:` structure) as `Infrastructure` rather than
generic `Configuration` — a deterministic, path/content-shape rule, not a heuristic,
consistent with how `Dependency`/`Infrastructure` already work by name-matching.
**Fundamental:** whether any real cluster currently relies on
`ciliumnetworkpolicy.yaml`'s existence — an operational deployment-topology question
no git fact can answer.

---

### Commit 3 — `actions/starter-workflows` `d0d2974` — "Name property on all workflows"

**What actually changed:** A `name:` frontmatter property added to 7 GitHub
"agentic" starter-workflow template files — a real, deliberate, wide, homogeneous
edit (one line added, identically, across all 7).

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** `shape.narrow_change` (7 files, under the 10-file threshold) and
`shape.homogeneous_categories` both fired — technically correct, but see below for
why "homogeneous" is misleading here specifically. **(3/10)**
**Historical Risk/Reach:** no claims fired for any of the 7 files. **(2/10)**
**Verification Coverage:** `no_test_files_changed`, correct, unremarkable. **(3/10)**

## Overall Reasoning Quality
1. **Valuable:** none.
2. **Correct-not-useful:** the triad.
3. **Ignored:** none distinctly.
4. **Redundant:** none new.
5. **Misleading — a second, independent instance of a pattern Batch 2 first found.**
   All 7 files classify `Documentation` purely because of their `.md` extension —
   but these are GitHub's own "agentic" starter-workflow *definitions* (workflow
   configuration authored in Markdown-with-frontmatter, an emerging format in the
   Actions ecosystem), not prose documentation. `shape.homogeneous_categories`
   is technically true (all 7 really are one category) but that category is wrong,
   the same root cause as Batch 2's `test_cases.txt` files being classified `Test`
   by name pattern while actually being domain data — an extension/name signal
   correctly matched, while the file's real *purpose* diverges from what that
   signal conventionally implies. Two independent hits, in unrelated domains,
   is a stronger argument this is systemic than either alone.

## Missing Reasoning
**Obtainable:** nothing about content-vs-extension mismatches is solvable by adding
more name rules — this specific case would need recognizing the file's actual
internal structure (YAML frontmatter with workflow-specific keys) rather than
trusting `.md` alone, a genuinely harder, more content-aware classification this
project has so far deliberately avoided in favor of simple, explainable rules.
**Fundamental:** whether every one of the 7 workflows now needs its `name` for a
specific GitHub Actions UI reason, or just consistency — a product/platform
decision, not a git fact.

---

### Commit 4 — `docker/awesome-compose` `662dfc0` — "ci: add ignore-scripts to Node package manager config"

**What actually changed:** A real, wide security-hardening commit: 10 different
sample projects' `Dockerfile`s each gained the same 2-line `RUN` addition disabling
npm/yarn install scripts (a real supply-chain-security mitigation), plus root-level
`.npmrc`/`.yarnrc.yml` configuration. 12 files.

## Commit Overview
- Overall usefulness: **5/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** `shape.wide_change` (12 files, correct), `shape.
heterogeneous_categories` (Infrastructure + Configuration + Unknown), and
`shape.low_extraction_confidence` all fired accurately — a genuinely
well-differentiated read of a real, wide commit. **(6/10)**
**Historical Risk:** `history.first_appearance` correctly fired for the two brand-new
root config files; `history.long_dormant_reactivated` fired for at least one
long-stable Dockerfile being touched for a security fix — both real, meaningful.
**(6/10)**
**Reach:** `reach.no_historical_coupling` correctly, honestly empty for the new
files. **(3/10)**
**Verification Coverage:** `no_test_files_changed`, correct. **(3/10)**

## Overall Reasoning Quality
1. **Valuable:** the full `shape.*`/`historical_risk` combination — this is, along
   with Commit 1, one of the two strongest non-Python results across this entire
   evaluation series, precisely because the commit is genuinely wide and varied.
2. **Correct-not-useful:** `reach`.
3. **Ignored:** none.
4. **Redundant:** the 10 near-identical Dockerfile edits produced 10 near-identical
   per-file claim sets — the wide-homogeneous-commit pattern again, now on real
   Dockerfiles specifically.
5. **Misleading:** `.npmrc` correctly classified `Unknown` (no recognized extension
   or name) and correctly surfaced via `shape.low_extraction_confidence` rather than
   silently dropped — the honest, correct behavior, not a gap.

## Missing Reasoning
**Obtainable:** recognizing that the *same* two-line pattern was added to all 10
Dockerfiles (a textual/structural diff-similarity check across files in one commit)
would let this render as one summarized fact instead of 10 repeated blocks — the
same "wide homogeneous commit" recommendation carried since Batch 1, now with its
clearest, most literal real-world instance (identical lines, 10 files, one commit).
**Fundamental:** whether disabling install scripts breaks any of these 10 sample
apps' actual build process — requires running each one, not a git fact.

---

### Commit 5 — `docker/awesome-compose` `fa1788d` — "react-express-mongodb: store mongo data in a volume"

**What actually changed:** A small, focused, real fix: MongoDB's data directory
switched from a bind mount (`./data:/data/db`) to a named Docker volume
(`mongo_data:/data/db`), with the volume declared at the bottom of the file. One
file, `compose.yaml`.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate `shape.narrow_change`/`homogeneous_categories`/
`touches_config`. **(3/10)**
**Historical Risk:** `history.long_dormant_reactivated` fired — plausible, this
sample's compose file hadn't been touched in a while. **(4/10)**
**Reach:** no claims. **(2/10)**
**Verification Coverage:** `no_test_files_changed`. **(3/10)**

## Overall Reasoning Quality
1. **Valuable:** none distinctly.
2. **Correct-not-useful:** the triad, `history.long_dormant_reactivated`.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading — the third, most concrete classification gap in this batch.**
   `react-express-mongodb/compose.yaml` classifies `Configuration`, not
   `Infrastructure` — and unlike Commit 2's Helm gap (no rule attempts to recognize
   K8s manifests at all), this one is narrower and more surprising:
   `file_classifier`'s own `INFRASTRUCTURE_ROOT_FILES` set already explicitly lists
   `"docker-compose.yml"`/`"docker-compose.yaml"` by name — but Docker deprecated
   that naming in favor of plain `compose.yaml`/`compose.yml` some time ago, which is
   exactly the filename this entire real, actively-maintained
   `docker/awesome-compose` repository now uses throughout. Confirmed directly in
   `src/utils/file_classifier.py`: the recognized name set simply never
   caught up to the newer convention. This is the same shape of gap as the
   `.lock`/non-canonical-`requirements.txt` misses found in Batches 1 and 2 — a fixed
   name list not keeping pace with an ecosystem's naming evolution — now confirmed a
   third time, in a third category (`Infrastructure` rather than `Dependency`).

## Missing Reasoning
**Obtainable:** add `compose.yaml`/`compose.yml` (undecorated, no `docker-` prefix)
to `INFRASTRUCTURE_ROOT_FILES` — the most mechanically simple, lowest-risk fix
identified in this entire evaluation series so far: a one-line addition to an
existing, already-correct rule, not a new capability. **Fundamental:** whether the
volume migration preserves existing users' already-persisted Mongo data (a bind mount
switching to a named volume does not automatically migrate prior data) — a real,
practically important deployment-migration question no git fact can answer.

---

## Batch 5 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| terraform-aws-eks `64558a4` (egress mode feature) | 5/10 | Partially | Yes |
| helm-charts `a292ec61` (Cilium policy removal) | 4/10 | Partially | Yes |
| starter-workflows `d0d2974` (name property) | 3/10 | No | Partially |
| awesome-compose `662dfc0` (ignore-scripts hardening) | 5/10 | Partially | Yes |
| awesome-compose `fa1788d` (mongo volume) | 3/10 | No | Partially |

## Final Verdict — Batch 5

**Top 3 most valuable reasoning outputs:**
1. `shape.wide_change`/`heterogeneous_categories` on both wide commits
   (`terraform-aws-eks`, `awesome-compose`'s hardening commit) — the clearest,
   most repeated positive confirmation yet that these claims are genuinely
   discriminating on commits that are actually wide/varied, resolving the
   cross-batch question raised since Batch 1 with two more clean data points.
2. `history.long_dormant_reactivated` firing four times across this batch (more
   than any prior batch) — infra/config files in these repos show a real,
   distinct "long stability, occasional deliberate revisit" lifecycle pattern,
   correctly and repeatedly captured.
3. Correct `Infrastructure` classification for real `.tf` files and real
   `Dockerfile`s — confirms the two rules that already existed work correctly on
   genuinely representative content, not just the synthetic/incidental cases they
   were originally verified against.

**Top 3 weakest reasoning outputs — all genuinely new classification gaps:**
1. **Helm/Kubernetes manifest templates classify as generic `Configuration`**, with
   no `Infrastructure`-category concept of a chart's `templates/` directory or a
   K8s manifest's shape at all — the most structurally significant gap, since it's a
   missing capability, not a missing name.
2. **`compose.yaml`/`compose.yml` (the modern Docker Compose naming) isn't in
   `INFRASTRUCTURE_ROOT_FILES`**, only the deprecated `docker-compose.yml` name is —
   the smallest, most mechanical fix of any gap found across all five batches.
3. **GitHub's Markdown-based "agentic workflow" files classify as `Documentation`**
   by extension alone — a second, independent confirmation (after Batch 2's
   `test_cases.txt`) that extension/name-based classification can't see a file's
   real purpose when it diverges from convention.

**One concrete improvement to prioritize, given this batch specifically:** fix the
`compose.yaml`/`compose.yml` naming gap first — it's a one-line addition to an
already-correct, already-existing rule (unlike the Helm gap, which needs new
capability, or the markdown-workflow gap, which needs content-aware classification
this project has deliberately avoided). The smallest lever, the most direct
real-world impact (this exact naming convention is now the officially recommended
one), and zero risk of the kind of fuzzy-matching this project has stayed away from
elsewhere.

## Cross-batch note: infra/DevOps content validates `file_classifier`'s original design, with real gaps at its edges

This is the first batch to sample content from the exact domain
`file_classifier`'s `Infrastructure`/`CI-CD` categories were built for back in
Milestone 4B — and the core rules hold up: real `.tf` files and real `Dockerfile`s
both classify correctly, at scale, across genuinely representative repositories.
The gaps found are all at the *edges* of that original design — ecosystems that
didn't exist or weren't considered when the rules were written (Helm/Kubernetes
manifests, the renamed Compose convention, Markdown-based workflow definitions) —
which is a meaningfully different, more reassuring conclusion than Batch 3's finding
that an entire module category (`contract_stability`) has zero coverage for
non-Python code. Here, the *approach* is validated; specific *rules* just need
updating as the ecosystem evolves, exactly the kind of incremental maintenance this
project's `extraction_confidence` mechanism was designed to surface honestly rather
than silently absorb.

---

## Batch 6 — Library/API Repositories

Five real, current, Python-heavy commits chosen specifically to stress-test
`contract_stability` on the one population it should matter most for: libraries with
large public API surfaces, real semantic-versioning discipline, and real deprecation
processes — `pydantic/pydantic`, `encode/httpx`, `pallets/click`, and
`python-attrs/attrs` (two commits). Each commit was picked because its own message or
changelog explicitly frames it as an API-surface event (an export, a deprecation, a
signature extension), not because it was expected to succeed or fail — the goal was
to see how this reasoning layer performs at exactly the moment its `contract_stability`
module should be most useful.

---

### Commit 1 — `encode/httpx` `ae1b9f6` — "Expose `FunctionAuth` in `__all__`"

**What actually changed:** A real, deliberate public-API-surface change: `FunctionAuth`
(an existing, already-public-looking class) added to two separate `__all__` lists
(`httpx/__init__.py`'s package-level list and `_auth.py`'s module-level list), plus a
real, semver-relevant `CHANGELOG.md` entry under "### Added." No other code changed.

## Commit Overview
- Overall usefulness: **2/10** | Faster review? **No** | Keep visible? **No**

## Module Evaluation

**Change Shape:** boilerplate triad plus `shape.touches_documentation` (the
changelog). **(3/10)**
**Historical Risk/Reach:** `reach.corroborated_wide_reach` fired on both `.py`
files — plausible, unremarkable for core package files. **(3/10)**
**Verification Coverage:** `no_test_files_changed` — technically correct, though
arguably beside the point for a pure `__all__` change (there's no new *behavior* to
test, only a new *export*, which is a distinction this module can't make). **(3/10)**
**Contract Stability:**
- **Zero claims, and this is the single most complete "invisible" result across all
  six batches.** Confirmed directly in the raw evidence: `semantic_analysis` reports
  **zero symbols and zero import changes** for both `httpx/__init__.py` and
  `httpx/_auth.py` — not a body-only miss, not a visibility-scoping miss, a case
  where the evidence layer never even attempted to look, because `__all__ = [...]`
  is a plain module-level assignment statement, and `_build_symbol_table`'s AST
  walker only reacts to `ClassDef`/`FunctionDef`/`AsyncFunctionDef` nodes — it has no
  concept of variable assignments at all. Every prior "invisible" finding in this
  series (body-only changes, private-symbol changes) at least had *something*
  computed as evidence that a reasoning module simply didn't surface; here, nothing
  was computed in the first place.
- Rating: **0/10** — the only true zero of the entire evaluation series, at the
  evidence layer, not just the reasoning layer.

## Overall Reasoning Quality
1. **Valuable:** none.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** the total silence, on a commit whose *entire content and purpose*
   is a deliberate public-API-surface expansion, is the most complete case of
   silence-as-false-reassurance in this whole series.

## Missing Reasoning
**Obtainable:** tracking `__all__` assignments specifically (a deterministic,
narrowly-scoped addition — recognize a module-level `Assign` node whose target is
named exactly `__all__`, diff its list contents the same way imports are already
diffed) would make this entire category of change visible; this is arguably a
*more* important signal for exactly this population (public libraries) than most of
what `contract_stability` already tracks, since `__all__` membership is often the
real, authoritative definition of "public" that a leading-underscore convention only
approximates. **Fundamental:** whether `FunctionAuth` was already being used by
downstream consumers via an unofficial import path before this change (making this
commit a de facto stabilization of existing behavior, not a truly new capability) —
requires ecosystem/usage data, not git facts.

---

### Commit 2 — `pallets/click` `c2ed414` — "Deprecate `isolated_filesystem` and document its limits"

**What actually changed:** A textbook, formal deprecation: `CliRunner.
isolated_filesystem`'s docstring gained a Sphinx `.. deprecated:: 8.5.0` directive and
an extensive `.. warning::` block explaining *why* (thread-safety, prior alternatives
considered and rejected), and its body gained a `warnings.warn(..., DeprecationWarning)`
call. The method's signature is completely unchanged. Real changelog entry, real
extensive documentation updates. No merge commit — this is the actual authoring
commit behind the later PR merge.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate-ish triad; `shape.touches_tests`/`touches_documentation`
both correctly fired, reflecting the real scope of a careful deprecation (tests
updated, docs extended). **(4/10)**
**Historical Risk:** no claims on the real production file (`testing.py`) — the file
apparently didn't cross either threshold. **(3/10)**
**Reach:** `reach.corroborated_wide_reach` on `testing.py` — plausible, this is
genuinely core, widely-depended-on code. **(4/10)**
**Verification Coverage:** `test_files_changed` — correct, though the real content
(a new deprecation test in `test_deprecations.py`) is exactly the kind of thing worth
knowing specifically, not just "yes, tests exist." **(4/10)**
**Contract Stability:**
- **Zero claims on `isolated_filesystem` itself — confirmed directly:**
  `visibility: "public"`, `signature_changed: false`, `docstring_status: "changed"`.
  This is the clearest, most concrete "a formal semver deprecation is entirely
  invisible to reasoning" result in the whole series: the evidence layer correctly
  captured that this public method's documented contract changed (it now carries an
  explicit deprecation notice with a target removal version), and no module
  consumes that fact.
- Every claim that did fire is on test files' own new/modified test functions —
  the now-familiar new-symbol-artifact pattern, seen once more.
- Rating: **1/10**

## Overall Reasoning Quality
1. **Valuable:** none.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** test-file noise.
4. **Redundant:** the new-symbol artifact, again.
5. **Misleading:** the complete silence on a real, formal, semver-relevant
   deprecation is arguably the single most consequential omission across this whole
   evaluation series for a "Library/API" population specifically — deprecation
   *is* the mechanism semantic versioning uses to manage breaking change, and this
   layer cannot see it at all.

## Missing Reasoning
**Obtainable:** a `contract.symbol_deprecated` claim, derived deterministically from
`docstring_status == "changed"` plus a simple, reliable textual signal (a Sphinx
`.. deprecated::` directive, or a `warnings.warn(..., DeprecationWarning)` call
newly appearing in the body) — both are mechanically detectable from already-parsed
AST facts, no new extraction needed, just a new claim type consuming data
`semantic_analysis` already computes. This is the single highest-value, most
directly-motivated recommendation this batch produces. **Fundamental:** whether
Click's own maintainers have a downstream-consumer communication plan for this
deprecation (changelog, migration guide adoption) — a process question, not a git fact.

---

### Commit 3 — `pydantic/pydantic` `2294b528` — "Fix type variable substitution in `__pydantic_extra__` with subclasses"

**What actually changed:** A real, substantive internal typing fix (37 lines) inside
`pydantic/_internal/_fields.py` — a file whose own directory name (`_internal`)
signals it is not part of pydantic's public API at all. A new regression test added.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate triad. **(3/10)**
**Historical Risk:** `history.hot_file` on `_fields.py` — correct, this is genuinely
core internal machinery. **(4/10)**
**Reach:** `reach.corroborated_wide_reach` on `_fields.py` — plausible. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- **Zero symbols reported at all for `_fields.py`** — confirmed directly: the real,
  37-line change produced no entry in `semantic_analysis` whatsoever, meaning the
  modified function(s) had no signature/decorator/docstring difference either — the
  cleanest, simplest instance of the body-only blind spot in this batch (distinct
  from Commit 1's "never even looked" case: here, the symbol table diff genuinely
  ran and correctly found nothing to report, since nothing tracked actually changed).
- Rating: **1/10** — correct behavior given the module's contract, but this is
  `pydantic`'s own internals, exactly the kind of file where a maintainer reviewing
  this change would want to know *which* internal function's logic changed, even
  without a public-facing contract shift.

## Overall Reasoning Quality
1. **Valuable:** `history.hot_file`/`reach.corroborated_wide_reach`, correctly
   flagging this as sensitive core code.
2. **Correct-not-useful:** the triad.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** none directly, though the total symbol-level silence here
   reinforces how large a share of real, substantive fixes in mature libraries are
   purely logic-level.

## Missing Reasoning
**Obtainable:** same body-only-change recommendation carried since Batch 1 — this is
its cleanest, simplest confirmation yet (no visibility nuance, no `__all__`
complication, just a genuine logic change with zero tracked-fact difference).
**Fundamental:** whether this fix could regress a different, currently-untested
generic-subclass configuration — a coverage-completeness question needing either
more tests or deep type-system reasoning, neither available here.

---

### Commit 4 — `python-attrs/attrs` `0f758fe` — "Expose converter as a decorator"

**What actually changed:** A real, substantial new public API surface:
`_CountingAttr.converter` (a decorator-style method) added, letting users register a
converter function via decorator syntax instead of only as a constructor argument.
Real Towncrier changelog fragment (`changelog.d/240.change.md`), real docs update,
54 lines of new tests.

## Commit Overview
- Overall usefulness: **4/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** boilerplate triad plus `touches_documentation`, correctly
reflecting the real doc update. **(4/10)**
**Historical Risk:** `history.hot_file` on `_make.py` — correct, this is attrs' own
core internals file. **(4/10)**
**Reach:** `reach.corroborated_wide_reach` on `_make.py` — plausible. **(4/10)**
**Verification Coverage:** `test_files_changed`. **(3/10)**
**Contract Stability:**
- `_CountingAttr.converter` correctly shows `public_signature_changed` — but, as
  established since Batch 1, this is the new-symbol artifact (old signature `None`),
  not evidence the module distinguishes a genuinely new decorator-style API from any
  other new symbol. Directionally right (a new public capability was added, worth
  flagging) for the familiar structural reason.
- Rating: **5/10** — correct information, same recurring caveat as every batch.

## Overall Reasoning Quality
1. **Valuable:** the new-symbol flag on `_CountingAttr.converter`, even if arrived at
   by artifact rather than design.
2. **Correct-not-useful:** the triad, `history`/`reach`.
3. **Ignored:** test-file noise claims.
4. **Redundant:** the new-symbol artifact, again.
5. **Misleading:** none new.

## Missing Reasoning
**Obtainable:** same `contract.new_public_api_added` recommendation carried since
Batch 4 — distinguishing this from an existing symbol's signature changing would let
a reviewer immediately tell "brand new capability" from "existing contract broke."
**Fundamental:** whether this new decorator syntax should become the *documented*
preferred way to set converters (vs. the existing constructor-argument form) — a
library design/deprecation-roadmap decision, not a git fact.

---

### Commit 5 — `python-attrs/attrs` `48b8611` — "Add instance support to `attrs.fields()`"

**What actually changed:** A real, meaningful semantic change to one of attrs' most
widely-used public functions: `fields()` previously only accepted a class; now it
also accepts an *instance* of an attrs class (resolving to its class automatically).
The docstring was substantially rewritten (updated description, updated `Raises`
text, a new `.. versionchanged:: 26.1.0` line) and the body gained real new
branching logic — but the function's actual signature, `def fields(cls):`, never
changes. A `.pyi` type-stub file is also touched. Real changelog fragment.

## Commit Overview
- Overall usefulness: **2/10** | Faster review? **No** | Keep visible? **No**

## Module Evaluation

**Change Shape:** boilerplate triad, plus `shape.low_extraction_confidence` —
correctly and honestly triggered. **(4/10)**
**Historical Risk:** `history.hot_file` on `_make.py`, and `history.
long_dormant_reactivated` on `__init__.pyi` — both plausible. **(4/10)**
**Reach:** `reach.corroborated_wide_reach` on `_make.py`. **(4/10)**
**Verification Coverage:** `test_files_changed`. **(3/10)**
**Contract Stability:**
- **Zero claims on `fields()` — the second-clearest "semver-relevant contract
  change entirely invisible" result in this batch**, confirmed directly:
  `visibility: "public"`, `signature_changed: false`, `docstring_status: "changed"`.
  This is arguably the single most consequential miss in the whole batch: `fields()`
  is one of attrs' most heavily-used public functions, and its *semantic* contract
  (what kinds of arguments it legitimately accepts) genuinely expanded, fully
  documented in the rewritten docstring and a formal `versionchanged` note — and
  none of it is visible to any reasoning module.
- Rating: **0/10** for the real change; a genuine, separate, honest finding
  elsewhere in this same commit (see below) keeps the file-classification side from
  being a total loss.

## Overall Reasoning Quality
1. **Valuable:** none in `contract_stability`; the correctly-flagged
   `low_extraction_confidence` elsewhere in this commit is a real, if modest, positive.
2. **Correct-not-useful:** the triad, `reach`/`history`.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** the silence on `fields()` is the batch's clearest case of a
   truly load-bearing public function's contract changing with zero signal.

## Missing Reasoning
**Obtainable, and a genuinely new, population-specific finding:** `src/attr/
__init__.pyi` — a type-stub file — classifies `Unknown`, confirmed directly via
`extraction_confidence.unsupported_extensions: [".pyi"]`. Correctly, honestly
self-reported rather than silently missed, but a real, concrete gap specific to
exactly this batch's population: well-typed public libraries lean heavily on `.pyi`
stubs to declare their public type surface, and neither `language_detector` nor
`file_classifier` currently recognizes the extension at all. Also obtainable: the
same `contract.symbol_deprecated`/docstring-contract-change claim recommended for
Commit 2 would catch this case too, since both are `docstring_status: "changed"`
with an unchanged signature. **Fundamental:** whether every existing caller of
`fields()` that currently passes a class will continue to behave identically (pure
backward-compatible addition) versus whether any edge case relies on the old
`TypeError` for non-class input — a behavioral-compatibility question needing
either exhaustive tests or real usage data, not obtainable from git alone.

---

## Batch 6 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| httpx `ae1b9f6` (`__all__` export) | 2/10 | No | No |
| click `c2ed414` (isolated_filesystem deprecation) | 3/10 | No | Partially |
| pydantic `2294b528` (typevar substitution fix) | 3/10 | No | Partially |
| attrs `0f758fe` (converter decorator) | 4/10 | Partially | Yes |
| attrs `48b8611` (fields() instance support) | 2/10 | No | No |

## Final Verdict — Batch 6

**Top 3 most valuable reasoning outputs:**
1. `reach.corroborated_wide_reach` firing correctly and consistently on every
   core-internals file touched in this batch (`_auth.py`, `testing.py`,
   `_fields.py`, `_make.py`) — a real, repeated confirmation these are
   high-stakes files, regardless of what kind of change touches them.
2. `shape.low_extraction_confidence` on the `.pyi` file — correctly, honestly
   self-reported rather than silently absorbed, exactly per this project's standing
   discipline.
3. The new-symbol artifact on `_CountingAttr.converter` — directionally correct,
   even while carrying its familiar caveat.

**Top 3 weakest reasoning outputs — the three clearest "invisible contract change" results of the entire evaluation series:**
1. **`httpx`'s `__all__` change: zero evidence computed at all**, not just zero
   reasoning — the single most complete blind spot found in any batch, because
   `symbol_extractor`'s AST walker has no concept of assignment statements.
2. **`click`'s formal `isolated_filesystem` deprecation, entirely invisible** —
   a real Sphinx `.. deprecated::` directive and `DeprecationWarning`, captured as
   `docstring_status: "changed"` in evidence, surfaced by zero reasoning modules.
3. **`attrs`' `fields()` gaining real instance support, entirely invisible** — the
   same shape of miss as Commit 2, on one of the library's most heavily-used public
   functions.

**One concrete improvement to prioritize, given this batch specifically:** add a
`contract.symbol_deprecated`-style claim (or, more generally, surface
`docstring_status` as its own claim dimension) in `contract_stability`. This single
change would have caught 2 of this batch's 5 commits' real, load-bearing contract
changes (Commits 2 and 5) using data `semantic_analysis` already computes today — no
new extraction, and directly targeted at exactly the population (libraries doing
careful semver/deprecation) where it matters most. Ranked above the `__all__`-tracking
idea (Commit 1) only because it requires zero new AST-walking logic, purely a new
claim over an existing fact — the `__all__` fix is real and valuable too, but is a
genuine extraction-layer change, not just a reasoning-layer one.

## Cross-batch note: this batch found the floor of what "invisible" can mean

Every prior batch found real instances of the body-only blind spot; this batch is
the first to reveal that "invisible" has *degrees*. Ranked from least to most
complete: (1) a real signature change correctly computed as evidence but excluded
from claims by a visibility policy (Batch 4, PostHog's private helper); (2) a real
contract change correctly computed as `docstring_status: "changed"` but never
consumed by any claim (this batch, Commits 2 and 5 — the evidence exists, no module
reads it); (3) a change to which the evidence layer itself never attends at all,
because the AST walker doesn't model the statement type involved (this batch,
Commit 1's `__all__` assignment — nothing is computed, at any layer). All three are
real, and this batch is the first single population to produce a clean example of
each, which matters directly for prioritization: (2) is the cheapest to fix (new
claim, existing data), (1) is nearly as cheap (policy change, existing data), and
(3) is the only one requiring new extraction work.

---

## Batch 7 — Refactoring-heavy Commits

Five real commits, sampled specifically by commit-message pattern rather than by
repository type — deliberately searching across `django`, `pallets/flask`, and
`crewAIInc/crewAI` for commits whose own message explicitly names one of the five
canonical refactoring moves the user asked for: Rename, Extract, Move, Refactor,
Cleanup. Unlike every prior batch, the organizing question here isn't "what kind of
repo is this" but "what kind of *change* is this" — commits explicitly claiming
little-to-no behavior change, lots of structural change. This is close to the
inverse of Batch 6: instead of asking "is a real behavior/contract change hidden by
this layer's limits," this batch asks "when a change is genuinely *supposed* to be
low-risk and purely structural, does the reasoning layer correctly reflect that, or
does it either miss the structure entirely or manufacture false alarm?"

---

### Commit 1 — `django/django` `f3e66a32` — "Renamed helper inside `_is_pk_set()`" (Rename)

**What actually changed:** A textbook pure rename: a nested helper function inside
`Model._is_pk_set` renamed from `_is_set` to `_is_unset` (correcting a confusingly
inverted name — the function actually reported "is this value unset"), both call
sites updated identically, logic completely unchanged. One file.

## Commit Overview
- Overall usefulness: **2/10** | Faster review? **No** | Keep visible? **No**

## Module Evaluation

**Change Shape:** boilerplate `shape.narrow_change`/`homogeneous_categories`. **(3/10)**
**Historical Risk/Reach:** `history.hot_file`/`reach.corroborated_wide_reach` on
`base.py` — plausible, this is genuinely core Django. **(4/10)**
**Verification Coverage:** `no_test_files_changed` — technically correct (a pure
rename doesn't need new test coverage), but reads oddly next to a commit that
changed nothing behaviorally. **(3/10)**
**Contract Stability:**
- **Zero claims — and this is a more complete silence than expected.** Both
  `_is_set`/`_is_unset` are private (leading underscore), so even the familiar
  "new symbol reads as changed" artifact never fires — `contract_stability`'s
  public-only gate (found in Batch 4) and the complete absence of rename-tracking
  (documented since ADR-005) *compound* here: a real, unambiguous identity change to
  a real symbol produces not even misleading noise, just total silence.
- Rating: **1/10**

## Overall Reasoning Quality
1. **Valuable:** none.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** none — there was nothing to ignore.
4. **Redundant:** none new.
5. **Misleading:** arguably the *opposite* of misleading here — for a pure,
   behavior-preserving private rename, silence is actually the least-wrong outcome
   of any option this layer could produce (better than manufacturing a false
   "signature changed" alarm). Worth noting explicitly: this is one case in the
   whole series where the blind spot's practical cost is close to zero, precisely
   because the change genuinely was low-stakes, matching this batch's own framing.

## Missing Reasoning
**Obtainable:** true rename detection (matching a removed symbol to an added one by
body/structural similarity within the same enclosing scope) would let this render as
a single `contract.symbol_renamed` fact instead of silence — explicitly named in
ADR-005 as deferred, since it edges toward the similarity-heuristics this project
has avoided elsewhere. **Fundamental:** whether any external caller relied on the
old (misleading) name via introspection/monkey-patching — vanishingly unlikely for a
private nested function, but not knowable from git alone.

---

### Commit 2 — `django/django` `f970a98e` — "Moved `django_file_prefixes()` to `django.utils.warnings`" (Move)

**What actually changed:** A real, explicit, author-confirmed function move: `django_
file_prefixes()` deleted from `django/utils/deprecation.py` and re-added, same name,
in a new file `django/utils/warnings.py`, with every one of ~15 call sites across the
framework updated to import from the new location. Test suite moved correspondingly.
21 files.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** `shape.wide_change`/`heterogeneous_categories`/
`touches_tests`/`touches_documentation` all fired correctly — a genuinely accurate
read of a wide, real, multi-part change. **(5/10)**
**Historical Risk:** `history.first_appearance` correctly fired for the new
`warnings.py`/its test file. **(4/10)**
**Reach:** `reach.high_historical_coupling` fired across several of the ~15 updated
call-site files — plausible, if somewhat diffuse given how many files are involved.
**(3/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- **This is the cleanest, most complete real-world confirmation of the cross-file
  duplication/move-correlation gap in the entire evaluation series.** `django_file_
  prefixes` appears **twice**, entirely disconnected: `contract.public_symbol_removed`
  in `deprecation.py`, `contract.public_signature_changed` (the new-symbol artifact)
  in `warnings.py` — with nothing anywhere linking them as the same function. The
  exact same disconnected pattern repeats for the `DjangoFilePrefixesTests` test
  class, moved from `tests/deprecation/tests.py` to `tests/utils_tests/
  test_warnings.py`. A human reviewer reads the commit message once and understands
  instantly; this layer produces two unrelated-looking facts in two unrelated files.
- Rating: **2/10** — technically accurate per-file, but actively obscures the single
  most important fact about this commit: nothing was added or removed in substance,
  something was *relocated*.

## Overall Reasoning Quality
1. **Valuable:** the `shape.*`/`history.first_appearance` combination, which at
   least correctly conveys "something wide and structural happened here."
2. **Correct-not-useful:** `reach` on the ~15 call-site files.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** the split `removed`/`added` pair for the identical function name,
   read without the commit message, could easily be misread as "a function was
   deleted and an unrelated new one with the same name was added" — a materially
   wrong impression of what actually happened.

## Missing Reasoning
**Obtainable, and the clearest, most directly-motivated instance of a
recommendation carried since Batch 2:** a same-commit, cross-file correlation
step — checking whether a qualified name that disappears from one file's symbol
table in a given commit reappears, structurally near-identical, in another file's
symbol table in the *same* commit — would turn this into one `contract.symbol_moved`
fact instead of two disconnected ones. This is now confirmed on a real, explicit,
author-labeled "Moved X to Y" commit, the least ambiguous possible test case.
**Fundamental:** whether every external (non-framework) caller of the old import
path will break — Django ships a deprecation shim for exactly this reason in many
such moves; whether one exists here requires reading past this specific diff.

---

### Commit 3 — `django/django` `3f912ee4` — "Extracted `set_choices()` method from `FilePathField.__init__()`" (Extract)

**What actually changed:** A textbook Extract Method refactor, with a real, deliberate
twist: the extracted method (`FilePathField.set_choices`) is not just an internal
helper — it's documented as new public API (`.. versionadded:: 6.1`), explicitly
callable by users to refresh choices after the field is constructed. Real docs, real
new test.

## Commit Overview
- Overall usefulness: **4/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** boilerplate-ish triad, `touches_tests`/`touches_documentation`
correctly reflecting the real scope. **(4/10)**
**Historical Risk/Reach:** `history.hot_file` on the changelog, `reach.
high_historical_coupling` on the docs page — unremarkable. **(3/10)**
**Verification Coverage:** `test_files_changed`, correct — and here genuinely
meaningful, since a real new capability got a real new test. **(4/10)**
**Contract Stability:**
- `FilePathField.set_choices` correctly shows `public_signature_changed` — and
  unlike most of this series' "new symbol" artifacts, **this is one of the rare
  cases where the artifact and the real story align**: the extraction was
  deliberately designed to expose new public surface, confirmed by the commit's own
  `versionadded` documentation, so "a new public symbol appeared" is exactly the
  right takeaway, not an incidental side effect of how the schema works.
- Rating: **6/10** — the highest-scoring `contract_stability` result in this batch,
  precisely because this refactor's "side effect" (new public API) is the one shape
  of change the new-symbol mechanism actually handles well.

## Overall Reasoning Quality
1. **Valuable:** `contract.public_signature_changed` on `set_choices` — a rare case
   where the by-now-familiar artifact happens to be the correct read.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** none — this is one of the cleanest results in the batch.

## Missing Reasoning
**Obtainable:** distinguishing "this extraction created new public API" from "this
extraction is a purely internal restructuring with no new exposed surface" still
can't be told apart in general (both currently look identical: a new public
symbol) — this commit happens to be the case where that ambiguity doesn't matter,
but the underlying ambiguity (carried since Batch 2's recommendation) remains.
**Fundamental:** whether calling `set_choices()` mid-request is safe under concurrent
access to the same field instance — a thread-safety question no git fact addresses.

---

### Commit 4 — `pallets/flask` `9822a035` — "refactor stream_with_context for async views" (Refactor)

**What actually changed:** A real, explicitly-labeled refactor: `stream_with_context`'s
internals reworked (71 lines changed) to correctly support async generator views, with
a real new test (`test_async_view`) and a changelog entry. The function's own
signature is unaffected — its whole point is remaining usable the same way for both
sync and async callers.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate triad plus `touches_tests`/`touches_documentation`,
correctly reflecting real scope. **(4/10)**
**Historical Risk/Reach:** `history.hot_file`/`reach.corroborated_wide_reach` on
`helpers.py` — correct, genuinely core code. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- **Zero claims on `stream_with_context` itself.** Every claim that fired is on the
  new test function and its nested closures — the now-completely-familiar
  new-symbol-artifact pattern. The actual refactor — reworking internals to support
  async generators while preserving the existing call signature — is invisible,
  precisely because "preserving the existing call signature while it works
  correctly under a new usage pattern" is the *entire point* of a good refactor,
  and exactly what this layer cannot see.
- Rating: **1/10**

## Overall Reasoning Quality
1. **Valuable:** none.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** test-noise claims.
4. **Redundant:** the body-only blind spot, now confirmed on a commit whose own
   message uses the word "refactor" explicitly — about as direct a hit on this
   batch's target population as possible.
5. **Misleading:** the complete silence risks reading as "nothing of substance
   changed here," when in fact this is exactly the kind of refactor (touching how a
   widely-used helper behaves under a new execution model) that most warrants
   careful review — its low visible footprint (no signature change) is precisely
   why it's easy to under-review, not a reason to.

## Missing Reasoning
**Obtainable:** body-only-change detection, the single most repeatedly-confirmed
recommendation in this entire series, now hitting its most literal target — a
commit whose author-given label is the word this whole batch searched for.
**Fundamental:** whether the reworked internals actually behave correctly across
every async-framework edge case (WSGI vs. ASGI-style async, generator vs.
async-generator callables) — a runtime-behavior question the new test exists to
answer, but answering it requires running that test, not reading evidence about it.

---

### Commit 5 — `crewAIInc/crewAI` `340d23ae` — "Remove `StateProxy` from flow state access" (Cleanup)

**What actually changed:** A large, deliberate architectural simplification: three
whole utility classes (`StateProxy`, `LockedDictProxy`, `LockedListProxy`) — dozens
of methods between them — deleted outright from `flow/runtime/__init__.py` (313
lines removed from that file alone), explicitly reasoned through in the commit
message (a thread-safety abstraction that only covered some cases, traded for
simpler, measurably faster code). Real test updates across 5 test files.

## Commit Overview
- Overall usefulness: **5/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** boilerplate-ish triad — undersells the real scale (313 lines,
three classes) since file/category counts alone don't capture symbol-level scale.
**(3/10)**
**Historical Risk:** `history.hot_file` on `flow.py` — correct. **(4/10)**
**Reach:** `reach.high_historical_coupling`/`corroborated_wide_reach` across several
files — plausible. **(3/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- **By far the most exhaustive, and most genuinely accurate, `contract_stability`
  result across all seven batches** — every one of ~30 removed methods across the
  three deleted classes is correctly, individually flagged `public_symbol_removed`.
  Unlike Batch 4's high-volume result (all artifact noise on test scaffolding), this
  volume is **entirely real signal**: three whole public classes' complete removal,
  comprehensively reported.
- **A genuinely new, precise nitpick, found because this batch's real data has
  enough volume to make it visible: every removed *function/method* fires both
  `public_symbol_removed` and `public_signature_changed` together** — confirmed
  directly by contrast with the removed *classes* (`StateProxy`, `LockedDictProxy`,
  `LockedListProxy` themselves), which correctly show only `public_symbol_removed`
  alone, since a class's `signature` is always `None` and `None != None` is `False`.
  A removed function's signature is a real string, so `old != None` is trivially
  `True` — meaning `public_signature_changed` fires on *every* function/method
  removal as a structural certainty, not new information beyond what
  `public_symbol_removed` already states. A small, precise, previously
  un-quantified redundancy.
- Rating: **7/10** — the best `contract_stability` showing in the whole evaluation
  series on substance, docked only for the redundant paired claim.

## Overall Reasoning Quality
1. **Valuable:** the near-complete, accurate enumeration of three deleted classes
   and their methods — genuinely the strongest `contract_stability` result found in
   any batch.
2. **Correct-not-useful:** the commit-shape triad, `reach`.
3. **Ignored:** none — unusually, almost every claim here carries real information.
4. **Redundant:** `public_signature_changed` paired with `public_symbol_removed` on
   every one of ~25 removed functions/methods — a real, quantifiable, structural
   redundancy, not a false claim, but ~25 duplicate facts a consumer has to notice
   and discount.
5. **Misleading:** none — the closest thing to a flaw here is noise-by-repetition,
   not inaccuracy.

## Missing Reasoning
**Obtainable:** suppress `public_signature_changed` when `public_symbol_removed`
already fired for the same symbol — the removal claim already subsumes it, and
this is a pure deduplication, not new logic. Also obtainable: given ~30 removed
methods across exactly 3 classes in one file, a commit-level summary
("3 public classes removed, 27 methods") would convey the same information as the
individual claims in a fraction of the volume — the same "wide homogeneous change,
summarize once" recommendation carried since Batch 1, now demonstrated at the
*symbol* level within a single file rather than across many files.
**Fundamental:** whether any external code (outside this repository, using crewAI
as a dependency) directly imports and uses `StateProxy` — a real breaking-change-
impact question this project has never had a way to answer, needing either a
deprecation period or downstream usage data neither git nor this pipeline has access to.

---

## Batch 7 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| django `f3e66a32` (Rename) | 2/10 | No | No |
| django `f970a98e` (Move) | 3/10 | No | Partially |
| django `3f912ee4` (Extract) | 4/10 | Partially | Yes |
| flask `9822a035` (Refactor) | 3/10 | No | Partially |
| crewai `340d23ae` (Cleanup) | 5/10 | Partially | Yes |

## Final Verdict — Batch 7

**Top 3 most valuable reasoning outputs:**
1. The near-complete, accurate enumeration of `crewAIInc/crewAI`'s three deleted
   classes and their ~30 methods — the strongest, most substantively correct
   `contract_stability` result across all seven batches.
2. `FilePathField.set_choices`'s correctly-flagged new-symbol signal — the rare case
   where the new-symbol artifact and the real story (deliberate new public API)
   genuinely align.
3. `shape.wide_change`/`history.first_appearance` correctly conveying "something
   wide and structural happened" on the Django move commit, even though the
   contract-level detail was disconnected.

**Top 3 weakest reasoning outputs:**
1. **The Django move commit's split, disconnected `removed`/`added` pair** for the
   identical function name — the cleanest, most unambiguous real-world confirmation
   of the cross-file move-correlation gap in the entire series, on an explicit,
   author-labeled "Moved X to Y" commit.
2. **Total silence on the pure rename** (Commit 1) — though here, uniquely in this
   whole series, the silence is closer to harmless than costly, since the change
   really was as low-stakes as its message claimed.
3. **Zero signal on Flask's explicitly-labeled "refactor"** — the body-only blind
   spot hitting its most literal possible target.

**One concrete improvement to prioritize, given this batch specifically:** a
same-commit cross-file symbol correlation step (a qualified name disappearing from
one file's table while a structurally-similar one appears in another file's table,
within the same commit) — directly motivated by the cleanest possible real-world
case (Commit 2), and it would also make Extract/Move refactors read completely
differently from unrelated add+remove pairs, which is exactly what this batch's
premise (low behavior change, lots of structural change) needs distinguished from
genuine risk.

## Cross-batch note: refactoring commits are where this project's own named limitations concentrate hardest

Every one of ADR-005's explicitly-named, deliberately-deferred limitations — no
rename tracking, no cross-file correlation, body-only invisibility, the
public/private scoping choice — shows up in this single five-commit batch, several
of them in their cleanest, most unambiguous form found anywhere in this evaluation
series. That is not a coincidence: a "refactor" commit is, almost by definition, a
commit engineered to change structure while preserving behavior and (often) public
signatures — which means it selects precisely for the properties (signature
stability, symbol identity change, cross-file relocation) this reasoning layer was
never built to track. This batch didn't find new gaps so much as it found the
sharpest possible lens on gaps already named — which is itself a useful, if
sobering, result: **the harder a project leans on refactoring, and the better its
refactors are at genuinely preserving behavior, the less this reasoning layer
currently has to say about them, at exactly the moment reviewers most want
reassurance that "nothing actually changed here."**

---

## Batch 8 — Bug Fixes

Five real commits, sampled by commit-message pattern again (Fix/Bug/Regression/
Crash/Null/Exception) rather than by repository type, across `django`, `psf/requests`,
and `pandas-dev/pandas`. Unlike Batch 7's premise (little behavior change expected),
this batch's premise is the opposite: every commit here claims a real, specific,
previously-wrong behavior is now corrected — the single most common and most
practically important commit category a reviewer actually encounters day to day.

---

### Commit 1 — `django/django` `ca5746b8` — "Added missing `chunk_size=None` check to `QuerySet.aiterator()`" (Null)

**What actually changed:** A genuine, meaningful public signature change:
`aiterator(self, chunk_size=2000)` → `aiterator(self, chunk_size=None)`, plus a new
import (`RemovedInDjango71Warning`) and a real deprecation-warning branch handling
the interaction between `chunk_size=None` and `prefetch_related()`. Real test
additions.

## Commit Overview
- Overall usefulness: **5/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** boilerplate-ish triad, correctly including
`touches_documentation`. **(4/10)**
**Historical Risk/Reach:** `history.hot_file`/`reach.large_neighborhood` on
`query.py` — correct, core Django. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- `QuerySet.aiterator` correctly shows `public_signature_changed` — a **second,
  independent confirmation** (after Batch 2's Form-default finding) that a genuine
  default-value change is exactly the shape of signature change this module
  reliably catches, since `signature_changed` is a plain textual comparison of the
  whole parameter list, defaults included.
- Rating: **7/10** — real, accurate, directly relevant signal, though it can't
  convey that the *meaning* of the new default is "opt into deprecated
  auto-chunking with a warning," only that something about the signature differs.

## Overall Reasoning Quality
1. **Valuable:** `contract.public_signature_changed` on `aiterator` — genuinely
   useful, accurate, and directly about the crux of the fix.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** none — one of the cleaner results in this batch.

## Missing Reasoning
**Obtainable:** the claim can't distinguish "default value changed" from "a
parameter was added/removed/reordered" — all currently collapse into the same
`signature_changed: true` boolean. A structured diff of the signature (which
specific parameter changed, old vs. new default) would let a reviewer act on this
without opening the file. **Fundamental:** whether every existing caller that relies
on the old default of 2000 is correctly covered by the new deprecation-warning path
— a behavioral-migration-completeness question the new tests exist to check, but
verifying requires running them.

---

### Commit 2 — `django/django` `a2348c85` — "Fixed inlines crash on parent models with `db_default` on primary key" (Crash)

**What actually changed:** The real root-cause fix for a crash: `Model._is_pk_set`
previously checked only `pk_val is None`, which missed the case where a primary key
using `db_default` resolves to a `DatabaseDefault` sentinel object instead of `None`
— causing inline formsets to crash. Fixed by adding a new nested helper,
`_is_set(value)`, checking both conditions. (This is the same function later
renamed to `_is_unset` in Batch 7's `f3e66a32` — this commit is its actual
introduction, one file, one real crash root-caused and fixed.)

## Commit Overview
- Overall usefulness: **2/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate triad. **(3/10)**
**Historical Risk/Reach:** `history.hot_file`/`reach.corroborated_wide_reach` on
`base.py` — correct, this is genuinely core, high-stakes Django model code. **(5/10)**
**Verification Coverage:** `test_files_changed`, correct — and multiple real test
files were added/extended specifically to cover the `db_default`-on-primary-key
case. **(4/10)**
**Contract Stability:**
- **Zero claims — confirmed directly: the new `_is_set` helper is `private`,
  `change_type: added`.** Since `contract_stability` only reports new-symbol
  artifacts for *public* symbols, this genuinely new function — the entire
  substance of the crash fix — produces nothing. **A concrete, connective finding
  across two batches**: this exact qualified name (`Model._is_pk_set._is_set`,
  later `_is_unset`) is invisible both when it's *introduced* to fix a real crash
  (here) and when it's *renamed* for clarity three weeks later (Batch 7) — the
  private-scoping gate blinds this layer to the symbol's entire visible lifecycle.
- Rating: **1/10**

## Overall Reasoning Quality
1. **Valuable:** `history.hot_file`/`reach.corroborated_wide_reach`, correctly
   flagging high stakes.
2. **Correct-not-useful:** the triad.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** the total silence on the actual crash-fixing logic, in code this
   central to the ORM, is a real cost — this is precisely a case where "what changed
   inside this function" matters more than usual, given the failure mode was a
   crash, not a cosmetic issue.

## Missing Reasoning
**Obtainable:** the same public/private policy question raised in Batch 4 — should
new *private* symbols also produce a (differently-labeled, lower-severity) claim,
especially when they're the entire content of a fix? This commit is arguably a
stronger case for "yes" than Batch 4's, since here a private helper isn't just an
implementation detail of an unrelated change — it *is* the fix. **Fundamental:**
whether every other `DatabaseDefault`-producing code path is now correctly guarded
(this fix addressed `_is_pk_set` specifically; whether an equivalent unguarded check
exists elsewhere in Django needs either a real audit or a comprehensive test suite
run, not a git diff.

---

### Commit 3 — `psf/requests` `3ff3ff21` — "`JSONDecodeError` are not deserializable" (Exception)

**What actually changed:** A real, subtle bug: `requests.exceptions.JSONDecodeError`
couldn't survive a `pickle.dumps`/`pickle.loads` round-trip (breaking multiprocessing
use), because Python's MRO picked the wrong parent's `__reduce__` implementation.
Fixed by adding an explicit `__reduce__` method to the class, ensuring all
constructor arguments are preserved through pickling. New round-trip test added.

## Commit Overview
- Overall usefulness: **4/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** boilerplate triad. **(3/10)**
**Historical Risk/Reach:** `reach.large_neighborhood` on `exceptions.py` —
unremarkable. **(3/10)**
**Verification Coverage:** `test_files_changed`, correct, and genuinely
meaningful — a new round-trip pickling test is exactly the right coverage for this
bug class. **(4/10)**
**Contract Stability:**
- `JSONDecodeError.__reduce__` correctly shows `public_signature_changed` — a new
  dunder method, correctly treated as public per this project's dunder-visibility
  rule (confirmed since Milestone 6), and genuinely meaningful here: adding
  `__reduce__` *is* the entire fix, and a reviewer seeing "new dunder method on this
  exception class" would immediately understand the shape of the change even
  without reading the diff.
- Rating: **6/10** — a real, correctly-surfaced signal, arrived at via the
  new-symbol mechanism but substantively accurate this time, similar in spirit to
  Batch 7's Extract Method case.

## Overall Reasoning Quality
1. **Valuable:** `contract.public_signature_changed` on `__reduce__` — accurate and
   directly informative about the fix's mechanism.
2. **Correct-not-useful:** the triad, `reach`.
3. **Ignored:** none.
4. **Redundant:** none new.
5. **Misleading:** none.

## Missing Reasoning
**Obtainable:** nothing distinguishes "a new dunder method was added to control a
specific protocol" (pickling, in this case) from any other new method — a claim
naming *which* Python protocol a new dunder participates in (`__reduce__`/
`__getstate__` → pickling, `__eq__`/`__hash__` → equality/hashing, etc.) would be a
small, deterministic addition with real explanatory value. **Fundamental:** whether
this fixes every pickling path (e.g. `copy.deepcopy`, which uses related but
distinct protocol methods) — requires either broader tests or protocol-level
expertise, not a git fact.

---

### Commit 4 — `psf/requests` `2d551768` — "Fix inconsistent exception for JSONDecode error" (Regression/Exception)

**What actually changed:** A real consistency fix: calling `.json()` on a response
could raise either `requests.exceptions.JSONDecodeError` or a bare `ValueError`
depending on whether an encoding was set — now consistently raises the
library's own exception type. The fix lives inside `Response.json()`'s body; no
signature change. New compatibility test added.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** boilerplate triad. **(3/10)**
**Historical Risk/Reach:** `history.hot_file`/`reach.corroborated_wide_reach` on
`models.py` — correct, this is one of requests' most central files. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- Zero claims on `models.py` itself — the body-only blind spot, reconfirmed on a
  real exception-consistency fix. Every claim that fired is test-file noise.
- Rating: **1/10**

## Overall Reasoning Quality
1. **Valuable:** none.
2. **Correct-not-useful:** the triad, `history`/`reach`.
3. **Ignored:** test-file noise.
4. **Redundant:** the body-only blind spot, again.
5. **Misleading:** the silence on a real "which exception type gets raised" change
   is a meaningful miss for exactly the reason this batch exists — knowing *which*
   exception a caller should expect is directly actionable information for review,
   and it's invisible here for the same structural reason as everywhere else.

## Missing Reasoning
**Obtainable:** detecting a change in which exception TYPE is raised at a given
`raise` statement (an AST-visible fact — `raise SomeException(...)` vs.
`raise OtherException(...)`) inside an otherwise-unchanged-signature function would
be a genuinely new, narrowly-scoped, deterministic claim this project hasn't
considered before — directly motivated by this commit and Commit 3, both
exception-behavior fixes invisible for related but distinct reasons.
**Fundamental:** whether any existing caller specifically catches the old,
inconsistent `ValueError` and would now silently stop handling the error correctly
— a real backward-compatibility risk no git fact resolves.

---

### Commit 5 — `pandas-dev/pandas` `06200bf2` — "groupby quantile with non-null NaN and all-NaT groups" (Bug/Null)

**What actually changed:** A real, subtle numerical-correctness bug: the core
`group_quantile` Cython routine didn't treat a float NaN as missing unless it was
also flagged by the mask array (true for masked/pyarrow-backed float arrays), which
could corrupt ordering comparisons. Fixed in `pandas/_libs/groupby.pyx` (Cython, not
Python) with a supporting, body-only change in `pandas/core/arrays/datetimelike.py`.
Real, substantial new tests across three scenarios.

## Commit Overview
- Overall usefulness: **2/10** | Faster review? **No** | Keep visible? **No**

## Module Evaluation

**Change Shape:** boilerplate triad plus `touches_documentation`,
`low_extraction_confidence` — correctly, honestly triggered by the `.pyx` file.
**(4/10)**
**Historical Risk/Reach:** `history.hot_file`/`reach.corroborated_wide_reach` on
`datetimelike.py` — correct. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct — three real, distinct new
test scenarios, more thorough than most commits in this series. **(3/10)**
**Contract Stability:**
- **Doubly invisible, for two different reasons at once.** The actual root-cause
  fix lives in `groupby.pyx` — Cython, not Python, correctly excluded by the `.py`
  extension filter before `semantic_analysis` ever runs (confirmed:
  `file_classification` is `Unknown`, `extraction_confidence` correctly names
  `.pyx` as unsupported). The *supporting* change, in real Python
  (`datetimelike.py`), produced zero symbol claims too — the ordinary body-only
  blind spot, compounding on top of the language boundary. This is the first
  commit in this evaluation series where the two most-repeated gaps (Python-only
  coverage, body-only invisibility) both apply to the *same* bug fix simultaneously.
- Rating: **0/10** for this specific commit's actual substance.

## Overall Reasoning Quality
1. **Valuable:** `shape.low_extraction_confidence`, honestly surfaced.
2. **Correct-not-useful:** the triad, `history`/`reach` on the one real Python file.
3. **Ignored:** test-file noise (three new tests, correctly detected as tests, no
   further signal).
4. **Redundant:** none new.
5. **Misleading:** the complete silence on a real, subtle, numerically-significant
   correctness bug is a serious miss, compounded by the fact that *neither* readily
   available mitigation (a JS/TS-style second semantic layer, or body-only-change
   detection) would fully close this specific gap — Cython support would need its
   own, separate extraction effort entirely distinct from a second general-purpose
   language.

## Missing Reasoning
**Obtainable:** the Python-side supporting change (`datetimelike.py`) is subject to
the same body-only recommendation carried since Batch 1. The Cython side is a
different, harder case: **obtainable in principle** (Cython is a superset of Python
syntax in large part, and a Cython-aware or even a permissive-parse-then-degrade
extractor could plausibly extract at least function-level facts from `.pyx` files)
but represents a third, distinct "new language" investment beyond the JS/TS
recommendation already carried since Batch 3 — narrower in applicability
(scientific/performance-critical Python projects specifically) but real for exactly
that population. **Fundamental:** whether the fix is numerically correct across
every dtype/masking combination pandas supports — a question the new tests are
built to answer, but only by actually running them.

---

## Batch 8 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| django `ca5746b8` (aiterator None default) | 5/10 | Partially | Yes |
| django `a2348c85` (db_default crash fix) | 2/10 | No | Partially |
| requests `3ff3ff21` (`__reduce__` pickling) | 4/10 | Partially | Yes |
| requests `2d551768` (JSONDecode consistency) | 3/10 | No | Partially |
| pandas `06200bf2` (groupby quantile NaN) | 2/10 | No | No |

## Final Verdict — Batch 8

**Top 3 most valuable reasoning outputs:**
1. `QuerySet.aiterator`'s correctly-flagged default-value change — a second,
   independent confirmation (after Batch 2) that real default-value changes are
   reliably, accurately caught.
2. `JSONDecodeError.__reduce__`'s correctly-flagged new dunder method — accurate,
   and directly informative about the fix's actual mechanism.
3. `shape.low_extraction_confidence` honestly firing on the `.pyx` file — correct,
   non-silent self-reporting exactly per this project's standing discipline.

**Top 3 weakest reasoning outputs:**
1. **Total silence on `_is_set`'s introduction** — the exact same private helper
   whose *rename* was already found invisible in Batch 7, now shown invisible at
   its *origin*, as the literal fix for a real crash. The clearest connective
   finding across any two batches in this series.
2. **The doubly-invisible pandas commit** — Cython excluded by design, the
   supporting Python change invisible by the ordinary body-only gap, on a subtle,
   numerically-significant correctness bug.
3. **Body-only silence on the requests exception-consistency fix** — reinforcing
   that "which exception type gets raised" is a real, currently-unaddressed
   category of invisible change, distinct from (but related to) the general
   body-only gap.

**One concrete improvement to prioritize, given this batch specifically:** revisit
the public/private policy question from Batch 4, now with a sharper edge — this
batch's clearest miss (`_is_set`) isn't a private helper incidental to an unrelated
change, it *is* the fix. A differently-labeled, lower-severity claim for new
*private* symbols (not just signature changes to existing ones, per Batch 4) would
have caught this. Ranked above the exception-type-tracking idea (Commits 3-4) and
the Cython-extraction idea (Commit 5) because it reuses a policy question already
on the table rather than opening new extraction work.

## Cross-batch note: the same symbol, across two batches, tells one continuous story

Batch 7 evaluated `Model._is_pk_set`'s helper being renamed (`_is_set` →
`_is_unset`) and found it invisible. This batch, independently selected by a
completely different search criterion (bug-fix keywords, not refactor keywords),
happened to surface the *same qualified name's* introduction three weeks earlier —
as the actual root-cause fix for a real crash. Across its entire visible lifecycle
in this project's sampling — created to fix a bug, later renamed for clarity — this
reasoning layer has had precisely nothing to say about it, for the same one
structural reason both times: it is private. This is the strongest single piece of
evidence in the whole evaluation series that the public/private policy choice in
`contract_stability` deserves reconsideration before any new module or language is
added — not because private symbols are unimportant, but because this project has
now watched one, real, consequential private symbol move through an entire
fix-then-refactor lifecycle in total silence.

---

## Batch 9 — Feature Commits

Five real "Add"/"Implement"/"Support"/"Introduce" commits, deliberately chosen to
span a real size range — from a single-file, 45-line addition to a 20-file,
2447-line one — specifically to answer the goal set for this batch: **does this
reasoning layer's output scale sensibly as a commit gets larger, or does it degrade
(in volume, noise, or signal quality) disproportionately?** Sources:
`django/django` (small), `fastapi/fastapi` (small and large), `crewAIInc/crewAI`
(large and very large).

## The scaling picture, measured directly

| Commit | Files changed | Total claims | Real symbol claims (non-test, non-tutorial source) | Wall time |
|---|---|---|---|---|
| django `3af5cb17` (45 lines) | 1 | 5 | 1 | 0.4s |
| fastapi `70580da8` (133 lines) | 5 | 22 | 2 | 1.1s |
| fastapi `749cefde` (1168 lines) | 21 | 134 | **2** | 3.8s |
| crewai `9db2d447` (1200 lines) | 20 | 75 | 45 (6 real files) | 4.9s |
| crewai `53c22844` (2447 lines) | 20 | 141 | 94 (6 real files) | 3.1s |

Two things are true at once, and they pull in opposite directions: **claim volume
and processing time both scale roughly linearly with commit size** (a genuinely
reassuring, practical finding — nothing about this pipeline breaks down or slows
disproportionately at real, large-commit scale), but **the proportion of that
volume which is genuinely informative about production code varies enormously by
repository**, not by size alone. The two large FastAPI/crewAI commits are within
15% of each other in raw line count, yet one produces almost entirely test/tutorial
noise around a razor-thin core of real signal, and the other produces almost
entirely real signal.

---

### Commit 1 — `django/django` `3af5cb17` — "Added support for nested fields to XML deserializer" (small, 45 lines)

**What actually changed:** A real, focused feature: `django/core/serializers/
xml_serializer.py`'s deserializer gained support for nested field structures
(needed by an external project, Django MongoDB Backend's `EmbeddedModelField`). One
file, one real function's signature genuinely changed.

## Commit Overview
- Overall usefulness: **6/10** | Faster review? **Yes** | Keep visible? **Yes**

## Module Evaluation
Standard boilerplate `shape.narrow_change`/`homogeneous_categories` (**3/10**), no
`historical_risk`/`reach` claims fired (file didn't cross thresholds), `verification.
no_test_files_changed` fired (**correct — no test file in *this* commit's diff,
though the feature is presumably tested elsewhere given the scale of Django's own
test suite; this claim's caveat about not knowing whether a test *exists* elsewhere,
raised as far back as Milestone 5A's own research, applies directly here**).
**Contract Stability:** one real, accurate `public_signature_changed` claim on the
actual modified deserialization function. **Rating: 8/10** — at this size, the
signal-to-noise ratio is close to ideal: one real claim, directly about the one real
change, no dilution.

## Overall Reasoning Quality
1. **Valuable:** the single `public_signature_changed` claim — precisely
   proportionate to a precisely-sized commit.
2. **Correct-not-useful:** the triad.
3. **Ignored/Redundant/Misleading:** none — this is one of the cleanest, best-
   calibrated results in the entire evaluation series, purely a function of size.

## Missing Reasoning
**Obtainable:** nothing distinguishes "this signature change adds backward-compatible
new capability" from "this signature change could break existing callers" — both
read identically. **Fundamental:** whether Django MongoDB Backend (the actual
downstream motivator, per the commit's own docstring reference) is now unblocked —
an external-dependency-satisfaction question no git fact answers.

---

### Commit 2 — `fastapi/fastapi` `70580da8` — "Add support for `@app.vibe()`" (small-medium, 133 lines)

**What actually changed:** A real, contained new decorator-based feature added to
`fastapi/applications.py`, with a matching new docs tutorial script and a new test
file. 5 files.

## Commit Overview
- Overall usefulness: **5/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation
Boilerplate-ish triad plus correctly-fired `touches_tests`/`touches_documentation`
(**4/10**). No `historical_risk`/`reach` claims. **Verification Coverage:**
`test_files_changed`, correct (**3/10**). **Contract Stability:** 2 real-file claims
(`applications.py`'s new method, correctly flagged; the new `docs_src/vibe/
tutorial001_py310.py` file's own top-level function, also correctly flagged as new)
plus 2 test-noise claims. **Rating: 6/10** — still a good, largely proportionate
signal at this size, with the first hint of the tutorial-file dilution that
dominates Commit 3 at larger scale.

## Overall Reasoning Quality
1. **Valuable:** the new decorator method flagged accurately.
2. **Correct-not-useful:** the triad.
3. **Ignored:** the tutorial file's own new-symbol claim — real, but not
   meaningfully distinct from "a new docs example was added," which
   `shape.touches_documentation` already conveyed more directly.
4. **Redundant:** none new. 5. **Misleading:** none.

## Missing Reasoning
**Obtainable:** distinguishing library-source new-symbol claims from
documentation-example new-symbol claims (both currently indistinguishable in the
output) — the seed of what becomes the central finding at Commit 3's scale.
**Fundamental:** whether `@app.vibe()` is stable enough to document as non-experimental
— a project-maturity judgment call, not a git fact.

---

### Commit 3 — `fastapi/fastapi` `749cefde` — "Add support for streaming JSON Lines and binary data with `yield`" (large, 1168 lines, 21 files)

**What actually changed:** A real, substantial core feature: `fastapi/routing.py`'s
central `get_request_handler` function (which builds every route's actual request
handler) was genuinely modified to detect and support JSON-Lines/binary streaming
generators, backed by four new private helper functions
(`_build_response_args`, `_async_stream_jsonl`, `_async_stream_raw`,
`_serialize_item`) and one new public helper in `dependencies/utils.py`
(`get_stream_item_type`). The other ~16 files are documentation tutorial scripts and
their corresponding tests.

## Commit Overview
- Overall usefulness: **3/10** | Faster review? **No** | Keep visible? **Partially**

## Module Evaluation

**Change Shape:** `shape.wide_change`/`heterogeneous_categories`/multiple
`touches_*` flags all fired correctly — an accurate structural read. **(5/10)**
**Historical Risk/Reach:** fired on several files, unremarkable. **(3/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- **This is the batch's central finding, and the clearest real-data demonstration
  of how the private-symbol blind spot's *absolute* cost scales with feature size.**
  Confirmed directly: `get_request_handler` (the one existing, central, genuinely
  modified public function) correctly fires `public_signature_changed` — real,
  accurate, important signal. `get_stream_item_type` (new, public) is correctly
  flagged too. But the four new private helper functions that carry the *actual
  streaming implementation logic* — `_build_response_args`,
  `_async_stream_jsonl`, `_async_stream_raw`, `_serialize_item` — are all
  invisible, confirmed: every one is `visibility: "private"`, `change_type:
  "added"`. **For this specific real feature, the tool sees roughly 2 of the ~6
  new/changed symbols that actually matter** — the same private-new-symbol gap
  found in Batches 4 and 8, but here directly quantified for the first time: as a
  feature gets larger and more of its logic lives in newly-introduced private
  helpers (the natural, good-practice way to build a large feature), the *share*
  of real signal this module can see shrinks, even as raw claim volume grows.
- Separately, of the 43 total symbol claims produced, the large majority sit on
  `docs_src/*` tutorial scripts and their tests — real code, correctly classified
  `Source` (a deliberate, longstanding decision from Milestone 3, not a new
  finding), but not part of the *library's* actual public interface a consumer
  would ever import. Nothing in this pipeline currently distinguishes "source code
  that ships as the library" from "source code that exists to demonstrate the
  library" — both look identical to `contract_stability`.
- Rating: **2/10** — the volume is large, but the fraction of it that's about the
  actual feature is small, and the largest, most import part of the actual
  implementation (four new private functions) is entirely absent.

## Overall Reasoning Quality
1. **Valuable:** `get_request_handler`'s real signature-change flag — the single
   most important fact in this whole commit, correctly caught.
2. **Correct-not-useful:** the `shape.*`/`reach` claims.
3. **Ignored:** the majority of the 43 symbol claims, once recognized as tutorial-
   script noise rather than library-API signal.
4. **Redundant:** the same new-symbol artifact repeating across ~15 tutorial/test
   files for what is structurally one feature.
5. **Misleading:** a reviewer skimming "43 contract claims" without this analysis
   could easily overestimate how much of the real implementation is visible, when
   in fact the four functions doing the actual work are completely silent.

## Missing Reasoning
**Obtainable:** (1) the private-new-symbol reporting question, now with its
sharpest quantitative motivation yet — 4 of 6 meaningful new symbols in this
commit's real feature are invisible purely because they're private; (2) a
structural distinction between "package source" and "documentation example source"
— derivable deterministically from path conventions this specific repo already
uses (`docs_src/` vs. the actual `fastapi/` package directory), not a new heuristic,
just a path-based scoping rule analogous to how `file_classifier` already
distinguishes root-level from nested files elsewhere. **Fundamental:** whether the
new streaming path handles backpressure/slow-consumer scenarios correctly under
real load — a runtime-behavior question the tutorial examples illustrate but don't
prove, and no static evidence can answer.

---

### Commit 4 — `crewAIInc/crewAI` `9db2d447` — "Add typed output schemas for CrewAI tools" (large, 1200 lines, 20 files)

**What actually changed:** A real, substantial feature spanning six real production
modules (`structured_tool.py`, `tools_handler.py`, `agent_utils.py`,
`tool_usage.py`, `tool_hooks.py`, `base_tool.py`) plus matching tests — adding typed
schema support across the tool-execution pipeline. Unlike Commit 3, crewAI has no
docs-tutorial-script convention diluting the diff.

## Commit Overview
- Overall usefulness: **5/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** `shape.wide_change`/`heterogeneous_categories`/`touches_tests`/
`touches_documentation` all correct. **(5/10)**
**Historical Risk/Reach:** fired across several core files, plausible. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- 45 symbol claims, and — in sharp contrast with Commit 3 at comparable raw size —
  **every one of the 6 non-test files carrying claims is genuinely part of
  crewAI's real, shipped source.** Still dominated by the new-symbol artifact (most
  of the 43 `public_signature_changed` claims are new functions/methods added as
  part of this feature, correctly if incidentally flagged), and still blind to
  whatever fraction of the new logic is private — but the *proportion* of noise-to-
  signal at this size is meaningfully better than Commit 3's, purely because this
  repository's source tree isn't diluted by embedded documentation examples.
- Rating: **5/10** — real, substantial coverage of a real, substantial feature,
  with the usual caveats rather than new ones.

## Overall Reasoning Quality
1. **Valuable:** broad, accurate coverage of genuinely new public surface across
   six real modules.
2. **Correct-not-useful:** `shape.*`/`reach`.
3. **Ignored:** none distinctly — unlike Commit 3, most claims here map to real work.
4. **Redundant:** the standard new-symbol-artifact ambiguity, at larger volume.
5. **Misleading:** none new.

## Missing Reasoning
**Obtainable:** same new-symbol-vs-real-change distinction carried since Batch 1,
now simply appearing at larger volume. **Fundamental:** whether the new typed
schemas correctly validate every existing tool definition in a real crew, not just
the ones covered by new tests — a compatibility-completeness question needing
either exhaustive tests or real usage, not git facts.

---

### Commit 5 — `crewAIInc/crewAI` `53c22844` — "Support ZIP deployment fallback and JSON crew project env runs" (very large, 2447 lines, 20 files)

**What actually changed:** The largest commit in this evaluation series: real,
substantial changes to crewAI's CLI deployment tooling across six real production
files (`run_crew.py`, `install_crew.py`, `plus_api.py` ×2, `archive.py`, `git.py`),
adding a new deployment fallback path and JSON-based project execution.

## Commit Overview
- Overall usefulness: **5/10** | Faster review? **Partially** | Keep visible? **Yes**

## Module Evaluation

**Change Shape:** `shape.wide_change`/`heterogeneous_categories`/`touches_tests`/
`touches_dependencies`/`low_extraction_confidence` all fired, correctly reflecting a
genuinely large, varied commit. **(5/10)**
**Historical Risk/Reach:** fired across the CLI files, plausible. **(4/10)**
**Verification Coverage:** `test_files_changed`, correct. **(3/10)**
**Contract Stability:**
- **94 symbol claims — the largest volume in this entire evaluation series
  (surpassing Batch 7's ~70-claim record, itself a real removal)** — including 3
  genuine `public_symbol_removed` claims alongside 93 `public_signature_changed`
  (again, structurally: every removed function trivially fires both, the exact
  redundancy quantified in Batch 7). Despite the volume, every non-test file
  carrying claims is real, shipped CLI source — this is the **cleanest positive
  demonstration that raw processing scale (2447 lines, the largest tested) does not
  by itself degrade signal quality** — the earlier concern (Commit 3) was about
  repository content mix, not really about size.
- Rating: **6/10** — real, substantial, mostly-accurate coverage, docked for the
  now-familiar removed-function redundancy and the irreducible private-symbol gap.

## Overall Reasoning Quality
1. **Valuable:** the 3 real removal claims plus broad, accurate coverage of new CLI
   functionality across six real files.
2. **Correct-not-useful:** `shape.*`/`reach`.
3. **Ignored:** none distinctly.
4. **Redundant:** the removed-function `public_symbol_removed`+
   `public_signature_changed` pairing, at its largest volume yet (3 instances) —
   same fix recommended since Batch 7.
5. **Misleading:** none new — the volume is real, not noise, at this scale.

## Missing Reasoning
**Obtainable:** the removed-function claim deduplication (Batch 7), and the same
new-symbol-vs-real-signature-change distinction carried since Batch 1, both simply
more valuable at higher claim volume, not newly discovered here. **Fundamental:**
whether the ZIP-deployment fallback behaves correctly against a real, slow, or
unreliable network — an operational/runtime question no static evidence reaches.

---

## Batch 9 Summary Table

| Commit | Overall | Faster review? | Keep visible? |
|---|---|---|---|
| django `3af5cb17` (XML nested fields, small) | 6/10 | Yes | Yes |
| fastapi `70580da8` (`@app.vibe()`, small) | 5/10 | Partially | Yes |
| fastapi `749cefde` (JSON Lines streaming, large) | 3/10 | No | Partially |
| crewai `9db2d447` (typed tool schemas, large) | 5/10 | Partially | Yes |
| crewai `53c22844` (ZIP deploy fallback, very large) | 6/10 | Partially | Yes |

## Final Verdict — Batch 9

**Top 3 most valuable reasoning outputs:**
1. Django's single, precisely-proportionate claim on a small, real feature — the
   best-calibrated result of the whole batch, and a reminder that small, focused
   commits are where this layer performs closest to its ceiling.
2. `fastapi/routing.py`'s `get_request_handler` correctly flagged as genuinely
   modified — the single most important fact in the batch's largest, messiest
   commit, correctly surfaced despite everything surrounding it.
3. `crewAIInc/crewAI`'s two large commits both showing that raw size, by itself,
   does not degrade signal quality when the repository's source tree is clean —
   real, substantial, mostly-accurate coverage at real scale.

**Top 3 weakest reasoning outputs:**
1. **FastAPI's four new private streaming-implementation helpers, entirely
   invisible** — the sharpest, most concretely quantified demonstration yet that
   the private-symbol blind spot's absolute cost scales with how much of a large
   feature's real logic lives in new private helpers (the normal, good way to build
   one).
2. **FastAPI's 43 symbol claims, dominated by documentation-tutorial-script noise**
   — a real, size-amplified instance of signal dilution specific to repositories
   whose source tree includes runnable documentation examples.
3. **The removed-function claim redundancy, now at its largest observed volume**
   (3 instances in Commit 5) — the same fix recommended since Batch 7, simply more
   costly at scale.

**One concrete improvement to prioritize, given this batch's explicit goal (does
reasoning scale well):** the answer is genuinely mixed, and the fix follows the
split — (1) **processing scales fine**: no new performance concern found even at
the largest commit tested (2447 lines, under 5 seconds, no volume-driven pipeline
issue); (2) **signal volume scales roughly proportionately with real work**, when
the repository's own source tree is clean of embedded documentation examples; but
(3) **signal quality does not scale for repositories that ship large amounts of
example/tutorial source code**, and this is a real, previously-unquantified
category worth its own recommendation: a deterministic, path-convention-based way
to mark certain source directories (e.g. `docs_src/`, or any path pattern the
target repo's own layout conventions already flag as documentation-adjacent) as a
distinct tier from the package's actual shipped source, so claim volume doesn't
misrepresent how much of a large commit's *real* API surface changed.

## Cross-batch note: two independent axes of "scaling," not one

This batch set out to answer "does reasoning scale with size" and found the
question needed splitting in two: scaling with **raw commit size** (measured
directly here — claim volume and wall-clock time both scale linearly, no
disproportionate cost found) and scaling with **how much of a large feature's real
logic is private** (the FastAPI streaming commit's sharpest lesson — as features
grow, more of their substance tends to live in new internal helpers, and this
project's evidence layer's blind spot to new private symbols means the *share* of a
large feature's real structure this reasoning layer can see may shrink even as the
absolute number of claims grows). The two axes are independent: a repository can
scale well on one and poorly on the other, as this batch's own five commits
directly demonstrate.

---

## Batch 10 — Edge Cases

Explicit goal, stated by the user: **break the reasoning engine.** Nine real
commits, deliberately one per named edge-case category (not the usual five, since
the whole premise is breadth of adversarial coverage), each fed through the full
pipeline wrapped in exception handling so a crash in one wouldn't lose the rest of
the run: a pure file rename, the largest single commit tested in this entire
series, a real two-parent merge commit fed directly through the builder methods
(bypassing `DatasetCollector`'s own non-merge filter — a code path never previously
exercised, since every prior batch went through the normal filtered path), real
auto-generated Django migration files, a dependency bump, a documentation-only
commit, a test-only commit, a pure binary asset change, and a CI-only commit.

## Headline result: nothing crashed

Every one of the nine adversarial inputs completed without an exception. That is a
genuinely important, previously-unmeasured robustness finding, not a foregone
conclusion — several of these paths (a real merge commit especially) had never
been exercised by any of this evaluation series' prior 44 commits. But "didn't
crash" is a low bar; two of the nine produced results worth calling out precisely
because nothing crashed while something more subtle went wrong.

---

### Commit 1 — Merge commit, fed directly (adversarial) — `pallets/flask` `9fcd34c9` — "Merge branch 'stable'"

**What was deliberately done:** `DatasetCollector.collect()` always resolves commits
via `get_non_merge_commit_hashes`, so a real merge commit (two parents) has never
reached any builder method in this project's history. This test called the builder
methods directly on a real merge commit hash to see what happens when that
assumption is bypassed — exactly the kind of thing that could happen if this
pipeline is ever exposed as a library other code calls directly, not just through
`main.py`.

## What happened
No exception anywhere in the pipeline. `change_set` reported exactly **one**
changed file (`docs/patterns/mongoengine.rst`). Independently verified against raw
git: `git diff <first-parent> <merge-commit> --stat` shows precisely that one file
— so **the tool's output is not wrong**, it is exactly correct for the specific
question `GitClient.get_commit_diff`/`get_changed_files` was designed to answer
("what changed relative to the first parent"), a convention documented since ADR-001.

But the *actual* merge brought in far more: `git diff <second-parent> <merge-commit>
--stat` shows **55 files, 1877 insertions** — the real content of what `stable`
contributed. Both numbers are simultaneously "correct" depending which question is
being asked, and this pipeline silently picks one without ever saying so.

## The real finding
**Nothing in this evidence/fusion/reasoning pipeline's output, as currently scoped,
can tell a consumer that this commit had two parents at all.** `identity` (which
does capture `parent_hashes`, and would show a length-2 list here) was deliberately
excluded from Evidence Fusion's bundle back in ADR-006, on the reasoning that it's
"commit bookkeeping, not evidence about the change." That was a defensible
decision on its own terms — but this is the first concrete demonstration of a real
side effect nobody named at the time: excluding `identity` doesn't just omit
bookkeeping, it makes the very fact that a commit is a merge **invisible to
everything downstream**, with no substitute signal anywhere else in the bundle.
Every claim `change_shape`/`historical_risk`/`reach`/`verification_coverage`/
`contract_stability` would produce for this commit would be built entirely on "one
file changed" — a confident, internally-consistent, and radically incomplete
picture, with nothing anywhere flagging that a completely different, much larger
picture exists relative to the other parent.

## Severity assessment
This is not a crash and not, strictly, a wrong answer — it is a **silent framing
choice with no visible seams**, which is arguably a more dangerous failure mode for
a review-assistance tool than an outright error: an error gets noticed and
investigated; a confident, plausible, incomplete answer does not. Rated the single
most significant finding of this adversarial batch.

## Missing Reasoning
**Obtainable, and cheap:** surface `parent_hashes` (or at minimum, a boolean "this
commit has multiple parents") somewhere in Evidence Fusion's commit bundle — not
necessarily reintroducing all of `identity`, just the one fact whose absence has a
real, now-demonstrated consequence. This is a narrow, surgical addition, not a
reversal of ADR-006's broader reasoning. **Fundamental:** whether `DatasetCollector`
should refuse (or specially handle) merge commits if ever called outside its own
`collect()` flow is a design decision, not something this evaluation resolves —
but it can't even be *considered* without first making the "is this a merge"
fact visible somewhere.

---

### Commit 2 — Huge commit — `django/django` `0f581cd29` — "Implemented dictionary-based MAILERS" (3593 insertions, 47 files)

**What happened:** No exception, but the slowest commit in this project's entire
evaluation history at **16.4 seconds** — noticeably slower, proportionally, than
Batch 9's largest tested commit (2447 lines / 20 files in under 5 seconds).
Profiling each builder stage individually pinpointed the cause precisely:
`co_change` alone took **13.17 of the 16.4 seconds (80%)**.

## The real finding
This is the first time this specific, previously-only-qualitatively-flagged cost
(`co_change`'s N+1 git-subprocess pattern, named as a concern since Milestone 5A and
observed anecdotally in Batch 1's Commit 6, 17-file case) has been measured in
concrete seconds at real, moderate-scale size. 47 files, each independently paying
up to 50 historical-commit lookups (the existing `max_history=50` bound) plus one
`get_changed_files` subprocess call per historical commit, compounds linearly with
file count and shows no per-commit sharing or caching across the 47 files' walks —
even though many of those 47 files likely share overlapping co-change history
(commits that touched several of these files at once get independently re-walked
once per file).

Claim volume itself was large but not incoherent: 171 symbol-bearing entities, 224
total claim instances, dominated by real `public_signature_changed`/
`decorator_changed` facts consistent with a genuine, large feature implementation
— no evidence of nonsensical or corrupted output at this scale, just a real,
now-quantified performance cost.

## Severity assessment
Not a crash, not wrong output — a genuine scalability concern, newly measured
rather than newly discovered (the underlying N+1 pattern has been documented since
`co_change_detector.md`'s own Future Improvements section). Real for any commit in
the 40+ file range, which is not an exotic edge case for a "huge feature" or "large
refactor" PR in an active project.

## Missing Reasoning
**Obtainable:** a per-commit, shared cache of historical-commit changed-file-lists
across all files being processed in the same commit — if two of the 47 files share
overlapping co-change history (plausible, even likely, for files that historically
changed together), that history currently gets independently re-fetched once per
file rather than computed once and reused. **Fundamental:** whether a stricter
bound (fewer than 50 historical commits, or a wall-clock budget per commit) would
be an acceptable tradeoff against losing recall on genuinely old but relevant
co-change patterns — a product decision this evaluation surfaces the need for but
doesn't resolve.

---

### Commits 3–9 — The remaining seven edge cases: all handled correctly, nothing broke

Each of these completed cleanly, quickly (0.1–2.7 seconds), and produced output
that, on direct inspection, was accurate and sensibly scoped — genuinely
reassuring baseline robustness, reported concisely since the finding in each case
is "this worked as it should," not a new gap:

- **Pure file rename**, `pallets/flask` `a64588f8` (`app.py`/`blueprints.py`/
  `scaffold.py` moved to `sansio/`): all three files correctly show `change_type:
  "renamed"`, correct `old_path`, and **zero** symbol diffs — exactly right for a
  content-identical (R100) move, confirming the rename-as-content-diff design
  (ADR-005) holds at a real, multi-file scale, not just the single-file case
  validated in Milestone 6.
- **Generated code**, `django/django` `64b1ac72` (adds real, auto-generated
  Django migration fixture files, `1_auto.py`/`2_auto.py`/etc.): every migration
  file parsed correctly (`parseable: true`) and correctly resolved to exactly one
  symbol each (`Migration`, the class every generated migration defines) — no AST
  issues from genuinely machine-generated, heavily-templated code. Classified
  `Test` (they live under `tests/migrations/`), a defensible call given their real
  purpose as test fixtures, distinct from Batch 2's `test_cases.txt` finding
  (that one was pure data with no test-directory placement at all).
- **Dependency bump**, `psf/requests` `69f84847` ("Bump the actions group with 3
  updates"): correctly narrow, correctly classified, nothing unexpected.
- **Documentation-only**, `fastapi/fastapi` `704fbe14` ("Update release notes"):
  single `.md` file, correctly classified, correctly produced minimal, proportionate
  output.
- **Test-only**, `django/django` `cceb6969d` (a single test file, flaky-test fix):
  correctly classified `Test`, correctly triggered `verification.
  test_files_changed` at the commit level with nothing further to report.
- **Binary asset**, `fastapi/fastapi` `2b5cd262` (a sponsor logo `.png`
  replacement, 0 textual insertions/deletions): correctly classified `Binary`,
  correctly counted in `extraction_confidence.skipped_binary_file_count`, and
  correctly produced **zero** symbol claims — no attempt to parse binary content as
  Python, no error.
- **CI-only**, `pallets/flask` `b21425d6` ("reduce venv size", two workflow YAML
  files): correctly classified, correctly narrow, nothing unexpected.

---

## Batch 10 Summary Table

| Commit | Category | Crashed? | Notable finding |
|---|---|---|---|
| flask `9fcd34c9` | Merge (adversarial) | No | Silent, technically-correct-but-radically-incomplete result; merge-ness itself invisible downstream |
| django `0f581cd29` | Huge commit | No | 16.4s wall time, 80% in `co_change`'s N+1 pattern — first concrete measurement of a long-flagged cost |
| flask `a64588f8` | File rename | No | Handled correctly at multi-file scale |
| django `64b1ac72` | Generated code | No | Parses and resolves correctly, no AST issues |
| requests `69f84847` | Dependency bump | No | Handled correctly |
| fastapi `704fbe14` | Documentation-only | No | Handled correctly |
| django `cceb6969d` | Test-only | No | Handled correctly |
| fastapi `2b5cd262` | Binary asset | No | Handled correctly |
| flask `b21425d6` | CI-only | No | Handled correctly |

## Final Verdict — Batch 10

**Top 3 most valuable findings:**
1. **The merge-commit test.** Not a crash, something more interesting: a
   confident, internally-consistent, technically-defensible answer that silently
   represents only one of two equally legitimate readings of what a merge commit
   "changed" — with no signal anywhere in the output that a choice was even made.
   The clearest demonstration in this whole series that "didn't crash" and "safe to
   trust" are different claims.
2. **The `co_change` scaling measurement.** A cost this project has qualitatively
   flagged since Milestone 5A, now measured in concrete seconds (13.17 of 16.4) at
   a real, unexceptional commit size (47 files) — turning a known theoretical
   concern into an actionable, quantified one.
3. **Zero crashes across nine genuinely adversarial, previously-unexercised
   inputs** — including the very first real merge commit this pipeline has ever
   processed. Robustness that was assumed, now actually tested.

**Top 3 weakest/most concerning findings:**
1. The merge-commit silence (same finding as above — its severity as a *weakness*
   and its value as a *discovery* are the same thing).
2. `co_change`'s unshared, per-file N+1 re-walk — real, avoidable computational
   waste at realistic commit sizes, not just a pathological extreme.
3. Nothing else — the other seven categories produced no weaknesses worth ranking;
   that in itself is the batch's second-most-important finding, not a null result.

**One concrete improvement to prioritize, given this batch's explicit goal:**
surface whether a commit has more than one parent somewhere in Evidence Fusion's
output. It is the cheapest possible fix for the single most consequential finding
in the entire ten-batch series — not because merge commits are common in this
pipeline's normal flow (they're filtered out by design), but because this test
proved the filter is the *only* thing standing between this pipeline and silently
misrepresenting a merge as a one-file commit, and that filter lives in exactly one
place (`DatasetCollector.collect()`), not in the evidence contract itself.

## Cross-batch note: ten batches later, one property never directly tested until now

Every prior batch operated inside the one invariant `DatasetCollector.collect()`
has always guaranteed: every commit reaching a builder method has exactly one
parent. Nine batches of real, adversarial-in-spirit commit sampling never actually
tested what happens when that invariant is violated, because every single one of
them went through the normal, filtered path. This batch is the first to step
outside that path on purpose — and the result is not that anything broke, but that
this project discovered exactly how much of its own correctness has quietly
depended on a filter living in one specific caller, rather than being a property
the evidence layer itself can detect, declare, or defend.

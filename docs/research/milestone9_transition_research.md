# Milestone 9 Transition Research: The Deterministic-to-Semantic Boundary

**Status: Research, now consolidated and frozen as ADR-011 through ADR-014 in
`docs/DECISIONS.md`.** Every informal "ADR-011"/"ADR-012" reference below (this
research predates the real numbering) refers to *this document's own* running
labels, not the numbered `DECISIONS.md` sequence — read `docs/DECISIONS.md`
directly for the authoritative, final architecture: ADR-011 (Review Context),
ADR-012 (LLM Reasoning Contract), ADR-013 (Review Output Contract), ADR-014
(Prompt Builder Contract). This document remains as the reasoning and evidence
behind those four decisions, not a competing or independent source. No prompts,
no APIs, no agents, no orchestration, no implementation appear anywhere below —
this is a purely conceptual analysis of where deterministic evidence (Milestones
5A–8.5C) naturally ends and semantic reasoning must begin, stage by stage.

## What "deterministic evidence" concretely means here

To keep this grounded rather than speculative, the full, current inventory: six
reasoning modules produce 34 claim types total (`change_shape` 11, `historical_risk`
6, `reach` 6, `verification_coverage` 3, `contract_stability` 3, `body_evidence` 6),
each with a scope (commit/file/symbol), a confidence tier (`observed`/`corroborated`/
`inferred`/`conflicting`), and an explicit basis. Every module also emits Gaps when
it can't assess something. The Synthesizer collects and groups these by scope —
nothing more; ADR-007 explicitly forbids it from ranking, filtering, or resolving
cross-module conflicts. Two limitations of this exact, current state matter directly
to this analysis and are **not fixed**, verified directly against the code before
writing this: `contract_stability` and `body_evidence` still produce identical claim
shapes for a brand-new symbol and a real change to an existing one (the "new-symbol
noise" finding — confirmed in 12 of 20 real commits in the last full evaluation), and
the Synthesizer still performs zero grouping or deduplication of near-identical
claims across a large commit (confirmed producing 335 claims for one real 20-file
commit). Both were reviewed and judged worth fixing in an earlier session but were
never implemented — they are live, present-tense properties of the evidence an AI
reviewer would actually receive today, not historical footnotes.

---

## Stage 1 — Understand the change

**Cognitive objective**: build a representational model of *what* changed, with no
interpretation of why or how risky it is yet.

**Deterministic evidence that supports it**: almost all of it. `change_set`
(added/deleted/modified/renamed files), `observations.file_classification`/
`change_categories`, and `semantic_analysis`/`body_evidence`'s per-symbol facts
(signature/decorator/docstring changes, callees, exceptions, context managers) give
an exact, textual account of what changed, down to the symbol level. `change_shape`'s
claims (wide/narrow, homogeneous/heterogeneous) summarize the diff's aggregate
shape. This is the single most deterministic-friendly stage of all seven.

**Questions already answered deterministically**: which files changed and what kind;
which symbols changed and exactly how (signature/decorators/docstring/callees/
exceptions/context managers); whether tests, docs, or dependencies were touched;
whether the change is structurally wide or narrow.

**Questions requiring semantic reasoning**: what the code *does* — its actual logic,
control flow, and behavior. The deterministic layer has never attempted this, by
design (ADR-005 excludes control-flow analysis and behavior modeling explicitly).
Reading the raw diff text to understand mechanism, not just which facts changed, is
irreducibly semantic.

**What should not be given at this stage, and why**: historical/reach evidence
(`file_history`, `co_change`, `local_module_context`) — these answer "how risky/how
far does this reach," which is Stage 3's question. Introducing it here risks
contaminating pure representation with premature risk framing — a change should be
understood on its own terms before its context is weighed. The commit message is a
subtler case, addressed under Stage 2 below, but the short version: it plausibly
should *not* appear here either, and this is a place where the AI reviewer's
ordering should deliberately diverge from the human one ADR-011 documents.
`contract_stability`/`body_evidence` claims should also be presented *distinguished*
from the raw diff, not blended with it — one is a verified fact, the other is text
requiring interpretation, and treating them as equally authoritative risks the LLM
either over-trusting an incomplete extraction or re-deriving (and possibly getting
wrong) something already established as fact.

**Output feeding Stage 2**: a structured account of what changed (files, categories,
per-symbol facts) plus the raw diff — explicitly without the commit message and
without any risk signal.

## Stage 2 — Infer intent

**Cognitive objective**: form a hypothesis for *why* this change exists, and check
it against what was actually observed in Stage 1.

**Deterministic evidence that supports it**: `metadata.message` (subject + body) is
fully extracted already — no reasoning is needed to *retrieve* the author's stated
intent, only to *interpret* it. `change_shape`'s categorical claims offer a coarse
intent proxy (a commit touching only changelog/version-file/lockfile has a
recognizable shape, as this project's own evaluations repeatedly confirmed for real
release commits).

**Questions already answered deterministically**: the literal text of what the
author says they did. Nothing more — no claim today states "this looks like a
release" or "this looks like a dependency bump" as an explicit fact; the shape
claims are a proxy a human would read into, not a stated conclusion.

**Questions requiring semantic reasoning**: connecting stated intent to a plausible
engineering goal, and — critically — detecting when the two representations
disagree. This project's own evaluation history has hit this mismatch directly more
than once (a personal repo's commit message naming a different file than the one
actually changed; a commit message reading "initial" when `file_history` itself
proved the file predated it). Recognizing this divergence is exactly the
"expected-change vs. actual-code" comparison ADR-011 describes as one of a
reviewer's three internal models — inherently semantic, and arguably the single
most important thing this stage exists to catch.

**A genuine split worth naming**: Stage 2 conflates two acts that have very
different deterministic support and should be treated as internally distinct even
if they remain one named stage. *Reading* the stated intent is a data-retrieval
act, already fully deterministic. *Reconciling* it against Stage 1's observed
structure is fully semantic. Collapsing them risks an AI reviewer treating "I have
the message" as equivalent to "I have inferred intent" — which is precisely the
anchoring failure mode worth guarding against, expanded on below.

**What should not be given at this stage, and why**: the full granular per-symbol
detail from Stage 1 should be summarized, not re-supplied verbatim — intent
inference operates at the level of "what kind of change is this," not "which exact
callees changed in which exact function," and re-injecting that detail dilutes the
stage's actual cognitive question with material already fully used in Stage 1.
Historical/reach evidence should still be withheld, for the same anchoring reason as
Stage 1 — a reviewer should decide what a change is *for* before knowing how risky
its file's history looks, or intent-inference collapses into risk-inference
prematurely.

**Output feeding Stage 3**: a stated-intent summary, a hypothesis of actual intent,
and an explicit flag when the two diverge — this divergence flag should be treated
by Stage 3 as a risk signal in its own right, on the same footing as the
deterministic risk claims.

## Stage 3 — Assess risk

**Cognitive objective**: calibrate how much scrutiny this specific change deserves
and how far its consequences might reach — an attention-budgeting act, not yet
specific failure hypotheses.

**Deterministic evidence that supports it**: the strongest coverage of any stage
after Stage 1. `historical_risk` (hot file, dormancy, rapid iteration, recent
churn, first-author-touch) and `reach` (historical coupling, neighborhood size,
corroborated wide reach, expected-partner-missing) are purpose-built risk proxies.
`verification_coverage` (test presence/absence) and `contract_stability` (public
contract changes) are risk signals in their own right. This is the stage this
project's deterministic layer was most deliberately built toward across Milestones
8, 8.5B, and 8.5C — an AI reviewer should lean on it more heavily, and do less
independent reasoning of its own, here than at any other stage.

**Questions already answered deterministically**: is this file historically
volatile or long-dormant? Is this the author's first time here? Is this file
tightly coupled to others, or isolated? Does this change a public contract? Is
there test coverage? All directly answered by existing claims, individually.

**Questions requiring semantic reasoning**: composing *multiple* risk signals into
one overall judgment. The deterministic layer, by explicit design (ADR-007), never
ranks or combines claims across modules — a file that is simultaneously a
first-author-touch, a hot file, and a public-contract change carries a
qualitatively different risk story than any one of those alone, and nothing today
computes that composite. Deciding how much three or four independently-true risk
proxies should compound is inherently a weighing judgment, not a lookup.

**What should not be given at this stage, and why**: the raw diff text, already
consumed in Stage 1, should not be re-parsed from scratch here — Stage 3 should
work from Stage 1's *output*, not restart. Anything resembling a specific failure
hypothesis (concurrency bug, edge case) is premature at this point and belongs to
Stage 4 — pulling it forward risks the reviewer fixating on one theory before
finishing risk calibration across the whole change.

**Output feeding Stage 4**: an attention-budget allocation — which parts of the
change are high-stakes and deserve deep hypothesis generation, which are low-stakes
and can be treated briefly — plus the divergence flag carried forward from Stage 2.

## Stage 4 — Generate hypotheses

**Cognitive objective**: actively construct specific, falsifiable theories about how
the change could fail — edge cases, concurrency, user-facing surprises — the
private "ideal implementation" comparison ADR-011 describes.

**Deterministic evidence that supports it**: the sharpest drop-off of any stage.
`body_evidence`'s facts (a new exception now caught, a new callee introduced, a new
context manager entered) are the closest thing to hypothesis *fuel* the
deterministic layer offers — they mark exactly where behavioral surface changed,
which narrows *where* to generate hypotheses, but they stop at "the fact changed,"
never asking whether the change is handled correctly. This is a targeting function,
not a hypothesis-generation function, and the distinction matters: it tells the
reviewer where to look, not what to conclude.

**Questions already answered deterministically**: essentially none of this stage's
real questions. What's available is scope, not substance.

**Questions requiring semantic reasoning**: all of them, and this should be stated
plainly rather than searched for deterministic crumbs that don't exist — this is
exactly the boundary this project's own review history has named repeatedly and
consistently as "already impossible under deterministic analysis" (severity and
behavioral correctness of a fix, across every evaluation pass conducted).

**What should not be given at this stage, and why**: the commit message's stated
intent should be de-emphasized here, not re-centered — over-relying on the
author's own framing while generating hypotheses risks a reviewer only imagining
the failure modes the author would have already considered, rather than genuinely
independent ones. This is a known review pitfall in its own right, and an AI
reviewer is arguably more susceptible to it than a human, since a stated intent is
exactly the kind of confident, fluent text an LLM tends to over-weight. Tone or
communication material (Stage 7) is obviously premature. Verdicts (Stage 6) should
not be formed yet — Stage 4 should generate a *wide* hypothesis set without
filtering for credibility; premature pruning here risks losing a legitimate concern
before Stage 5 has had a chance to check it.

**Output feeding Stage 5**: a set of specific, checkable hypotheses — not yet
verdicts, just testable claims Stage 5 will attempt to confirm or refute.

## Stage 5 — Seek missing evidence

**Cognitive objective**: determine what's needed to resolve Stage 4's hypotheses,
and actively go get it — more file context, a clarifying question, a linked issue —
while explicitly naming what remains unknown.

**Deterministic evidence that supports it**: a genuinely interesting partial
precedent already exists. Every reasoning module explicitly emits a Gap whenever it
cannot assess something (`cannot_assess_history`, `cannot_assess_contract`,
`cannot_assess_coupling`, `cannot_assess_neighborhood`, `cannot_assess_dormancy`,
`cannot_assess_body_evidence`) — structurally, this *is* "notice missing evidence
and name it explicitly," just scoped to missing *input data* rather than missing
*resolution of a specific hypothesis*. This is worth taking seriously as a
precedent, not dismissing as unrelated: the deterministic layer already refuses to
silently guess when evidence is absent, which is the same instinct Stage 5 needs,
just narrower in what counts as "missing."

**Questions already answered deterministically**: whether evidence needed to support
a given *claim* was available at all. Not whether a specific *hypothesis* from
Stage 4 has been resolved — that's a different, broader question the Gap
mechanism was never built to answer.

**Questions requiring semantic reasoning**: whether a Stage-4 hypothesis is actually
resolved by reading more of the surrounding code, deciding what additional context
is relevant, and interpreting it once found. Recognizing when a hypothesis is
genuinely unresolvable versus merely under-investigated is itself a judgment call.

**What should not be given at this stage, and why**: a fresh, undifferentiated copy
of the entire evidence bundle should not reappear here — Stage 5 should work from
Stage 4's specific open hypotheses and seek what's relevant to *those*, not re-scan
everything. Re-presenting the full bundle at every stage without a clear reason is
a concrete hallucination-adjacent risk: it invites a reviewer to "discover" a new
hypothesis mid-verification instead of staying disciplined about resolving the ones
already on the table, quietly turning a staged process into an unstructured one.

**Output feeding Stage 6**: each Stage-4 hypothesis marked resolved (confirmed or
refuted, with what resolved it) or unresolved (explicitly flagged, with a note on
what would resolve it) — a natural fit for the same two-sided Claim/Gap vocabulary
the deterministic layer already established, not an invented new one.

## Stage 6 — Form conclusions

**Cognitive objective**: convert everything accumulated — risk profile, resolved
hypotheses, remaining unknowns — into a single overall verdict: does accepting this
change leave the system better than it found it, per the decision rule ADR-011
documents from Google's own guidance.

**Deterministic evidence that supports it**: deliberately, explicitly none. This is
worth stating as plainly as possible: Stage 6 is exactly the boundary ADR-007 drew
and has been reaffirmed at every subsequent decision point in this project — the
Synthesizer collects and groups claims and gaps but is explicitly forbidden from
ranking, filtering, or resolving conflicts between them. That is not an oversight
to eventually fix deterministically; it is the single most consistently reaffirmed
architectural line in this entire project. Stage 6 is squarely, by design, where
the deterministic layer was built to stop.

**Questions already answered deterministically**: none of the actual verdict. What
exists is the necessary *input* to a verdict — a clean, confidence-tagged inventory
of everything found — never the verdict itself.

**Questions requiring semantic reasoning**: weighing incommensurable things against
each other (a public contract break against strong test coverage against an
unfamiliar author against a hypothesis that turned out to be a non-issue) with no
formula, because this project has explicitly, repeatedly declined to build one.

**What should not be given at this stage, and why**: the raw diff and granular
per-symbol facts should not reappear — Stage 6 should work from the condensed
outputs of Stages 2, 3, and 5, not re-derive from first principles. Re-injecting
full raw material here risks the reviewer re-litigating earlier stages instead of
actually concluding, the same discipline failure named at Stage 3 and Stage 5.

**Output feeding Stage 7**: a verdict, plus the specific reasons behind it — which
claims and resolved hypotheses actually drove it.

## Stage 7 — Produce review

**Cognitive objective**: communicate the verdict in a way that's calibrated
(blocking versus minor), well-explained, and appropriately toned — a distinct act
from forming the verdict itself.

**Deterministic evidence that supports it**: none directly — this is
presentation, not analysis. The one indirect link: claim confidence tiers and which
specific claims drove the verdict could inform which points structurally deserve
blocking framing versus minor framing, even though the actual phrasing is entirely
semantic.

**Questions already answered deterministically**: essentially none.

**Questions requiring semantic reasoning**: tone, framing, what to say versus what
to omit, explaining *why* rather than just asserting *what* — all inherently
linguistic and judgment-based.

**What should not be given at this stage, and why**: the full internal
hypothesis-generation and evidence-seeking trail from Stages 4–5 should not be
dumped verbatim into the output. A reviewer's internal reasoning process is not the
same artifact as what they say to the author, and conflating the two produces a
review that reads like a reasoning trace rather than actionable feedback.

**Output**: the review itself — calibrated, explained, and reasoned about only in
terms of what it says, not re-litigating how it got there.

---

## Where the boundary actually falls

Laid out stage by stage, the seven stages sort cleanly into three groups by how
much deterministic evidence genuinely carries them:

- **Deterministic-dominant**: Stage 1 (understand) and Stage 3 (assess risk). An AI
  reviewer should do the least independent reasoning and lean hardest on existing
  claims here.
- **Semantic-dominant, with a real but partial deterministic hook**: Stage 5 (seek
  evidence), via the existing Gap mechanism, and Stage 2 (infer intent), via
  `metadata.message` already being fully extracted.
- **Semantic-dominant, with essentially no deterministic support today**: Stage 4
  (generate hypotheses), Stage 6 (form conclusions), and Stage 7 (produce review).

The bookends of the model — understanding what changed, and calibrating how much it
matters — are where this project's five milestones of deterministic work actually
pay off. The interior of the model — why, what could go wrong, what it all means,
how to say it — is where semantic reasoning is irreplaceable, and no amount of
further deterministic extraction changes that; this project's own review history
has already tested that boundary directly and repeatedly, not just assumed it.

## Should any stages split or merge for an AI reviewer? Yes, twice, and both cut
## against merging rather than toward it

**Stage 2 has an internal seam worth naming explicitly**, even without becoming two
top-level stages: reading stated intent is retrieval (deterministic, already done);
reconciling it against observed structure is judgment (semantic). Treating the two
as one undifferentiated act risks an AI reviewer mistaking "I have the message" for
"I have understood the intent."

**Stage 4 and Stage 5 should be held more rigidly separate for an AI reviewer than
ADR-011's own research suggests they are for humans** — this is the most important
critical departure in this whole analysis. ADR-011 documents that human reviewers
interleave hypothesis-generation and evidence-seeking almost as one loop, not two
clean passes. That's true, and it's tempting to conclude an AI reviewer should mimic
it. But the *reason* humans can safely blend the two is that their internal
verification is cheap, fast, and reliable — a human generating a hypothesis usually
already half-knows the answer from experience. An LLM's "verification" is a
categorically different, riskier act: checking a generated hypothesis against actual
deterministic evidence is precisely the mechanism that prevents a plausible-sounding
but unverified theory from being reported as settled fact. Fusing generation and
verification into one step for an AI reviewer removes the one checkpoint that
catches a hallucinated hypothesis before it reaches a conclusion. The human model
blends these two; the AI model should not, specifically because the failure mode
that makes blending safe for a human is exactly the failure mode an AI reviewer is
most exposed to.

**The same logic applies, in mirror, to Stage 6 and Stage 7.** Forming a verdict and
phrasing it are one motion for an experienced human. For an AI reviewer, collapsing
them risks a different known failure mode — sycophancy, hedging, or softening a real
concern because tone considerations are being weighed at the same moment as the
verdict itself. Keeping "what do I actually conclude" strictly prior to "how do I
say this" protects the verdict's substance from being diluted by the different,
legitimate, but separate concern of how to communicate it kindly.

**Everything else holds.** Stage 1 and Stage 3, despite both being
deterministic-heavy, should not merge — collapsing "what changed" into "how risky
is this" risks letting historical/contextual risk signals color the basic
representation of the change before it's even been neutrally understood, which is
exactly the anchoring risk this analysis flags repeatedly. The seven-stage shape
itself should be preserved into ADR-012; what changes for an AI reviewer is not the
count of stages but the *strictness* of the boundaries between exactly the two
adjacent pairs named above — and in both cases, stricter than the human model, not
looser.

## One structural theme, not specific to any single stage

Across all seven stages, the same hazard recurs: **each stage should receive the
minimal sufficient slice of deterministic evidence, plus the condensed output of
the stage(s) before it — not an ever-growing cumulative bundle of everything seen
so far.** Every "what should not be given here" answer above is a version of this
same principle. This matters more, not less, because of the two current, real,
unfixed limitations named at the top of this document: without a new-symbol-versus-
real-change distinction, a commit dominated by new test functions will read to an
AI reviewer as a large number of contract changes that aren't actually contract
changes, potentially inflating Stage 3's risk read for no real reason. Without
claim deduplication for wide commits, a 20-file commit's 335 claims risk drowning
Stage 1's representation in repetition before the reviewer ever reaches a judgment.
Neither problem is hypothetical — both were measured directly on real commits.
Whatever ADR-012 ultimately decides about staging, it inherits these two
limitations as-is; they are not solved by moving into semantic reasoning; if
anything, semantic reasoning is more exposed to their noise than the deterministic
layer itself ever was, since the deterministic layer never had to *interpret* its
own output's volume, only produce it.

---

## The object passed to the LLM, and the invariants that govern it

**Revision note**: this section originally answered these five questions by
treating "the object passed to the LLM" as the Synthesizer's claims/gaps plus
message plus diff, directly. On reflection, that conflated two things that need to
stay separate — the raw material and what's actually handed to the LLM after
summarization and addressing are applied — which is exactly what left
summarization with no owner and traceability with nothing to point at. The answers
below are revised to name that boundary explicitly, as **Input Sources** (raw,
complete, never seen directly by the LLM) versus the **Review Context** (the
constructed, summarized, addressable artifact a **Review Context Builder**
produces from them, and the only thing Milestone 9 actually receives).

### What exact object should be passed

Not the Synthesizer's output directly — the **Review Context**, produced by a
**Review Context Builder** from two things, both of which are now correctly
understood as its *inputs*, not the LLM-facing object itself:

- The Synthesizer's own output — `{"commit_claims": [...], "file_claims": {...},
  "symbol_claims": {...}, "gaps": {"commit": [...], "files": {...}}}` — already the
  reasoning layer's product, every claim carrying `claim`/`scope`/`confidence`/
  `basis`, every gap carrying `reason`/`scope`/`missing`.
- The two raw materials the deterministic layer has always deliberately left
  uninterpreted: the commit message (`metadata.message`) and the diff text
  (`artifacts/diff.patch`).

Call these two things, together, the **Input Sources** — raw and complete, never
themselves the object handed to the LLM. The Builder's output — the **Review
Context** — is a distinct, second-order artifact: the same underlying content,
after deterministic summarization has been applied and every remaining unit has
been given a stable, citable address. The LLM only ever sees the Review Context.
One Review Context per commit — the seven stages are different lenses applied to
reading it progressively, not seven separately constructed payloads.

### Included directly vs. summarized

Claims and gaps: always verbatim, never paraphrased, and passed through by the
Builder completely unmodified — the Builder's summarization authority extends only
to the raw-material half of the Input Sources, never to claims or gaps themselves.
A claim's `confidence` tier and `basis` are already maximally compressed exact
facts (a four-value vocabulary, not prose); summarizing risks exactly the failure
this project's evaluation history has hunted for repeatedly — blurring an
`inferred`, threshold-based claim into reading as more or less certain than it is.
A gap is already a one-line admission of "I don't know X"; summarizing risks
quietly dropping the admission itself.

The raw diff and per-symbol `body_evidence` detail: summarized, never omitted, and
the decision is owned entirely by the Builder, using only facts the Reasoning Layer
has already concluded — never a new heuristic, never an LLM call, never similarity
matching. `change_shape`'s `wide_change`/`homogeneous_categories` claims make a
file a *candidate* for collapsing to one representative example plus a count; any
risk-bearing claim on that file at all (a public contract change, a missing-test
claim, `first_author_touch`, `hot_file`, anything from `reach`) means it is never
collapsed, regardless of the commit's overall shape. This is the concrete,
object-construction-level answer to the still-unfixed new-symbol-noise and
claim-explosion problems named above, without touching the frozen deterministic
layer itself — and it is the same "never re-derive an already-computed fact"
discipline named as an invariant below, now applied to the Builder's own behavior,
not just to the LLM downstream of it.

One refinement the Builder's existence makes necessary: **even a collapsed,
summarized representation must remain individually addressable.** Collapsing 14
files to one representative example plus a count doesn't mean the representative
example loses its citable identity — it still needs a stable address (its own file
path and line range), or a conclusion drawn from it would have nothing to cite,
violating the traceability invariant below for the exact material the Builder was
trying to make usable, not hide.

### What should never be sent — the layers below reasoning, and two new additions

Everything the reasoning layer exists specifically to abstract away: Evidence
Fusion's `{status, evidence}` envelope wrapper itself (its status-resolution has
already happened by the time a claim or gap exists — re-exposing it invites a
second, informal path to a conclusion Fusion already reached formally); the full
`semantic_analysis` symbol table for unchanged symbols and any raw AST field beyond
what became a claim; `co_change`'s raw per-commit historical file-lists, as opposed
to the already-ranked top-N output `reach` consumes; `identity`/`artifacts`,
excluded from Fusion's own scope back in ADR-006 as "bookkeeping, not evidence" —
that line should hold here too; threshold constants and module internals
(`HIGH_COUPLING_THRESHOLD`, exact git commands, `\x1f`-delimited parsing) — the LLM
should see the conclusion a threshold produced, never the logic, or it gains an
opening to privately re-litigate a decision this project already made; and a
module's full `LIMITATIONS` list dumped wholesale, as opposed to the specific
caveat relevant to a claim actually being shown.

Two more belong on this list specifically because the Builder now exists:

- **The discarded raw material behind a collapsed representation.** If 14 files
  were collapsed to one example plus a count, the other 13 files' full diff hunks
  must not *also* be sent alongside the collapsed summary — sending both defeats
  the purpose of collapsing and reintroduces the exact volume problem the Builder
  exists to solve.
- **The Builder's own collapse-decision reasoning.** *Why* a given file was
  collapsed (which claim's absence, which threshold on `change_shape` triggered
  it) is the Builder's internal mechanism, analogous to a reasoning module's own
  threshold constants — the LLM should see the collapsed *result*, addressable and
  usable, never a trace of the rule that produced it.

### Invariants between deterministic reasoning and the LLM

Nine now, not eight — the traceability invariant belongs alongside the original
anchor, not appended after it, because it's what turns several of the others from
a stated hope into something checkable:

1. **Traceability, the mechanism that makes the rest enforceable**: every
   LLM-generated conclusion must cite at least one addressable unit in the Review
   Context — a claim (by its `claim` id and `scope`), a gap (by its `reason` and
   `scope`), a specific span of the commit message, or a specific included diff
   hunk (by file path and line range — the one genuinely new identity this
   requires, since diff hunks don't carry one today). A conclusion citing nothing
   addressable is not a deeper insight; it is an unsupported one, and must be
   flagged as such rather than kept.
2. The LLM may interpret a claim's meaning; it may never contradict its factual
   content — traceability is what makes this checkable: a citation of the actual
   claim being contradicted would surface the contradiction directly.
3. The LLM's own conclusions must never be presented in the reserved
   `observed`/`corroborated`/`inferred`/`conflicting` vocabulary — that vocabulary
   means "computed from evidence, per ADR-007," and laundering a model-formed
   judgment into it misrepresents its source even when the conclusion is correctly
   traceable.
4. A gap must never be silently filled — the LLM may reason about an admitted
   unknown, never report certainty in its place. Traceability requires citing
   *something*, not citing *everything relevant* — a conclusion can be
   technically traceable to one claim while still silently ignoring a gap that
   directly bears on it, so this remains a distinct requirement, not fully
   subsumed by invariant 1.
5. Confidence is a floor the LLM can lower, never a ceiling it can raise — it may
   discount an `inferred` claim, never treat it as if it were `observed`, and
   never borrow `observed`'s authority for its own uncertain read.
6. Scope must not be silently widened — a claim scoped to one symbol must not
   become a statement about the whole commit; this is exactly the mechanism that
   would let the still-unfixed new-symbol-noise problem get worse instead of
   better if left unchecked, and exactly what the Builder's own addressable-unit
   scoping (per claim, per symbol) is meant to prevent downstream.
7. Absence of a claim — or a file collapsed by the Builder because no risk-bearing
   claim touched it — is not evidence of absence, and must never be reported as
   reassurance. It can mean nothing happened, that evidence was never collected (a
   gap should exist for that), that a real fact was computed but excluded by an
   explicit policy choice (the still-open private-symbol-visibility question from
   the historical-evidence work), or simply that a file matched a shape-based
   collapse rule rather than being individually verified. None of these is
   "verified safe," and the Builder's own summarization adds a new way this
   invariant can be violated if not held carefully.
8. The Python-only extraction boundary must stay visible, never quietly
   compensated for — a non-Python file has zero `semantic_analysis` coverage by
   construction, not oversight, and the LLM must not invent structural facts about
   a language nothing ever parsed.
9. The LLM must not re-derive a fact already computed and verified — recomputing
   "is this file hot" informally from raw dates, instead of trusting
   `history.hot_file`, only creates a second, less rigorous path to disagree with
   a conclusion this project already validated against real commits. The Builder
   is held to this same standard in its own operation, not just the LLM: it uses
   `change_shape`'s claims to decide what to collapse, never recomputing wideness
   itself from raw `change_set` data.

### The smallest self-contained input that still allows high-quality review

The same four parts as before, but now properly understood as the smallest
**Review Context**, not the smallest raw Input Sources — meaning each of the four
must be individually addressable even at minimum size, since the traceability
invariant applies regardless of commit size. For a small, narrow commit, the
Builder's summarization step is simply a no-op — there is nothing wide or
homogeneous to collapse — so the content is unchanged from before, but it is still,
strictly, the Builder's output the LLM receives, not the Input Sources handed
through untouched:

- **The commit message** — without it, Stage 2 has nothing to reconcile against,
  exactly the gap this project's evaluations named repeatedly as unrecoverable,
  FastAPI's dependency-injection commit being the clearest recorded case.
- **The raw diff** — without it, nothing past Stage 1 can reason about actual code
  content at all — the one truly irreducible raw material.
- **The synthesized claims** — without them, the LLM repeats, by hand and less
  reliably, work five milestones already did, and Stage 5 loses anything solid to
  check a hypothesis against.
- **The synthesized gaps** — without them, the LLM can present false confidence
  exactly where the deterministic layer was honest about not knowing — the most
  dangerous omission on this list, because a missing gap doesn't look like a gap,
  it looks like nothing was wrong.

Historical and reach evidence (`file_history`, `co_change`, `local_module_context`)
sit just outside this floor — the backbone of Stage 3, genuinely valuable, but a
review remains viable on pure code-correctness grounds without it. Losing it costs
the risk-calibration dimension specifically, not the review's basic viability —
the real second tier, distinct from the four-part floor above it.

### What this is and isn't

Still a naming and shaping exercise, not a decision — nothing above commits to a
module path, a function signature, a diff-splitting algorithm, or a
citation-checking mechanism, all of which are real, non-trivial work still
undesigned. It also isn't a reopening of the frozen deterministic layer: nothing
here adds a new claim type, touches `GitClient`/`DatasetCollector`, or changes any
reasoning module's `CONSUMES`/`PRODUCES`. The Review Context Builder is new,
deterministic, and entirely in service of preparing the already-frozen layer's
output for Milestone 9 — not an expansion of what that frozen layer itself is
responsible for.

---

## Milestone 9A: The LLM's Responsibility Boundary

**Frozen.** Assumes the deterministic layer (5A–8.5C) and the Review Context
architecture above are settled. Answers where the LLM's responsibility begins and
what governs it — no prompts, no APIs, no implementation.

### Which reviewer questions belong to the LLM

Six categories, each tied to a specific, already-identified gap rather than a
general claim: **why** — does stated intent match observed structure, and where do
they diverge; **what could go wrong** — edge cases, concurrency, user-facing
surprise, since `body_evidence` marks *where* behavioral surface changed but never
whether the change is handled correctly; **is this actually correct** — the
largest, most-repeated category across this project's whole evaluation history,
since the deterministic layer sees that a symbol changed, never whether the change
does what it should; **is this the same thing, moved** — cross-file
rename/extraction/duplication correspondence, declined everywhere in this project
because solving it deterministically needs similarity matching; **how much does
this matter, all together** — weighing multiple independently-true deterministic
signals into one composite judgment, a permanent gap by ADR-007's own design, not
a temporary one; **how should this be said** — tone and framing, with zero
deterministic support by nature.

### The LLM's reasoning sequence

The same seven stages from the human reviewer model, same order — refined by which
stages the LLM *receives* already-computed material from versus which it
*generates* new judgment in:

1. **Understand** — receiving; the LLM absorbs the Review Context's structural
   representation, generates nothing here.
2. **Infer intent** — generating; its first real judgment, reconciling stated
   intent against the absorbed structure.
3. **Assess risk** — receiving; absorbing the deterministic risk profile,
   recalibrating attention without inventing new risk facts. Kept distinct from
   step 1, not merged into it, specifically to avoid risk signals coloring what
   "understanding the change" means before it's been neutrally read.
4. **Generate hypotheses** — generating, held strictly apart from step 5.
5. **Seek/resolve evidence** — generating, but distinct from step 4: checking each
   hypothesis against the Review Context's addressable units. Fusing 4 and 5
   removes the one checkpoint that catches a hallucinated hypothesis before it's
   reported as fact.
6. **Form conclusions** — generating, held strictly apart from step 7: the verdict
   is reached on resolved evidence alone, before any tone consideration.
7. **Produce review** — generating: translating the verdict into calibrated,
   citation-bearing output.

### Invariants between deterministic evidence and semantic reasoning

Nine, unchanged from the Review Context research, restated at this level: (1)
every conclusion traces to an addressable unit — a claim, a gap, a message span,
or an included diff hunk; (2) the LLM may interpret a claim, never contradict its
factual content; (3) the LLM's own conclusions never borrow the reserved
`observed`/`corroborated`/`inferred`/`conflicting` vocabulary; (4) a gap is never
silently filled; (5) confidence is a floor the LLM can lower, never a ceiling it
can raise; (6) claim scope is never silently widened; (7) absence of a claim — or
a file the Builder collapsed — is never evidence of absence or reported as
reassurance; (8) the Python-only extraction boundary stays visible, never quietly
compensated for; (9) the LLM never re-derives a fact already computed and
verified deterministically.

### The primary objective — one, defended, not a list

**Prioritize reviewer attention.** Not assess correctness, not estimate risk, not
infer intent.

Risk estimation is ruled out because it's already the deterministic layer's
best-covered ground (Stage 3 is deterministic-dominant by design across
Milestones 8, 8.5B, 8.5C) — making it the LLM's primary job would duplicate
existing, validated work. Correctness assessment is ruled out because it overclaims
exactly the authority the invariants above exist to prevent — verifying code is
correct is closer to formal verification than review, and this project has been
consistently humble about not asserting certainty it can't back. Intent inference
is ruled out as a primary objective because it's a means, not an end — it matters
only insofar as it helps decide what deserves scrutiny.

Attention-prioritization is what's left, and it's also the objective every other
capability actually serves. It's the precise, permanent gap this project's own
architecture names: ADR-007's decision that the Synthesizer must never rank or
resolve cross-module conflicts wasn't temporary, and turning "34 independently-true,
unranked facts" into "here's what to look at first, and why" is exactly the act
that line was drawn in front of. It also matches `PROJECT.md`'s own charter —
*understanding changes and estimating impact before merge*, not certifying
correctness.

### Representing uncertainty without appearing falsely certain

Three principles, not one hedge mechanism: **a separate vocabulary**, never
blended with the deterministic confidence tiers, since those mean "computed from
evidence, per ADR-007," not "how sure the model is"; **monotonicity in one
direction only** — the LLM may express less confidence than a claim's tier alone
would suggest, never more, and a `conflicting` claim must be surfaced as a
conflict, never silently resolved toward one side; **per-conclusion, never a
single global score** — different parts of the same review rest on wildly
different grounding, and collapsing that into one number hides exactly the
distinction the whole invariant structure exists to preserve.

### Traceable to deterministic evidence vs. legitimate semantic judgment

Narrower than "traceable to the Review Context" (which every conclusion must
satisfy) — two tiers within it. **Must trace to a deterministic claim or gap
specifically, never independently restated**: any factual statement about what
changed; any risk characterization overlapping a claim already computed (hot
file, unfamiliar author, missing tests); any statement of absence. **May
legitimately be the LLM's own judgment, but must still trace to specific raw
material, not float free**: intent inference, grounded in a cited message span
and diff; hypotheses about behavior or correctness, grounded in a cited diff
hunk; the composite risk weighing itself, which synthesizes already-cited material
rather than needing its own separate citation; communication choices, which
govern how cited material is presented, not what new fact is asserted. The
dividing line: if the deterministic layer already computed it, the LLM cites it;
if understanding it requires reading code or prose the deterministic layer never
interpreted, the LLM may reason about it, but only by pointing at the specific
material it's reasoning over.

---

## Milestone 9B: The Review Output Contract

**Frozen.** Assumes the deterministic layer, the Review Context architecture, and
Milestone 9A above are settled. Defines the structure of what's presented to the
human reviewer once the LLM has completed its internal reasoning — no prompts, no
UI, no implementation.

### Section order

Five sections, ordered so that priority — the primary objective from 9A — is
embodied by position, not just content: **(1) Verdict** — a short, calibrated
headline of overall attention-worthiness and the one-line reason for it; **(2)
What changed and why** — a compressed synthesis of structure and inferred intent,
including any divergence between the two; **(3) What deserves attention, ranked**
— the substantive core, ordered by cost-of-missing, not file order or claim order;
**(4) Open questions** — unresolved hypotheses and relevant gaps, named
explicitly; **(5) Minor notes** — nits and style points, clearly separated from
anything blocking.

Verdict-first serves a time-constrained reader directly, but carries a real risk
worth naming: presenting a verdict before the reasoning can anchor a reviewer into
premature agreement. The resolution isn't to move it later — that trades away the
efficiency it exists to provide — it's that the verdict must never be phrased
with more finality than a first-pass triage warrants. It's a prioritization
signal, not an adjudication.

### What belongs where, and what explicitly doesn't

**Verdict**: attention-worthiness and why, in one or two sentences — not a claim
inventory, not certainty beyond what's grounded, not style detail. **What changed
and why**: structural summary plus inferred intent and any divergence flag — not
line-by-line detail, not raw diff text reproduced wholesale. **What deserves
attention**: each point self-contained — the concern, what it traces to, why it
matters — ordered by priority; not anything ungrounded, and not the same
underlying pattern restated N times across N symbols when it's really one thing
happening N times (recognizing that and saying so once is a legitimate semantic
act, distinct from the Review Context Builder's purely mechanical collapsing,
since it requires judging the instances are the *same concern*, not just
structurally similar). **Open questions**: each named as "this is unresolved, and
here's what would resolve it" — not manufactured uncertainty about things that
are actually settled. **Minor notes**: genuinely non-blocking only — never where a
real concern quietly gets downgraded.

### What should never appear, even if available

The deterministic layer's internal vocabulary (claim IDs, confidence-tier names,
module names, thresholds) never surfaces as visible jargon — it's the citation
underneath a sentence, not the sentence itself. Anything without a traceability
anchor is excluded outright, not softened with a hedge. Fabricated certainty about
anything not actually verified. The same fact repeated across sections. And
everything already excluded from the LLM's *input* (raw AST, fusion envelopes,
thresholds) is excluded from its *output* by the same logic — that boundary
doesn't get re-decided at the far end of the pipeline.

### What makes a review genuinely useful — three principles, not a checklist

**Ordered by cost of missing it, not by where it occurs.** The load-bearing
principle; the others largely follow from it — a correctly-ordered review is
skimmable within a fixed time budget by construction, since a reviewer who stops
early still caught what mattered most. **Every point of importance is checkable,
not just asserted.** A reviewer trusts, and can act on, a claim they can verify in
ten seconds against its citation far more than one requiring independent
re-derivation — traceability restated as a value the reviewer directly benefits
from, not only an internal discipline. **Silence about the unknown is a defect,
not a virtue.** A review that hides what it couldn't determine looks more
complete and is actually more dangerous — invariant 7 (absence isn't evidence of
absence) applied at the output, not just the reasoning.

### Presenting deterministic evidence alongside semantic reasoning

Woven into single sentences, not two separate dumps — the factual clause is the
deterministic grounding, the interpretive clause is what it means: *"this
function's public signature changed with no accompanying test update — since it's
a public API, callers may break silently if they're not updated too."* The
distinction survives in phrasing, not markup: deterministic-grounded statements
are stated plainly, since they're already verified; LLM-judgment statements carry
the hedging language, since they should. The degree of hedging becomes the
implicit signal of what's citable ground truth versus the model's own read,
without breaking sentences into two registers a reader has to context-switch
between.

### Tone

Collaborative and calibrated — matching the human-reviewer conventions already
researched in ADR-011 (informational phrasing, explaining why not just what) —
pitched at a distinctly lower register of authority than a senior human reviewer
would use: a well-prepared peer presenting findings for someone else's judgment,
not an authority handing down a verdict. This follows directly from the objective
defended in 9A, not generic politeness — an AI reviewer's actual epistemic
position is narrower than a senior human's, and every invariant established exists
to stop it overclaiming certainty. But tone shouldn't overcorrect into uniform
hedging either — qualifying every line adds reviewer effort extracting the actual
point; hedging is reserved for what's actually uncertain, not applied as a
defensive tic everywhere.

### What the review should read like — one philosophy, defended

**A prioritized reviewer assistant.** Not an analytical report — a report
optimizes for the completeness and defensibility of the document itself, exactly
the failure mode this project has measured as harmful (335 claims for one real
commit, presented flat), where an assistant optimizes for the reader's next
action. Not a checklist either — a checklist implies uniform, undifferentiated
items to tick off, with no natural place for the single most important principle
above: ordering by cost of missing it. "Reviewer assistant" isn't a tone
preference; it's the structural consequence of the primary objective, the section
order, and the tone all pointing at the same shape.

### Against the four standing criteria

Improves review quality: ordering by cost-of-missing and naming unresolved
questions explicitly both address gaps this project measured, not assumed.
Reduces reviewer effort: verdict-first, non-redundant presentation, and reserved
hedging cut against the specific volume/noise problems already found in real
commits. Preserves traceability: every section's allowed content is defined by
what it may claim, and the hard exclusion rule (no anchor, no appearance) makes
this enforceable, not aspirational. Remains model-agnostic: the contract is about
what a review *contains*, independent of what produces it — nothing above depends
on a specific model's capabilities, context window, or API shape.

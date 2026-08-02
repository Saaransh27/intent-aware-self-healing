# The Reviewer Reasoning Model (research — not part of the numbered ADR sequence)

**Status: Research only — no architecture, no prompts, no implementation.** Its
seven-stage model is consolidated into `docs/DECISIONS.md`'s ADR-012 (LLM
Reasoning Contract), which is the authoritative, frozen version — this document
remains as the underlying evidence and reasoning behind that ADR, not a competing
source. This document answers exactly one question: *how does an experienced
reviewer actually think*, as a cognitive process — not what a tool should do
about it. It is grounded
in Google's, Microsoft's, Meta's, and Chromium's own published review guidelines,
Gerrit's and Phabricator's review-system design philosophies, the Linux kernel's
maintainer process, and independent research/writing on how experienced engineers
read and evaluate code. Full source list at the bottom.

## Framing

Every source studied here converges on the same underlying shape, even though none
of them state it as a numbered model: reviewing code is not "reading a diff and
commenting on it." It is a sequence of distinct cognitive acts — building context,
guessing why, calibrating how much attention this deserves, forming provisional
theories, actively hunting for what's missing, converging on a verdict, and only
then deciding how to say it. The stages below are not a checklist to follow; they
are a description of what already happens, largely unconsciously, in an
experienced reviewer's head — evidenced independently across every source studied,
not invented for this document.

---

## Stage 1 — Understand the change

Before anything else, the reviewer builds a model of *what the code now does*, as
distinct from what it used to do. Google's guidance is blunt about the discipline
this requires: reviewers should "look at *every* line of code that they have been
assigned to review," not scan and assume. Microsoft's playbook frames this as a
distinct first stage — read every modified line in a logical sequence, and
explicitly step outside the diff ("click to view the whole file") the moment the
change can't be understood in isolation.

This stage is not passive reading. The research on expert cognition describes it as
selective and strategic from the very first moment: reviewers scope how carefully
they read based on complexity and risk, rather than processing the whole diff at
uniform depth. Most reviews begin the same way regardless of source — the PR title
and description are read first, before a single line of the actual diff (used in
the large majority of reviews studied), because they anchor everything that
follows.

## Stage 2 — Infer intent

Understanding *what changed* is not the same as understanding *why*. Every source
treats this as a distinct, prior question. Google's own priority ordering puts
"design" — does this belong in the codebase at all, does it integrate with the
system as intended — ahead of every mechanical concern, precisely because a change
that's well-built but solving the wrong problem is a bigger failure than a
well-motivated change with rough edges. Phabricator's Differential made this
structural, not optional: every revision is built around a *Summary and Test
Plan* — a required statement of what the change does and why, before a single line
of diff is examined. The Linux kernel's submitting-patches guidance is explicit that
this is the author's job to make easy, not the reviewer's job to reconstruct: "the
body of a patch is a chance to tell a maintainer why they should take your patch."

Cognitively, this is where the reviewer builds what researchers describe as the
*expected-change* model — a mental picture of what the author intended, built from
the description, linked issues, and prior discussion, held distinct from what the
code actually does. The gap between the two is not yet a verdict — it's raw
material for every stage that follows.

## Stage 3 — Assess risk

Before investing further attention, the reviewer calibrates *how much scrutiny this
specific change deserves* — and every source treats this as an explicit, early
decision, not something that falls out naturally from reading. Chromium's process
makes this structural: review authority is scoped to owners of the specific
directories touched, and reviewers are chosen for familiarity with the affected
area — risk is triaged by who is qualified to judge it, before the content is even
read closely. The Linux kernel's maintainers are described as reviewing explicitly
for "functionality" and, just as importantly, "any side effects" — a distinct
question from "does this work," aimed squarely at blast radius. Microsoft's
guidance names race conditions and security flaws as first-class categories a
reviewer watches for, separate from ordinary correctness.

The cognitive research is direct about this being a deliberate resource-allocation
act, not incidental: reviewers "scope their attention based on complexity, risk,
and available time," and when a change is judged too complex to reason about from
the diff alone, the response isn't to read harder — it's to change strategy
entirely ("I just ask for a walkthrough"). Risk assessment, in other words, decides
*how* the remaining stages will be carried out, not just how much weight to give the
final verdict.

## Stage 4 — Generate hypotheses

With intent and risk established, the reviewer doesn't pass over the code a second
time passively — they actively generate specific, falsifiable theories about how it
could fail. Google's guidance names this directly: reviewers are told to be
"thinking about edge cases," "looking for concurrency problems," and "trying to
think like a user" — three distinct hypothesis-generating lenses, not a single pass.

The clearest description of the underlying mechanism comes from research on expert
review cognition: reviewers hold a third mental model alongside the actual code and
the expected change — an *ideal implementation*, their own private theory of how
they would have solved the same problem. Discrepancies between that private model
and the real one are what generate the specific questions and comments a review
produces; the model itself is never stated aloud, only its divergences are. This
reframes what looks like "finding bugs" as something closer to running a mental
simulation against a hypothesis, then checking where the real code and the
hypothesis disagree.

## Stage 5 — Seek missing evidence

An experienced reviewer treats the diff as necessary but never sufficient, and
actively goes looking for what it doesn't say. This is one of the most consistently
and concretely evidenced stages across every source. Cognitive research on review
behavior quantifies it directly: reviewers consult issue trackers, prior discussion
threads, and external tools well beyond the code itself, and understanding is
described as developing "incrementally and interactively through conversation — not
just isolated inspection." The same research states the trade-off plainly: a
five-minute conversation with the author can save five hours of solitary reading.

Every review-system's design encodes the same belief. Google's guidance instructs
reviewers to ask the author directly the moment something is unclear, rather than
guess. Microsoft's playbook says the same. Gerrit and Phabricator both build
iterative, comment-and-respond loops into the tooling itself, rather than a single
read-then-verdict pass, because the expectation is that review will surface
questions the diff alone can't answer. The Linux kernel's mailing-list process is
this same principle in its oldest form — patches are discussed, not just read.

## Stage 6 — Form conclusions

At some point the reviewer stops gathering and starts deciding — and what's notable
across every source is that this decision is governed by an explicit standard, not
raw intuition. Google states its decision rule outright: a reviewer should approve
"once it is in a state where it definitely improves the overall code health of the
system being worked on, even if the CL isn't perfect," because "there is no such
thing as 'perfect' code — there is only better code." The reviewer's job at this
stage is explicitly framed as weighing forward progress against the importance of
remaining concerns, not maximizing thoroughness for its own sake.

Meta's own internal framing is compatible with this from the opposite direction —
they track "Eyeball Time," the actual time a reviewer spends looking at a diff, as
a guardrail specifically so that fast approval doesn't collapse into rubber-stamping
disguised as decisiveness. Chromium's LGTM convention captures the same tempered
confidence in its own name: "looks good to me," not a guarantee. The conclusion a
reviewer reaches, in other words, isn't "is this flawless" — it's "does accepting
this, on balance and against everything surfaced in the stages above, leave the
system better than it found it."

## Stage 7 — Produce review

The final stage is not the verdict itself but how it's communicated — and this is
treated as seriously as the analysis that produced it, across sources that
otherwise have little in common. Microsoft's guidance is explicit about tone as a
first-class concern: prefer "we" to "you," ask questions rather than issue
commands, explain the reasoning behind a requested change rather than just
asserting it. Google's guidance asks reviewers to explicitly call out good work,
not just problems. Both converge on the same mechanical device — prefixing
optional, non-blocking feedback with "Nit:" — because conflating a blocking concern
with a stylistic preference forces the author to guess which is which, undermining
everything the earlier stages established.

Chromium's process adds a timeliness dimension to production itself: if a full
review can't be completed promptly, the guidance is to say so explicitly rather
than let a reviewee wait in silence — communication of *status*, not just verdict,
is part of what a review produces. Across every source, the shape is the same: the
output of a review is calibrated, prioritized, and explained, never a flat list of
every discrepancy Stage 4 turned up.

---

## What ties the seven stages together

None of the sources studied describe this as a strictly linear pipeline, and
neither should this document. Risk assessment (Stage 3) reshapes how understanding
(Stage 1) is even attempted. Seeking evidence (Stage 5) routinely sends a reviewer
back to revise their model of intent (Stage 2). The generate-hypotheses stage
(Stage 4) and the seek-evidence stage (Stage 5) are, in the cognitive research,
close to the same loop repeated until confidence is reached, not two cleanly
separate passes. What's consistent, and what every source — however different their
tooling, scale, or era — independently arrives at, is that expertise here isn't
about processing more of the diff more carefully. It's about knowing, at each
stage, what can safely be skipped, and where to deliberately go looking outside the
diff for the one thing that can't.

---

## Sources

- [Introduction — eng-practices (Google)](https://google.github.io/eng-practices/review/)
- [What to look for in a code review — eng-practices (Google)](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [The Standard of Code Review — eng-practices (Google)](https://google.github.io/eng-practices/review/reviewer/standard.html)
- [Code Reviews — Chromium Docs](https://chromium.googlesource.com/chromium/src/+/lkgr/docs/code_reviews.md)
- [Respectful Code Reviews — Chromium Docs](https://chromium.googlesource.com/chromium/src/+/main/docs/cr_respect.md)
- [Gerrit Code Review](https://www.gerritcodereview.com/)
- [Gerrit's approach to code review — Graphite](https://graphite.com/guides/gerrits-approach-to-code-review)
- [Differential: Phabricator's Code Review Application — Graphite](https://graphite.dev/guides/differential-phabricators-code-review-application)
- [Differential User Guide — Phabricator](https://secure.phabricator.com/book/phabricator/article/differential/)
- [Move faster, wait less: Improving code review time at Meta — Engineering at Meta](https://engineering.fb.com/2022/11/16/culture/meta-code-review-time-improving/)
- [Reviewer Guidance — Microsoft Engineering Fundamentals Playbook](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/process-guidance/reviewer-guidance/)
- [How Code Reviews work at Microsoft — Dr. Michaela Greiler](https://www.michaelagreiler.com/code-reviews-at-microsoft-how-to-code-review-at-a-large-software-company/)
- [RDEL #94: How do experienced engineers actually review code?](https://rdel.substack.com/p/rdel-94-how-do-experienced-engineers)
- [Philosophy of Linux kernel patches — kernelnewbies](https://kernelnewbies.org/PatchPhilosophy)
- [Submitting patches: the essential guide — The Linux Kernel documentation](https://docs.kernel.org/process/submitting-patches.html)

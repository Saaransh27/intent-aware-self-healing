# Context Design (Milestone 5A)

**Status: Proposal at the time this document was written — since implemented.** This
document was research + design only when written; the four Context evidence extractors
it proposes were subsequently built in Milestone 5A and are wired into the production
pipeline via `src/pipeline/orchestrator.py`'s `_build_evidence`. See `docs/MILESTONES.md`
(Milestone 5A) and `docs/CURRENT_STATE.md` for their current, implemented state.

## Starting definition

The user's own framing, which this document builds on rather than replaces:

> The minimum additional repository information required to understand a commit
> without reading the entire repository.

One refinement worth making explicit: by the time `collect()` runs, the *entire*
repository is already sitting on disk in `repo_path` — nothing stops us from reading any
file in it. So this was never really about *access*. It's about *not needing to
semantically understand* the rest of the repository (parse its code, build an AST) to
say something useful about a commit's likely reach. Sharpened definition used below:

> Context is what a reviewer would want to have in mind, beyond the diff itself, to
> judge how far a change's effects might reach — derived only from Git history and the
> repository tree, never from parsing or understanding source code semantically.

## The actual starting point: what does a reviewer do?

Before any talk of fields or schemas, the honest exercise is: imagine a PR with one file
changed. Before reading a single line of the diff, what are the first tabs a reviewer
opens?

1. **The PR title / description / commit message** — why is this happening at all.
   Everything else gets filtered through this.
2. **The full file, not just the diff hunk** — the surrounding function/class the
   change sits inside.
3. **"Find usages" on whatever changed** — who calls this function, who imports this
   module. Often the very *first* click, not a late one — it's how reach gets judged.
4. **Blame on the changed lines** — was this written yesterday or three years ago?
5. **The file's own commit history** — how often does this file change? A first-ever
   edit to something stable for two years reads completely differently than the
   twentieth edit this month.
6. **Sibling files in the same directory** — what else lives here conceptually.
7. **The test file** — does one exist? Is it being updated? Code changing without its
   test is itself a signal.
8. **Who owns this / who last touched it** — who to ask if something looks off.
9. **A comparable file elsewhere** — does this follow the same shape as similar code in
   the repo, or diverge from it?
10. **README / module docs** — orientation, only if this part of the codebase is
    unfamiliar.

This isn't just introspection — it matches published research directly. A recent
cognitive-model study of real code review behavior ([Code Review as Decision-Making,
2026](https://arxiv.org/html/2507.09637v1)) found reviewers move through two phases:
first **orientational** — understanding the author, the rationale, the repo, before
touching code at all — then **analytical**, which culminates in **assessing overall
change impact**: "security, performance, interoperability, compatibility with future
development." Rationale first, mechanics second, impact third — in that order, every
time. PR-review guidance from real engineering orgs says the same thing independently:
understand intent and business context *before* line-by-line review, and treat
tests/docs/config as equally important as the code itself, not an afterthought
([PR review guidance](https://pharmaverse.github.io/admiraldev/articles/pr_review_guidance.html)).

## What Context means, stripped to one sentence

Every tab above is answering the same implicit question a reviewer always asks:

> **"What do I need to have in my head, that isn't in this diff, to judge whether this
> change is bigger than it looks?"**

That splits into eight genuinely distinct ideas — not a flat list of fields, a set of
*categories of thing a reviewer needs*:

| Category | The question it answers | Reviewer's tab |
|---|---|---|
| **Rationale** | Why is this happening? | PR description, commit message |
| **Reach** | Who else depends on this file? | "Find usages" |
| **Lineage** | Is this stable ground being disturbed, or a hotspot again? | Blame, file history |
| **Neighborhood** | What sits next to this, conceptually and physically? | Sibling files |
| **Verification surface** | Does this have tests, did they move too? | Test file |
| **Ownership** | Who would I ask if I'm unsure? | Blame / last-touched-by |
| **Convention** | Does this match how similar things are usually done here? | A comparable file |
| **Orientation** | What is this part of the system even for? | README / module docs |

## Mapping against what we already have

Some of these are already partly answered by sections already built — Context, in this
project, is specifically about closing the *remaining* gap, not duplicating work.

- **Rationale** — partially covered. `metadata.message` gives the commit message, but a
  reviewer's real "why" often lives in a linked issue or PR description, which sits
  outside git entirely (GitHub API, out of reach today — same reasoning as
  `build_system_detector`'s deferred stars/description fields).
- **Reach** — not covered at all today. The one every reviewer workflow (mine, and the
  published research) puts *first*, and the one hardest for us to get deterministically,
  because the traditional way to get it — call graphs, "find usages" — requires parsing
  code per language. The available substitute, historical co-change (files that
  empirically change together over time), is real change-impact-analysis literature, not
  invented for this project — but it's a correlation-based proxy for "reach," not the
  real thing, and that difference should stay visible in whatever we eventually build.
- **Lineage** — not covered. Purely git history (blame, commit count per file) — no
  parsing needed at all.
- **Neighborhood** — not covered at the per-commit level. `layout_detector` already
  tells us directory *categories* repo-wide; it doesn't tell us "what else lives next to
  the specific files this commit touched."
- **Verification surface** — partially covered. `observations.touches_tests` (a boolean,
  from Milestone 4B) already tells us *whether* a test category was touched — it doesn't
  tell us whether a corresponding test *exists but wasn't touched*, which is arguably the
  more interesting signal ("code changed, its test didn't").
- **Ownership** — partially covered at the *repo* level (`repository.json`'s
  `contributors`), not at the *file* level. Knowing the whole repo has 12 contributors
  doesn't tell you which one actually owns this specific file.
- **Convention** — not covered at all, and probably the hardest of the eight to make
  genuinely deterministic without drifting into subjective judgement ("does this look
  similar" is inherently fuzzier than the others).
- **Orientation** — not covered, and arguably the weakest fit for a benchmark sample
  anyway — README content is closer to a nice-to-have than a signal about *this commit's*
  reach specifically.

## What's out of reach regardless of category

- **Call graphs / import graphs** — the traditional way to get real "Reach." Requires
  per-language AST parsing (Tree-sitter or similar) — every modern AI code-review
  "blast radius" tool actually uses this ([Code Change Blast
  Radius](https://pharaoh.so/blog/code-change-blast-radius/)), which is worth naming
  honestly: we're choosing a deliberately weaker, git-only proxy for "Reach," not
  reinventing the state of the art.
- **Dynamic test coverage** — the real mechanism behind knowing which tests would fail.
  Requires actually running the target repo's test suite; not a git artifact.
- **PR description / issue text / review comments** — real "Rationale," per SWE-bench's
  own use of `hints_text` ([SWE-bench dataset](https://huggingface.co/datasets/SWE-bench/SWE-bench)).
  GitHub API, not git.
- **Semantic/embedding similarity** — "no AI," unchanged since this project's first
  milestone.

## Open questions, conceptual (not implementation) ones first

1. **Which of the eight categories actually belong in this benchmark**, given what
   we're building toward (`PROJECT.md`'s five questions)? My read: Reach, Lineage,
   Neighborhood, and the gap in Verification surface are the strongest fits. Ownership
   is useful but secondary. Convention and Orientation feel weakest — worth your gut
   check before I weight them at all.
2. **Is a weaker, correlation-based proxy for Reach (co-change) worth including at all**,
   given it's honestly not the same thing as real "who calls this" — or would presenting
   it risk implying more confidence than it deserves?
3. **Does "no language-specific parsing" (Milestone 4B's constraint) hold for Context
   too?** This is really asking: is real "Reach" (import/call graphs) permanently out of
   scope, or just deferred?

## Implementation feasibility notes (deferred — not the point of this document)

Kept here only because the checks are real and shouldn't be redone later. None of this
should drive *what* belongs in Context — that's the section above.

- Verified against real `fastapi/fastapi` history (7,487 commits) that no single git
  command produces co-change data directly — it requires listing a file's touching
  commits, then fetching each of those commits' full changed-file lists, an N+1 pattern.
- Real file history depths sampled: a "hot" file had 176 touching commits, a moderately
  active one 105, a rarely-touched one 7 — meaning any history walk needs an explicit
  bound before it's built, not an unbounded walk.
- Any history walk must be scoped to the target commit itself (its ancestors), never
  `HEAD`, so a historical benchmark sample can never "see" commits from its own future —
  the same discipline `GitClient` already applies everywhere.

## Recommended path forward

Talk through the conceptual open questions above first — which categories genuinely earn
a place, and whether a labeled-as-weak Reach proxy is worth having at all — before
picking a first concrete field to build. Same incremental discipline as every other
milestone here: one thing at a time, verified against real repos, once we agree on *what*
it is.

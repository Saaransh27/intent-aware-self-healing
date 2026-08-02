# evidence_fusion

`src/fusion/evidence_fusion.py`

## Purpose

An adapter layer between the extraction layer (`change_set`, `observations`,
`file_history`, `co_change`, `local_module_context`, `repository_signals`,
`semantic_analysis`, `metadata`) and the future Reasoning Engine. It performs no
reasoning, scoring, classification, or inference — its only job is to reshape
independently-built evidence sections into **entity-centric bundles** (one per commit,
one per changed file) behind a single stable contract, so the Reasoning Engine never
needs to know which section is dict-shaped, which is list-shaped, or which sections are
nested inside `observations`.

**Lossless by design.** Fusion may normalize, reshape, group, and copy evidence — it
must never summarize, filter, merge, rank, infer, or discard information. Every fact
produced by the extraction layer remains reachable somewhere in its output, verbatim.
`change_set`'s full, untouched object is always present in the commit bundle
specifically so nothing is lost even where a per-file convenience field is derived from
it (see below).

Not persisted. `fuse_evidence` is a pure function of its input — callable on demand by
whatever assembles or reads the evidence, regenerable at any time, never written to disk
as a competing artifact.

## Public API

- `fuse_evidence(evidence: dict) -> dict` — the module's only public function.

  ```
  {
    "commit": {
      "metadata": {"status": ..., "evidence": ...},
      "change_set": {"status": ..., "evidence": ...},
      "repository_signals": {"status": ..., "evidence": ...},
      "touched_directories": {"status": ..., "evidence": ...},
      "change_statistics": {"status": ..., "evidence": ...},
      "change_categories": {"status": ..., "evidence": ...},
      "extraction_confidence": {"status": ..., "evidence": ...}
    },
    "files": [
      {
        "file_path": ...,
        "change_set": {"status": ..., "evidence": {"file_status": ..., "old_path": ...}},
        "file_classification": {"status": ..., "evidence": ...},
        "file_history": {"status": ..., "evidence": ...},
        "co_change": {"status": ..., "evidence": ...},
        "local_module_context": {"status": ..., "evidence": ...},
        "semantic_analysis": {"status": ..., "evidence": ...}
      }
    ]
  }
  ```

  Every entry is the same envelope: `{"status": "ok"|"not_applicable"|"not_collected",
  "evidence": <verbatim value> | None}`. `evidence`, when `status` is `"ok"`, is the
  exact value already produced upstream — copied out, never restructured or renamed.

## Responsibilities

- `_resolve_*` functions (one per evidence category) each decide `status` by checking
  *presence*, never by inspecting or judging the value itself:
  - `not_collected` — the section is entirely absent from the input (e.g. no
    `semantic_analysis` key at all).
  - `not_applicable` — the section is present, but this entity has no entry in it (a
    non-Python file has no entry in `semantic_analysis.files`).
  - `ok` — an entry exists; `evidence` is that value, verbatim.
- Each resolver hides exactly one structural quirk of its section: `file_history`/
  `co_change`/`local_module_context` are flat dicts keyed by path (a direct lookup);
  `file_classification` is nested one level inside `observations`; `semantic_analysis`
  is a **list** of per-file dicts (a linear search by `file_path`, not a lookup);
  `change_set` has no per-file structure at all — a file's status is derived by
  checking which of four lists (or the `renamed_files` entries) contains its path. This
  last one is the only genuine reshape in the module: turning list membership into one
  labeled fact (`file_status`), using `change_set`'s own existing vocabulary
  (`added`/`deleted`/`modified`/`renamed`) — not an invented concept, and the full
  original `change_set` object is still passed through, untouched, in the commit
  bundle.
- `fuse_evidence` enumerates file entities from `change_set.changed_files` — if
  `change_set` itself is absent, there is no way to know which files exist, so `files`
  is simply empty; this is an honest degenerate case, not something Fusion works around
  by inferring file identity from other sections.

## Internal Workflow

No I/O, no git access, no dependency on `GitClient` or `DatasetCollector` — `evidence`
is just a dict shaped like whatever subset of extraction sections is present. Fusion
treats each section as flat and independently optional; there is no `"context"`
wrapper, because that nesting (raised as an open question in `docs/context_design.md`)
was never actually decided or built. If a future decision does nest
`file_history`/`co_change`/`local_module_context`/`repository_signals` under a single
key, only this module's resolvers need to change — the bundle contract stays the same.

`artifacts`/`collection`/`identity` are out of scope — bookkeeping about where a commit
or its raw files live, not evidence about the change itself, same boundary drawn for
`context_design.md`'s original scoping.

## Dependencies

Python stdlib only. No dependency on any other module in the project — takes a plain
dict in, returns a plain dict out.

## Future Improvements

- `not_applicable` is currently only ever exercised by `semantic_analysis` (the one
  conditionally-applicable section, Python-only). `file_history`/`co_change`/
  `local_module_context` are computed unconditionally for every changed file today, so
  they never actually produce `not_applicable` in practice — the resolver still
  supports it, for whichever of them becomes conditional first.
- Verified against real commits in `pallets/flask` (`06ea505c` — non-Python files
  correctly `not_applicable` for `semantic_analysis`, verbatim pass-through confirmed by
  direct comparison against the raw extractor output) and `tcx_nogrunt-1` (`d99f6cb` —
  a real non-trivial rename correctly reshaped to `{"file_status": "renamed",
  "old_path": ...}`; a `not_collected` state confirmed by simulating a missing section).

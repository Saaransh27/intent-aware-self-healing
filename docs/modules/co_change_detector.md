# co_change_detector

`src/utils/co_change_detector.py`

## Purpose

Rank a file's historical co-change partners — files that have empirically changed
alongside it across its (bounded) commit history. Pure computation only; the git history
walk that produces its input lives in `GitClient`, not here. Built for Milestone 5A
("Historical Co-Change"), one of the four independent evidence extractors.

## Responsibilities

- `rank_co_changed_files(file_path, historical_file_lists, top_n=10) -> list[dict]` —
  counts how often each other file appears alongside `file_path` across a list of
  historical commits' full changed-file lists, and returns the top N by frequency.

## Internal Workflow

Pure function, no I/O, no git access. Tallies occurrences of every path across
`historical_file_lists` (excluding `file_path` itself), sorts descending by count, and
returns `{"path": ..., "co_change_count": ...}` entries for the top `top_n`.

## Dependencies

Python stdlib only. No dependency on `GitClient` or any other detector — takes the raw
historical file-lists as plain data, returns a plain list.

## Future Improvements

- `top_n=10` and the caller-supplied history bound (`GitClient.get_co_change_history`'s
  `max_history=50`) are both defaults chosen without a specific validation loop behind
  them — reasonable starting points, not tuned values.
- No weighting by recency within the window itself — every historical commit inside the
  bound counts equally; a commit from just outside the window is treated as if it never
  happened. The bound itself provides *coarse* recency-weighting (old patterns eventually
  age out), but nothing graduated within it.
- Verified against real `fastapi/fastapi` history: `fastapi/routing.py`'s top co-change
  partners were genuinely plausible FastAPI internals (`dependencies/utils.py`,
  `applications.py`, `openapi/utils.py`), not noise — a real, not just theoretical,
  validation that the signal captures meaningful coupling.

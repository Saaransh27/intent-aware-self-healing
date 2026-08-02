import re

# Exact section header text as instructed by src/prompt/prompt_builder.py's
# SYSTEM_PROMPT (OUTPUT FORMAT). This module deliberately knows nothing about
# the Review Engine or the Adapter — it only shapes an already-produced
# response string for the API's response schema.
SECTION_KEYS = (
    ("verdict", "Verdict"),
    ("what_changed_and_why", "What changed and why"),
    ("what_deserves_attention_ranked", "What deserves attention, ranked"),
    ("open_questions", "Open questions"),
    ("minor_notes", "Minor notes"),
)

_HEADING_LINE = re.compile(r"^#{1,6}\s*(.+?)\s*$")


def parse_review_sections(response_text):
    """Splits a model response into the five ADR-013 sections, matched on
    literal markdown heading text. Returns None (never raises) if the text
    isn't a non-empty string or doesn't contain all five expected headings —
    the model's own internal sub-structure below heading level is never
    parsed, since ADR-013 does not constrain it."""
    if not isinstance(response_text, str) or not response_text.strip():
        return None

    lines = response_text.splitlines()
    headings_by_key = {key: label.casefold() for key, label in SECTION_KEYS}
    found_positions = []

    for line_index, line in enumerate(lines):
        match = _HEADING_LINE.match(line.strip())
        if not match:
            continue
        heading_text = match.group(1).strip().casefold()
        for key, expected in headings_by_key.items():
            if heading_text == expected:
                found_positions.append((line_index, key))
                break

    if {key for _, key in found_positions} != set(headings_by_key):
        return None

    found_positions.sort()
    sections = {}
    for position, (line_index, key) in enumerate(found_positions):
        start = line_index + 1
        end = found_positions[position + 1][0] if position + 1 < len(found_positions) else len(lines)
        sections[key] = "\n".join(lines[start:end]).strip()

    return sections

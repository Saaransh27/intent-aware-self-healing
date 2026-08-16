import json
import re
from typing import get_args

from pydantic import ValidationError

from src.api.models import StructuredFinding

# Milestone 8, Part A5. Extracts and validates the model's own structured
# findings from section 3 of its response ("What deserves attention,
# ranked" -- see src/prompt/prompt_builder.py's OUTPUT FORMAT). The
# guiding rule throughout this module: repair only what is mechanically
# safe (whitespace, casing, a bare string where an array was expected) --
# never invent or reinterpret a field's meaning. Anything that still
# doesn't fit the contract after that is rejected, not guessed at.

_JSON_FENCE = re.compile(r"```(?:json)?\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)
_TRAILING_COMMA = re.compile(r",(\s*[\]}])")

_ENUM_FIELDS = (
    "category", "severity", "confidence", "evidenceStrength", "status", "proofType",
)
_STRING_LIST_FIELDS = ("evidence", "affectedFiles", "affectedSymbols", "verificationNeeded")

_LITERAL_VALUES = {
    field_name: get_args(StructuredFinding.model_fields[field_name].annotation)
    for field_name in _ENUM_FIELDS
}


def _extract_json_array_text(section_text):
    if not isinstance(section_text, str):
        return None
    match = _JSON_FENCE.search(section_text)
    if match is None:
        return None
    return match.group(1).strip()


def _repair_enum_case(raw_finding):
    """Fixes whitespace/casing drift against the exact literal the field
    expects (e.g. "confirmed" -> "Confirmed"). Never maps between distinct
    terms -- a value like "Likely" is left as-is and will fail validation,
    since silently reinterpreting it as one of the three allowed confidence
    terms would be a fabrication, not a repair."""
    repaired = dict(raw_finding)
    for field_name in _ENUM_FIELDS:
        value = repaired.get(field_name)
        if not isinstance(value, str):
            continue
        allowed = _LITERAL_VALUES[field_name]
        if value in allowed:
            continue
        stripped = value.strip()
        for candidate in allowed:
            if stripped.casefold() == candidate.casefold():
                repaired[field_name] = candidate
                break
    return repaired


def _repair_list_fields(raw_finding):
    """Wraps a bare string in a single-element list for fields the schema
    requires as arrays -- a common, harmless model slip that carries no
    ambiguity about intent."""
    repaired = dict(raw_finding)
    for field_name in _STRING_LIST_FIELDS:
        value = repaired.get(field_name)
        if isinstance(value, str):
            repaired[field_name] = [value] if value.strip() else []
    return repaired


def _validate_one(raw_finding):
    if not isinstance(raw_finding, dict):
        return None, "finding is not a JSON object"
    repaired = _repair_list_fields(_repair_enum_case(raw_finding))
    try:
        return StructuredFinding.model_validate(repaired), None
    except ValidationError as exc:
        return None, str(exc)


def parse_structured_findings(section_text):
    """Returns a dict shaped like api.models.StructuredFindingsResult.

    - state "unavailable": no fenced JSON array could be extracted or
      parsed at all -- nothing here can be trusted as structured data, and
      callers must not derive a verdict from it.
    - state "reduced": the JSON parsed, but one or more individual findings
      had to be dropped for not matching the schema -- what remains is
      real, but the set is known-incomplete.
    - state "ok": every element the model reported validated cleanly,
      including the legitimate case of an empty array ("nothing requires
      special attention").
    """
    raw_text = _extract_json_array_text(section_text)
    if raw_text is None:
        return {
            "state": "unavailable",
            "findings": [],
            "total_reported": 0,
            "rejected_count": 0,
            "parse_error": "no fenced JSON code block found in the ranked-attention section",
        }

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        try:
            parsed = json.loads(_TRAILING_COMMA.sub(r"\1", raw_text))
        except json.JSONDecodeError as exc:
            return {
                "state": "unavailable",
                "findings": [],
                "total_reported": 0,
                "rejected_count": 0,
                "parse_error": f"the ranked-attention section's JSON could not be parsed: {exc}",
            }

    if not isinstance(parsed, list):
        return {
            "state": "unavailable",
            "findings": [],
            "total_reported": 0,
            "rejected_count": 0,
            "parse_error": "the ranked-attention section's JSON is not an array",
        }

    validated = []
    for raw_finding in parsed:
        finding, _error = _validate_one(raw_finding)
        if finding is not None:
            validated.append(finding)

    total_reported = len(parsed)
    rejected_count = total_reported - len(validated)
    return {
        "state": "reduced" if rejected_count > 0 else "ok",
        "findings": validated,
        "total_reported": total_reported,
        "rejected_count": rejected_count,
        "parse_error": None,
    }

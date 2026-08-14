import re

from src.api.response_parser import SECTION_KEYS

_HEADING_LINE = re.compile(r"^#{1,6}\s*(.+?)\s*$")
_FENCE_LINE = re.compile(r"^```")

# The closed, enumerable set of claim ids actually emitted by
# src/reasoning/modules/*.py. Anchoring on these exact strings (rather than
# a prefix plus a generic "any dotted word" suffix) is what keeps this check
# from firing on legitimate prose/code references such as "numpy.pad",
# "self.band.id", or an ordinary filename that happens to start with a
# claim-id prefix, like "documentation.md".
_CLAIM_IDS = (
    "shape.heterogeneous_categories",
    "shape.homogeneous_categories",
    "shape.low_extraction_confidence",
    "shape.narrow_change",
    "shape.touches_build_files",
    "shape.touches_ci",
    "shape.touches_config",
    "shape.touches_dependencies",
    "shape.touches_documentation",
    "shape.touches_tests",
    "shape.wide_change",
    "history.first_appearance",
    "history.first_author_touch",
    "history.high_recent_churn",
    "history.hot_file",
    "history.long_dormant_reactivated",
    "history.rapid_iteration",
    "reach.corroborated_wide_reach",
    "reach.expected_co_change_partner_missing",
    "reach.high_historical_coupling",
    "reach.isolated_module",
    "reach.large_neighborhood",
    "reach.no_historical_coupling",
    "verification.no_test_files_changed",
    "verification.public_change_without_tests",
    "verification.test_files_changed",
    "contract.decorator_changed",
    "contract.public_signature_changed",
    "contract.public_symbol_removed",
    "interaction.callees_changed",
    "error_handling.exceptions_caught_changed",
    "error_handling.exceptions_raised_changed",
    "resource_management.context_managers_changed",
    "documentation.deprecation_marker_added",
    "structure.internal_symbol_added",
)
_CLAIM_ID_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(claim_id) for claim_id in _CLAIM_IDS) + r")\b"
)

# FORBIDDEN BEHAVIORS reserves these four words for the Claims themselves —
# never for the model's own conclusions. Distinct from the four allowed
# uncertainty-vocabulary terms (Confirmed/Likely/Worth checking/Unknown),
# which must never be flagged by this check.
_RESERVED_TIER_WORDS = ("observed", "corroborated", "inferred", "conflicting")
_RESERVED_TIER_TAG_PATTERN = re.compile(
    r"\((?:" + "|".join(_RESERVED_TIER_WORDS) + r")\b[^)]*\)", re.IGNORECASE
)
# Same pattern, but also consumes a preceding space so stripping the tag
# never leaves a stray double-space or a space before punctuation.
_RESERVED_TIER_TAG_STRIP_PATTERN = re.compile(
    r"\s*\((?:" + "|".join(_RESERVED_TIER_WORDS) + r")\b[^)]*\)", re.IGNORECASE
)


def sanitize_response(text):
    """Best-effort cleanup of a known-safe-to-strip artifact: a reserved
    confidence-tier word used as a self-applied parenthetical tag (e.g.
    "(observed low extraction confidence)"). This pattern is always a
    parenthetical aside, so removing it never breaks the surrounding
    sentence's grammar.

    A literal claim-id leak (_CLAIM_ID_PATTERN) is deliberately NOT stripped
    here: it's often embedded inline in a sentence (e.g. "...because
    shape.low_extraction_confidence"), so removing it can leave a
    grammatically broken result. That case is left for the validator to
    flag rather than silently rewritten.
    """
    return _RESERVED_TIER_TAG_STRIP_PATTERN.sub("", text)

# A maintained, growable list seeded from phrases actually observed leaking
# during the Milestone 16B benchmark. Lower precision than the claim-id
# check by nature — flagged as WARNING, never sanitized.
_MODULE_JARGON_PATTERNS = (
    re.compile(r"\bsymbol[- ]level claims?\b", re.IGNORECASE),
    re.compile(r"\bsymbol claims?\b", re.IGNORECASE),
    re.compile(r"\bsemantic analysis claim\b", re.IGNORECASE),
    re.compile(r"\bcontract stability\b", re.IGNORECASE),
    re.compile(r"\bcontract analysis\b", re.IGNORECASE),
    re.compile(r"\bbody[- ]evidence\b", re.IGNORECASE),
    re.compile(r"\bcoverage ledger\b", re.IGNORECASE),
    re.compile(r"\bevidence units?\b", re.IGNORECASE),
    re.compile(r"\bthe claims? (?:indicate|show|record|note)s?\b", re.IGNORECASE),
)

_BOLD_MARKER = "**"
_MIN_DUPLICATE_PARAGRAPH_LENGTH = 20
# Milestone 5: a real, demonstrated false positive -- Python double-star
# syntax (`**kwargs`, dict-unpacking) referenced inside inline code spans
# is common in a code-review response and has nothing to do with Markdown
# bold. Stripped before counting, the same way _scan_headings already
# treats fenced code blocks as opaque.
_INLINE_CODE_SPAN = re.compile(r"`[^`\n]*`")

_EXPECTED_ORDER = [key for key, _ in SECTION_KEYS]
_LABEL_TO_KEY = {label.casefold(): key for key, label in SECTION_KEYS}
_KEY_TO_LABEL = dict(SECTION_KEYS)


def _finding(rule, severity, message, location=None):
    return {"rule": rule, "severity": severity, "message": message, "location": location}


def _line_of(text, char_index):
    return text.count("\n", 0, char_index)


def _scan_headings(lines):
    """Finds every heading-shaped line, skipping any that fall inside an
    open code fence — matching how a Markdown renderer (and any downstream
    consumer) would actually interpret the text, not a naive per-line scan."""
    headings = []
    in_fence = False
    for line_index, line in enumerate(lines):
        stripped = line.strip()
        if _FENCE_LINE.match(stripped):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = _HEADING_LINE.match(stripped)
        if match:
            headings.append((line_index, match.group(1).strip()))
    return headings


def _classify_headings(headings):
    known, unknown = [], []
    for line_index, text in headings:
        key = _LABEL_TO_KEY.get(text.casefold())
        (known if key is not None else unknown).append(
            (line_index, key if key is not None else text)
        )
    return known, unknown


def _section_bodies(lines, known_headings):
    ordered = sorted(known_headings)
    bodies = {}
    for position, (line_index, key) in enumerate(ordered):
        if key in bodies:
            continue
        start = line_index + 1
        end = ordered[position + 1][0] if position + 1 < len(ordered) else len(lines)
        bodies[key] = "\n".join(lines[start:end])
    return bodies


def _check_missing_and_duplicate_sections(known_headings):
    counts, first_seen = {}, {}
    for line_index, key in known_headings:
        counts[key] = counts.get(key, 0) + 1
        first_seen.setdefault(key, line_index)

    findings = []
    for key in _EXPECTED_ORDER:
        label = _KEY_TO_LABEL[key]
        count = counts.get(key, 0)
        if count == 0:
            findings.append(_finding(
                "missing_section", "ERROR",
                f"Required section '{label}' is missing.",
            ))
        elif count > 1:
            findings.append(_finding(
                "duplicate_section_heading", "WARNING",
                f"Section '{label}' appears {count} times; only the first is used.",
                first_seen[key],
            ))
    return findings


def _check_order(known_headings):
    seen_order = []
    for _, key in known_headings:
        if key not in seen_order:
            seen_order.append(key)
    expected_subsequence = [key for key in _EXPECTED_ORDER if key in seen_order]
    if seen_order != expected_subsequence:
        return [_finding(
            "sections_out_of_order", "WARNING",
            "Sections do not appear in the required order (Verdict, What "
            "changed and why, What deserves attention ranked, Open "
            "questions, Minor notes).",
        )]
    return []


def _check_unknown_headings(unknown_headings):
    return [
        _finding(
            "unknown_heading", "WARNING",
            f"Heading '{text}' is not one of the five required section names.",
            line_index,
        )
        for line_index, text in unknown_headings
    ]


def _check_empty_sections(bodies, known_headings):
    first_seen = {}
    for line_index, key in known_headings:
        first_seen.setdefault(key, line_index)
    return [
        _finding(
            "empty_section_body", "WARNING",
            f"Section '{_KEY_TO_LABEL[key]}' has no content.",
            first_seen.get(key),
        )
        for key, body in bodies.items()
        if not body.strip()
    ]


def _check_duplicated_paragraphs(bodies):
    paragraph_to_sections = {}
    for key, body in bodies.items():
        for raw_paragraph in re.split(r"\n\s*\n", body):
            normalized = re.sub(r"\s+", " ", raw_paragraph).strip()
            if len(normalized) < _MIN_DUPLICATE_PARAGRAPH_LENGTH:
                continue
            paragraph_to_sections.setdefault(normalized, set()).add(key)

    findings = []
    for keys in paragraph_to_sections.values():
        if len(keys) > 1:
            names = ", ".join(_KEY_TO_LABEL[k] for k in sorted(keys, key=_EXPECTED_ORDER.index))
            findings.append(_finding(
                "duplicated_paragraph", "WARNING",
                f"The same point appears in more than one section ({names}).",
            ))
    return findings


def _check_claim_id_leaks(text):
    return [
        _finding(
            "literal_claim_id_leak", "ERROR",
            f"Internal claim id {match.group(0)!r} appears verbatim in the response.",
            _line_of(text, match.start()),
        )
        for match in _CLAIM_ID_PATTERN.finditer(text)
    ]


def _check_reserved_tier_self_tagging(text):
    return [
        _finding(
            "reserved_confidence_tier_self_tagging", "ERROR",
            f"Reserved word used as a self-applied tag: {match.group(0)!r}.",
            _line_of(text, match.start()),
        )
        for match in _RESERVED_TIER_TAG_PATTERN.finditer(text)
    ]


def _check_module_jargon(text):
    return [
        _finding(
            "module_jargon_leak", "WARNING",
            f"Internal terminology-like phrase found: {match.group(0)!r}.",
            _line_of(text, match.start()),
        )
        for pattern in _MODULE_JARGON_PATTERNS
        for match in pattern.finditer(text)
    ]


def _check_bold_balance(text):
    text_outside_inline_code = _INLINE_CODE_SPAN.sub("", text)
    if text_outside_inline_code.count(_BOLD_MARKER) % 2 != 0:
        return [_finding(
            "malformed_markdown", "WARNING",
            "Unbalanced '**' (bold) markers in the response.",
        )]
    return []


def _check_code_fences(lines):
    fence_lines = [i for i, line in enumerate(lines) if _FENCE_LINE.match(line.strip())]
    if len(fence_lines) % 2 != 0:
        return [_finding(
            "unclosed_code_fence", "ERROR",
            "An unclosed code fence ('```') may hide subsequent sections "
            "from being recognized.",
            fence_lines[-1],
        )]
    return []


def _outcome_for(findings):
    if any(f["severity"] == "ERROR" for f in findings):
        return "invalid"
    if findings:
        return "flagged"
    return "clean"


def validate_response(response_text):
    """Deterministically checks a model response for ADR-013 presentation-
    contract compliance: required-section formatting, internal-vocabulary
    leaks, and structural well-formedness. Inspects the response text only —
    no evidence, no Claims/Gaps, no model call, no network access. Never
    mutates the input, never logs, never raises; always returns a report."""
    text = response_text if isinstance(response_text, str) else ""
    lines = text.splitlines()

    known_headings, unknown_headings = _classify_headings(_scan_headings(lines))
    bodies = _section_bodies(lines, known_headings)

    findings = [
        *_check_missing_and_duplicate_sections(known_headings),
        *_check_order(known_headings),
        *_check_unknown_headings(unknown_headings),
        *_check_empty_sections(bodies, known_headings),
        *_check_duplicated_paragraphs(bodies),
        *_check_claim_id_leaks(text),
        *_check_reserved_tier_self_tagging(text),
        *_check_module_jargon(text),
        *_check_bold_balance(text),
        *_check_code_fences(lines),
    ]

    return {"outcome": _outcome_for(findings), "findings": findings}

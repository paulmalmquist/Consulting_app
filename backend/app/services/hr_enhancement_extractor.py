"""History Rhymes research → planning bridge: deterministic brief extractor.

Parses a weekly research brief markdown into the canonical 7 sections, extracts
Enhancement Path items into normalized candidates, and preserves adversarial
stress-test verdicts. Pure (no DB, no LLM, no network).

Design contract (locked by plan review):
  - The 7-section structure is the canonical parser contract. A heading-alias
    map provides tolerance; unknown headings are ignored.
  - Confidence is a simple deterministic fraction for display only — NOT a
    scoring system. Clear structure → success; otherwise → degraded.
  - Fail closed: when structure is weak the result is `degraded` with warnings
    and zero candidates. Missing sub-fields are left None — never fabricated.
    Unclear structure degrades; it is never "recovered."

Usage:
    from app.services.hr_enhancement_extractor import extract_enhancements
    result = extract_enhancements(markdown_text)
    result.degraded, result.confidence, result.candidates
    result.to_dict()  # JSON-serializable; stored as parsed_json archive
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# ── Canonical contract ────────────────────────────────────────────────────────

CANONICAL_SECTIONS: list[str] = [
    "executive_summary",
    "thematic_findings",
    "enhancement_path",
    "adversarial_stress_test",
    "signal_pulse",
    "open_questions",
    "honeypot_alert",
]

# Normalized heading text → canonical section key. Normalization lowercases and
# strips punctuation (see _normalize_heading). Legacy/skeletal aliases included
# (e.g. "themes" → thematic_findings) for tolerance, never fabrication.
SECTION_ALIASES: dict[str, str] = {
    "executive summary": "executive_summary",
    "exec summary": "executive_summary",
    "summary": "executive_summary",
    "thematic findings": "thematic_findings",
    "thematic": "thematic_findings",
    "themes": "thematic_findings",
    "key themes": "thematic_findings",
    "enhancement path": "enhancement_path",
    "enhancements": "enhancement_path",
    "enhancement candidates": "enhancement_path",
    "enhancement opportunities": "enhancement_path",
    "action items": "enhancement_path",
    "recommended actions": "enhancement_path",
    "adversarial stress test": "adversarial_stress_test",
    "adversarial stress tests": "adversarial_stress_test",
    "stress test": "adversarial_stress_test",
    "adversarial": "adversarial_stress_test",
    "red team": "adversarial_stress_test",
    "signal pulse": "signal_pulse",
    "standing signal pulse": "signal_pulse",
    "standing signal pulse check": "signal_pulse",
    "signal pulse check": "signal_pulse",
    "pulse": "signal_pulse",
    "open questions": "open_questions",
    "unresolved questions": "open_questions",
    "questions": "open_questions",
    "honeypot alert": "honeypot_alert",
    "honeypot alerts": "honeypot_alert",
    "honeypot": "honeypot_alert",
    "trap alert": "honeypot_alert",
}

# Success requires a clear structure. Binary-ish (guardrail 2).
MIN_SECTIONS_FOR_SUCCESS = 4
LOW_CONFIDENCE_THRESHOLD = 0.5  # == 3.5/7; 4+ canonical sections clears it

VALID_PRIORITIES = {"low", "medium", "high", "critical"}
ADVERSARIAL_VERDICT_TOKENS = ("PASS", "FAIL", "HOLD", "CAUTION", "ABSTAIN")

_HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)\s*#*\s*$")
_BULLET_RE = re.compile(r"^(\s*)(?:[-*+]|\d+[.)])\s+(.*\S)\s*$")
_SUBHEAD_RE = re.compile(r"^(#{3,6})[ \t]+(.+?)\s*#*\s*$")
_NUMBER_RE = re.compile(r"(\d+(?:\.\d+)?)")


# ── Result types ──────────────────────────────────────────────────────────────


@dataclass
class ExtractionCandidate:
    title: str
    category: str | None = None
    what: str | None = None
    why: str | None = None
    effort_days: float | None = None
    expected_impact: str | None = None
    dependencies: list[str] = field(default_factory=list)
    priority: str = "medium"
    confidence: float | None = None
    adversarial_verdict: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "category": self.category,
            "what": self.what,
            "why": self.why,
            "effort_days": self.effort_days,
            "expected_impact": self.expected_impact,
            "dependencies": list(self.dependencies),
            "priority": self.priority,
            "confidence": self.confidence,
            "adversarial_verdict": self.adversarial_verdict,
        }


@dataclass
class ExtractionResult:
    title: str | None
    regime_call: str | None
    confidence: float
    freshness_score: float | None
    degraded: bool
    warnings: list[str]
    found_sections: list[str]
    sections: dict[str, str]
    candidates: list[ExtractionCandidate]

    @property
    def metrics(self) -> dict[str, Any]:
        return {
            "sections_found": len(self.found_sections),
            "candidate_count": len(self.candidates),
            "confidence": self.confidence,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "regime_call": self.regime_call,
            "confidence": self.confidence,
            "freshness_score": self.freshness_score,
            "degraded": self.degraded,
            "warnings": list(self.warnings),
            "found_sections": list(self.found_sections),
            "sections": dict(self.sections),
            "candidates": [c.to_dict() for c in self.candidates],
            "metrics": self.metrics,
        }


# ── Public API ────────────────────────────────────────────────────────────────


def extract_enhancements(markdown: str) -> ExtractionResult:
    """Deterministically extract structure + enhancement candidates from a brief.

    Never raises on malformed input — returns a degraded result with warnings.
    """
    warnings: list[str] = []

    if not markdown or not markdown.strip():
        return ExtractionResult(
            title=None,
            regime_call=None,
            confidence=0.0,
            freshness_score=None,
            degraded=True,
            warnings=["Empty markdown content; nothing to extract."],
            found_sections=[],
            sections={},
            candidates=[],
        )

    title, preamble, sections = _split_sections(markdown, warnings)
    regime_call, header_confidence, freshness_score, has_header_meta = _parse_header_meta(
        preamble
    )

    found_sections = [k for k in CANONICAL_SECTIONS if k in sections]
    sections_found = len(found_sections)
    display_confidence = round(sections_found / len(CANONICAL_SECTIONS), 3)

    candidates: list[ExtractionCandidate] = []
    if "enhancement_path" in sections:
        candidates = _parse_enhancement_items(sections["enhancement_path"], warnings)
    else:
        warnings.append(
            "No Enhancement Path section found; no enhancement candidates extracted."
        )

    if "adversarial_stress_test" in sections and candidates:
        _apply_adversarial_verdicts(
            sections["adversarial_stress_test"], candidates, warnings
        )

    structured_ok = len(candidates) >= 1
    structure_ok = (
        sections_found >= MIN_SECTIONS_FOR_SUCCESS
        and display_confidence >= LOW_CONFIDENCE_THRESHOLD
        and "enhancement_path" in sections
        and structured_ok
        and has_header_meta
    )
    degraded = not structure_ok

    if degraded:
        # Fail closed: do not surface partially-trusted candidates (guardrail 2).
        if not has_header_meta:
            warnings.append(
                "Brief header metadata (Regime call / Confidence / Freshness "
                "score) missing or unparseable."
            )
        if sections_found < MIN_SECTIONS_FOR_SUCCESS:
            warnings.append(
                f"Only {sections_found}/{len(CANONICAL_SECTIONS)} canonical "
                f"sections recognized (need >= {MIN_SECTIONS_FOR_SUCCESS}). "
                "Treating as degraded; structure not recovered."
            )
        if candidates:
            warnings.append(
                f"Discarded {len(candidates)} parsed item(s): brief structure "
                "is below the confidence threshold (fail-closed)."
            )
        candidates = []

    return ExtractionResult(
        title=title,
        regime_call=regime_call,
        confidence=display_confidence,
        freshness_score=freshness_score,
        degraded=degraded,
        warnings=warnings,
        found_sections=found_sections,
        sections={k: sections[k] for k in found_sections},
        candidates=candidates,
    )


# ── Section splitting ─────────────────────────────────────────────────────────


def _normalize_heading(text: str) -> str:
    text = re.sub(r"[*_`#]", "", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def _split_sections(
    markdown: str, warnings: list[str]
) -> tuple[str | None, str, dict[str, str]]:
    """Return (title, preamble_before_first_section, {canonical_key: body})."""
    lines = markdown.splitlines()
    title: str | None = None
    preamble_lines: list[str] = []
    sections: dict[str, str] = {}

    current_key: str | None = None
    current_body: list[str] = []
    seen_section_heading = False

    def _flush() -> None:
        if current_key is None:
            return
        if current_key in sections:
            warnings.append(f"Duplicate '{current_key}' section; keeping the first.")
            return
        sections[current_key] = "\n".join(current_body).strip()

    for raw in lines:
        m = _HEADING_RE.match(raw)
        if m:
            level = len(m.group(1))
            heading_text = m.group(2)
            if level == 1 and title is None and not seen_section_heading:
                title = heading_text.strip()
                continue
            if level >= 2:
                _flush()
                seen_section_heading = True
                norm = _normalize_heading(heading_text)
                mapped = SECTION_ALIASES.get(norm)
                current_key = mapped
                current_body = []
                if mapped is None and norm:
                    warnings.append(f"Unrecognized section heading: '{heading_text}'.")
                continue
        if not seen_section_heading:
            preamble_lines.append(raw)
        else:
            current_body.append(raw)

    _flush()
    return title, "\n".join(preamble_lines).strip(), sections


def _parse_header_meta(
    preamble: str,
) -> tuple[str | None, float | None, float | None, bool]:
    regime = _meta_value(preamble, "regime call")
    confidence = _meta_float(preamble, "confidence")
    freshness = _meta_float(preamble, "freshness score")
    has_meta = any(v is not None for v in (regime, confidence, freshness))
    return regime, confidence, freshness, has_meta


def _meta_value(text: str, label: str) -> str | None:
    pat = re.compile(
        rf"^\s*\**\s*{re.escape(label)}\s*\**\s*[:\-]\s*\**\s*(.+?)\s*\**\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    m = pat.search(text)
    if not m:
        return None
    val = m.group(1).strip()
    return val or None


def _meta_float(text: str, label: str) -> float | None:
    val = _meta_value(text, label)
    if val is None:
        return None
    num = _NUMBER_RE.search(val)
    if not num:
        return None
    try:
        return float(num.group(1))
    except ValueError:
        return None


# ── Enhancement Path parsing ──────────────────────────────────────────────────

_SUBKEY_ALIASES: dict[str, str] = {
    "what": "what",
    "why": "why",
    "rationale": "why",
    "effort": "effort_days",
    "effort days": "effort_days",
    "estimate": "effort_days",
    "impact": "expected_impact",
    "expected impact": "expected_impact",
    "dependencies": "dependencies",
    "depends on": "dependencies",
    "priority": "priority",
    "category": "category",
    "confidence": "confidence",
}


def _parse_enhancement_items(
    body: str, warnings: list[str]
) -> list[ExtractionCandidate]:
    lines = body.splitlines()
    items: list[tuple[str, list[str]]] = []  # (header_text, sub_lines)
    current_header: str | None = None
    current_subs: list[str] = []
    base_indent = 0

    def _push() -> None:
        nonlocal current_header, current_subs
        if current_header is not None:
            items.append((current_header, current_subs))
        current_header = None
        current_subs = []

    for raw in lines:
        if not raw.strip():
            continue
        sub = _SUBHEAD_RE.match(raw)
        if sub:
            _push()
            current_header = sub.group(2).strip()
            base_indent = 0
            continue
        bullet = _BULLET_RE.match(raw)
        if bullet:
            indent = len(bullet.group(1).expandtabs(4))
            content = bullet.group(2).strip()
            if current_header is None or indent <= base_indent:
                _push()
                current_header = content
                base_indent = indent
            else:
                current_subs.append(content)
            continue
        # Non-bullet continuation line under an item.
        if current_header is not None:
            current_subs.append(raw.strip())

    _push()

    candidates: list[ExtractionCandidate] = []
    for header, subs in items:
        cand = _build_candidate(header, subs)
        if cand is None:
            warnings.append(
                f"Skipped an Enhancement Path entry with no resolvable title: "
                f"{header[:80]!r}"
            )
            continue
        candidates.append(cand)

    if not candidates:
        warnings.append("Enhancement Path section had no parseable items.")
    return candidates


def _build_candidate(header: str, subs: list[str]) -> ExtractionCandidate | None:
    title, inline_desc = _split_title(header)
    if not title:
        return None

    cand = ExtractionCandidate(title=title)
    if inline_desc:
        cand.what = inline_desc

    for line in subs:
        key, value = _split_subkey(line)
        if key is None or not value:
            continue
        if key == "what":
            cand.what = value
        elif key == "why":
            cand.why = value
        elif key == "effort_days":
            cand.effort_days = _first_number(value)
        elif key == "expected_impact":
            cand.expected_impact = value
        elif key == "dependencies":
            cand.dependencies = _split_dependencies(value)
        elif key == "priority":
            cand.priority = _normalize_priority(value)
        elif key == "category":
            cand.category = value
        elif key == "confidence":
            cand.confidence = _first_number(value)

    return cand


def _split_title(header: str) -> tuple[str, str | None]:
    """Resolve a title (and optional inline description) from an item header."""
    text = header.strip()
    bold = re.match(r"^\*\*(.+?)\*\*\s*[—\-:]?\s*(.*)$", text)
    if bold:
        return bold.group(1).strip(), (bold.group(2).strip() or None)
    bracket = re.match(r"^\[(.+?)\]\s*[:\-—]?\s*(.*)$", text)
    if bracket:
        return bracket.group(1).strip(), (bracket.group(2).strip() or None)
    for sep in (" — ", " – ", " - ", ": "):
        if sep in text:
            left, right = text.split(sep, 1)
            left = left.strip()
            if left:
                return left, (right.strip() or None)
    return text, None


def _split_subkey(line: str) -> tuple[str | None, str | None]:
    m = re.match(r"^\**\s*([A-Za-z][A-Za-z _]*?)\s*\**\s*[:\-]\s*(.*)$", line.strip())
    if not m:
        return None, None
    norm = re.sub(r"\s+", " ", m.group(1).strip().lower())
    return _SUBKEY_ALIASES.get(norm), m.group(2).strip()


def _first_number(text: str) -> float | None:
    m = _NUMBER_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _split_dependencies(text: str) -> list[str]:
    cleaned = text.strip()
    if cleaned.lower() in {"none", "n/a", "na", "-", "—", ""}:
        return []
    parts = re.split(r"\s*(?:,|;|/|\band\b)\s*", cleaned)
    return [p.strip(" .") for p in parts if p.strip(" .")]


def _normalize_priority(text: str) -> str:
    low = text.strip().lower()
    if low in VALID_PRIORITIES:
        return low
    for p in ("critical", "high", "medium", "low"):
        if p in low:
            return p
    return "medium"


# ── Adversarial verdicts ──────────────────────────────────────────────────────


def _apply_adversarial_verdicts(
    body: str, candidates: list[ExtractionCandidate], warnings: list[str]
) -> None:
    section_default: str | None = None
    title_map: list[tuple[str, str]] = []  # (lowercased line, verdict)
    distinct: set[str] = set()

    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        verdict = _verdict_in(line)
        if verdict is None:
            continue
        distinct.add(verdict)
        low = line.lower()
        if low.startswith(("overall", "verdict", "summary")):
            section_default = verdict
        else:
            title_map.append((low, verdict))

    if section_default is None and len(distinct) == 1:
        section_default = next(iter(distinct))

    for cand in candidates:
        t = cand.title.lower()
        matched: str | None = None
        for low, verdict in title_map:
            if t and t in low:
                matched = verdict
                break
        cand.adversarial_verdict = matched if matched is not None else section_default

    if section_default is None and not title_map:
        warnings.append(
            "Adversarial Stress Test section present but no PASS/FAIL/HOLD/"
            "CAUTION/ABSTAIN verdict was recognized."
        )


def _verdict_in(line: str) -> str | None:
    upper = line.upper()
    for tok in ADVERSARIAL_VERDICT_TOKENS:
        if re.search(rf"\b{tok}\b", upper):
            return tok
    return None

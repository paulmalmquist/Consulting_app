"""Universal AnalyzerFinding contract (plan PR 8.5).

The shared, typed contract every analyzer (telemetry, data-platform, business — PRs 9-11)
MUST return. Defining it before the analyzers exist keeps Phase 4 from diverging into
three inconsistent services, and lets the card feed / investigation surfaces consume one
shape.

Deterministic-first: a finding's facts (severity, what_changed, driver_math, evidence)
are produced by code/rules/queries. An LLM may later SUMMARIZE a set of findings, but it
must not be the source of a finding's numbers or its severity. This module contains NO
analyzer implementation.

Honesty rules (enforced by validation):
  - severity is RULE-BASED, never LLM-assigned (it is a plain field; analyzers set it
    from thresholds/evidence, and validation forbids high-severity claims with no evidence).
  - A finding may not be 'critical' OR carry confidence >= 0.70 without evidence_refs.
  - confidence bands are documented below and checked for range.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# ── confidence bands (documented, enforced for range) ─────────────────────────
# 0.90-1.00  directly measured / reconciled to a governed metric
# 0.70-0.89  strong evidence, minor assumptions
# 0.50-0.69  directional / incomplete evidence
# < 0.50     informational only — may NOT drive a critical severity or an anomaly card
CONFIDENCE_MIN = 0.0
CONFIDENCE_MAX = 1.0
HIGH_CONFIDENCE = 0.70

SEVERITIES = ("info", "warning", "critical")
ANALYZER_TYPES = ("telemetry", "data_platform", "business")
EVAL_STATUSES = ("pass", "fail", "pending", None)

# severity -> intel card type + whether it flags an anomaly
_SEVERITY_CARD = {
    "critical": ("alert", True),
    "warning": ("finding", False),
    "info": ("finding", False),
}


class FindingValidationError(ValueError):
    """Raised when a finding violates the contract (fail closed; never silently accepted)."""


@dataclass(frozen=True)
class AnalyzerFinding:
    finding_id: str
    env_id: str
    analyzer_type: str                 # 'telemetry' | 'data_platform' | 'business'
    source_ref: dict                   # {run_id, table_name, metric_key, ...} provenance
    severity: str                      # 'info' | 'warning' | 'critical' — rule-assigned, never LLM
    what_changed: str                  # human-readable factual claim
    why_it_matters: str                # deterministic interpretation, not LLM prose
    confidence: float                  # 0-1, banded above
    evidence_refs: list[str] = field(default_factory=list)   # source row ids / metric refs / SQL results
    metric_refs: list[str] = field(default_factory=list)     # governed metric names
    driver_math: dict | None = None    # {contributor, contribution_pct, evidence_row}
    null_reasons: list[str] = field(default_factory=list)    # why any field is None / unavailable
    recommendations: list[str] = field(default_factory=list) # deterministic action candidates
    next_questions: list[str] = field(default_factory=list)  # investigation fork suggestions
    cost_to_generate_usd: float | None = None                # NULL if no priced compute ran
    latency_ms: int | None = None
    eval_status: str | None = None     # 'pass' | 'fail' | 'pending' | None

    def __post_init__(self) -> None:
        validate_finding(self)

    def to_dict(self) -> dict:
        return {
            "finding_id": self.finding_id,
            "env_id": self.env_id,
            "analyzer_type": self.analyzer_type,
            "source_ref": self.source_ref,
            "severity": self.severity,
            "what_changed": self.what_changed,
            "why_it_matters": self.why_it_matters,
            "confidence": self.confidence,
            "evidence_refs": list(self.evidence_refs),
            "metric_refs": list(self.metric_refs),
            "driver_math": self.driver_math,
            "null_reasons": list(self.null_reasons),
            "recommendations": list(self.recommendations),
            "next_questions": list(self.next_questions),
            "cost_to_generate_usd": self.cost_to_generate_usd,
            "latency_ms": self.latency_ms,
            "eval_status": self.eval_status,
        }


_ID_RE = re.compile(r"^[A-Za-z0-9._:-]+$")


def validate_finding(f: AnalyzerFinding) -> None:
    """Raise FindingValidationError on any contract violation. Called in __post_init__
    so an invalid finding can never be constructed."""
    if not f.finding_id or not _ID_RE.match(f.finding_id):
        raise FindingValidationError(f"invalid finding_id: {f.finding_id!r}")
    if not f.env_id:
        raise FindingValidationError("env_id is required")
    if f.analyzer_type not in ANALYZER_TYPES:
        raise FindingValidationError(f"unknown analyzer_type: {f.analyzer_type!r}")
    if f.severity not in SEVERITIES:
        raise FindingValidationError(f"unknown severity: {f.severity!r}")
    if not isinstance(f.source_ref, dict):
        raise FindingValidationError("source_ref must be a dict")
    if not f.what_changed or not f.what_changed.strip():
        raise FindingValidationError("what_changed is required")
    if not (CONFIDENCE_MIN <= f.confidence <= CONFIDENCE_MAX):
        raise FindingValidationError(f"confidence out of range: {f.confidence}")
    if f.eval_status not in EVAL_STATUSES:
        raise FindingValidationError(f"unknown eval_status: {f.eval_status!r}")

    # The load-bearing honesty rule: a high-confidence OR critical finding must carry
    # evidence. No evidence -> it cannot claim high confidence or critical severity.
    has_evidence = bool(f.evidence_refs)
    if f.confidence >= HIGH_CONFIDENCE and not has_evidence:
        raise FindingValidationError(
            f"confidence {f.confidence} >= {HIGH_CONFIDENCE} requires non-empty evidence_refs"
        )
    if f.severity == "critical" and not has_evidence:
        raise FindingValidationError("severity 'critical' requires non-empty evidence_refs")
    # An informational-confidence finding (< 0.5) may not drive a critical severity.
    if f.severity == "critical" and f.confidence < 0.5:
        raise FindingValidationError("severity 'critical' requires confidence >= 0.5")
    if f.cost_to_generate_usd is not None and f.cost_to_generate_usd < 0:
        raise FindingValidationError("cost_to_generate_usd may not be negative")


def to_intel_card(finding: AnalyzerFinding) -> dict:
    """Map a finding to intelligence_cards.upsert_card(**kwargs). Deterministic, no LLM.

    Severity drives card_type + anomaly_flag (rule-based); priority scales with
    confidence and severity; source_ref carries the finding id for idempotency and
    drill-through. Returns the kwargs dict so the caller owns the actual write.
    """
    card_type, anomaly = _SEVERITY_CARD[finding.severity]
    severity_weight = {"critical": 1.0, "warning": 0.6, "info": 0.3}[finding.severity]
    priority = round(min(1.0, severity_weight * max(0.0, min(1.0, finding.confidence))), 4)
    summary = finding.why_it_matters or finding.what_changed
    return {
        "card_type": card_type,
        "title": finding.what_changed[:200],
        "summary": summary,
        "source_ref": {
            "type": "analyzer_finding",
            "finding_id": finding.finding_id,
            "analyzer_type": finding.analyzer_type,
            **finding.source_ref,
        },
        "priority_score": priority,
        "anomaly_flag": anomaly,
        "created_by": f"analyzer:{finding.analyzer_type}",
    }


def from_dict(data: dict[str, Any]) -> AnalyzerFinding:
    """Build (and validate) a finding from a plain dict. Unknown keys are ignored."""
    allowed = AnalyzerFinding.__dataclass_fields__.keys()
    return AnalyzerFinding(**{k: v for k, v in data.items() if k in allowed})

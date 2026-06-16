"""Data Platform Analyzer (plan PR 10) — real findings, deterministic-first.

Grounds findings in existing reads on main today:
  - telemetry_stream_etl.stream_health  -> DQ assertion failures, stale freshness
  - telemetry_stream_etl.stream_live    -> pipeline surface status (fresh/stale/failed)
  - audit_dashboard.summary             -> tool error rate, estimated-cost spike

Every number comes from a real read. Severity is RULE-BASED. When a source is empty or
returns a null_reason, the finding is SKIPPED with a recorded null_reason — never a
fabricated number. Heavy DQ EXECUTION (BigQuery/Databricks) is out of scope; this reads
the already-computed assertion/status results.
"""
from __future__ import annotations

import time
import uuid
from uuid import UUID

from app.services.analyzer_contract import AnalyzerFinding

ANALYZER_TYPE = "data_platform"

# Rule-based thresholds (frozen, not LLM-assigned).
TOOL_ERROR_RATE_CRITICAL = 0.25   # >25% of audited calls failing
TOOL_ERROR_RATE_WARNING = 0.10
COST_SPIKE_SIGMA = 2.0            # a day's cost > mean + 2*stddev of the window


def _fid() -> str:
    return f"dp-{uuid.uuid4().hex[:12]}"


def analyze(env_id: str, business_id: str | UUID) -> dict:
    started = time.monotonic()
    biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))
    findings: list[AnalyzerFinding] = []
    null_reasons: list[dict] = []

    findings.extend(_pipeline_findings(env_id, biz, null_reasons))
    findings.extend(_dq_findings(env_id, biz, null_reasons))
    findings.extend(_audit_findings(env_id, biz, null_reasons))

    latency_ms = int((time.monotonic() - started) * 1000)
    findings = [AnalyzerFinding(**{**f.to_dict(), "latency_ms": latency_ms}) for f in findings]
    return {
        "analyzer_type": ANALYZER_TYPE,
        "findings": [f.to_dict() for f in findings],
        "null_reasons": null_reasons,
        "latency_ms": latency_ms,
    }


def _safe(call, *, source: str, null_reasons: list[dict]):
    try:
        return call()
    except Exception:  # noqa: BLE001 — fail closed
        null_reasons.append({"source": source, "reason": f"{source}_unavailable"})
        return None


# ── pipeline status (stream_live.pipeline) ───────────────────────────────────
def _pipeline_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    from app.services import telemetry_stream_etl
    live = _safe(lambda: telemetry_stream_etl.stream_live(env_id=env_id, business_id=biz),
                 source="pipeline_status", null_reasons=null_reasons)
    if live is None:
        return []
    pipeline = live.get("pipeline") or {}
    surfaces = pipeline.get("surfaces") or {}
    if not surfaces:
        null_reasons.append({"source": "pipeline_status", "reason": "no_pipeline_status"})
        return []
    findings: list[AnalyzerFinding] = []
    for surface, info in surfaces.items():
        status = (info or {}).get("status")
        if status in ("fresh", "unknown", None):
            continue  # only real degraded states produce a finding
        ftype = "pipeline_failed" if status == "failed" else "feed_stale"
        severity = "critical" if status == "failed" else "warning"
        reason = (info or {}).get("reason")
        findings.append(AnalyzerFinding(
            finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
            source_ref={"source": "telemetry_stream_etl.stream_live", "surface": surface,
                        "status": status, "finding_type": ftype},
            severity=severity, confidence=0.85,
            what_changed=f"Pipeline surface '{surface}' is {status}",
            why_it_matters=("A non-fresh surface means downstream reads may be serving stale or "
                            "missing data."),
            evidence_refs=[f"surface={surface}", f"status={status}", f"as_of_ts={(info or {}).get('as_of_ts')}"],
            metric_refs=[f"pipeline.{surface}.status"],
            recommendations=[f"Investigate the {surface} pipeline: {reason or 'see pipeline status'}"],
            next_questions=["Is the ingest worker running and are watermarks advancing?"],
        ))
    return findings


# ── DQ assertions + freshness (stream_health) ────────────────────────────────
def _dq_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    from app.services import telemetry_stream_etl
    health = _safe(lambda: telemetry_stream_etl.stream_health(env_id=env_id, business_id=biz),
                   source="stream_health", null_reasons=null_reasons)
    if health is None:
        return []
    findings: list[AnalyzerFinding] = []
    assertions = health.get("assertions") or []
    failed = [a for a in assertions if a.get("passed") is False]
    if not assertions:
        null_reasons.append({"source": "dq_assertions", "reason": "no_dq_assertions"})
    for a in failed:
        findings.append(AnalyzerFinding(
            finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
            source_ref={"source": "telemetry_stream_etl.stream_health", "finding_type": "dq_assertion_fail",
                        "assertion_name": a.get("assertion_name"), "table_name": a.get("table_name")},
            severity="warning", confidence=0.88,
            what_changed=f"DQ assertion '{a.get('assertion_name')}' failed on {a.get('table_name')}",
            why_it_matters="A failing data-quality assertion means a downstream metric may be wrong.",
            evidence_refs=[f"observed={a.get('observed')}", f"threshold={a.get('threshold')}",
                           f"run_ts={a.get('run_ts')}"],
            metric_refs=[str(a.get("assertion_name"))],
            recommendations=[f"Check {a.get('table_name')}: observed {a.get('observed')} vs {a.get('threshold')}."],
            next_questions=["What upstream change broke this assertion?"],
        ))
    return findings


# ── audit error rate + cost spike (audit_dashboard.summary) ──────────────────
def _audit_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    from app.services import audit_dashboard
    summ = _safe(lambda: audit_dashboard.summary(biz, env_id=env_id),
                 source="audit_summary", null_reasons=null_reasons)
    if summ is None:
        return []
    if summ.get("null_reason"):
        null_reasons.append({"source": "audit_summary", "reason": summ["null_reason"]})
        return []
    findings: list[AnalyzerFinding] = []
    total = summ.get("total_decisions") or 0
    if total > 0 and summ.get("success_rate") is not None:
        err_rate = round(1.0 - summ["success_rate"], 4)
        if err_rate >= TOOL_ERROR_RATE_WARNING:
            severity = "critical" if err_rate >= TOOL_ERROR_RATE_CRITICAL else "warning"
            findings.append(AnalyzerFinding(
                finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
                source_ref={"source": "audit_dashboard.summary", "field": "success_rate",
                            "finding_type": "tool_error_rate"},
                severity=severity, confidence=0.82,
                what_changed=f"Tool error rate is {round(err_rate * 100, 2)}% over {summ.get('window_days')}d",
                why_it_matters="Elevated tool-call failures degrade every surface that depends on them.",
                evidence_refs=[f"failed={summ.get('failed')}", f"total_decisions={total}"],
                metric_refs=["success_rate"],
                recommendations=["Review the top failing tools in the audit dashboard."],
                next_questions=["Which tool accounts for most failures?"],
            ))
    else:
        null_reasons.append({"source": "audit_summary.error_rate", "reason": "no_decisions"})

    # Cost spike: a day's estimated cost far above the window mean (deterministic stats).
    series = [d.get("calls") for d in (summ.get("calls_per_day") or []) if isinstance(d.get("calls"), (int, float))]
    spike = _detect_spike(series)
    if spike is not None:
        findings.append(AnalyzerFinding(
            finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
            source_ref={"source": "audit_dashboard.summary", "field": "calls_per_day",
                        "finding_type": "cost_spike"},
            severity="warning", confidence=0.7,
            what_changed=(f"A day's call volume ({spike['value']}) exceeded the window mean "
                          f"by > {COST_SPIKE_SIGMA}σ"),
            why_it_matters="A volume spike drives cost and can indicate a runaway loop or misuse.",
            evidence_refs=[f"value={spike['value']}", f"mean={spike['mean']}", f"stddev={spike['stddev']}"],
            metric_refs=["calls_per_day"],
            recommendations=["Inspect that day's audit activity for an anomaly or runaway caller."],
            next_questions=["What drove the volume spike?"],
        ))
    elif not series:
        null_reasons.append({"source": "audit_summary.cost", "reason": "no_calls_per_day"})
    return findings


def _detect_spike(series: list[float]) -> dict | None:
    """Return the max point if it exceeds mean + COST_SPIKE_SIGMA*stddev. Needs >=4 points
    and a non-zero stddev. Pure, deterministic — no fabrication."""
    if len(series) < 4:
        return None
    n = len(series)
    mean = sum(series) / n
    var = sum((x - mean) ** 2 for x in series) / n
    stddev = var ** 0.5
    if stddev == 0:
        return None
    peak = max(series)
    if peak > mean + COST_SPIKE_SIGMA * stddev:
        return {"value": peak, "mean": round(mean, 2), "stddev": round(stddev, 2)}
    return None


def summary(env_id: str, business_id: str | UUID) -> dict:
    biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))
    result = analyze(env_id, biz)
    by_sev: dict[str, int] = {"info": 0, "warning": 0, "critical": 0}
    for f in result["findings"]:
        by_sev[f["severity"]] = by_sev.get(f["severity"], 0) + 1
    return {
        "analyzer_type": ANALYZER_TYPE,
        "finding_count": len(result["findings"]),
        "by_severity": by_sev,
        "null_reasons": result["null_reasons"],
        "latency_ms": result["latency_ms"],
    }

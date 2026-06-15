"""Telemetry Analyzer (plan PR 9) — real findings, deterministic-first.

Reads the existing telemetry serving surface (telemetry_serving.monitoring / summary /
model_performance) and turns REAL numbers into AnalyzerFinding objects (the PR 8.5
contract). Severity is RULE-BASED from real thresholds (anomaly rate, PSI drift, false-
alarm-rate vs conformal alpha). No fabricated numbers: when a source is empty or returns
a null_reason, that finding is SKIPPED with a recorded null_reason — never invented.

Scope (honest first cut, NO Databricks): grounds in the live serving reads available on
main today. NCR clustering / backlog forecast / RUL calibration require the Databricks
mirror and are explicitly out of scope (they appear in null_reasons when unavailable).
"""
from __future__ import annotations

import time
import uuid
from uuid import UUID

from app.services.analyzer_contract import AnalyzerFinding

ANALYZER_TYPE = "telemetry"

# Rule-based severity thresholds (frozen, not LLM-assigned).
ANOMALY_RATE_CRITICAL = 0.20   # >20% NO_GO windows
ANOMALY_RATE_WARNING = 0.10    # >10%
PSI_DRIFT_WARNING = 0.20       # standard population-stability-index alert band
PSI_DRIFT_CRITICAL = 0.30


def _fid() -> str:
    return f"tel-{uuid.uuid4().hex[:12]}"


def analyze(env_id: str, business_id: str | UUID) -> dict:
    """Produce grounded telemetry findings + the null_reasons for sources that were
    unavailable. Returns {findings: [...], null_reasons: [...], analyzer_type, latency_ms}."""
    started = time.monotonic()
    biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))
    findings: list[AnalyzerFinding] = []
    null_reasons: list[dict] = []

    findings.extend(_anomaly_rate_findings(env_id, biz, null_reasons))
    findings.extend(_drift_findings(env_id, biz, null_reasons))
    findings.extend(_model_health_findings(env_id, biz, null_reasons))

    # Databricks-only sources are honestly disclosed as out of scope, never faked.
    null_reasons.append({"source": "ncr_intelligence", "reason": "requires_databricks_mirror"})

    latency_ms = int((time.monotonic() - started) * 1000)
    for i, f in enumerate(findings):
        # stamp a measured latency on each finding (cost stays None — no priced compute)
        findings[i] = AnalyzerFinding(**{**f.to_dict(), "latency_ms": latency_ms})
    return {
        "analyzer_type": ANALYZER_TYPE,
        "findings": [f.to_dict() for f in findings],
        "null_reasons": null_reasons,
        "latency_ms": latency_ms,
    }


def _safe_monitoring(env_id: str, biz: UUID) -> dict | None:
    try:
        from app.services import telemetry_serving
        return telemetry_serving.monitoring(env_id=env_id, business_id=biz)
    except Exception:  # noqa: BLE001 — fail closed
        return None


def _safe_model_performance(env_id: str, biz: UUID) -> dict | None:
    try:
        from app.services import telemetry_serving
        return telemetry_serving.model_performance(env_id=env_id, business_id=biz)
    except Exception:  # noqa: BLE001
        return None


# ── anomaly rate (monitoring.rolling_anomaly_rate) ────────────────────────────
def _anomaly_rate_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    mon = _safe_monitoring(env_id, biz)
    if mon is None:
        null_reasons.append({"source": "monitoring", "reason": "monitoring_unavailable"})
        return []
    if mon.get("null_reason"):
        null_reasons.append({"source": "monitoring.anomaly_rate", "reason": mon["null_reason"]})
        return []
    rate = mon.get("rolling_anomaly_rate")
    if rate is None:
        null_reasons.append({"source": "monitoring.anomaly_rate", "reason": "no_anomaly_rate"})
        return []

    n = mon.get("prediction_count") or 0
    evidence = [f"prediction_count={n}", f"last_scored_at={mon.get('last_scored_at')}"]
    if rate >= ANOMALY_RATE_CRITICAL:
        severity, conf = "critical", 0.85
    elif rate >= ANOMALY_RATE_WARNING:
        severity, conf = "warning", 0.8
    else:
        severity, conf = "info", 0.75
    return [AnalyzerFinding(
        finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
        source_ref={"source": "telemetry_serving.monitoring", "field": "rolling_anomaly_rate",
                    "model": mon.get("latest_model_name")},
        severity=severity, confidence=conf,
        what_changed=f"Rolling anomaly rate is {round(rate * 100, 2)}% over the recent window",
        why_it_matters=("Sustained NO_GO verdicts indicate the champion is flagging out-of-band "
                        "behavior more often than baseline."),
        evidence_refs=evidence, metric_refs=["rolling_anomaly_rate"],
        recommendations=["Review the most recent NO_GO runs and their channel attribution."],
        next_questions=["Which channels drive the elevated anomaly rate?"],
    )]


# ── drift (monitoring.psi) ────────────────────────────────────────────────────
def _drift_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    mon = _safe_monitoring(env_id, biz)
    if mon is None or mon.get("psi") is None:
        null_reasons.append({"source": "drift.psi", "reason": "no_psi_metric"})
        return []
    psi = mon["psi"]
    if psi >= PSI_DRIFT_CRITICAL:
        severity, conf = "critical", 0.82
    elif psi >= PSI_DRIFT_WARNING:
        severity, conf = "warning", 0.78
    else:
        severity, conf = "info", 0.7
    return [AnalyzerFinding(
        finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
        source_ref={"source": "telemetry_serving.monitoring", "field": "psi",
                    "window_label": mon.get("window_label")},
        severity=severity, confidence=conf,
        what_changed=f"Population stability index (PSI) is {round(psi, 4)}",
        why_it_matters="A rising PSI signals the input distribution has drifted from the training window.",
        evidence_refs=[f"psi={psi}", f"window={mon.get('window_label')}"],
        metric_refs=["psi"],
        recommendations=["Compare recent channel distributions against the training baseline."],
        next_questions=["Has a data source or sensor changed recently?"],
    )]


# ── model health (model_performance + monitoring) ────────────────────────────
def _model_health_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    perf = _safe_model_performance(env_id, biz)
    if perf is None or perf.get("null_reason"):
        null_reasons.append({"source": "model_performance",
                             "reason": (perf or {}).get("null_reason", "model_performance_unavailable")})
        return []
    models = perf.get("models") or []
    findings: list[AnalyzerFinding] = []
    for m in models:
        metrics = m.get("metrics") or {}
        far = metrics.get("conformal_measured_false_alarm_rate")
        alpha = metrics.get("conformal_alpha")
        if far is None or alpha is None:
            continue  # only a grounded comparison produces a finding
        breach = far > alpha
        severity = "warning" if breach else "info"
        conf = 0.8 if breach else 0.72
        findings.append(AnalyzerFinding(
            finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
            source_ref={"source": "telemetry_serving.model_performance",
                        "model_name": m.get("model_name"), "model_version": m.get("model_version"),
                        "mlflow_run_id": m.get("mlflow_run_id")},
            severity=severity, confidence=conf,
            what_changed=(f"{m.get('model_name')} measured false-alarm rate {round(far, 4)} "
                          f"vs target alpha {round(alpha, 4)}"),
            why_it_matters=("A measured FAR above the conformal target means the model alarms more "
                            "than its calibrated budget allows."),
            evidence_refs=[f"far={far}", f"alpha={alpha}", f"mlflow_run_id={m.get('mlflow_run_id')}"],
            metric_refs=["conformal_measured_false_alarm_rate", "conformal_alpha"],
            recommendations=["Recalibrate the conformal threshold or investigate recent inputs."]
            if breach else [],
            next_questions=["Did input drift push the false-alarm rate past budget?"] if breach else [],
        ))
    if not findings:
        null_reasons.append({"source": "model_performance.conformal", "reason": "no_conformal_metrics"})
    return findings


def summary(env_id: str, business_id: str | UUID) -> dict:
    """A compact, grounded overview for a cached read. Numbers only from real sources."""
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

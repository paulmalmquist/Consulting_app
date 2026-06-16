"""Business Analyzer (plan PR 11) — real findings, deterministic-first, env-type dispatch.

For any environment, produces operational signals grounded in real reads. Dispatches on
the environment's industry/template:
  - consulting          -> execution_tasks.board_summary (overdue tasks, TODAY-cap pressure)
  - accounting/finance  -> nv_accounting_kpis.compute_kpis (cash status tiles)
  - generic (always)    -> audit_dashboard.summary (tool error rate) as a universal floor

Severity is RULE-BASED. Every number comes from a real read; when a source is empty or
returns a null_reason / unavailable status, the finding is SKIPPED with a recorded
null_reason — never a fabricated number. No LLM. No per-finding model calls.
"""
from __future__ import annotations

import time
import uuid
from uuid import UUID

from app.services.analyzer_contract import AnalyzerFinding

ANALYZER_TYPE = "business"

# Rule-based thresholds.
OVERDUE_WARNING = 1          # any overdue task is worth a warning
OVERDUE_CRITICAL = 5
TODAY_CAP = 8                # the consulting board's forced-prioritization cap
TOOL_ERROR_RATE_WARNING = 0.10
TOOL_ERROR_RATE_CRITICAL = 0.25

_CONSULTING_HINTS = ("consulting", "consulting_revenue_os", "cro")
_ACCOUNTING_HINTS = ("accounting", "finance", "novendor", "bookkeeping")


def _fid() -> str:
    return f"biz-{uuid.uuid4().hex[:12]}"


def _resolve_env_type(env_id: str) -> str:
    """Best-effort env classification from the environment row. 'generic' on any failure."""
    try:
        from app.services import lab
        row = lab.get_environment(env_id)
        if not row:
            return "generic"
        hint = f"{row.get('industry_type') or ''} {row.get('industry') or ''} " \
               f"{row.get('workspace_template_key') or ''}".lower()
        if any(h in hint for h in _CONSULTING_HINTS):
            return "consulting"
        if any(h in hint for h in _ACCOUNTING_HINTS):
            return "accounting"
        return "generic"
    except Exception:  # noqa: BLE001
        return "generic"


def analyze(env_id: str, business_id: str | UUID, *, env_type: str | None = None) -> dict:
    started = time.monotonic()
    biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))
    resolved = env_type or _resolve_env_type(env_id)
    findings: list[AnalyzerFinding] = []
    null_reasons: list[dict] = []

    if resolved == "consulting":
        findings.extend(_consulting_findings(env_id, biz, null_reasons))
    elif resolved == "accounting":
        findings.extend(_accounting_findings(env_id, biz, null_reasons))
    # Universal floor: audit error rate applies to every environment.
    findings.extend(_audit_findings(env_id, biz, null_reasons))

    latency_ms = int((time.monotonic() - started) * 1000)
    findings = [AnalyzerFinding(**{**f.to_dict(), "latency_ms": latency_ms}) for f in findings]
    return {
        "analyzer_type": ANALYZER_TYPE,
        "env_type": resolved,
        "findings": [f.to_dict() for f in findings],
        "null_reasons": null_reasons,
        "latency_ms": latency_ms,
    }


def _safe(call, *, source: str, null_reasons: list[dict]):
    try:
        return call()
    except Exception:  # noqa: BLE001
        null_reasons.append({"source": source, "reason": f"{source}_unavailable"})
        return None


# ── consulting (execution_tasks.board_summary) ───────────────────────────────
def _consulting_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    from app.services import execution_tasks
    board = _safe(lambda: execution_tasks.board_summary(env_id=env_id, business_id=biz),
                  source="board_summary", null_reasons=null_reasons)
    if board is None:
        return []
    findings: list[AnalyzerFinding] = []
    overdue = board.get("overdue_count") or 0
    today = board.get("today_count") or 0

    if overdue >= OVERDUE_WARNING:
        severity = "critical" if overdue >= OVERDUE_CRITICAL else "warning"
        findings.append(AnalyzerFinding(
            finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
            source_ref={"source": "execution_tasks.board_summary", "field": "overdue_count",
                        "signal_type": "bottleneck"},
            severity=severity, confidence=0.85,
            what_changed=f"{overdue} task{'' if overdue == 1 else 's'} are overdue",
            why_it_matters="Overdue tasks signal commitments slipping past their due dates.",
            evidence_refs=[f"overdue_count={overdue}", f"today_count={today}",
                           f"this_week_count={board.get('this_week_count')}"],
            metric_refs=["overdue_count"],
            recommendations=["Re-prioritize or reschedule the overdue items on the board."],
            next_questions=["Which workstream owns the overdue tasks?"],
        ))
    if today > TODAY_CAP:
        findings.append(AnalyzerFinding(
            finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
            source_ref={"source": "execution_tasks.board_summary", "field": "today_count",
                        "signal_type": "risk"},
            severity="warning", confidence=0.78,
            what_changed=f"TODAY column holds {today} tasks (cap is {TODAY_CAP})",
            why_it_matters="An over-cap TODAY column defeats forced prioritization and dilutes focus.",
            evidence_refs=[f"today_count={today}", f"cap={TODAY_CAP}"],
            metric_refs=["today_count"],
            recommendations=["Trim TODAY back toward the cap; move non-urgent items to This Week."],
            next_questions=["What can move out of TODAY without missing a commitment?"],
        ))
    return findings


# ── accounting (nv_accounting_kpis.compute_kpis) ─────────────────────────────
def _accounting_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    from app.services import nv_accounting_kpis
    kpis = _safe(lambda: nv_accounting_kpis.compute_kpis(env_id=env_id, business_id=str(biz)),
                 source="accounting_kpis", null_reasons=null_reasons)
    if kpis is None:
        return []
    tiles = kpis.get("kpis") or []
    # A tile that reports 'unavailable' status is disclosed as a null_reason, never coerced.
    cash = next((t for t in tiles if t.get("key") in ("cash-balance", "cash_balance")), None)
    if cash is None:
        null_reasons.append({"source": "accounting_kpis", "reason": "no_cash_balance_tile"})
        return []
    if cash.get("status") == "unavailable":
        null_reasons.append({"source": "accounting_kpis.cash_balance", "reason": "cash_balance_unavailable"})
        return []
    # Real value present: an informational leading-indicator finding (no fabricated thresholds).
    return [AnalyzerFinding(
        finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
        source_ref={"source": "nv_accounting_kpis.compute_kpis", "field": "cash_balance",
                    "signal_type": "leading_indicator"},
        severity="info", confidence=0.7,
        what_changed=f"Cash balance tile reports {cash.get('value')}",
        why_it_matters="Cash position is a leading indicator for the operating runway.",
        evidence_refs=[f"value={cash.get('value')}", f"status={cash.get('status')}"],
        metric_refs=["cash_balance"],
        recommendations=[],
        next_questions=["Is the 30-day cash trend improving or declining?"],
    )]


# ── universal floor: audit error rate ────────────────────────────────────────
def _audit_findings(env_id: str, biz: UUID, null_reasons: list[dict]) -> list[AnalyzerFinding]:
    from app.services import audit_dashboard
    summ = _safe(lambda: audit_dashboard.summary(biz, env_id=env_id),
                 source="audit_summary", null_reasons=null_reasons)
    if summ is None:
        return []
    if summ.get("null_reason") or not (summ.get("total_decisions") or 0):
        null_reasons.append({"source": "audit_summary", "reason": summ.get("null_reason") or "no_decisions"})
        return []
    if summ.get("success_rate") is None:
        null_reasons.append({"source": "audit_summary", "reason": "no_success_rate"})
        return []
    err_rate = round(1.0 - summ["success_rate"], 4)
    if err_rate < TOOL_ERROR_RATE_WARNING:
        return []
    severity = "critical" if err_rate >= TOOL_ERROR_RATE_CRITICAL else "warning"
    return [AnalyzerFinding(
        finding_id=_fid(), env_id=env_id, analyzer_type=ANALYZER_TYPE,
        source_ref={"source": "audit_dashboard.summary", "field": "success_rate", "signal_type": "risk"},
        severity=severity, confidence=0.8,
        what_changed=f"Tool error rate is {round(err_rate * 100, 2)}% over {summ.get('window_days')}d",
        why_it_matters="Failing tool calls degrade every operational surface in the environment.",
        evidence_refs=[f"failed={summ.get('failed')}", f"total_decisions={summ.get('total_decisions')}"],
        metric_refs=["success_rate"],
        recommendations=["Review the top failing tools in the audit dashboard."],
        next_questions=["Which tool accounts for most failures?"],
    )]


def summary(env_id: str, business_id: str | UUID, *, env_type: str | None = None) -> dict:
    biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))
    result = analyze(env_id, biz, env_type=env_type)
    by_sev: dict[str, int] = {"info": 0, "warning": 0, "critical": 0}
    for f in result["findings"]:
        by_sev[f["severity"]] = by_sev.get(f["severity"], 0) + 1
    return {
        "analyzer_type": ANALYZER_TYPE,
        "env_type": result["env_type"],
        "finding_count": len(result["findings"]),
        "by_severity": by_sev,
        "null_reasons": result["null_reasons"],
        "latency_ms": result["latency_ms"],
    }

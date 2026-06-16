"""Persist analyzer findings as intelligence cards (connective seam).

Bridges the deterministic AnalyzerFinding contract to the intelligence card feed:
rehydrate each finding dict, map it through `to_intel_card()` (rule-based, no LLM), and
upsert it via `intelligence_cards.upsert_card`. Idempotent by (env_id, source_ref_key) —
the finding's id rides in source_ref, so re-running an analyzer updates cards in place
rather than duplicating them.

Best-effort and fail-closed: a finding that can't be rehydrated or a card that can't be
written is skipped (counted, never raised), so a successful analysis is never downgraded
to a 500 because the optional persist step hit a snag. No LLM, no fabricated numbers.
"""
from __future__ import annotations

from uuid import UUID

from app.observability.logger import emit_log


def persist_findings_as_cards(
    env_id: str, business_id: str | UUID, findings: list[dict]
) -> int:
    """Upsert each finding dict as an intel card. Returns the count actually written.

    Imports are lazy to mirror the existing card-write idiom (analysis_sessions) and to
    keep the analyzer routes importable even if a downstream module is unavailable.
    """
    if not findings:
        return 0
    try:
        from app.services import analyzer_contract, intelligence_cards
    except Exception as exc:  # noqa: BLE001 — module may be absent; best-effort
        emit_log(level="warning", service="analyzer_persist", action="import_failed",
                 message=str(exc), error=exc)
        return 0

    written = 0
    for data in findings:
        try:
            finding = analyzer_contract.from_dict(data)
            intelligence_cards.upsert_card(
                env_id, business_id, **analyzer_contract.to_intel_card(finding)
            )
            written += 1
        except Exception as exc:  # noqa: BLE001 — skip the one finding, keep going
            emit_log(level="warning", service="analyzer_persist", action="upsert_failed",
                     message=str(exc), error=exc,
                     context={"finding_id": (data or {}).get("finding_id")})
            continue
    return written

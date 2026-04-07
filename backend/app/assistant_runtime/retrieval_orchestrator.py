from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal
import re
from typing import Any

from app.assistant_runtime.turn_receipts import (
    RetrievalDebugReceipt,
    RetrievalPolicy,
    RetrievalReceipt,
    RetrievalStatus,
    StructuredPrecheckReceipt,
    StructuredPrecheckStatus,
)
from app.config import RAG_MIN_SCORE, RAG_OVERFETCH, RAG_TOP_K
from app.mcp.auth import McpContext
from app.mcp.schemas.novendor_tools import ListTasksDueTodayInput
from app.mcp.schemas.repe_analysis_tools import NoiVarianceInput
from app.mcp.schemas.repe_tools import ListDealsInput, ListFundsInput
from app.mcp.tools.novendor_tools import _list_tasks_due_today
from app.mcp.tools.repe_analysis_tools import _noi_variance
from app.mcp.tools.repe_tools import _list_deals, _list_funds
from app.services.rag_indexer import RetrievedChunk, semantic_search
from app.services.rag_reranker import rerank_chunks
from app.services.request_router import RouteDecision

_FOLLOW_UP_RE = re.compile(r"\b(follow up|follow-up|next action|today)\b", re.IGNORECASE)
_NOI_VARIANCE_RE = re.compile(r"\b(noi|underwriting|down vs|variance)\b", re.IGNORECASE)
_FUND_SUMMARY_RE = re.compile(
    r"\b(summary|overview|snapshot|list|show|describe)\b.*\b(fund|funds|portfolio)\b"
    r"|\b(fund|funds|portfolio)\b.*\b(summary|overview|snapshot|list|show|describe)\b",
    re.IGNORECASE,
)
_FUND_HOLDINGS_RE = re.compile(
    r"\b(holdings?|breakdown|(?:assets?\s+in|what\s+does\s+it\s+own|portfolio\s+composition|underlying))\b",
    re.IGNORECASE,
)
_COUNT_QUERY_RE = re.compile(
    r"\b(how\s+many|count|number\s+of|total)\b.*\b(assets?|properties|funds?|investments?|deals?)\b",
    re.IGNORECASE,
)
_FUND_INVESTMENT_RE = re.compile(
    r"\b(invest(?:ment|ed|ing|ments)?|deal|disposition|exit(?:ed)?|"
    r"acquisition|realized|unrealized|status)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RetrievalExecution:
    chunks: list[RetrievedChunk]
    context_text: str
    receipt: RetrievalReceipt


@dataclass(frozen=True)
class StructuredRetrievalResult:
    context_text: str = ""
    result_count: int = 0
    prechecks: list[StructuredPrecheckReceipt] = field(default_factory=list)
    top_hits: list[dict[str, Any]] = field(default_factory=list)
    strategy_suffix: str | None = None
    empty_reason: str | None = None


def _coerce_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _build_rag_context(chunks: list[RetrievedChunk], *, char_limit: int) -> str:
    if not chunks:
        return ""
    parts = ["RELEVANT DOCUMENT CONTEXT:"]
    for idx, chunk in enumerate(chunks, start=1):
        heading = f" | section={chunk.section_heading}" if chunk.section_heading else ""
        parts.append(
            f"[Doc {idx} | score={chunk.score:.3f}{heading}]\n{chunk.chunk_text[:char_limit]}"
        )
    return "\n\n".join(parts)


def _scope_filters(
    *,
    business_id: str | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
    entity_id_filter_applied: bool,
) -> dict[str, Any]:
    return {
        "business_id": business_id,
        "env_id": env_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_id_filter_applied": entity_id_filter_applied,
    }


def _chunk_hits(chunks: list[RetrievedChunk], *, limit: int = 5) -> list[dict[str, Any]]:
    return [
        {
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "score": round(float(chunk.score), 4),
            "entity_type": chunk.entity_type,
            "entity_id": chunk.entity_id,
            "env_id": chunk.env_id,
            "section_heading": chunk.section_heading,
            "source_filename": chunk.source_filename,
            "snippet": chunk.chunk_text[:220],
            "retrieval_method": chunk.retrieval_method,
        }
        for chunk in chunks[:limit]
    ]


def _safe_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _tasks_context(payload: dict[str, Any]) -> str:
    tasks = list(payload.get("tasks") or [])
    today_count = int(payload.get("today_count") or 0)
    overdue_count = int(payload.get("overdue_count") or 0)
    lines = [
        "STRUCTURED TASK CONTEXT:",
        f"Tasks due today: {today_count}.",
        f"Overdue tasks still open: {overdue_count}.",
    ]
    for task in tasks[:5]:
        lines.append(
            f"- {task.get('description')} (priority={task.get('priority')}, due={task.get('due_date')}, entity={task.get('entity_type')})"
        )
    return "\n".join(lines)


def _variance_context(payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]], int]:
    rows = list(payload.get("variance_items") or [])
    noi_rows = [
        row for row in rows
        if "noi" in str(row.get("line_code") or "").lower()
    ]
    interesting = noi_rows or rows
    ranked = sorted(
        interesting,
        key=lambda row: abs(_safe_decimal(row.get("variance_amount"))),
        reverse=True,
    )[:5]
    summary = payload.get("summary") or {}
    lines = [
        "STRUCTURED NOI VARIANCE CONTEXT:",
        f"Total actual: {summary.get('total_actual')}.",
        f"Total underwriting plan: {summary.get('total_plan')}.",
        f"Total variance: {summary.get('total_variance')}.",
        f"Average variance pct: {summary.get('avg_variance_pct')}.",
    ]
    for row in ranked:
        lines.append(
            f"- {row.get('asset_name') or 'Unknown asset'} / {row.get('line_code')}: actual {row.get('actual_amount')} vs underwriting {row.get('plan_amount')} (variance {row.get('variance_amount')}, pct {row.get('variance_pct')})"
        )
    top_hits = [
        {
            "source": "structured:finance.noi_variance",
            "label": row.get("asset_name") or "Unknown asset",
            "line_code": row.get("line_code"),
            "quarter": row.get("quarter"),
            "variance_amount": row.get("variance_amount"),
            "variance_pct": row.get("variance_pct"),
            "entity_id": row.get("asset_id"),
            "entity_type": "asset",
        }
        for row in ranked
    ]
    return "\n".join(lines), top_hits, len(interesting)


def _merge_context_parts(parts: list[str]) -> str:
    cleaned = [part.strip() for part in parts if part and part.strip()]
    return "\n\n".join(cleaned)


def _structured_ctx(
    *,
    business_id: str | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> McpContext:
    return McpContext(
        actor="assistant_runtime",
        token_valid=True,
        resolved_scope={
            "business_id": business_id,
            "environment_id": env_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
    )


def _novendor_follow_up_precheck(
    *,
    message: str,
    business_uuid: uuid.UUID | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> StructuredRetrievalResult:
    if business_uuid is None or not env_id or not _FOLLOW_UP_RE.search(message or ""):
        return StructuredRetrievalResult()

    try:
        payload = _list_tasks_due_today(
            _structured_ctx(
                business_id=str(business_uuid),
                env_id=env_id,
                entity_type=entity_type,
                entity_id=entity_id,
            ),
            ListTasksDueTodayInput(
                business_id=business_uuid,
                env_id=env_id,
                include_overdue=True,
            ),
        )
        tasks = list(payload.get("tasks") or [])
        precheck = StructuredPrecheckReceipt(
            name="novendor_follow_up_today",
            source="novendor.tasks.list_tasks_due_today",
            status=StructuredPrecheckStatus.OK if tasks else StructuredPrecheckStatus.EMPTY,
            scoped=True,
            result_count=len(tasks),
            evidence={
                "env_id": env_id,
                "business_id": str(business_uuid),
                "today_count": payload.get("today_count"),
                "overdue_count": payload.get("overdue_count"),
                "sample_tasks": [
                    {
                        "description": task.get("description"),
                        "priority": task.get("priority"),
                        "due_date": task.get("due_date"),
                        "entity_type": task.get("entity_type"),
                        "entity_id": task.get("entity_id"),
                    }
                    for task in tasks[:5]
                ],
            },
            notes=["Structured due-today Novendor task source evaluated."],
        )
        return StructuredRetrievalResult(
            context_text=_tasks_context(payload) if tasks else "",
            result_count=len(tasks),
            prechecks=[precheck],
            top_hits=[
                {
                    "source": "structured:novendor.tasks.list_tasks_due_today",
                    "label": task.get("description"),
                    "due_date": task.get("due_date"),
                    "priority": task.get("priority"),
                    "entity_type": task.get("entity_type"),
                    "entity_id": task.get("entity_id"),
                }
                for task in tasks[:5]
            ],
            strategy_suffix="structured_precheck",
            empty_reason=None if tasks else "no_tasks_due_today",
        )
    except Exception as exc:
        return StructuredRetrievalResult(
            prechecks=[
                StructuredPrecheckReceipt(
                    name="novendor_follow_up_today",
                    source="novendor.tasks.list_tasks_due_today",
                    status=StructuredPrecheckStatus.ERROR,
                    scoped=True,
                    result_count=0,
                    evidence={"env_id": env_id, "business_id": str(business_uuid)},
                    error=str(exc)[:500],
                    notes=["Structured Novendor task precheck failed."],
                )
            ],
            empty_reason="structured_precheck_error",
        )


def _meridian_variance_precheck(
    *,
    message: str,
    business_uuid: uuid.UUID | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> StructuredRetrievalResult:
    if business_uuid is None or not env_id or not _NOI_VARIANCE_RE.search(message or ""):
        return StructuredRetrievalResult()

    fund_uuid = _coerce_uuid(entity_id) if entity_type == "fund" else None
    asset_uuid = _coerce_uuid(entity_id) if entity_type == "asset" else None
    try:
        payload = _noi_variance(
            _structured_ctx(
                business_id=str(business_uuid),
                env_id=env_id,
                entity_type=entity_type,
                entity_id=entity_id,
            ),
            NoiVarianceInput(
                env_id=env_id,
                business_id=str(business_uuid),
                fund_id=fund_uuid,
                asset_id=asset_uuid,
            ),
        )
        context_text, top_hits, matched_count = _variance_context(payload)
        precheck = StructuredPrecheckReceipt(
            name="meridian_noi_variance",
            source="finance.noi_variance",
            status=StructuredPrecheckStatus.OK if matched_count else StructuredPrecheckStatus.EMPTY,
            scoped=True,
            result_count=matched_count,
            evidence={
                "env_id": env_id,
                "business_id": str(business_uuid),
                "entity_type": entity_type,
                "entity_id": entity_id,
                "requested_fund_id": str(fund_uuid) if fund_uuid else None,
                "requested_asset_id": str(asset_uuid) if asset_uuid else None,
                "raw_row_count": payload.get("count"),
                "summary": payload.get("summary") or {},
            },
            notes=["Structured NOI variance source evaluated before document retrieval."],
        )
        return StructuredRetrievalResult(
            context_text=context_text if matched_count else "",
            result_count=matched_count,
            prechecks=[precheck],
            top_hits=top_hits,
            strategy_suffix="structured_precheck",
            empty_reason=None if matched_count else "no_variance_rows_for_scope",
        )
    except Exception as exc:
        return StructuredRetrievalResult(
            prechecks=[
                StructuredPrecheckReceipt(
                    name="meridian_noi_variance",
                    source="finance.noi_variance",
                    status=StructuredPrecheckStatus.ERROR,
                    scoped=True,
                    result_count=0,
                    evidence={
                        "env_id": env_id,
                        "business_id": str(business_uuid),
                        "entity_type": entity_type,
                        "entity_id": entity_id,
                    },
                    error=str(exc)[:500],
                    notes=["Structured Meridian variance precheck failed."],
                )
            ],
            empty_reason="structured_precheck_error",
        )


def _fund_summary_precheck(
    *,
    message: str,
    business_uuid: uuid.UUID | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> StructuredRetrievalResult:
    if business_uuid is None or not _FUND_SUMMARY_RE.search(message or ""):
        return StructuredRetrievalResult()

    try:
        ctx = _structured_ctx(
            business_id=str(business_uuid),
            env_id=env_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        result = _list_funds(ctx, ListFundsInput(business_id=business_uuid))
        funds = result.get("funds", [])
        total = result.get("total", 0)

        if not funds:
            return StructuredRetrievalResult(
                prechecks=[
                    StructuredPrecheckReceipt(
                        name="fund_summary",
                        source="repe.list_funds",
                        status=StructuredPrecheckStatus.EMPTY,
                        scoped=True,
                        result_count=0,
                        evidence={"business_id": str(business_uuid), "env_id": env_id},
                        notes=["No funds found for this business."],
                    )
                ],
                empty_reason="no_funds_found",
            )

        lines = [f"FUND PORTFOLIO SUMMARY ({total} funds):"]
        for fund in funds[:20]:
            name = fund.get("name") or fund.get("fund_name") or "Unnamed"
            strategy = fund.get("strategy") or fund.get("fund_type") or ""
            vintage = fund.get("vintage_year") or ""
            status = fund.get("status") or ""
            parts = [name]
            if strategy:
                parts.append(f"strategy={strategy}")
            if vintage:
                parts.append(f"vintage={vintage}")
            if status:
                parts.append(f"status={status}")
            lines.append(f"  - {' | '.join(parts)}")

        precheck = StructuredPrecheckReceipt(
            name="fund_summary",
            source="repe.list_funds",
            status=StructuredPrecheckStatus.HIT,
            scoped=True,
            result_count=total,
            evidence={"business_id": str(business_uuid), "env_id": env_id},
            notes=[f"Fetched {total} fund(s) from structured data."],
        )
        return StructuredRetrievalResult(
            context_text="\n".join(lines),
            result_count=total,
            prechecks=[precheck],
            top_hits=[
                {
                    "source": "structured:repe.list_funds",
                    "label": f.get("name") or f.get("fund_name"),
                    "fund_id": str(f.get("fund_id", "")),
                    "strategy": f.get("strategy") or f.get("fund_type"),
                }
                for f in funds[:5]
            ],
            strategy_suffix="structured_precheck",
        )
    except Exception as exc:
        return StructuredRetrievalResult(
            prechecks=[
                StructuredPrecheckReceipt(
                    name="fund_summary",
                    source="repe.list_funds",
                    status=StructuredPrecheckStatus.ERROR,
                    scoped=True,
                    result_count=0,
                    evidence={"business_id": str(business_uuid), "env_id": env_id},
                    error=str(exc)[:500],
                    notes=["Fund summary precheck failed."],
                )
            ],
            empty_reason="structured_precheck_error",
        )


def _fund_holdings_precheck(
    *,
    message: str,
    business_uuid: uuid.UUID | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> StructuredRetrievalResult:
    """Fetch holdings (assets) for a fund when a holdings query is detected."""
    if business_uuid is None or not _FUND_HOLDINGS_RE.search(message or ""):
        return StructuredRetrievalResult()
    if entity_type != "fund" or not entity_id:
        return StructuredRetrievalResult()

    try:
        from app.mcp.schemas.repe_tools import ListAssetsInput
        from app.mcp.tools.repe_tools import _list_assets

        ctx = _structured_ctx(
            business_id=str(business_uuid),
            env_id=env_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        result = _list_assets(ctx, ListAssetsInput(fund_id=uuid.UUID(entity_id)))
        assets = result.get("assets", [])
        total = result.get("total", 0)

        if not assets:
            return StructuredRetrievalResult(
                prechecks=[
                    StructuredPrecheckReceipt(
                        name="fund_holdings",
                        source="repe.list_assets",
                        status=StructuredPrecheckStatus.EMPTY,
                        scoped=True,
                        result_count=0,
                        notes=["This fund currently has no recorded holdings."],
                    )
                ],
                empty_reason="no_holdings_found",
            )

        lines = [f"FUND HOLDINGS ({total} assets):"]
        for asset in assets[:20]:
            name = asset.get("name") or "Unnamed"
            ptype = asset.get("property_type") or ""
            city = asset.get("city") or ""
            state = asset.get("state") or ""
            loc = f"{city}, {state}" if city else ""
            parts = [name]
            if ptype:
                parts.append(f"type={ptype}")
            if loc:
                parts.append(f"location={loc}")
            lines.append("  - " + " | ".join(parts))

        return StructuredRetrievalResult(
            context_text="\n".join(lines),
            result_count=total,
            prechecks=[
                StructuredPrecheckReceipt(
                    name="fund_holdings",
                    source="repe.list_assets",
                    status=StructuredPrecheckStatus.OK,
                    scoped=True,
                    result_count=total,
                )
            ],
            top_hits=[{"name": a.get("name"), "property_type": a.get("property_type")} for a in assets[:5]],
            strategy_suffix="fund_holdings",
        )
    except Exception as exc:
        return StructuredRetrievalResult(
            prechecks=[
                StructuredPrecheckReceipt(
                    name="fund_holdings",
                    source="repe.list_assets",
                    status=StructuredPrecheckStatus.ERROR,
                    error=str(exc)[:500],
                    notes=["Fund holdings precheck failed."],
                )
            ],
            empty_reason="structured_precheck_error",
        )


def _asset_count_precheck(
    *,
    message: str,
    business_uuid: uuid.UUID | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> StructuredRetrievalResult:
    """Fast path for count questions — uses canonical count_assets() from repe service."""
    if business_uuid is None or not _COUNT_QUERY_RE.search(message or ""):
        return StructuredRetrievalResult()

    try:
        from app.services.repe import count_assets

        fund_uuid = uuid.UUID(entity_id) if entity_type == "fund" and entity_id else None
        counts = count_assets(business_id=business_uuid, fund_id=fund_uuid)

        scope = f"fund {entity_id[:8]}..." if fund_uuid else "portfolio"
        lines = [
            f"ASSET COUNTS ({scope}):",
            f"  Active assets: {counts['active']}",
            f"  Disposed assets: {counts['disposed']}",
            f"  Pipeline assets: {counts['pipeline']}",
            f"  Total property assets (all statuses): {counts['total']}",
            "",
            "Definition: 'Active' includes status = active, held, lease_up, operating, or NULL (legacy).",
            "Excludes CMBS and non-property assets. Matches the page KPI definition.",
        ]

        return StructuredRetrievalResult(
            context_text="\n".join(lines),
            result_count=counts["total"],
            prechecks=[
                StructuredPrecheckReceipt(
                    name="asset_count",
                    source="repe.count_assets",
                    status=StructuredPrecheckStatus.OK,
                    scoped=True,
                    result_count=counts["total"],
                    evidence=counts,
                )
            ],
            top_hits=[counts],
            strategy_suffix="asset_count",
        )
    except Exception as exc:
        return StructuredRetrievalResult(
            prechecks=[
                StructuredPrecheckReceipt(
                    name="asset_count",
                    source="repe.count_assets",
                    status=StructuredPrecheckStatus.ERROR,
                    error=str(exc)[:500],
                )
            ],
        )


def _fund_investment_precheck(
    *,
    message: str,
    business_uuid: uuid.UUID | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> StructuredRetrievalResult:
    """Fetch investments (deals) for a fund when investment-related query detected."""
    if business_uuid is None or entity_type != "fund" or not entity_id:
        return StructuredRetrievalResult()
    if not _FUND_INVESTMENT_RE.search(message or ""):
        return StructuredRetrievalResult()

    try:
        ctx = _structured_ctx(
            business_id=str(business_uuid),
            env_id=env_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        result = _list_deals(ctx, ListDealsInput(fund_id=uuid.UUID(entity_id)))
        deals = result.get("deals", [])
        total = result.get("total", 0)

        if not deals:
            return StructuredRetrievalResult(
                prechecks=[
                    StructuredPrecheckReceipt(
                        name="fund_investments",
                        source="repe.list_deals",
                        status=StructuredPrecheckStatus.EMPTY,
                        scoped=True,
                        result_count=0,
                        notes=["No investments found for this fund."],
                    )
                ],
                empty_reason="no_investments_found",
            )

        lines = [f"FUND INVESTMENTS ({total} deals):"]
        for deal in deals[:10]:
            name = deal.get("name") or "Unnamed"
            status = deal.get("status") or ""
            committed = deal.get("committed_equity") or ""
            parts = [name]
            if status:
                parts.append(f"status={status}")
            if committed:
                parts.append(f"committed=${committed:,.0f}" if isinstance(committed, (int, float)) else f"committed={committed}")
            lines.append("  - " + " | ".join(parts))

        return StructuredRetrievalResult(
            context_text="\n".join(lines),
            result_count=total,
            prechecks=[
                StructuredPrecheckReceipt(
                    name="fund_investments",
                    source="repe.list_deals",
                    status=StructuredPrecheckStatus.OK,
                    scoped=True,
                    result_count=total,
                )
            ],
            top_hits=[{"name": d.get("name"), "status": d.get("status")} for d in deals[:5]],
            strategy_suffix="fund_investments",
        )
    except Exception as exc:
        return StructuredRetrievalResult(
            prechecks=[
                StructuredPrecheckReceipt(
                    name="fund_investments",
                    source="repe.list_deals",
                    status=StructuredPrecheckStatus.ERROR,
                    error=str(exc)[:500],
                    notes=["Fund investment precheck failed."],
                )
            ],
            empty_reason="structured_precheck_error",
        )


def _run_structured_prechecks(
    *,
    message: str,
    business_uuid: uuid.UUID | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> StructuredRetrievalResult:
    novendor = _novendor_follow_up_precheck(
        message=message,
        business_uuid=business_uuid,
        env_id=env_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    meridian = _meridian_variance_precheck(
        message=message,
        business_uuid=business_uuid,
        env_id=env_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    fund_summary = _fund_summary_precheck(
        message=message,
        business_uuid=business_uuid,
        env_id=env_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    fund_holdings = _fund_holdings_precheck(
        message=message,
        business_uuid=business_uuid,
        env_id=env_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    fund_investments = _fund_investment_precheck(
        message=message,
        business_uuid=business_uuid,
        env_id=env_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    asset_count = _asset_count_precheck(
        message=message,
        business_uuid=business_uuid,
        env_id=env_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    all_results = [novendor, meridian, fund_summary, fund_holdings, fund_investments, asset_count]
    prechecks = [pc for r in all_results for pc in r.prechecks]
    context_text = _merge_context_parts([r.context_text for r in all_results])
    top_hits = [hit for r in all_results for hit in r.top_hits][:5]
    result_count = sum(r.result_count for r in all_results)
    strategy_parts = [r.strategy_suffix for r in all_results if r.strategy_suffix]
    empty_reason = next((r.empty_reason for r in all_results if r.empty_reason), None)
    return StructuredRetrievalResult(
        context_text=context_text,
        result_count=result_count,
        prechecks=prechecks,
        top_hits=top_hits,
        strategy_suffix="+".join(strategy_parts) if strategy_parts else None,
        empty_reason=empty_reason,
    )


async def execute_retrieval(
    *,
    route: RouteDecision,
    retrieval_policy: RetrievalPolicy,
    message: str,
    business_id: str | None,
    env_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> RetrievalExecution:
    if route.skip_rag or retrieval_policy == RetrievalPolicy.NONE or not business_id:
        return RetrievalExecution(
            chunks=[],
            context_text="",
            receipt=RetrievalReceipt(used=False, result_count=0, status=RetrievalStatus.OK),
        )

    business_uuid = _coerce_uuid(business_id)
    effective_entity_type = entity_type
    effective_entity_id = entity_id
    if entity_type == "environment":
        effective_entity_type = None
        effective_entity_id = None

    structured = _run_structured_prechecks(
        message=message,
        business_uuid=business_uuid,
        env_id=env_id,
        entity_type=effective_entity_type,
        entity_id=effective_entity_id,
    )

    scope_filters = _scope_filters(
        business_id=business_id,
        env_id=env_id,
        entity_type=effective_entity_type,
        entity_id=effective_entity_id,
        entity_id_filter_applied=False,
    )

    if business_uuid is None:
        return RetrievalExecution(
            chunks=[],
            context_text=structured.context_text,
            receipt=RetrievalReceipt(
                used=True,
                result_count=structured.result_count,
                status=RetrievalStatus.EMPTY,
                debug=RetrievalDebugReceipt(
                    query_text=message,
                    scope_filters=scope_filters,
                    strategy=structured.strategy_suffix or "semantic",
                    top_hits=structured.top_hits,
                    structured_prechecks=structured.prechecks,
                    empty_reason="invalid_business_id",
                ),
            ),
        )

    entity_uuid = _coerce_uuid(effective_entity_id) if effective_entity_id else None
    if effective_entity_id and entity_uuid is None:
        effective_entity_type = None
        effective_entity_id = None
        scope_filters = _scope_filters(
            business_id=business_id,
            env_id=env_id,
            entity_type=None,
            entity_id=entity_id,
            entity_id_filter_applied=False,
        )
        entity_uuid = None
    else:
        scope_filters = _scope_filters(
            business_id=business_id,
            env_id=env_id,
            entity_type=effective_entity_type,
            entity_id=effective_entity_id,
            entity_id_filter_applied=bool(entity_uuid),
        )

    top_k = route.rag_top_k if route.rag_top_k > 0 else RAG_TOP_K
    raw_chunks = semantic_search(
        query=message,
        business_id=business_uuid,
        env_id=_coerce_uuid(env_id) if env_id else None,
        entity_type=effective_entity_type,
        entity_id=entity_uuid,
        top_k=top_k,
        use_hybrid=route.use_hybrid,
        overfetch=RAG_OVERFETCH if route.use_rerank else None,
        return_all=route.use_rerank,
    )
    debug_top_hits = structured.top_hits or _chunk_hits(raw_chunks)

    if route.use_rerank and len(raw_chunks) > 1:
        chunks = await rerank_chunks(query=message, chunks=raw_chunks, top_k=top_k)
    else:
        chunks = list(raw_chunks)
    min_score = getattr(route, "rag_min_score", RAG_MIN_SCORE)
    filtered_chunks = [chunk for chunk in chunks if chunk.score >= min_score]

    strategy_parts: list[str] = []
    if structured.strategy_suffix:
        strategy_parts.append(structured.strategy_suffix)
    strategy_parts.append("hybrid" if route.use_hybrid else "semantic")
    if route.use_rerank:
        strategy_parts.append("rerank")
    strategy = "+".join(strategy_parts)

    if not filtered_chunks and structured.result_count == 0:
        empty_reason = structured.empty_reason
        if empty_reason is None:
            empty_reason = "hits_below_threshold" if raw_chunks else "no_scoped_results"
        return RetrievalExecution(
            chunks=[],
            context_text="",
            receipt=RetrievalReceipt(
                used=True,
                result_count=0,
                status=RetrievalStatus.EMPTY,
                debug=RetrievalDebugReceipt(
                    query_text=message,
                    scope_filters=scope_filters,
                    strategy=strategy,
                    top_hits=debug_top_hits,
                    structured_prechecks=structured.prechecks,
                    empty_reason=empty_reason,
                ),
            ),
        )

    char_limit = 500 if retrieval_policy == RetrievalPolicy.LIGHT else 1100
    rag_context = _build_rag_context(filtered_chunks, char_limit=char_limit)
    merged_context = _merge_context_parts([structured.context_text, rag_context])
    result_count = structured.result_count + len(filtered_chunks)
    return RetrievalExecution(
        chunks=filtered_chunks,
        context_text=merged_context,
        receipt=RetrievalReceipt(
            used=True,
            result_count=result_count,
            status=RetrievalStatus.OK,
            debug=RetrievalDebugReceipt(
                query_text=message,
                scope_filters=scope_filters,
                strategy=strategy,
                top_hits=debug_top_hits,
                structured_prechecks=structured.prechecks,
                empty_reason=None,
            ),
        ),
    )

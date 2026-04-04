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
from app.mcp.tools.novendor_tools import _list_tasks_due_today
from app.mcp.tools.repe_analysis_tools import _noi_variance
from app.services.rag_indexer import RetrievedChunk, semantic_search
from app.services.rag_reranker import rerank_chunks
from app.services.request_router import RouteDecision

_FOLLOW_UP_RE = re.compile(r"\b(follow up|follow-up|next action|today)\b", re.IGNORECASE)
_NOI_VARIANCE_RE = re.compile(r"\b(noi|underwriting|down vs|variance)\b", re.IGNORECASE)


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

    prechecks = [*novendor.prechecks, *meridian.prechecks]
    context_text = _merge_context_parts([novendor.context_text, meridian.context_text])
    top_hits = [*novendor.top_hits, *meridian.top_hits][:5]
    result_count = novendor.result_count + meridian.result_count
    strategy_parts = [item for item in [novendor.strategy_suffix, meridian.strategy_suffix] if item]
    empty_reason = novendor.empty_reason or meridian.empty_reason
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

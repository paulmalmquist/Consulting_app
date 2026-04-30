"""Fund-level scope discovery for the bottom-up authoritative pipeline.

Today's bottom-up engine is manifest-driven: callers pass an explicit
``included_investment_ids`` set, or the rollup runs over every investment
under the fund regardless of stage / archive status.

This module replaces that with an explicit scope contract. ``discover_fund_scope``
walks the deal/asset hierarchy, applies the active-asset rules
(``stage IN ('closing','operating','exited')``,
``archived_at IS NULL``, ``quarantined_at IS NULL``),
and returns the expected investment + asset set, an explicit exclusion list
with reasons, and a NAV-eligible subset that excludes exited assets without
residual value.

The scope receipt is the audit-grade source of truth for "which assets and
investments contributed to this snapshot, and which were intentionally left
out and why".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from app.db import get_cursor

OPERATIONAL_DEAL_STAGES: tuple[str, ...] = ("closing", "operating", "exited")
NAV_ACTIVE_STAGES: tuple[str, ...] = ("closing", "operating")
SCOPE_CONTRACT_VERSION = "v2"

ScopeExclusionReason = Literal[
    "archived",
    "quarantined",
    "stage_inactive",
    "no_active_assets",
]


@dataclass(frozen=True)
class ScopeExclusion:
    entity_type: Literal["asset", "investment"]
    entity_id: UUID
    name: str
    reason: ScopeExclusionReason | str
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class FundScope:
    fund_id: UUID
    as_of_quarter: str
    expected_investment_ids: set[UUID]
    expected_asset_ids: set[UUID]
    nav_eligible_asset_ids: set[UUID]
    exclusions: list[ScopeExclusion]
    audit_mode: bool
    scope_contract_version: str = SCOPE_CONTRACT_VERSION

    @property
    def expected_investment_count(self) -> int:
        return len(self.expected_investment_ids)

    @property
    def expected_asset_count(self) -> int:
        return len(self.expected_asset_ids)

    def to_receipt_dict(self) -> dict[str, Any]:
        return {
            "fund_id": str(self.fund_id),
            "as_of_quarter": self.as_of_quarter,
            "scope_contract_version": self.scope_contract_version,
            "expected_investment_count": self.expected_investment_count,
            "expected_asset_count": self.expected_asset_count,
            "expected_investment_ids": sorted(str(i) for i in self.expected_investment_ids),
            "expected_asset_ids": sorted(str(a) for a in self.expected_asset_ids),
            "nav_eligible_asset_ids": sorted(str(a) for a in self.nav_eligible_asset_ids),
            "exclusion_count": len(self.exclusions),
            "exclusions": [
                {
                    "entity_type": ex.entity_type,
                    "entity_id": str(ex.entity_id),
                    "name": ex.name,
                    "reason": ex.reason,
                    **({"extra": ex.extra} if ex.extra else {}),
                }
                for ex in self.exclusions
            ],
            "audit_mode": self.audit_mode,
        }


def discover_fund_scope(
    fund_id: UUID,
    as_of_quarter: str,
    *,
    audit_mode: bool = False,
) -> FundScope:
    """Walk a fund's deal/asset hierarchy and produce its bottom-up scope.

    ``audit_mode=True`` keeps archived / quarantined / stage-inactive entities
    in ``expected_*`` AND in ``exclusions`` so the receipt shows what would
    normally be skipped. ``audit_mode=False`` (default) excludes them from
    ``expected_*`` and only records them in ``exclusions``.

    NAV-eligible assets are a subset of expected assets where the parent deal
    is in ``NAV_ACTIVE_STAGES`` ('closing', 'operating'). Exited assets stay
    in ``expected_asset_ids`` so lifetime CF / DPI / IRR calculations include
    their full history, but they are excluded from the current ending-NAV
    identity check (gate 5 in the snapshot pipeline).

    The query is one-shot: a single LEFT JOIN of repe_deal x repe_asset
    pre-filtered by fund. Buckets are applied in Python so the rules and
    exclusion reasons are testable without DB fixtures.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                d.deal_id,
                d.name           AS deal_name,
                d.stage,
                a.asset_id,
                a.name           AS asset_name,
                a.archived_at,
                a.quarantined_at,
                a.quarantine_reason
            FROM repe_deal d
            LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
            WHERE d.fund_id = %s
            ORDER BY d.deal_id, a.asset_id
            """,
            (fund_id,),
        )
        rows = cur.fetchall()

    return _bucket_scope_rows(
        fund_id=fund_id,
        as_of_quarter=as_of_quarter,
        rows=rows,
        audit_mode=audit_mode,
    )


def _bucket_scope_rows(
    *,
    fund_id: UUID,
    as_of_quarter: str,
    rows: list[dict[str, Any]],
    audit_mode: bool,
) -> FundScope:
    """Apply scope rules to raw deal/asset rows. Pure function for testability."""
    expected_investment_ids: set[UUID] = set()
    expected_asset_ids: set[UUID] = set()
    nav_eligible_asset_ids: set[UUID] = set()
    exclusions: list[ScopeExclusion] = []

    deals_seen: dict[UUID, dict[str, Any]] = {}
    deal_assets: dict[UUID, list[dict[str, Any]]] = {}
    for row in rows:
        deal_id = row["deal_id"]
        if deal_id not in deals_seen:
            deals_seen[deal_id] = {"name": row["deal_name"], "stage": row["stage"]}
            deal_assets[deal_id] = []
        if row["asset_id"] is not None:
            deal_assets[deal_id].append(row)

    for deal_id, info in deals_seen.items():
        stage = info["stage"]
        deal_name = info["name"] or "(unnamed deal)"
        assets = deal_assets[deal_id]

        stage_active = stage in OPERATIONAL_DEAL_STAGES

        if not stage_active:
            exclusions.append(
                ScopeExclusion(
                    entity_type="investment",
                    entity_id=deal_id,
                    name=deal_name,
                    reason="stage_inactive",
                    extra={"stage": stage},
                )
            )
            if audit_mode:
                expected_investment_ids.add(deal_id)
            else:
                continue

        active_asset_count = 0
        for asset_row in assets:
            asset_id = asset_row["asset_id"]
            asset_name = asset_row["asset_name"] or "(unnamed asset)"
            archived = asset_row["archived_at"] is not None
            quarantined = asset_row["quarantined_at"] is not None

            if archived:
                exclusions.append(
                    ScopeExclusion(
                        entity_type="asset",
                        entity_id=asset_id,
                        name=asset_name,
                        reason="archived",
                        extra={"archived_at": asset_row["archived_at"].isoformat()},
                    )
                )
                if audit_mode:
                    expected_asset_ids.add(asset_id)
                continue
            if quarantined:
                exclusions.append(
                    ScopeExclusion(
                        entity_type="asset",
                        entity_id=asset_id,
                        name=asset_name,
                        reason="quarantined",
                        extra={
                            "quarantined_at": asset_row["quarantined_at"].isoformat(),
                            "quarantine_reason": asset_row["quarantine_reason"] or "",
                        },
                    )
                )
                if audit_mode:
                    expected_asset_ids.add(asset_id)
                continue

            expected_asset_ids.add(asset_id)
            active_asset_count += 1
            if stage in NAV_ACTIVE_STAGES:
                nav_eligible_asset_ids.add(asset_id)

        if stage_active and active_asset_count == 0:
            if not assets:
                exclusions.append(
                    ScopeExclusion(
                        entity_type="investment",
                        entity_id=deal_id,
                        name=deal_name,
                        reason="no_active_assets",
                        extra={"stage": stage, "asset_count_total": 0},
                    )
                )
            else:
                exclusions.append(
                    ScopeExclusion(
                        entity_type="investment",
                        entity_id=deal_id,
                        name=deal_name,
                        reason="no_active_assets",
                        extra={"stage": stage, "asset_count_total": len(assets)},
                    )
                )
            if not audit_mode:
                continue

        if stage_active:
            expected_investment_ids.add(deal_id)

    return FundScope(
        fund_id=fund_id,
        as_of_quarter=as_of_quarter,
        expected_investment_ids=expected_investment_ids,
        expected_asset_ids=expected_asset_ids,
        nav_eligible_asset_ids=nav_eligible_asset_ids,
        exclusions=exclusions,
        audit_mode=audit_mode,
    )


def asset_residual_at(
    asset_id: UUID, quarter: str, *, scenario_id: UUID | None = None
) -> Decimal | None:
    """Look up a single asset's residual value at ``quarter``.

    Used to decide whether an exited asset still belongs in the NAV identity
    check (gate 5). Reads ``re_authoritative_asset_state_qtr`` first
    (released-only); falls back to ``re_asset_quarter_state``.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT (canonical_metrics->>'authoritative_nav')::numeric AS nav
            FROM re_authoritative_asset_state_qtr
            WHERE asset_id = %s AND quarter = %s AND promotion_state = 'released'
            ORDER BY released_at DESC NULLS LAST
            LIMIT 1
            """,
            (asset_id, quarter),
        )
        row = cur.fetchone()
        if row and row["nav"] is not None:
            return Decimal(row["nav"])

        cur.execute(
            """
            SELECT nav::numeric AS nav
            FROM re_asset_quarter_state
            WHERE asset_id = %s AND quarter = %s
              AND (scenario_id = %s OR (scenario_id IS NULL AND %s::uuid IS NULL))
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (asset_id, quarter, scenario_id, scenario_id),
        )
        row = cur.fetchone()
        if row and row["nav"] is not None:
            return Decimal(row["nav"])
    return None


def expand_nav_eligibility_with_residuals(
    scope: FundScope,
    *,
    quarter: str | None = None,
    scenario_id: UUID | None = None,
) -> FundScope:
    """Add exited assets that still carry a non-zero residual NAV to the
    NAV-eligible set.

    Default behavior of ``discover_fund_scope`` excludes all exited-stage
    assets from ``nav_eligible_asset_ids``. This helper checks each excluded
    exited asset for a residual value and re-includes it if found. Splitting
    this from the main scope query keeps the cheap path cheap (no per-asset
    NAV lookups) and only pays the cost when the snapshot pipeline asks
    for it.
    """
    target_quarter = quarter or scope.as_of_quarter
    candidates = scope.expected_asset_ids - scope.nav_eligible_asset_ids
    if not candidates:
        return scope
    new_eligible = set(scope.nav_eligible_asset_ids)
    for asset_id in candidates:
        residual = asset_residual_at(asset_id, target_quarter, scenario_id=scenario_id)
        if residual is not None and residual > Decimal("0"):
            new_eligible.add(asset_id)
    if new_eligible == scope.nav_eligible_asset_ids:
        return scope
    return FundScope(
        fund_id=scope.fund_id,
        as_of_quarter=scope.as_of_quarter,
        expected_investment_ids=scope.expected_investment_ids,
        expected_asset_ids=scope.expected_asset_ids,
        nav_eligible_asset_ids=new_eligible,
        exclusions=scope.exclusions,
        audit_mode=scope.audit_mode,
        scope_contract_version=scope.scope_contract_version,
    )

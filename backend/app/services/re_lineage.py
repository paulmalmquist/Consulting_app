from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor


ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _quarter_state_clause(scenario_id: UUID | None, alias: str = "s") -> tuple[str, list[str]]:
    if scenario_id:
        return f"{alias}.scenario_id = %s", [str(scenario_id)]
    return f"{alias}.scenario_id IS NULL", []


def _widget(
    *,
    widget_key: str,
    label: str,
    display_value,
    endpoint: str,
    source_table: str,
    source_column: str,
    source_row_ref: str | None,
    run_id: str | None = None,
    inputs_hash: str | None = None,
    computed_from: list[str] | None = None,
    propagates_to: list[str] | None = None,
    notes: list[str] | None = None,
    status: str = "ok",
) -> dict:
    return {
        "widget_key": widget_key,
        "label": label,
        "status": status,
        "display_value": display_value,
        "endpoint": endpoint,
        "source_table": source_table,
        "source_column": source_column,
        "source_row_ref": source_row_ref,
        "run_id": run_id,
        "inputs_hash": inputs_hash,
        "computed_from": computed_from or [],
        "propagates_to": propagates_to or [],
        "notes": notes or [],
    }


def get_asset_quarter_state(*, asset_id: UUID, quarter: str, scenario_id: UUID | None = None) -> dict:
    with get_cursor() as cur:
        if scenario_id:
            cur.execute(
                """
                SELECT *
                FROM re_asset_quarter_state
                WHERE asset_id = %s AND quarter = %s AND scenario_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(asset_id), quarter, str(scenario_id)),
            )
        else:
            cur.execute(
                """
                SELECT *
                FROM re_asset_quarter_state
                WHERE asset_id = %s AND quarter = %s AND scenario_id IS NULL
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(asset_id), quarter),
            )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"No asset state for {asset_id} quarter {quarter}")
        return row


def list_fund_investment_rollup(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
) -> list[dict]:
    clause, extra = _quarter_state_clause(scenario_id, "s")
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                d.deal_id AS investment_id,
                d.name,
                d.deal_type,
                d.stage,
                s.id AS quarter_state_id,
                s.run_id,
                s.nav,
                s.gross_asset_value,
                s.debt_balance,
                s.cash_balance,
                s.effective_ownership_percent,
                s.fund_nav_contribution,
                s.inputs_hash,
                s.created_at
            FROM repe_deal d
            LEFT JOIN LATERAL (
                SELECT *
                FROM re_investment_quarter_state s
                WHERE s.investment_id = d.deal_id AND s.quarter = %s AND {clause}
                ORDER BY s.created_at DESC
                LIMIT 1
            ) s ON true
            WHERE d.fund_id = %s
            ORDER BY d.name
            """,
            [quarter, *extra, str(fund_id)],
        )
        return cur.fetchall()


def list_investment_assets(
    *,
    investment_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
) -> list[dict]:
    clause, extra = _quarter_state_clause(scenario_id, "s")
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                a.asset_id,
                a.deal_id,
                a.jv_id,
                a.asset_type,
                a.name,
                pa.property_type,
                s.id AS quarter_state_id,
                s.run_id,
                s.noi,
                s.net_cash_flow,
                s.debt_balance,
                s.asset_value,
                s.nav,
                s.inputs_hash,
                s.created_at
            FROM repe_asset a
            LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
            LEFT JOIN LATERAL (
                SELECT *
                FROM re_asset_quarter_state s
                WHERE s.asset_id = a.asset_id AND s.quarter = %s AND {clause}
                ORDER BY s.created_at DESC
                LIMIT 1
            ) s ON true
            WHERE a.deal_id = %s
            ORDER BY a.name
            """,
            [quarter, *extra, str(investment_id)],
        )
        return cur.fetchall()


def list_jv_assets(
    *,
    jv_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
) -> list[dict]:
    clause, extra = _quarter_state_clause(scenario_id, "s")
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                a.asset_id,
                a.deal_id,
                a.jv_id,
                a.asset_type,
                a.name,
                pa.property_type,
                s.id AS quarter_state_id,
                s.run_id,
                s.noi,
                s.net_cash_flow,
                s.debt_balance,
                s.asset_value,
                s.nav,
                s.inputs_hash,
                s.created_at
            FROM repe_asset a
            LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
            LEFT JOIN LATERAL (
                SELECT *
                FROM re_asset_quarter_state s
                WHERE s.asset_id = a.asset_id AND s.quarter = %s AND {clause}
                ORDER BY s.created_at DESC
                LIMIT 1
            ) s ON true
            WHERE a.jv_id = %s
            ORDER BY a.name
            """,
            [quarter, *extra, str(jv_id)],
        )
        return cur.fetchall()


def fund_lineage(*, fund_id: UUID, quarter: str, scenario_id: UUID | None = None) -> dict:
    widgets: list[dict] = []
    issues: list[dict] = []

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT f.*, t.preferred_return_rate, t.carry_rate, t.waterfall_style
            FROM repe_fund f
            LEFT JOIN LATERAL (
                SELECT preferred_return_rate, carry_rate, waterfall_style
                FROM repe_fund_term
                WHERE fund_id = f.fund_id
                ORDER BY effective_from DESC
                LIMIT 1
            ) t ON true
            WHERE f.fund_id = %s
            """,
            (str(fund_id),),
        )
        fund = cur.fetchone()
        if not fund:
            raise LookupError(f"Fund {fund_id} not found")

        if scenario_id:
            cur.execute(
                """
                SELECT * FROM re_fund_quarter_state
                WHERE fund_id = %s AND quarter = %s AND scenario_id = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(fund_id), quarter, str(scenario_id)),
            )
            cur_state = cur.fetchone()
            cur.execute(
                """
                SELECT * FROM re_fund_quarter_metrics
                WHERE fund_id = %s AND quarter = %s AND scenario_id = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(fund_id), quarter, str(scenario_id)),
            )
            metrics = cur.fetchone()
        else:
            cur.execute(
                """
                SELECT * FROM re_fund_quarter_state
                WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(fund_id), quarter),
            )
            cur_state = cur.fetchone()
            cur.execute(
                """
                SELECT * FROM re_fund_quarter_metrics
                WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(fund_id), quarter),
            )
            metrics = cur.fetchone()

        cur.execute("SELECT COUNT(*) AS cnt FROM repe_deal WHERE fund_id = %s", (str(fund_id),))
        investment_count = cur.fetchone()["cnt"]
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM re_scenario
            WHERE fund_id = %s AND status = 'active' AND is_base = false
            """,
            (str(fund_id),),
        )
        scenario_count = cur.fetchone()["cnt"]

    state_row_ref = f"re_fund_quarter_state:{cur_state['id']}" if cur_state else None
    metrics_row_ref = f"re_fund_quarter_metrics:{metrics['id']}" if metrics else None
    state_run_id = str(cur_state["run_id"]) if cur_state and cur_state.get("run_id") else None
    state_hash = cur_state.get("inputs_hash") if cur_state else None

    if not cur_state:
        issues.append(
            {
                "severity": "error",
                "code": "MISSING_FUND_STATE",
                "message": f"Fund quarter state is missing for {quarter}.",
                "widget_keys": ["kpi.nav", "kpi.committed", "kpi.called", "kpi.distributed", "kpi.dpi", "kpi.tvpi"],
            }
        )

    widgets.extend(
        [
            _widget(
                widget_key="header.name",
                label="Fund Name",
                display_value=fund["name"],
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund",
                source_column="name",
                source_row_ref=f"repe_fund:{fund_id}",
                propagates_to=["kpi.nav", "overview.investment_table"],
            ),
            _widget(
                widget_key="header.strategy",
                label="Strategy",
                display_value=fund.get("strategy"),
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund",
                source_column="strategy",
                source_row_ref=f"repe_fund:{fund_id}",
            ),
            _widget(
                widget_key="header.vintage",
                label="Vintage",
                display_value=fund.get("vintage_year"),
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund",
                source_column="vintage_year",
                source_row_ref=f"repe_fund:{fund_id}",
            ),
            _widget(
                widget_key="header.pref_return",
                label="Preferred Return",
                display_value=fund.get("preferred_return_rate"),
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund_term",
                source_column="preferred_return_rate",
                source_row_ref=f"repe_fund_term:{fund_id}",
            ),
            _widget(
                widget_key="header.carry",
                label="Carry",
                display_value=fund.get("carry_rate"),
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund_term",
                source_column="carry_rate",
                source_row_ref=f"repe_fund_term:{fund_id}",
            ),
            _widget(
                widget_key="header.waterfall_style",
                label="Waterfall Style",
                display_value=fund.get("waterfall_style"),
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund_term",
                source_column="waterfall_style",
                source_row_ref=f"repe_fund_term:{fund_id}",
            ),
            _widget(
                widget_key="header.target_size",
                label="Target Size",
                display_value=fund.get("target_size"),
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund",
                source_column="target_size",
                source_row_ref=f"repe_fund:{fund_id}",
            ),
        ]
    )

    for widget_key, label, column, computed_from in (
        ("kpi.nav", "NAV", "portfolio_nav", ["re_investment_quarter_state.fund_nav_contribution"]),
        ("kpi.committed", "Committed", "total_committed", ["re_capital_ledger_entry.amount_base"]),
        ("kpi.called", "Called", "total_called", ["re_capital_ledger_entry.amount_base"]),
        ("kpi.distributed", "Distributed", "total_distributed", ["re_capital_ledger_entry.amount_base"]),
        ("kpi.dpi", "DPI", "dpi", ["re_fund_quarter_state.total_distributed", "re_fund_quarter_state.total_called"]),
        ("kpi.tvpi", "TVPI", "tvpi", ["re_fund_quarter_state.portfolio_nav", "re_fund_quarter_state.total_distributed", "re_fund_quarter_state.total_called"]),
    ):
        status = "ok" if cur_state else "missing_data"
        widgets.append(
            _widget(
                widget_key=widget_key,
                label=label,
                display_value=cur_state.get(column) if cur_state else None,
                endpoint=f"/api/re/v2/funds/{fund_id}/quarter-state/{quarter}",
                source_table="re_fund_quarter_state",
                source_column=column,
                source_row_ref=state_row_ref,
                run_id=state_run_id,
                inputs_hash=state_hash,
                computed_from=computed_from,
                propagates_to=["lp.kpis", "lp.partner_table"] if widget_key == "kpi.nav" else [],
                notes=["Run quarter close to populate this value."] if not cur_state else [],
                status=status,
            )
        )

    widgets.append(
        _widget(
            widget_key="kpi.irr",
            label="IRR",
            display_value=metrics.get("irr") if metrics else None,
            endpoint=f"/api/re/v2/funds/{fund_id}/metrics/{quarter}",
            source_table="re_fund_quarter_metrics",
            source_column="irr",
            source_row_ref=metrics_row_ref,
            run_id=state_run_id,
            inputs_hash=state_hash,
            computed_from=[
                "re_capital_ledger_entry.amount_base",
                "re_capital_ledger_entry.effective_date",
                "re_fund_quarter_state.portfolio_nav",
            ],
            propagates_to=["lp.kpis"],
            notes=["IRR is only available once ledger cash flows and a terminal NAV exist."] if not metrics else [],
            status="ok" if metrics else "missing_data",
        )
    )

    if not metrics:
        issues.append(
            {
                "severity": "warn",
                "code": "MISSING_FUND_METRICS",
                "message": f"Fund metrics are missing for {quarter}.",
                "widget_keys": ["kpi.irr"],
            }
        )

    widgets.extend(
        [
            _widget(
                widget_key="overview.investments_count",
                label="Investment Count",
                display_value=investment_count,
                endpoint=f"/api/re/v2/funds/{fund_id}/investments",
                source_table="repe_deal",
                source_column="deal_id",
                source_row_ref=f"repe_deal:fund={fund_id}",
                propagates_to=["overview.investment_table"],
            ),
            _widget(
                widget_key="overview.strategy",
                label="Overview Strategy",
                display_value=fund.get("strategy"),
                endpoint=f"/api/repe/funds/{fund_id}",
                source_table="repe_fund",
                source_column="strategy",
                source_row_ref=f"repe_fund:{fund_id}",
            ),
            _widget(
                widget_key="overview.scenarios_count",
                label="Scenario Count",
                display_value=scenario_count,
                endpoint=f"/api/re/v2/funds/{fund_id}/scenarios",
                source_table="re_scenario",
                source_column="scenario_id",
                source_row_ref=f"re_scenario:fund={fund_id}",
                notes=["Count excludes the base scenario to match the selector."],
            ),
            _widget(
                widget_key="overview.investment_table",
                label="Investment Table",
                display_value=investment_count,
                endpoint=f"/api/re/v2/funds/{fund_id}/investment-rollup/{quarter}",
                source_table="re_investment_quarter_state",
                source_column="fund_nav_contribution",
                source_row_ref=f"re_investment_quarter_state:fund={fund_id}:quarter={quarter}",
                run_id=state_run_id,
                computed_from=["repe_deal", "re_investment_quarter_state"],
            ),
        ]
    )

    return {
        "entity_type": "fund",
        "entity_id": str(fund_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "widgets": widgets,
        "issues": issues,
    }


def investment_lineage(
    *,
    investment_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
) -> dict:
    widgets: list[dict] = []
    issues: list[dict] = []
    with get_cursor() as cur:
        cur.execute("SELECT * FROM repe_deal WHERE deal_id = %s", (str(investment_id),))
        inv = cur.fetchone()
        if not inv:
            raise LookupError(f"Investment {investment_id} not found")
        if scenario_id:
            cur.execute(
                """
                SELECT * FROM re_investment_quarter_state
                WHERE investment_id = %s AND quarter = %s AND scenario_id = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(investment_id), quarter, str(scenario_id)),
            )
        else:
            cur.execute(
                """
                SELECT * FROM re_investment_quarter_state
                WHERE investment_id = %s AND quarter = %s AND scenario_id IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(investment_id), quarter),
            )
        state = cur.fetchone()
        cur.execute("SELECT COUNT(*) AS cnt FROM re_jv WHERE investment_id = %s", (str(investment_id),))
        jv_count = cur.fetchone()["cnt"]
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM repe_asset WHERE deal_id = %s AND jv_id IS NULL",
            (str(investment_id),),
        )
        direct_assets = cur.fetchone()["cnt"]

    if not state:
        issues.append(
            {
                "severity": "warn",
                "code": "MISSING_INVESTMENT_STATE",
                "message": f"Investment quarter state is missing for {quarter}.",
                "widget_keys": ["kpi.nav", "kpi.moic"],
            }
        )

    row_ref = f"re_investment_quarter_state:{state['id']}" if state else None
    run_id = str(state["run_id"]) if state and state.get("run_id") else None
    inputs_hash = state.get("inputs_hash") if state else None
    widgets.extend(
        [
            _widget(
                widget_key="header.name",
                label="Investment Name",
                display_value=inv.get("name"),
                endpoint=f"/api/re/v2/investments/{investment_id}",
                source_table="repe_deal",
                source_column="name",
                source_row_ref=f"repe_deal:{investment_id}",
                propagates_to=["kpi.nav", "jv.table"],
            ),
            _widget(
                widget_key="header.fund_link",
                label="Fund Link",
                display_value=inv.get("fund_id"),
                endpoint=f"/api/re/v2/investments/{investment_id}",
                source_table="repe_deal",
                source_column="fund_id",
                source_row_ref=f"repe_deal:{investment_id}",
            ),
            _widget(
                widget_key="kpi.committed",
                label="Committed",
                display_value=inv.get("committed_capital"),
                endpoint=f"/api/re/v2/investments/{investment_id}",
                source_table="repe_deal",
                source_column="committed_capital",
                source_row_ref=f"repe_deal:{investment_id}",
            ),
            _widget(
                widget_key="kpi.invested",
                label="Invested",
                display_value=inv.get("invested_capital"),
                endpoint=f"/api/re/v2/investments/{investment_id}",
                source_table="repe_deal",
                source_column="invested_capital",
                source_row_ref=f"repe_deal:{investment_id}",
            ),
            _widget(
                widget_key="kpi.nav",
                label="NAV",
                display_value=state.get("nav") if state else None,
                endpoint=f"/api/re/v2/investments/{investment_id}/quarter-state/{quarter}",
                source_table="re_investment_quarter_state",
                source_column="nav",
                source_row_ref=row_ref,
                run_id=run_id,
                inputs_hash=inputs_hash,
                computed_from=["re_jv_quarter_state.nav", "re_asset_quarter_state.nav"],
                propagates_to=["fund.kpi.nav"],
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="kpi.moic",
                label="MOIC",
                display_value=state.get("equity_multiple") if state else None,
                endpoint=f"/api/re/v2/investments/{investment_id}/quarter-state/{quarter}",
                source_table="re_investment_quarter_state",
                source_column="equity_multiple",
                source_row_ref=row_ref,
                run_id=run_id,
                inputs_hash=inputs_hash,
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="kpi.hold_period",
                label="Hold Period",
                display_value=inv.get("target_close_date"),
                endpoint=f"/api/re/v2/investments/{investment_id}",
                source_table="repe_deal",
                source_column="target_close_date",
                source_row_ref=f"repe_deal:{investment_id}",
            ),
            _widget(
                widget_key="jv.table",
                label="JV Table",
                display_value=jv_count,
                endpoint=f"/api/re/v2/investments/{investment_id}/jvs",
                source_table="re_jv",
                source_column="jv_id",
                source_row_ref=f"re_jv:investment={investment_id}",
            ),
            _widget(
                widget_key="direct_assets.summary",
                label="Direct Assets",
                display_value=direct_assets,
                endpoint=f"/api/re/v2/investments/{investment_id}/assets/{quarter}",
                source_table="repe_asset",
                source_column="asset_id",
                source_row_ref=f"repe_asset:investment={investment_id}",
            ),
        ]
    )

    return {
        "entity_type": "investment",
        "entity_id": str(investment_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "widgets": widgets,
        "issues": issues,
    }


def jv_lineage(*, jv_id: UUID, quarter: str, scenario_id: UUID | None = None) -> dict:
    widgets: list[dict] = []
    issues: list[dict] = []
    with get_cursor() as cur:
        cur.execute("SELECT * FROM re_jv WHERE jv_id = %s", (str(jv_id),))
        jv = cur.fetchone()
        if not jv:
            raise LookupError(f"JV {jv_id} not found")
        if scenario_id:
            cur.execute(
                """
                SELECT * FROM re_jv_quarter_state
                WHERE jv_id = %s AND quarter = %s AND scenario_id = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(jv_id), quarter, str(scenario_id)),
            )
        else:
            cur.execute(
                """
                SELECT * FROM re_jv_quarter_state
                WHERE jv_id = %s AND quarter = %s AND scenario_id IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(jv_id), quarter),
            )
        state = cur.fetchone()
        cur.execute("SELECT COUNT(*) AS cnt FROM repe_asset WHERE jv_id = %s", (str(jv_id),))
        asset_count = cur.fetchone()["cnt"]

    if not state:
        issues.append(
            {
                "severity": "warn",
                "code": "MISSING_JV_STATE",
                "message": f"JV quarter state is missing for {quarter}.",
                "widget_keys": ["kpi.nav", "kpi.noi", "kpi.debt_balance"],
            }
        )

    row_ref = f"re_jv_quarter_state:{state['id']}" if state else None
    run_id = str(state["run_id"]) if state and state.get("run_id") else None
    inputs_hash = state.get("inputs_hash") if state else None
    widgets.extend(
        [
            _widget(
                widget_key="header.legal_name",
                label="Legal Name",
                display_value=jv.get("legal_name"),
                endpoint=f"/api/re/v2/jvs/{jv_id}",
                source_table="re_jv",
                source_column="legal_name",
                source_row_ref=f"re_jv:{jv_id}",
            ),
            _widget(
                widget_key="header.investment_link",
                label="Investment Link",
                display_value=jv.get("investment_id"),
                endpoint=f"/api/re/v2/jvs/{jv_id}",
                source_table="re_jv",
                source_column="investment_id",
                source_row_ref=f"re_jv:{jv_id}",
            ),
            _widget(
                widget_key="kpi.nav",
                label="NAV",
                display_value=state.get("nav") if state else None,
                endpoint=f"/api/re/v2/jvs/{jv_id}/quarter-state/{quarter}",
                source_table="re_jv_quarter_state",
                source_column="nav",
                source_row_ref=row_ref,
                run_id=run_id,
                inputs_hash=inputs_hash,
                computed_from=["re_asset_quarter_state.nav"],
                propagates_to=["investment.kpi.nav"],
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="kpi.noi",
                label="NOI",
                display_value=state.get("noi") if state else None,
                endpoint=f"/api/re/v2/jvs/{jv_id}/quarter-state/{quarter}",
                source_table="re_jv_quarter_state",
                source_column="noi",
                source_row_ref=row_ref,
                run_id=run_id,
                inputs_hash=inputs_hash,
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="kpi.debt_balance",
                label="Debt Balance",
                display_value=state.get("debt_balance") if state else None,
                endpoint=f"/api/re/v2/jvs/{jv_id}/quarter-state/{quarter}",
                source_table="re_jv_quarter_state",
                source_column="debt_balance",
                source_row_ref=row_ref,
                run_id=run_id,
                inputs_hash=inputs_hash,
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="kpi.asset_count",
                label="Asset Count",
                display_value=asset_count,
                endpoint=f"/api/re/v2/jvs/{jv_id}/assets",
                source_table="repe_asset",
                source_column="asset_id",
                source_row_ref=f"repe_asset:jv={jv_id}",
            ),
            _widget(
                widget_key="assets.table",
                label="Assets Table",
                display_value=asset_count,
                endpoint=f"/api/re/v2/jvs/{jv_id}/assets",
                source_table="repe_asset",
                source_column="asset_id",
                source_row_ref=f"repe_asset:jv={jv_id}",
                computed_from=["repe_asset", "re_asset_quarter_state"],
            ),
        ]
    )

    return {
        "entity_type": "jv",
        "entity_id": str(jv_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "widgets": widgets,
        "issues": issues,
    }


def asset_lineage(*, asset_id: UUID, quarter: str, scenario_id: UUID | None = None) -> dict:
    widgets: list[dict] = []
    issues: list[dict] = []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT a.*, pa.property_type, pa.market, pa.units, pa.occupancy AS current_occupancy
            FROM repe_asset a
            LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
            WHERE a.asset_id = %s
            """,
            (str(asset_id),),
        )
        asset = cur.fetchone()
        if not asset:
            raise LookupError(f"Asset {asset_id} not found")
    try:
        state = get_asset_quarter_state(asset_id=asset_id, quarter=quarter, scenario_id=scenario_id)
    except LookupError:
        state = None
    row_ref = f"re_asset_quarter_state:{state['id']}" if state else None

    if not state:
        issues.append(
            {
                "severity": "warn",
                "code": "MISSING_ASSET_STATE",
                "message": f"Asset quarter state is missing for {quarter}.",
                "widget_keys": ["overview.latest_quarter", "performance.cards", "debt.fields", "valuation.fields"],
            }
        )

    if state and state.get("value_source") == "missing_inputs_fallback":
        issues.append(
            {
                "severity": "warn",
                "code": "MISSING_OPERATING_INPUTS",
                "message": "Asset quarter state is using fallback inputs instead of re_asset_operating_qtr.",
                "widget_keys": ["overview.latest_quarter", "performance.cards", "valuation.fields"],
            }
        )

    widgets.extend(
        [
            _widget(
                widget_key="header.name",
                label="Asset Name",
                display_value=asset.get("name"),
                endpoint=f"/api/repe/assets/{asset_id}",
                source_table="repe_asset",
                source_column="name",
                source_row_ref=f"repe_asset:{asset_id}",
            ),
            _widget(
                widget_key="overview.summary",
                label="Overview Summary",
                display_value=asset.get("property_type") or asset.get("asset_type"),
                endpoint=f"/api/repe/assets/{asset_id}",
                source_table="repe_property_asset" if asset.get("property_type") else "repe_asset",
                source_column="property_type" if asset.get("property_type") else "asset_type",
                source_row_ref=f"repe_asset:{asset_id}",
            ),
            _widget(
                widget_key="overview.latest_quarter",
                label="Latest Quarter",
                display_value=state.get("quarter") if state else quarter,
                endpoint=f"/api/re/v2/assets/{asset_id}/quarter-state/{quarter}",
                source_table="re_asset_quarter_state",
                source_column="quarter",
                source_row_ref=row_ref,
                run_id=str(state["run_id"]) if state and state.get("run_id") else None,
                inputs_hash=state.get("inputs_hash") if state else None,
                notes=[f"value_source={state.get('value_source')}"] if state and state.get("value_source") else [],
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="performance.cards",
                label="Performance Cards",
                display_value=state.get("net_cash_flow") if state else None,
                endpoint=f"/api/re/v2/assets/{asset_id}/quarter-state/{quarter}",
                source_table="re_asset_quarter_state",
                source_column="net_cash_flow",
                source_row_ref=row_ref,
                run_id=str(state["run_id"]) if state and state.get("run_id") else None,
                inputs_hash=state.get("inputs_hash") if state else None,
                computed_from=["re_asset_operating_qtr", "re_assumption_override"],
                propagates_to=["jv.kpi.noi", "investment.kpi.nav"],
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="debt.fields",
                label="Debt Fields",
                display_value=state.get("debt_balance") if state else None,
                endpoint=f"/api/re/v2/assets/{asset_id}/quarter-state/{quarter}",
                source_table="re_asset_quarter_state",
                source_column="debt_balance",
                source_row_ref=row_ref,
                run_id=str(state["run_id"]) if state and state.get("run_id") else None,
                inputs_hash=state.get("inputs_hash") if state else None,
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="valuation.fields",
                label="Valuation Fields",
                display_value=state.get("asset_value") if state else None,
                endpoint=f"/api/re/v2/assets/{asset_id}/quarter-state/{quarter}",
                source_table="re_asset_quarter_state",
                source_column="asset_value",
                source_row_ref=row_ref,
                run_id=str(state["run_id"]) if state and state.get("run_id") else None,
                inputs_hash=state.get("inputs_hash") if state else None,
                computed_from=["re_asset_quarter_state.noi", "re_assumption_override.exit_cap_rate"],
                propagates_to=["jv.kpi.nav", "investment.kpi.nav", "fund.kpi.nav"],
                status="ok" if state else "missing_data",
            ),
            _widget(
                widget_key="attachments",
                label="Attachments",
                display_value=None,
                endpoint=f"/api/repe/assets/{asset_id}/documents",
                source_table="documents",
                source_column="document_id",
                source_row_ref=f"documents:asset={asset_id}",
                notes=["Non-financial support artifacts; not used in rollup calculations."],
            ),
        ]
    )

    return {
        "entity_type": "asset",
        "entity_id": str(asset_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "widgets": widgets,
        "issues": issues,
    }

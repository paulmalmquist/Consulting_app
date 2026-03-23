"""Covenant compliance MCP tools.

Wraps the re_debt_surveillance service to expose covenant checks and alerts
through the MCP tool registry for Winston AI fast-path and LLM tool-calling.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.covenant_tools import (
    CheckCovenantComplianceInput,
    ListCovenantAlertsInput,
)
from app.observability.logger import emit_log


def _serialize(obj):
    """Convert non-serializable types to JSON-safe values."""
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return str(obj)
    if hasattr(obj, "hex"):
        return str(obj)
    return obj


def _check_covenant_compliance(ctx: McpContext, inp: CheckCovenantComplianceInput) -> dict:
    """Check covenant compliance for all loans on a specific asset.

    Returns current metric values vs. covenant thresholds with status and headroom.
    """
    with get_cursor() as cur:
        # Get loans for this asset
        cur.execute(
            """
            SELECT l.id AS loan_id, l.loan_name, l.upb, l.rate, l.maturity_date,
                   l.fund_id, l.asset_id
            FROM re_loan l
            WHERE l.asset_id = %s AND l.env_id = %s AND l.business_id = %s
            ORDER BY l.loan_name
            """,
            (str(inp.asset_id), inp.env_id, inp.business_id),
        )
        loans = cur.fetchall()

        if not loans:
            return {"asset_id": str(inp.asset_id), "loans": [], "message": "No loans found for this asset"}

        # Determine quarter — use latest available if not specified
        quarter = inp.quarter
        if not quarter:
            cur.execute(
                """
                SELECT quarter FROM re_asset_quarter_state
                WHERE asset_id = %s
                ORDER BY quarter DESC LIMIT 1
                """,
                (str(inp.asset_id),),
            )
            row = cur.fetchone()
            quarter = row["quarter"] if row else None
            if not quarter:
                return {"asset_id": str(inp.asset_id), "loans": [], "message": "No quarter data available"}

        # Get asset financials for the quarter
        cur.execute(
            """
            SELECT noi, asset_value FROM re_asset_quarter_state
            WHERE asset_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(inp.asset_id), quarter),
        )
        state = cur.fetchone()
        noi = Decimal(str(state["noi"] or 0)) if state else Decimal("0")
        asset_value = Decimal(str(state["asset_value"] or 0)) if state else Decimal("0")

        loan_results = []
        total_covenants = 0
        total_breaches = 0

        for loan in loans:
            loan_id = loan["loan_id"]
            upb = Decimal(str(loan["upb"] or 0))
            rate = Decimal(str(loan["rate"] or 0))
            annual_ds = upb * rate if rate > 0 else Decimal("0")

            # Try amortization schedule for more accurate debt service
            try:
                from app.services import re_amortization
                ds = re_amortization.get_debt_service_summary(loan_id=UUID(loan_id), quarter=quarter)
                annual_ds = Decimal(ds["annual_debt_service"])
            except (LookupError, ValueError, ImportError):
                pass

            dscr = (noi / annual_ds).quantize(Decimal("0.01")) if annual_ds > 0 else None
            ltv = (upb / asset_value).quantize(Decimal("0.0001")) if asset_value > 0 else None
            debt_yield = (noi / upb).quantize(Decimal("0.0001")) if upb > 0 else None

            # Get covenant definitions
            cur.execute(
                """
                SELECT * FROM re_loan_covenant_definition
                WHERE loan_id = %s AND active = true
                ORDER BY covenant_type
                """,
                (str(loan_id),),
            )
            covenants = cur.fetchall()

            cov_results = []
            for cov in covenants:
                total_covenants += 1
                cov_type = cov["covenant_type"]
                threshold = Decimal(str(cov["threshold"]))
                comparator = cov["comparator"]

                test_value = None
                if cov_type == "DSCR":
                    test_value = dscr
                elif cov_type == "LTV":
                    test_value = ltv
                elif cov_type == "DEBT_YIELD":
                    test_value = debt_yield

                passed = True
                headroom = None
                if test_value is not None:
                    if comparator == ">=" and test_value < threshold:
                        passed = False
                    elif comparator == "<=" and test_value > threshold:
                        passed = False
                    headroom = float((test_value - threshold).quantize(Decimal("0.0001")))
                else:
                    passed = False

                if not passed:
                    total_breaches += 1

                # Determine severity
                severity = "pass"
                if not passed:
                    severity = "breach"
                elif headroom is not None:
                    # Warning if within 10% of threshold
                    warn_band = float(threshold) * Decimal("0.10")
                    if abs(headroom) <= warn_band:
                        severity = "warning"

                cov_results.append({
                    "covenant_type": cov_type,
                    "threshold": float(threshold),
                    "comparator": comparator,
                    "current_value": float(test_value) if test_value is not None else None,
                    "headroom": headroom,
                    "status": severity,
                    "passed": passed,
                })

            loan_results.append({
                "loan_id": str(loan_id),
                "loan_name": loan["loan_name"],
                "upb": float(upb),
                "maturity_date": str(loan["maturity_date"]) if loan.get("maturity_date") else None,
                "metrics": {
                    "dscr": float(dscr) if dscr is not None else None,
                    "ltv": float(ltv) if ltv is not None else None,
                    "debt_yield": float(debt_yield) if debt_yield is not None else None,
                },
                "covenants": cov_results,
            })

    emit_log(
        level="info",
        service="backend",
        action="mcp.covenant.check_compliance",
        message=f"Covenant compliance check: {total_covenants} covenants, {total_breaches} breaches",
        context={"asset_id": str(inp.asset_id), "quarter": quarter},
    )

    return _serialize({
        "asset_id": str(inp.asset_id),
        "quarter": quarter,
        "total_covenants": total_covenants,
        "total_breaches": total_breaches,
        "noi": float(noi),
        "asset_value": float(asset_value),
        "loans": loan_results,
    })


def _list_covenant_alerts(ctx: McpContext, inp: ListCovenantAlertsInput) -> dict:
    """List covenant alerts across the portfolio or for a specific fund."""
    with get_cursor() as cur:
        conditions = ["env_id = %s", "business_id = %s"]
        params: list = [inp.env_id, inp.business_id]

        if inp.fund_id:
            conditions.append("fund_id = %s")
            params.append(str(inp.fund_id))
        if inp.severity:
            conditions.append("severity = %s")
            params.append(inp.severity)
        if inp.quarter:
            conditions.append("quarter = %s")
            params.append(inp.quarter)
        if not inp.include_resolved:
            conditions.append("resolved = false")

        cur.execute(
            f"""
            SELECT ca.*,
                   l.loan_name,
                   l.asset_id
            FROM re_covenant_alert ca
            JOIN re_loan l ON l.id = ca.loan_id
            WHERE {' AND '.join(conditions)}
            ORDER BY
                CASE ca.severity
                    WHEN 'critical' THEN 1
                    WHEN 'breach' THEN 2
                    WHEN 'warning' THEN 3
                END,
                ca.created_at DESC
            LIMIT 100
            """,
            params,
        )
        alerts = cur.fetchall()

    return _serialize({
        "total": len(alerts),
        "alerts": [
            {
                "id": str(a["id"]),
                "loan_id": str(a["loan_id"]),
                "loan_name": a.get("loan_name"),
                "asset_id": str(a["asset_id"]) if a.get("asset_id") else None,
                "fund_id": str(a["fund_id"]),
                "quarter": a["quarter"],
                "metric": a["metric"],
                "current_value": float(a["current_value"]) if a.get("current_value") is not None else None,
                "threshold": float(a["threshold"]),
                "headroom": float(a["headroom"]) if a.get("headroom") is not None else None,
                "severity": a["severity"],
                "resolved": a["resolved"],
                "created_at": str(a["created_at"]),
            }
            for a in alerts
        ],
    })


def register_covenant_tools():
    registry.register(ToolDef(
        name="finance.check_covenant_compliance",
        description="Check covenant compliance for all loans on an asset — returns current DSCR/LTV/Debt Yield vs. thresholds with headroom and breach status",
        module="bm",
        permission="read",
        input_model=CheckCovenantComplianceInput,
        handler=_check_covenant_compliance,
        tags=frozenset({"repe", "finance", "analysis"}),
    ))
    registry.register(ToolDef(
        name="finance.list_covenant_alerts",
        description="List covenant breach and warning alerts across the portfolio or for a specific fund, sorted by severity",
        module="bm",
        permission="read",
        input_model=ListCovenantAlertsInput,
        handler=_list_covenant_alerts,
        tags=frozenset({"repe", "finance", "analysis"}),
    ))

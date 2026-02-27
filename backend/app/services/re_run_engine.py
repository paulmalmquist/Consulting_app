"""Run engine for financial intelligence runs.

Orchestrates quarter close, covenant tests, and waterfall shadow runs
with the new financial intelligence tables.
"""
from __future__ import annotations

import hashlib
import json
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import re_variance
from app.services import re_fund_metrics
from app.services import re_debt_surveillance


def _compute_hash(data: dict) -> str:
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _create_run(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    scenario_id: str | None,
    run_type: str,
    created_by: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_run
                (env_id, business_id, fund_id, quarter, scenario_id, run_type, status, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, 'running', %s)
            RETURNING *
            """,
            (env_id, str(business_id), str(fund_id), quarter, scenario_id, run_type, created_by),
        )
        return cur.fetchone()


def _complete_run(*, run_id: UUID, output_hash: str | None = None) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_run SET status = 'success', output_hash = %s WHERE id = %s
            """,
            (output_hash, str(run_id)),
        )


def _fail_run(*, run_id: UUID, error_msg: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE re_run SET status = 'failed' WHERE id = %s",
            (str(run_id),),
        )


def run_quarter_close(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    scenario_id: str | None = None,
    uw_version_id: UUID | None = None,
    accounting_source_hash: str | None = None,
    created_by: str | None = None,
) -> dict:
    """Execute a full quarter close run with variance analysis and return metrics."""
    run = _create_run(
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        run_type="QUARTER_CLOSE",
        created_by=created_by,
    )
    run_id = UUID(str(run["id"]))

    emit_log(
        level="info",
        service="backend",
        action="re.run.quarter_close.started",
        message=f"Quarter close started for fund {fund_id} {quarter}",
        context={"run_id": str(run_id), "fund_id": str(fund_id), "quarter": quarter},
    )

    try:
        # 1. Compute NOI variance (only if UW version provided)
        variance_data = None
        if uw_version_id:
            variance_items = re_variance.compute_noi_variance(
                env_id=env_id,
                business_id=business_id,
                fund_id=fund_id,
                quarter=quarter,
                uw_version_id=uw_version_id,
                run_id=run_id,
            )
            variance_data = {"items_count": len(variance_items)}

        # 2. Compute fee accrual
        fee_amount = re_fund_metrics.compute_fee_accrual(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
            run_id=run_id,
        )

        # 3. Compute return metrics + bridge
        metrics_result = re_fund_metrics.compute_return_metrics(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
            run_id=run_id,
        )

        output_hash = _compute_hash({
            "variance": variance_data,
            "fee_amount": str(fee_amount),
            "metrics": str(metrics_result.get("metrics")),
        })

        _complete_run(run_id=run_id, output_hash=output_hash)

        emit_log(
            level="info",
            service="backend",
            action="re.run.quarter_close.completed",
            message=f"Quarter close completed for fund {fund_id} {quarter}",
            context={"run_id": str(run_id)},
        )

        return {
            "run_id": str(run_id),
            "fund_id": str(fund_id),
            "quarter": quarter,
            "run_type": "QUARTER_CLOSE",
            "status": "success",
            "variance": variance_data,
            "fee_accrual": str(fee_amount),
            "metrics": metrics_result.get("metrics"),
            "bridge": metrics_result.get("bridge"),
            "inputs_missing": metrics_result.get("inputs_missing", []),
        }

    except Exception as exc:
        _fail_run(run_id=run_id, error_msg=str(exc))
        emit_log(
            level="error",
            service="backend",
            action="re.run.quarter_close.failed",
            message=f"Quarter close failed for fund {fund_id} {quarter}",
            context={"run_id": str(run_id)},
            error=exc,
        )
        raise


def run_covenant_tests(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    created_by: str | None = None,
) -> dict:
    """Run covenant tests for a debt fund."""
    run = _create_run(
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=None,
        run_type="COVENANT_TEST",
        created_by=created_by,
    )
    run_id = UUID(str(run["id"]))

    emit_log(
        level="info",
        service="backend",
        action="re.run.covenant_test.started",
        message=f"Covenant tests started for fund {fund_id} {quarter}",
        context={"run_id": str(run_id), "fund_id": str(fund_id)},
    )

    try:
        result = re_debt_surveillance.run_covenant_tests(
            env_id=env_id,
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter,
            run_id=run_id,
        )

        _complete_run(run_id=run_id)

        return {
            "run_id": str(run_id),
            "fund_id": str(fund_id),
            "quarter": quarter,
            "run_type": "COVENANT_TEST",
            "status": "success",
            **result,
        }

    except Exception as exc:
        _fail_run(run_id=run_id, error_msg=str(exc))
        raise


def run_waterfall_shadow(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    created_by: str | None = None,
) -> dict:
    """Run shadow waterfall to estimate carry."""
    run = _create_run(
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=None,
        run_type="WATERFALL_SHADOW",
        created_by=created_by,
    )
    run_id = UUID(str(run["id"]))

    try:
        from decimal import Decimal

        carry = Decimal("0")
        waterfall_run_id = None

        # Try real waterfall engine first
        try:
            from app.services.re_waterfall_runtime import run_waterfall
            wf_result = run_waterfall(fund_id=fund_id, quarter=quarter)
            waterfall_run_id = wf_result.get("run_id")
            # Sum carry + catch-up allocations from waterfall results
            for result in (wf_result.get("results") or []):
                tier_code = result.get("tier_code", "")
                if "carry" in tier_code or "catch_up" in tier_code:
                    carry += Decimal(str(result.get("amount", 0)))
            carry = carry.quantize(Decimal("0.01"))
        except (LookupError, ValueError):
            # Fallback: simplified carry when no waterfall definition exists
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        COALESCE(SUM(CASE WHEN event_type = 'CALL' THEN amount ELSE 0 END), 0) AS total_called,
                        COALESCE(SUM(CASE WHEN event_type = 'DIST' THEN amount ELSE 0 END), 0) AS total_distributed
                    FROM re_cash_event
                    WHERE env_id = %s AND business_id = %s AND fund_id = %s
                    """,
                    (env_id, str(business_id), str(fund_id)),
                )
                totals = cur.fetchone()

                cur.execute(
                    """
                    SELECT portfolio_nav FROM re_fund_quarter_state
                    WHERE fund_id = %s AND quarter = %s
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (str(fund_id), quarter),
                )
                state = cur.fetchone()

            called = Decimal(str(totals["total_called"])) if totals else Decimal("0")
            distributed = Decimal(str(totals["total_distributed"])) if totals else Decimal("0")
            nav = Decimal(str(state["portfolio_nav"])) if state and state.get("portfolio_nav") else Decimal("0")

            gross_return = distributed + nav - called
            pref_hurdle = called * Decimal("0.08")
            if gross_return > pref_hurdle:
                carry = ((gross_return - pref_hurdle) * Decimal("0.20")).quantize(Decimal("0.01"))

        # Update bridge with carry shadow
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE re_gross_net_bridge_qtr
                SET carry_shadow = %s,
                    net_return = gross_return - mgmt_fees - fund_expenses - %s
                WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
                """,
                (str(carry), str(carry), env_id, str(business_id), str(fund_id), quarter),
            )

        _complete_run(run_id=run_id)

        result = {
            "run_id": str(run_id),
            "fund_id": str(fund_id),
            "quarter": quarter,
            "run_type": "WATERFALL_SHADOW",
            "status": "success",
            "carry_shadow": str(carry),
        }
        if waterfall_run_id:
            result["waterfall_run_id"] = str(waterfall_run_id)
        return result

    except Exception as exc:
        _fail_run(run_id=run_id, error_msg=str(exc))
        raise


def list_runs(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["env_id = %s", "business_id = %s", "fund_id = %s"]
        params: list = [env_id, str(business_id), str(fund_id)]
        if quarter:
            conditions.append("quarter = %s")
            params.append(quarter)
        cur.execute(
            f"""
            SELECT * FROM re_run
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            """,
            params,
        )
        return cur.fetchall()

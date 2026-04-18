"""Receipt reports — software spend aggregations + Apple-billed breakdown."""
from __future__ import annotations

from datetime import date
from typing import Any

from app.db import get_cursor


def software_spend_report(
    *,
    env_id: str,
    business_id: str,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, Any]:
    """Total software spend grouped by vendor + category."""
    with get_cursor() as cur:
        conditions = ["p.env_id = %s", "p.business_id = %s::uuid"]
        params: list[Any] = [env_id, business_id]
        if period_start:
            conditions.append("p.transaction_date >= %s")
            params.append(period_start)
        if period_end:
            conditions.append("p.transaction_date <= %s")
            params.append(period_end)
        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
                COALESCE(p.vendor_normalized, p.merchant_raw, 'Unknown') AS vendor,
                p.billing_platform,
                COUNT(*) AS receipt_count,
                SUM(p.total) AS total_spend,
                p.currency
              FROM nv_receipt_parse_result p
             WHERE {where}
             GROUP BY vendor, p.billing_platform, p.currency
             ORDER BY total_spend DESC NULLS LAST
            """,
            params,
        )
        by_vendor = [dict(r) for r in cur.fetchall()]

        cur.execute(
            f"""
            SELECT COALESCE(p.billing_platform, 'direct') AS platform,
                   SUM(p.total) AS total_spend,
                   COUNT(*) AS receipt_count
              FROM nv_receipt_parse_result p
             WHERE {where}
             GROUP BY platform
             ORDER BY total_spend DESC NULLS LAST
            """,
            params,
        )
        by_platform = [dict(r) for r in cur.fetchall()]

    total = sum(float(v["total_spend"] or 0) for v in by_vendor)
    return {
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "total_spend": total,
        "by_vendor": by_vendor,
        "by_platform": by_platform,
    }


def apple_billed_spend_report(
    *,
    env_id: str,
    business_id: str,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        conditions = [
            "p.env_id = %s",
            "p.business_id = %s::uuid",
            "p.billing_platform ILIKE 'apple'",
        ]
        params: list[Any] = [env_id, business_id]
        if period_start:
            conditions.append("p.transaction_date >= %s")
            params.append(period_start)
        if period_end:
            conditions.append("p.transaction_date <= %s")
            params.append(period_end)
        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
                COALESCE(p.vendor_normalized, 'Undetermined') AS vendor,
                p.service_name_guess AS service,
                COUNT(*) AS receipt_count,
                SUM(p.total) AS total_spend,
                p.currency
              FROM nv_receipt_parse_result p
             WHERE {where}
             GROUP BY vendor, service, p.currency
             ORDER BY total_spend DESC NULLS LAST
            """,
            params,
        )
        rows = [dict(r) for r in cur.fetchall()]

    total = sum(float(v["total_spend"] or 0) for v in rows)
    undetermined = sum(
        float(v["total_spend"] or 0) for v in rows if v["vendor"] == "Undetermined"
    )
    return {
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "total_apple_billed": total,
        "undetermined_vendor_spend": undetermined,
        "rows": rows,
    }


def ai_software_summary(
    *,
    env_id: str,
    business_id: str,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, Any]:
    """The one report that proves the system earns its keep.

    Returns: {
        apple_billed_total, claude_total, openai_total,
        by_spend_type: [subscription_fixed, api_usage, one_off, ambiguous, reimbursable_client],
        by_vendor: [...],
        ambiguous_pending_review_usd,
        missing_support_count,
        period_start, period_end
    }
    """
    with get_cursor() as cur:
        conditions = ["p.env_id = %s", "p.business_id = %s::uuid"]
        params: list[Any] = [env_id, business_id]
        if period_start:
            conditions.append("p.transaction_date >= %s")
            params.append(period_start)
        if period_end:
            conditions.append("p.transaction_date <= %s")
            params.append(period_end)
        where = " AND ".join(conditions)

        # Apple-billed total.
        cur.execute(
            f"""
            SELECT COALESCE(SUM(p.total), 0) AS total
              FROM nv_receipt_parse_result p
             WHERE {where} AND p.billing_platform ILIKE 'apple'
            """,
            params,
        )
        apple_total = float((cur.fetchone() or {}).get("total") or 0)

        # Vendor-level: Claude (Anthropic), OpenAI.
        cur.execute(
            f"""
            SELECT p.vendor_normalized AS vendor,
                   COALESCE(SUM(p.total), 0) AS total
              FROM nv_receipt_parse_result p
             WHERE {where}
               AND p.vendor_normalized IN ('Anthropic', 'OpenAI')
             GROUP BY vendor
            """,
            params,
        )
        vendor_totals = {r["vendor"]: float(r["total"] or 0) for r in cur.fetchall()}

        # Breakdown by spend_type.
        cur.execute(
            f"""
            SELECT COALESCE(p.spend_type, 'ambiguous') AS spend_type,
                   COALESCE(SUM(p.total), 0) AS total,
                   COUNT(*) AS receipt_count
              FROM nv_receipt_parse_result p
             WHERE {where}
             GROUP BY spend_type
             ORDER BY total DESC
            """,
            params,
        )
        by_spend_type = [dict(r) for r in cur.fetchall()]

        # Top-10 vendors (platform-aware).
        cur.execute(
            f"""
            SELECT COALESCE(p.vendor_normalized, p.merchant_raw, 'Unknown') AS vendor,
                   p.billing_platform,
                   COALESCE(SUM(p.total), 0) AS total,
                   COUNT(*) AS receipt_count
              FROM nv_receipt_parse_result p
             WHERE {where}
             GROUP BY vendor, p.billing_platform
             ORDER BY total DESC NULLS LAST
             LIMIT 10
            """,
            params,
        )
        by_vendor = [dict(r) for r in cur.fetchall()]

        # Ambiguous amount awaiting review.
        cur.execute(
            f"""
            SELECT COALESCE(SUM(p.total), 0) AS pending_usd
              FROM nv_receipt_parse_result p
              JOIN nv_receipt_review_item ri ON ri.intake_id = p.intake_id
             WHERE {where}
               AND ri.status = 'open'
               AND ri.reason IN ('apple_ambiguous', 'uncategorized', 'low_confidence')
            """,
            params,
        )
        ambiguous_pending = float((cur.fetchone() or {}).get("pending_usd") or 0)

        # Missing-support count: active subscriptions with overdue documentation.
        cur.execute(
            """
            SELECT COUNT(*) AS c
              FROM nv_subscription_ledger
             WHERE env_id = %s AND business_id = %s::uuid
               AND is_active = true
               AND documentation_complete = false
            """,
            (env_id, business_id),
        )
        missing_support = int((cur.fetchone() or {}).get("c") or 0)

    return {
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "apple_billed_total": apple_total,
        "claude_total": vendor_totals.get("Anthropic", 0.0),
        "openai_total": vendor_totals.get("OpenAI", 0.0),
        "by_spend_type": by_spend_type,
        "by_vendor": by_vendor,
        "ambiguous_pending_review_usd": ambiguous_pending,
        "missing_support_count": missing_support,
    }


def tooling_spend_mom(
    *, env_id: str, business_id: str, months: int = 6,
) -> list[dict[str, Any]]:
    """Monthly tooling spend for the Command Desk trends band."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT date_trunc('month', COALESCE(p.transaction_date, p.created_at::date))::date AS month,
                   SUM(p.total) AS total_spend
              FROM nv_receipt_parse_result p
             WHERE p.env_id = %s AND p.business_id = %s::uuid
               AND COALESCE(p.transaction_date, p.created_at::date) >= (CURRENT_DATE - (%s * INTERVAL '1 month'))
             GROUP BY month
             ORDER BY month ASC
            """,
            (env_id, business_id, months),
        )
        return [dict(r) for r in cur.fetchall()]

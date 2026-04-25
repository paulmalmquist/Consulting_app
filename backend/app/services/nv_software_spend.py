"""Aggregate software / AI tool spend from subscription ledger + receipt intake."""
from __future__ import annotations

from typing import Any

from app.db import get_cursor

_AI_VENDORS = {"anthropic", "openai", "google", "microsoft", "mistral", "perplexity"}
_INFRA_VENDORS = {"railway", "vercel", "github", "cloudflare", "aws", "gcp", "azure", "godaddy", "render", "fly.io"}


def _classify_vendor(vendor: str | None, spend_type: str | None) -> str:
    if spend_type in ("capital_purchase", "office_expense", "home_office"):
        return "other"
    v = (vendor or "").lower()
    if any(k in v for k in _AI_VENDORS):
        return "ai_tools"
    if any(k in v for k in _INFRA_VENDORS):
        return "infrastructure"
    return "other"


def get_software_spend(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Aggregate software/AI spend from the subscription ledger.

    Returns rows (one per service), category totals, and dedup candidates
    (services present on both Apple billing and direct billing).
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   vendor_normalized,
                   service_name,
                   billing_platform,
                   cadence,
                   expected_amount,
                   spend_type,
                   business_relevance,
                   is_active,
                   last_seen_date
              FROM nv_subscription_ledger
             WHERE env_id = %s AND business_id = %s::uuid
               AND is_active = true
             ORDER BY vendor_normalized NULLS LAST, service_name
            """,
            (env_id, business_id),
        )
        ledger_rows = cur.fetchall()

    def _monthly(amount: float | None, cadence: str) -> float:
        if amount is None:
            return 0.0
        if cadence == "monthly":
            return float(amount)
        if cadence == "quarterly":
            return float(amount) / 3
        if cadence == "annual":
            return float(amount) / 12
        return float(amount)

    rows: list[dict] = []
    vendor_by_platform: dict[str, dict[str, float]] = {}

    totals = {"ai_tools": 0.0, "infrastructure": 0.0, "other": 0.0, "apple_billed": 0.0, "direct": 0.0}

    for r in ledger_rows:
        vendor = r["vendor_normalized"] or r["service_name"]
        cadence = r["cadence"] or "unknown"
        monthly = _monthly(r["expected_amount"], cadence)
        # YTD: rough estimate — months elapsed since Jan 1
        from datetime import date
        ytd_months = date.today().month
        ytd = monthly * ytd_months

        platform = (r["billing_platform"] or "direct").lower()
        is_apple = platform == "apple"
        category = _classify_vendor(r["vendor_normalized"], r["spend_type"])

        rows.append({
            "vendor": vendor,
            "product": r["service_name"],
            "platform": r["billing_platform"],
            "cadence": cadence,
            "monthly_cost": round(monthly, 2),
            "ytd_cost": round(ytd, 2),
            "spend_type": r["spend_type"],
            "business_relevance": r["business_relevance"],
            "is_apple_billed": is_apple,
            "has_dedup_risk": False,  # updated below
        })

        totals[category] = totals.get(category, 0.0) + monthly
        if is_apple:
            totals["apple_billed"] += monthly
        else:
            totals["direct"] += monthly

        # Track per-vendor amounts by billing platform for dedup detection
        vkey = vendor.lower()
        if vkey not in vendor_by_platform:
            vendor_by_platform[vkey] = {}
        vendor_by_platform[vkey][platform] = vendor_by_platform[vkey].get(platform, 0.0) + monthly

    # Flag dedup candidates: same vendor on both apple and a non-apple platform
    dedup_candidates: list[dict] = []
    dedup_vendors: set[str] = set()
    for vkey, platforms in vendor_by_platform.items():
        has_apple = "apple" in platforms
        non_apple = {k: v for k, v in platforms.items() if k != "apple"}
        if has_apple and non_apple:
            dedup_vendors.add(vkey)
            dedup_candidates.append({
                "vendor": vkey,
                "apple_billed_amount": round(platforms["apple"], 2),
                "direct_amount": round(sum(non_apple.values()), 2),
            })

    # Update has_dedup_risk flag on matching rows
    for row in rows:
        if row["vendor"].lower() in dedup_vendors:
            row["has_dedup_risk"] = True

    return {
        "rows": rows,
        "totals": {k: round(v, 2) for k, v in totals.items()},
        "dedup_candidates": dedup_candidates,
    }

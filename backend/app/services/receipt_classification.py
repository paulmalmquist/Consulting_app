"""Receipt classification — category, business_relevance, entity_linkage.

Runs the JSONB rules layer first (from nv_receipt_classification_rule), then
falls back to heuristics driven by billing_platform and service_name_guess.
Also carries forward classification from an existing subscription_ledger row
when the same (service_name, billing_platform) has been classified before.
"""
from __future__ import annotations

from typing import Any

from app.db import get_cursor
from app.services import receipt_normalization


# Defaults when nothing else fires — keyed on service-text substrings.
_DEFAULT_CATEGORY_RULES: list[tuple[str, str, str]] = [
    # (service-contains, category, business_relevance)
    ("chatgpt",     "AI tools",             "high"),
    ("claude",      "AI tools",             "high"),
    ("perplexity",  "AI tools",             "high"),
    ("github",      "Developer tools",      "high"),
    ("notion",      "Productivity",         "high"),
    ("1password",   "Security",             "high"),
    ("dropbox",     "Cloud / Storage",      "medium"),
    ("icloud",      "Cloud / Storage",      "medium"),
    ("apple one",   "Software subscription","medium"),
    ("apple tv",    "Media",                "personal"),
    ("apple music", "Media",                "personal"),
    ("apple arcade","Media",                "personal"),
    ("spotify",     "Media",                "personal"),
    ("netflix",     "Media",                "personal"),
]


def _load_rules(env_id: str, business_id: str) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, priority, match_when, set_category,
                   set_business_relevance, set_vendor_normalized
              FROM nv_receipt_classification_rule
             WHERE env_id = %s AND business_id = %s::uuid AND is_active = true
             ORDER BY priority ASC
            """,
            (env_id, business_id),
        )
        return [dict(r) for r in cur.fetchall()]


def _carry_forward(
    env_id: str, business_id: str,
    service_name_guess: str | None, billing_platform: str | None,
) -> dict[str, Any] | None:
    """Reuse the prior classification when this subscription is already known."""
    if not service_name_guess:
        return None
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT category, business_relevance, vendor_normalized
              FROM nv_subscription_ledger
             WHERE env_id = %s AND business_id = %s::uuid
               AND service_name = %s
               AND (billing_platform IS NOT DISTINCT FROM %s)
             LIMIT 1
            """,
            (env_id, business_id, service_name_guess, billing_platform),
        )
        row = cur.fetchone()
        if not row or not row.get("category"):
            return None
        return {
            "category": row["category"],
            "business_relevance": row.get("business_relevance"),
            "carry_forward": True,
        }


def _default_classify(
    service_name_guess: str | None, billing_platform: str | None,
) -> dict[str, Any]:
    service = (service_name_guess or "").lower()
    for needle, cat, relevance in _DEFAULT_CATEGORY_RULES:
        if needle in service:
            return {
                "category": cat,
                "business_relevance": relevance,
                "entity_linkage": _guess_entity_linkage(cat, relevance),
            }
    # Apple-billed with no underlying vendor → leave uncategorized for review.
    if (billing_platform or "").lower() == "apple":
        return {"category": None, "business_relevance": "unknown"}
    return {"category": None, "business_relevance": "medium"}


def _guess_entity_linkage(category: str | None, business_relevance: str | None) -> str | None:
    if business_relevance == "personal":
        return "personal"
    if category == "AI tools":
        return "winston"
    if category == "Developer tools":
        return "product"
    if category in ("Productivity", "Security"):
        return "novendor_ops"
    if category == "Cloud / Storage":
        return "novendor_ops"
    return None


def classify(
    *,
    env_id: str,
    business_id: str,
    billing_platform: str | None,
    service_name_guess: str | None,
    vendor_normalized: str | None,
) -> dict[str, Any]:
    """Return {category, business_relevance, entity_linkage, is_recurring, ...}."""
    # 1. Custom JSONB rules.
    rules = _load_rules(env_id, business_id)
    matched = receipt_normalization.apply_classification_rules(
        rules,
        billing_platform=billing_platform,
        service_name_guess=service_name_guess,
        vendor_normalized=vendor_normalized,
    )
    if matched.get("category"):
        return {
            "category": matched["category"],
            "business_relevance": matched.get("business_relevance") or "medium",
            "entity_linkage": _guess_entity_linkage(
                matched["category"], matched.get("business_relevance"),
            ),
            "rule_id": matched.get("matched_rule_id"),
        }

    # 2. Carry forward from prior subscription.
    carried = _carry_forward(env_id, business_id, service_name_guess, billing_platform)
    if carried:
        carried["entity_linkage"] = _guess_entity_linkage(
            carried["category"], carried.get("business_relevance"),
        )
        return carried

    # 3. Default heuristics.
    return _default_classify(service_name_guess, billing_platform)

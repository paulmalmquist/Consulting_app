"""Subscription ledger — detect recurring, flag price changes, flag missing docs.

Stability rules handled here:
- Tax drift: subtotal is preferred for comparison when present; otherwise total.
- Billing-date drift: monthly cadence accepts 25-35 day gaps; quarterly 85-100;
  annual 355-380. Drift within the window is absorbed silently.
- Annual renewal: first sighting sets cadence='unknown'; second sighting ~365
  days later classifies as 'annual'.
- Missing month + reappearance: gap > cadence window sets review_state='auto'
  and flags cadence_changed; ledger stays active.
- Triple-signal dedup: nv_subscription_occurrence has a unique index on
  (subscription_id, occurrence_date). Confirm() is idempotent per period.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from psycopg.types.json import Json

from app.db import get_cursor
from app.services import receipt_review_queue


PRICE_CHANGE_TOLERANCE = Decimal("0.02")  # 2%


def _cadence_window(cadence: str) -> tuple[int, int] | None:
    if cadence == "monthly":
        return (25, 35)
    if cadence == "quarterly":
        return (85, 100)
    if cadence == "annual":
        return (355, 380)
    return None


def _infer_cadence_from_gap(gap_days: int) -> str:
    if 25 <= gap_days <= 35:
        return "monthly"
    if 85 <= gap_days <= 100:
        return "quarterly"
    if 355 <= gap_days <= 380:
        return "annual"
    return "unknown"


def _preferred_amount(parsed) -> Decimal | None:
    """Use subtotal for comparison (tax drift stability); fall back to total."""
    subtotal = getattr(parsed, "subtotal", None)
    if subtotal is not None:
        return Decimal(str(subtotal))
    total = getattr(parsed, "total", None)
    if total is not None:
        return Decimal(str(total))
    return None


def _next_expected(last_seen: date | None, cadence: str) -> date | None:
    if not last_seen:
        return None
    if cadence == "monthly":
        # Approximate next month — good enough for "missing documentation" alerts.
        return last_seen + timedelta(days=31)
    if cadence == "quarterly":
        return last_seen + timedelta(days=92)
    if cadence == "annual":
        return last_seen + timedelta(days=366)
    return None


def update_ledger_on_new_receipt(
    *,
    env_id: str,
    business_id: str,
    intake_id: str,
    parsed,  # ExtractedReceipt-like
    classification: dict[str, Any],
) -> dict[str, Any] | None:
    """Upsert a subscription_ledger row + write an occurrence row.

    Returns {subscription_id, price_changed, new, cadence_changed, occurrence_id}.
    Non-subscription spend_types (api_usage, one_off, ambiguous) skip the
    ledger entirely unless the service already has a ledger row (vendor-level
    aggregation for api_usage is intentional — e.g. OpenAI API rolled up).
    """
    if not parsed.service_name_guess:
        return None

    # Non-subscription spend types don't open new ledger rows.
    spend_type = getattr(parsed, "spend_type", None)
    allow_new_ledger = spend_type in (None, "subscription_fixed", "api_usage")

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, expected_amount, cadence, last_seen_date,
                   category, business_relevance, spend_type
              FROM nv_subscription_ledger
             WHERE env_id = %s AND business_id = %s::uuid
               AND service_name = %s
               AND (billing_platform IS NOT DISTINCT FROM %s)
             LIMIT 1
            """,
            (env_id, business_id, parsed.service_name_guess, parsed.billing_platform),
        )
        existing = cur.fetchone()

        txn_date = parsed.transaction_date or date.today()

        if existing:
            # ── Price change (stability: compare on subtotal when present) ──
            prior = existing.get("expected_amount")
            new_amount = _preferred_amount(parsed)
            price_changed = False
            if prior is not None and new_amount is not None:
                denom = max(abs(Decimal(str(prior))), Decimal("0.01"))
                pct = abs((new_amount - Decimal(str(prior))) / denom)
                if pct > PRICE_CHANGE_TOLERANCE:
                    price_changed = True

            # ── Cadence refinement + gap/reappearance handling ──
            cadence = existing["cadence"]
            cadence_changed = False
            if existing["last_seen_date"]:
                gap_days = (txn_date - existing["last_seen_date"]).days
                if cadence == "unknown":
                    inferred = _infer_cadence_from_gap(gap_days)
                    if inferred != "unknown":
                        cadence = inferred
                else:
                    window = _cadence_window(cadence)
                    if window and (gap_days < window[0] or gap_days > window[1]):
                        # Drift outside window — could be missing month + reappearance,
                        # or genuine cadence change. Flag for review, keep ledger live.
                        cadence_changed = True
            else:
                gap_days = None

            cur.execute(
                """
                UPDATE nv_subscription_ledger
                   SET expected_amount = COALESCE(%s, expected_amount),
                       cadence = %s,
                       last_seen_date = %s,
                       next_expected_date = %s,
                       last_receipt_id = %s::uuid,
                       documentation_complete = true,
                       category = COALESCE(category, %s),
                       business_relevance = COALESCE(business_relevance, %s),
                       spend_type = COALESCE(spend_type, %s),
                       updated_at = now()
                 WHERE id = %s::uuid
                RETURNING id
                """,
                (
                    new_amount if new_amount is not None else parsed.total,
                    cadence, txn_date,
                    _next_expected(txn_date, cadence), intake_id,
                    classification.get("category"),
                    classification.get("business_relevance"),
                    spend_type,
                    existing["id"],
                ),
            )
            sub_id = str(cur.fetchone()["id"])

            if price_changed:
                receipt_review_queue.build_review_item(
                    env_id=env_id, business_id=business_id, intake_id=intake_id,
                    reason="price_increased",
                    next_action=(
                        f"Price changed for {parsed.service_name_guess} "
                        f"({existing['expected_amount']} → {new_amount}). Confirm."
                    ),
                )
            if cadence_changed:
                receipt_review_queue.build_review_item(
                    env_id=env_id, business_id=business_id, intake_id=intake_id,
                    reason="cadence_changed",
                    next_action=(
                        f"Billing cadence drift for {parsed.service_name_guess} "
                        f"(gap {gap_days}d; expected {cadence} window)."
                    ),
                )

            occurrence_id = _upsert_occurrence(
                cur,
                env_id=env_id, business_id=business_id,
                subscription_id=sub_id, intake_id=intake_id,
                occurrence_date=txn_date, amount=new_amount, currency=parsed.currency,
                expected_amount=prior,
                days_since_last=gap_days,
                source_signals=[{"source": "intake", "intake_id": intake_id}],
            )
            return {
                "subscription_id": sub_id,
                "price_changed": price_changed,
                "cadence_changed": cadence_changed,
                "new": False,
                "occurrence_id": occurrence_id,
            }

        # First sighting — cadence unknown until we see a second receipt.
        if not allow_new_ledger:
            return {"subscription_id": None, "new": False, "skipped_reason": f"spend_type={spend_type}"}

        cur.execute(
            """
            INSERT INTO nv_subscription_ledger
              (env_id, business_id, vendor_normalized, service_name,
               billing_platform, cadence, expected_amount, currency,
               category, business_relevance, spend_type, last_seen_date,
               next_expected_date, last_receipt_id, documentation_complete)
            VALUES (%s, %s::uuid, %s, %s, %s, 'unknown', %s, %s,
                    %s, %s, %s, %s, NULL, %s::uuid, true)
            RETURNING id
            """,
            (
                env_id, business_id,
                parsed.vendor_normalized, parsed.service_name_guess,
                parsed.billing_platform,
                _preferred_amount(parsed), parsed.currency,
                classification.get("category"),
                classification.get("business_relevance") or "medium",
                spend_type,
                txn_date, intake_id,
            ),
        )
        sub_id = str(cur.fetchone()["id"])
        occurrence_id = _upsert_occurrence(
            cur,
            env_id=env_id, business_id=business_id,
            subscription_id=sub_id, intake_id=intake_id,
            occurrence_date=txn_date,
            amount=_preferred_amount(parsed), currency=parsed.currency,
            expected_amount=None, days_since_last=None,
            source_signals=[{"source": "intake", "intake_id": intake_id}],
        )
        return {
            "subscription_id": sub_id,
            "price_changed": False,
            "cadence_changed": False,
            "new": True,
            "occurrence_id": occurrence_id,
        }


def _upsert_occurrence(
    cur,
    *,
    env_id: str,
    business_id: str,
    subscription_id: str,
    intake_id: str | None,
    occurrence_date: date,
    amount: Decimal | None,
    currency: str | None,
    expected_amount: Decimal | None,
    days_since_last: int | None,
    source_signals: list[dict[str, Any]],
    review_state: str = "auto",
) -> str:
    """Upsert a single per-period occurrence row. Triple-signal dedup via UNIQUE
    (subscription_id, occurrence_date): if the same period arrives from file +
    transaction + provider export, the first write wins and subsequent calls
    merge source_signals instead of creating duplicates.
    """
    pct = None
    if expected_amount is not None and amount is not None and expected_amount != 0:
        denom = max(abs(Decimal(str(expected_amount))), Decimal("0.01"))
        pct = float((Decimal(str(amount)) - Decimal(str(expected_amount))) / denom)
    cur.execute(
        """
        INSERT INTO nv_subscription_occurrence
          (env_id, business_id, subscription_id, intake_id, occurrence_date,
           amount, currency, expected_amount, price_delta_pct, days_since_last,
           source_signals, review_state)
        VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (subscription_id, occurrence_date) DO UPDATE
           SET source_signals = nv_subscription_occurrence.source_signals || EXCLUDED.source_signals,
               amount = COALESCE(EXCLUDED.amount, nv_subscription_occurrence.amount),
               expected_amount = COALESCE(EXCLUDED.expected_amount, nv_subscription_occurrence.expected_amount),
               price_delta_pct = COALESCE(EXCLUDED.price_delta_pct, nv_subscription_occurrence.price_delta_pct),
               days_since_last = COALESCE(EXCLUDED.days_since_last, nv_subscription_occurrence.days_since_last)
        RETURNING id
        """,
        (
            env_id, business_id, subscription_id,
            intake_id if intake_id else None,
            occurrence_date, amount, currency or "USD",
            expected_amount, pct, days_since_last,
            Json(source_signals), review_state,
        ),
    )
    return str(cur.fetchone()["id"])


def set_occurrence_review_state(
    *,
    env_id: str,
    business_id: str,
    occurrence_id: str,
    review_state: str,
    notes: str | None = None,
) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_subscription_occurrence
               SET review_state = %s,
                   notes = COALESCE(%s, notes)
             WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
            RETURNING id
            """,
            (review_state, notes, occurrence_id, env_id, business_id),
        )
        return cur.fetchone() is not None


def detect_recurring(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Scan parse_results, promote qualifying ones into the ledger.

    Idempotent: calls update_ledger_on_new_receipt for each receipt so the
    cadence-detection logic kicks in once there are ≥2 receipts for the same
    (service_name, billing_platform).
    """
    from app.services import receipt_classification

    promoted = 0
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.intake_id, p.service_name_guess, p.billing_platform,
                   p.vendor_normalized, p.subtotal, p.total, p.currency,
                   p.transaction_date, p.spend_type, p.renewal_language
              FROM nv_receipt_parse_result p
             WHERE p.env_id = %s AND p.business_id = %s::uuid
               AND p.service_name_guess IS NOT NULL
             ORDER BY p.transaction_date ASC NULLS LAST, p.created_at ASC
            """,
            (env_id, business_id),
        )
        rows = cur.fetchall()

    # Lightweight parse-like shim for the update helper.
    class _Shim:
        pass
    for r in rows:
        shim = _Shim()
        shim.service_name_guess = r["service_name_guess"]
        shim.billing_platform = r["billing_platform"]
        shim.vendor_normalized = r["vendor_normalized"]
        shim.subtotal = r.get("subtotal")
        shim.total = r["total"]
        shim.currency = r["currency"] or "USD"
        shim.transaction_date = r["transaction_date"]
        shim.spend_type = r.get("spend_type")
        shim.renewal_language = r.get("renewal_language")
        classification = receipt_classification.classify(
            env_id=env_id, business_id=business_id,
            billing_platform=shim.billing_platform,
            service_name_guess=shim.service_name_guess,
            vendor_normalized=shim.vendor_normalized,
        )
        update_ledger_on_new_receipt(
            env_id=env_id, business_id=business_id,
            intake_id=str(r["intake_id"]),
            parsed=shim,
            classification=classification,
        )
        promoted += 1
    return {"processed": promoted}


def list_ledger(
    *, env_id: str, business_id: str, active_only: bool = True,
    spend_type: str | None = None,
) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        conditions = ["l.env_id = %s", "l.business_id = %s::uuid"]
        params: list[Any] = [env_id, business_id]
        if active_only:
            conditions.append("l.is_active = true")
        if spend_type:
            conditions.append("l.spend_type = %s")
            params.append(spend_type)
        cur.execute(
            f"""
            SELECT l.id, l.vendor_normalized, l.service_name, l.billing_platform,
                   l.cadence, l.expected_amount, l.currency, l.category,
                   l.business_relevance, l.spend_type, l.last_seen_date,
                   l.next_expected_date, l.documentation_complete, l.is_active,
                   l.updated_at,
                   COALESCE(occ.occurrence_count, 0) AS occurrence_count,
                   occ.last_price_delta_pct
              FROM nv_subscription_ledger l
         LEFT JOIN LATERAL (
                SELECT COUNT(*) AS occurrence_count,
                       (SELECT price_delta_pct FROM nv_subscription_occurrence
                          WHERE subscription_id = l.id
                          ORDER BY occurrence_date DESC LIMIT 1) AS last_price_delta_pct
                  FROM nv_subscription_occurrence
                 WHERE subscription_id = l.id
              ) occ ON true
             WHERE {' AND '.join(conditions)}
             ORDER BY l.business_relevance, l.service_name
            """,
            params,
        )
        return [dict(r) for r in cur.fetchall()]


def list_occurrences(
    *, env_id: str, business_id: str, subscription_id: str, limit: int = 24,
) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, occurrence_date, amount, currency, expected_amount,
                   price_delta_pct, days_since_last, source_signals,
                   review_state, notes, created_at
              FROM nv_subscription_occurrence
             WHERE env_id = %s AND business_id = %s::uuid AND subscription_id = %s::uuid
             ORDER BY occurrence_date DESC
             LIMIT %s
            """,
            (env_id, business_id, subscription_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def attach_intake_to_subscription(
    *,
    env_id: str,
    business_id: str,
    subscription_id: str,
    intake_id: str,
    review_state: str = "confirmed",
) -> str:
    """Operator action: attach an intake to an existing subscription as a
    confirmed occurrence. Used from the Subscription Watch action menu.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.subtotal, p.total, p.currency, p.transaction_date
              FROM nv_receipt_parse_result p
             WHERE p.intake_id = %s::uuid AND p.env_id = %s AND p.business_id = %s::uuid
             ORDER BY p.created_at DESC LIMIT 1
            """,
            (intake_id, env_id, business_id),
        )
        parse = cur.fetchone()
        amount = parse.get("subtotal") or parse.get("total") if parse else None
        txn_date = parse.get("transaction_date") if parse else None
        if txn_date is None:
            txn_date = date.today()

        cur.execute(
            "SELECT expected_amount, last_seen_date FROM nv_subscription_ledger WHERE id = %s::uuid",
            (subscription_id,),
        )
        sub = cur.fetchone() or {}
        gap_days = None
        if sub.get("last_seen_date"):
            gap_days = (txn_date - sub["last_seen_date"]).days

        occurrence_id = _upsert_occurrence(
            cur,
            env_id=env_id, business_id=business_id,
            subscription_id=subscription_id, intake_id=intake_id,
            occurrence_date=txn_date, amount=amount,
            currency=(parse or {}).get("currency"),
            expected_amount=sub.get("expected_amount"),
            days_since_last=gap_days,
            source_signals=[{"source": "operator_attach", "intake_id": intake_id}],
            review_state=review_state,
        )
    return occurrence_id


def mark_subscription_non_business(
    *, env_id: str, business_id: str, subscription_id: str,
) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_subscription_ledger
               SET business_relevance = 'personal', is_active = false,
                   updated_at = now()
             WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
            RETURNING id
            """,
            (subscription_id, env_id, business_id),
        )
        return cur.fetchone() is not None


def suppress_duplicate_occurrence(
    *, env_id: str, business_id: str, occurrence_id: str,
) -> bool:
    return set_occurrence_review_state(
        env_id=env_id, business_id=business_id,
        occurrence_id=occurrence_id, review_state="rejected",
        notes="suppressed as duplicate by operator",
    )


def flag_missing_documentation(*, env_id: str, business_id: str) -> int:
    """Mark documentation_complete=false when next_expected_date is >7 days past."""
    cutoff = date.today() - timedelta(days=7)
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_subscription_ledger
               SET documentation_complete = false, updated_at = now()
             WHERE env_id = %s AND business_id = %s::uuid
               AND is_active = true
               AND next_expected_date IS NOT NULL
               AND next_expected_date < %s
               AND last_seen_date < %s
            """,
            (env_id, business_id, cutoff, cutoff),
        )
        return cur.rowcount

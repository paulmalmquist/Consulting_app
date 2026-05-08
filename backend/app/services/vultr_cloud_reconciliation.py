"""Six-stage reconciliation bridge for the Vultr Cloud Intelligence OS.

Stages (in order):
  1. platform_usage      — fact_cloud_resource_usage_hourly × list price
  2. rated_billing       — fact_cloud_billing_line_item     (post-discount)
  3. issued_invoices     — fact_cloud_invoice               (header amounts)
  4. recognized_revenue  — fact_cloud_revenue_recognition
  5. collected_cash      — fact_cloud_payment
  6. contract_committed  — dim_cloud_contract               (active in period)

The bridge is informational, not generative. The seed pack engineers known
breaks; the exception table (`fact_cloud_reconciliation_exception`) is the
authoritative break list.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.schemas.vultr import BridgeStage, ReconciliationBridgeOut
from app.services import vultr_cloud_dataset as ds


def _stage(
    *,
    key: str,
    label: str,
    amount: Decimal,
    record_count: int,
    source_system: str,
    previous: Decimal | None,
    null_reason: str | None = None,
) -> BridgeStage:
    delta = None
    if previous is not None and amount is not None:
        delta = (amount - previous).quantize(Decimal("0.01"))
    return BridgeStage(
        stage_key=key,  # type: ignore[arg-type]
        label=label,
        amount_usd=None if null_reason else amount.quantize(Decimal("0.01")),
        delta_from_previous_usd=delta,
        null_reason=null_reason,
        source_system=source_system,
        record_count=record_count,
    )


def build_bridge(env_id: str, period_start: date, period_end: date) -> ReconciliationBridgeOut:
    usage_amt, usage_n   = ds.total_platform_usage_usd(env_id, period_start, period_end)
    bill_amt,  bill_n    = ds.total_rated_billing_usd(env_id, period_start, period_end)
    inv_amt,   inv_n     = ds.total_invoiced_usd(env_id, period_start, period_end)
    rec_amt,   rec_n     = ds.total_recognized_revenue_usd(env_id, period_start, period_end)
    cash_amt,  cash_n    = ds.total_collected_cash_usd(env_id, period_start, period_end)
    cmt_amt,   cmt_n     = ds.total_committed_usd(env_id, period_start, period_end)

    stages: list[BridgeStage] = []
    prev: Decimal | None = None

    s1 = _stage(
        key="platform_usage", label="Platform Usage @ List",
        amount=usage_amt, record_count=usage_n,
        source_system="platform_telemetry_demo", previous=prev,
        null_reason="no_usage_rows" if usage_n == 0 else None,
    )
    stages.append(s1)
    prev = s1.amount_usd

    s2 = _stage(
        key="rated_billing", label="Rated Billing",
        amount=bill_amt, record_count=bill_n,
        source_system="billing_engine_demo", previous=prev,
        null_reason="no_billing_lines" if bill_n == 0 else None,
    )
    stages.append(s2)
    prev = s2.amount_usd

    s3 = _stage(
        key="issued_invoices", label="Issued Invoices",
        amount=inv_amt, record_count=inv_n,
        source_system="netsuite_demo", previous=prev,
        null_reason="no_invoices" if inv_n == 0 else None,
    )
    stages.append(s3)
    prev = s3.amount_usd

    s4 = _stage(
        key="recognized_revenue", label="Recognized Revenue",
        amount=rec_amt, record_count=rec_n,
        source_system="netsuite_demo", previous=prev,
        null_reason="no_revrec_rows" if rec_n == 0 else None,
    )
    stages.append(s4)
    prev = s4.amount_usd

    s5 = _stage(
        key="collected_cash", label="Collected Cash",
        amount=cash_amt, record_count=cash_n,
        source_system="netsuite_demo", previous=prev,
        null_reason="no_payments" if cash_n == 0 else None,
    )
    stages.append(s5)
    prev = s5.amount_usd

    s6 = _stage(
        key="contract_committed", label="Contract Committed",
        amount=cmt_amt, record_count=cmt_n,
        source_system="salesforce_demo", previous=prev,
        null_reason="no_active_contracts" if cmt_n == 0 else None,
    )
    stages.append(s6)

    excs = ds.list_exceptions(env_id, limit=10_000)
    excs_in_period = [
        e for e in excs
        if e["period_start"] <= period_end and e["period_end"] >= period_start
    ]
    total = sum(
        (Decimal(str(e["amount_usd"])) for e in excs_in_period),
        start=Decimal("0"),
    )

    return ReconciliationBridgeOut(
        period_start=period_start,
        period_end=period_end,
        stages=stages,
        exceptions_total_usd=total.quantize(Decimal("0.01")),
        exceptions_count=len(excs_in_period),
    )


def latest_complete_month_bounds(today: date | None = None) -> tuple[date, date]:
    """Returns (first, last) of the most recent complete calendar month."""
    today = today or date.today()
    first_of_this_month = today.replace(day=1)
    last_complete = first_of_this_month - timedelta(days=1)
    first_of_last = last_complete.replace(day=1)
    return first_of_last, last_complete

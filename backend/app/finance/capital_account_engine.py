"""Deterministic capital account rollforward from replayed events."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from .utils import parse_date, qmoney


def compute_rollforward(events: list[dict], as_of_date: date) -> list[dict]:
    rows: dict[tuple[str, str], dict] = {}

    ordered = sorted(
        [e for e in events if parse_date(e["event_date"]) <= as_of_date],
        key=lambda e: (parse_date(e["event_date"]), str(e.get("fin_capital_event_id", ""))),
    )

    for event in ordered:
        key = (str(event["fin_entity_id"]), str(event["fin_participant_id"]))
        if key not in rows:
            rows[key] = {
                "fin_entity_id": key[0],
                "fin_participant_id": key[1],
                "opening_balance": Decimal("0"),
                "contributions": Decimal("0"),
                "distributions": Decimal("0"),
                "fees": Decimal("0"),
                "accruals": Decimal("0"),
                "clawbacks": Decimal("0"),
            }

        amount = qmoney(event.get("amount", 0))
        event_type = str(event.get("event_type", "")).lower()

        if event_type in {"commitment", "capital_call", "contribution"}:
            rows[key]["contributions"] += amount
        elif event_type == "distribution":
            rows[key]["distributions"] += amount
        elif event_type == "fee":
            rows[key]["fees"] += amount
        elif event_type == "accrual":
            rows[key]["accruals"] += amount
        elif event_type == "clawback":
            rows[key]["clawbacks"] += amount

    out: list[dict] = []
    for row in rows.values():
        row["opening_balance"] = qmoney(row["opening_balance"])
        row["contributions"] = qmoney(row["contributions"])
        row["distributions"] = qmoney(row["distributions"])
        row["fees"] = qmoney(row["fees"])
        row["accruals"] = qmoney(row["accruals"])
        row["clawbacks"] = qmoney(row["clawbacks"])
        row["closing_balance"] = qmoney(
            row["opening_balance"]
            + row["contributions"]
            + row["accruals"]
            + row["clawbacks"]
            - row["distributions"]
            - row["fees"]
        )
        out.append(row)

    return sorted(out, key=lambda r: (r["fin_entity_id"], r["fin_participant_id"]))


def compute_cashflows_for_irr(events: list[dict], entity_id: str, participant_id: str) -> list[tuple[date, Decimal]]:
    flows: list[tuple[date, Decimal]] = []
    for event in events:
        if str(event["fin_entity_id"]) != entity_id:
            continue
        if str(event["fin_participant_id"]) != participant_id:
            continue

        dt = parse_date(event["event_date"])
        amount = qmoney(event.get("amount", 0))
        event_type = str(event.get("event_type", "")).lower()
        sign = Decimal("0")

        if event_type in {"contribution", "capital_call", "fee"}:
            sign = -amount
        elif event_type in {"distribution", "accrual", "clawback"}:
            sign = amount

        if sign != 0:
            flows.append((dt, sign))

    return sorted(flows, key=lambda row: row[0])

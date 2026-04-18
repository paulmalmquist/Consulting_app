"""Fixture-backed repository for the Accounting Command Desk.

Keeps a deep-copied in-memory store per process so mutations (accept/defer/
reject queue items, upload receipts, match/split transactions, etc.) persist
for the life of the server without touching SQL. Swap the loader for a
Postgres-backed implementation later by satisfying ``AccountingRepo``.
"""
from __future__ import annotations

import copy
import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol


_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "winston_demo"
    / "hall_boys_accounting_seed.json"
)


class AccountingFixtureMissing(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _load_raw() -> dict[str, Any]:
    if not _FIXTURE_PATH.exists():
        raise AccountingFixtureMissing(
            f"Accounting demo fixture not found at {_FIXTURE_PATH}"
        )
    with _FIXTURE_PATH.open() as f:
        return json.load(f)


class AccountingRepo(Protocol):
    def as_of(self) -> str: ...
    def transactions(self) -> list[dict[str, Any]]: ...
    def receipts(self) -> list[dict[str, Any]]: ...
    def invoices(self) -> list[dict[str, Any]]: ...
    def expenses(self) -> list[dict[str, Any]]: ...
    def vendor_category_map(self) -> dict[str, str]: ...
    def queue_overrides(self) -> dict[str, str]: ...
    def kpi_sparklines(self) -> dict[str, list[float]]: ...
    def cash_movement_30d(self) -> dict[str, Any]: ...

    # Subscription intake (Track B)
    def subscription_evidence(self) -> list[dict[str, Any]]: ...
    def subscription_parse_results(self) -> list[dict[str, Any]]: ...
    def subscription_ledger(self) -> list[dict[str, Any]]: ...
    def subscription_occurrences(self) -> list[dict[str, Any]]: ...
    def subscription_review_queue(self) -> list[dict[str, Any]]: ...

    # Mutations
    def set_queue_override(self, item_id: str, state: str) -> None: ...
    def insert_receipt(self, row: dict[str, Any]) -> None: ...
    def update_transaction_match(
        self, txn_id: str, *, receipt_id: str | None = None, invoice_id: str | None = None
    ) -> dict[str, Any] | None: ...
    def split_transaction(
        self, txn_id: str, parts: list[dict[str, Any]]
    ) -> list[dict[str, Any]]: ...
    def mark_invoice_reminded(self, invoice_id: str, channel: str) -> dict[str, Any] | None: ...
    def create_expense(self, row: dict[str, Any]) -> dict[str, Any]: ...
    def create_invoice(self, row: dict[str, Any]) -> dict[str, Any]: ...

    # Subscription mutations
    def insert_subscription_evidence(self, row: dict[str, Any]) -> None: ...
    def insert_subscription_parse_result(self, row: dict[str, Any]) -> None: ...
    def upsert_subscription_ledger(self, row: dict[str, Any]) -> dict[str, Any]: ...
    def insert_subscription_occurrence(self, row: dict[str, Any]) -> None: ...
    def resolve_review_item(self, evidence_id: str) -> None: ...


class JsonFixtureAccountingRepo:
    """In-memory repo backed by the Hall Boys accounting seed.

    Each instance holds its own mutable copy of the fixture, so tests can get
    isolated state by constructing a new repo. Production usage should treat a
    single per-process instance as "the" store for the demo.
    """

    def __init__(self, seed: dict[str, Any] | None = None) -> None:
        raw = copy.deepcopy(seed if seed is not None else _load_raw())
        self._as_of = raw.get("as_of") or date.today().isoformat()
        self._transactions = list(raw.get("transactions", []))
        self._receipts = list(raw.get("receipts", []))
        self._invoices = list(raw.get("invoices", []))
        self._expenses = list(raw.get("expenses", []))
        self._vendor_category_map = dict(raw.get("vendor_category_map", {}))
        self._queue_overrides = dict(raw.get("queue_overrides", {}))
        self._kpi_sparklines = dict(raw.get("kpi_sparklines", {}))
        self._cash_movement = dict(raw.get("cash_movement_30d", {}))

        self._sub_evidence = list(raw.get("subscription_evidence", []))
        self._sub_parse = list(raw.get("subscription_parse_results", []))
        self._sub_ledger = list(raw.get("subscription_ledger", []))
        self._sub_occurrences = list(raw.get("subscription_occurrences", []))
        self._sub_review_queue = list(raw.get("subscription_review_queue", []))

    # ------- reads -------
    def as_of(self) -> str:
        return self._as_of

    def transactions(self) -> list[dict[str, Any]]:
        return list(self._transactions)

    def receipts(self) -> list[dict[str, Any]]:
        return list(self._receipts)

    def invoices(self) -> list[dict[str, Any]]:
        return list(self._invoices)

    def expenses(self) -> list[dict[str, Any]]:
        return list(self._expenses)

    def vendor_category_map(self) -> dict[str, str]:
        return dict(self._vendor_category_map)

    def queue_overrides(self) -> dict[str, str]:
        return dict(self._queue_overrides)

    def kpi_sparklines(self) -> dict[str, list[float]]:
        return {k: list(v) for k, v in self._kpi_sparklines.items()}

    def cash_movement_30d(self) -> dict[str, Any]:
        return copy.deepcopy(self._cash_movement)

    def subscription_evidence(self) -> list[dict[str, Any]]:
        return list(self._sub_evidence)

    def subscription_parse_results(self) -> list[dict[str, Any]]:
        return list(self._sub_parse)

    def subscription_ledger(self) -> list[dict[str, Any]]:
        return list(self._sub_ledger)

    def subscription_occurrences(self) -> list[dict[str, Any]]:
        return list(self._sub_occurrences)

    def subscription_review_queue(self) -> list[dict[str, Any]]:
        return list(self._sub_review_queue)

    # ------- mutations -------
    def set_queue_override(self, item_id: str, state: str) -> None:
        self._queue_overrides[item_id] = state

    def insert_receipt(self, row: dict[str, Any]) -> None:
        self._receipts.insert(0, row)

    def update_transaction_match(
        self, txn_id: str, *, receipt_id: str | None = None, invoice_id: str | None = None
    ) -> dict[str, Any] | None:
        for t in self._transactions:
            if t["id"] == txn_id:
                if receipt_id is not None:
                    t["match_receipt_id"] = receipt_id
                if invoice_id is not None:
                    t["match_invoice_id"] = invoice_id
                if receipt_id or invoice_id:
                    t["state"] = "reconciled"
                return t
        return None

    def split_transaction(
        self, txn_id: str, parts: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        original: dict[str, Any] | None = None
        for t in self._transactions:
            if t["id"] == txn_id:
                original = t
                break
        if original is None:
            return []
        new_rows: list[dict[str, Any]] = []
        for i, part in enumerate(parts, start=1):
            clone = copy.deepcopy(original)
            clone["id"] = f"{txn_id}-S{i}"
            clone["amount"] = -abs(float(part["amount"])) if original["amount"] < 0 else float(part["amount"])
            if part.get("category"):
                clone["category"] = part["category"]
            if part.get("memo"):
                clone["desc"] = f"{clone['desc']} · {part['memo']}"
            clone["state"] = "categorized"
            clone["match_hint"] = "split"
            self._transactions.append(clone)
            new_rows.append(clone)
        # Flag original as superseded (keep for audit trail)
        original["state"] = "categorized"
        original["match_hint"] = "split · superseded"
        return new_rows

    def mark_invoice_reminded(self, invoice_id: str, channel: str) -> dict[str, Any] | None:
        for inv in self._invoices:
            if inv["id"] == invoice_id:
                inv["last_reminded_channel"] = channel
                return inv
        return None

    def create_expense(self, row: dict[str, Any]) -> dict[str, Any]:
        self._expenses.insert(0, row)
        return row

    def create_invoice(self, row: dict[str, Any]) -> dict[str, Any]:
        self._invoices.insert(0, row)
        return row

    def insert_subscription_evidence(self, row: dict[str, Any]) -> None:
        self._sub_evidence.insert(0, row)

    def insert_subscription_parse_result(self, row: dict[str, Any]) -> None:
        self._sub_parse.insert(0, row)

    def upsert_subscription_ledger(self, row: dict[str, Any]) -> dict[str, Any]:
        for i, existing in enumerate(self._sub_ledger):
            if (
                existing["vendor_normalized"] == row.get("vendor_normalized")
                and existing["product"] == row.get("product")
                and existing["billing_platform"] == row.get("billing_platform")
            ):
                merged = {**existing, **row}
                merged["linked_evidence_ids"] = list(
                    {*existing.get("linked_evidence_ids", []), *row.get("linked_evidence_ids", [])}
                )
                self._sub_ledger[i] = merged
                return merged
        self._sub_ledger.append(row)
        return row

    def insert_subscription_occurrence(self, row: dict[str, Any]) -> None:
        self._sub_occurrences.append(row)

    def resolve_review_item(self, evidence_id: str) -> None:
        self._sub_review_queue = [
            r for r in self._sub_review_queue if r["evidence_id"] != evidence_id
        ]


_shared_repo: JsonFixtureAccountingRepo | None = None


def get_accounting_repo() -> JsonFixtureAccountingRepo:
    """Return the per-process accounting repo instance.

    Backed by the Hall Boys demo fixture. In v1, tenant isolation is not
    enforced — the fixture IS the tenant. A future SQL-backed repo should be
    resolved per `(env_id, business_id)`.
    """
    global _shared_repo
    if _shared_repo is None:
        _shared_repo = JsonFixtureAccountingRepo()
    return _shared_repo


def reset_accounting_repo() -> None:
    """Test hook — drop the singleton so subsequent calls reload from fixture."""
    global _shared_repo
    _shared_repo = None
    _load_raw.cache_clear()

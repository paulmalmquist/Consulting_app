"""Pydantic schemas for the Development ↔ REPE Asset Bridge API."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DevAssumptionUpdate(BaseModel):
    """Partial update for a dev_assumption_set row."""
    hard_cost: Decimal | None = None
    soft_cost: Decimal | None = None
    contingency: Decimal | None = None
    financing_cost: Decimal | None = None
    total_development_cost: Decimal | None = None
    construction_start: date | None = None
    construction_end: date | None = None
    lease_up_start: date | None = None
    lease_up_months: int | None = None
    stabilization_date: date | None = None
    stabilized_occupancy: Decimal | None = None
    stabilized_noi: Decimal | None = None
    exit_cap_rate: Decimal | None = None
    construction_loan_amt: Decimal | None = None
    construction_loan_rate: Decimal | None = None
    perm_loan_amt: Decimal | None = None
    perm_loan_rate: Decimal | None = None

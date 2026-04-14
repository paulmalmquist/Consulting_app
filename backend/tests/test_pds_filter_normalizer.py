"""Tests for the single canonical filter path."""
from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest

from app.services.pds_executive.filter_normalizer import (
    FilterValidationError,
    SUPPORTED_GRAINS,
    normalize_filters,
)


ENV = uuid4()
BIZ = uuid4()


def test_normalize_produces_identical_contract_across_services():
    """Same inputs must produce byte-identical NormalizedFilters regardless of caller."""
    a = normalize_filters(env_id=ENV, business_id=BIZ, grain="portfolio")
    b = normalize_filters(env_id=ENV, business_id=BIZ, grain="portfolio")
    assert a == b
    assert a.as_receipt_filters() == b.as_receipt_filters()


def test_every_supported_grain_is_accepted():
    for grain in SUPPORTED_GRAINS:
        nf = normalize_filters(env_id=ENV, business_id=BIZ, grain=grain)
        assert nf.grain == grain


def test_unsupported_grain_fails_loudly():
    with pytest.raises(FilterValidationError):
        normalize_filters(env_id=ENV, business_id=BIZ, grain="region")


def test_missing_env_id_fails_loudly():
    with pytest.raises(FilterValidationError):
        normalize_filters(env_id=None, business_id=BIZ, grain="portfolio")


def test_missing_business_id_fails_loudly():
    with pytest.raises(FilterValidationError):
        normalize_filters(env_id=ENV, business_id=None, grain="portfolio")


def test_date_range_inverted_fails():
    with pytest.raises(FilterValidationError):
        normalize_filters(
            env_id=ENV,
            business_id=BIZ,
            grain="portfolio",
            date_from="2026-06-01",
            date_to="2026-01-01",
        )


def test_iso_date_strings_are_accepted():
    nf = normalize_filters(
        env_id=ENV,
        business_id=BIZ,
        grain="portfolio",
        as_of_date="2026-04-14",
        date_from="2026-01-01",
        date_to="2026-04-14",
    )
    assert nf.as_of_date == date(2026, 4, 14)
    assert nf.date_from == date(2026, 1, 1)
    assert nf.date_to == date(2026, 4, 14)


def test_malformed_date_fails_loudly():
    with pytest.raises(FilterValidationError):
        normalize_filters(
            env_id=ENV, business_id=BIZ, grain="portfolio", as_of_date="not-a-date"
        )


def test_receipt_filters_shape_contains_all_keys():
    nf = normalize_filters(env_id=ENV, business_id=BIZ, grain="account")
    receipt = nf.as_receipt_filters()
    for key in (
        "env_id",
        "business_id",
        "grain",
        "as_of_date",
        "date_from",
        "date_to",
        "entity_ids",
        "status_filters",
        "include_suppressed",
    ):
        assert key in receipt

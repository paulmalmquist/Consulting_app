from __future__ import annotations

import pytest

from app.underwriting.normalization import (
    normalize_research_payload,
    parse_bps,
    parse_currency_to_cents,
    parse_percent_to_decimal,
    parse_sf,
    validate_citation_requirements,
)


def test_parse_numeric_units():
    assert parse_percent_to_decimal("5.5%") == pytest.approx(0.055)
    assert parse_percent_to_decimal("250 bps") == pytest.approx(0.025)
    assert parse_percent_to_decimal(0.062) == pytest.approx(0.062)
    assert parse_bps("1.25%") == pytest.approx(125.0)
    assert parse_currency_to_cents("$1,234.56") == 123456
    assert parse_currency_to_cents("(10.00)") == -1000
    assert parse_sf("12,500 sf") == pytest.approx(12500.0)


def test_normalize_research_payload_dedup_and_range_warning():
    payload = {
        "contract_version": "uw_research_contract_v1",
        "sources": [
            {
                "citation_key": "SRC-1",
                "url": "https://example.com",
                "date_accessed": "2026-02-19",
                "raw_text_excerpt": "example",
            }
        ],
        "extracted_datapoints": [
            {
                "datum_key": "vacancy_rate",
                "fact_class": "fact",
                "value": "3.2%",
                "unit": "pct_decimal",
                "citation_key": "SRC-1",
            }
        ],
        "sale_comps": [
            {
                "address": "100 Main St",
                "close_date": "2025-12-01",
                "sale_price": "$10,000,000",
                "cap_rate": "4.8%",
                "noi": "$480,000",
                "size_sf": "50000 sf",
                "citation_key": "SRC-1",
                "confidence": 0.7,
            },
            {
                "address": "100 Main St",
                "close_date": "2025-12-20",
                "sale_price": "$10,100,000",
                "cap_rate": "4.9%",
                "noi": "$494,900",
                "size_sf": "50020 sf",
                "citation_key": "SRC-1",
                "confidence": 0.9,
            },
        ],
        "lease_comps": [],
        "market_snapshot": [
            {
                "metric_key": "cap_rate",
                "metric_date": "2025-12-31",
                "metric_grain": "point",
                "metric_value": "25%",
                "unit": "pct_decimal",
                "citation_key": "SRC-1",
            }
        ],
        "unknowns": [],
        "assumption_suggestions": [],
    }

    normalized = normalize_research_payload(payload)
    assert normalized["stats"]["sale_comp_deduped"] == 1
    assert len(normalized["sale_comps"]) == 1
    assert normalized["sale_comps"][0]["sale_price_cents"] == 1010000000
    assert "market:cap_rate:cap_rate_out_of_range" in normalized["warnings"]


def test_lease_outlier_flag():
    lease_rows = []
    for idx in range(10):
        lease_rows.append(
            {
                "address": f"{idx} A St",
                "rent_psf": f"${30 + idx * 0.2:.2f}",
                "size_sf": "900 sf",
                "citation_key": "SRC-1",
            }
        )
    lease_rows.append(
        {
            "address": "99 Extreme St",
            "rent_psf": "$120.00",
            "size_sf": "900 sf",
            "citation_key": "SRC-1",
        }
    )

    payload = {
        "contract_version": "uw_research_contract_v1",
        "sources": [],
        "extracted_datapoints": [],
        "sale_comps": [],
        "lease_comps": lease_rows,
        "market_snapshot": [],
        "unknowns": [],
        "assumption_suggestions": [],
    }

    normalized = normalize_research_payload(payload)
    assert len(normalized["lease_comps"]) == 11
    assert any(row["is_outlier"] for row in normalized["lease_comps"])


def test_validate_citation_requirements():
    with pytest.raises(ValueError, match="requires citation_key"):
        validate_citation_requirements(
            {
                "extracted_datapoints": [
                    {
                        "datum_key": "vacancy_rate",
                        "fact_class": "fact",
                        "value": 0.05,
                        "unit": "pct_decimal",
                    }
                ],
                "sale_comps": [],
                "lease_comps": [],
                "market_snapshot": [],
            }
        )

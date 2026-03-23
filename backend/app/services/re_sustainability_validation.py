from __future__ import annotations

from decimal import Decimal


SECTOR_INTENSITY_BANDS: dict[str, tuple[Decimal, Decimal]] = {
    "multifamily": (Decimal("0.0025"), Decimal("0.0065")),
    "senior_housing": (Decimal("0.0030"), Decimal("0.0075")),
    "medical_office": (Decimal("0.0030"), Decimal("0.0080")),
    "student_housing": (Decimal("0.0025"), Decimal("0.0070")),
    "office": (Decimal("0.0020"), Decimal("0.0060")),
}


def _d(value: object | None) -> Decimal:
    return Decimal(str(value or 0))


def non_negative_issues(row: dict) -> list[dict]:
    issues: list[dict] = []
    fields = (
        "usage_kwh",
        "usage_therms",
        "usage_gallons",
        "peak_kw",
        "cost_total",
        "demand_charges",
        "supply_charges",
        "taxes_fees",
        "waste_tons",
        "water_gallons",
    )
    for field in fields:
        if field in row and row.get(field) is not None and _d(row.get(field)) < 0:
            issues.append(
                {
                    "severity": "error",
                    "issue_code": "NEGATIVE_VALUE",
                    "message": f"{field} cannot be negative.",
                    "blocked": True,
                }
            )
    return issues


def eui_spike_issue(
    *,
    previous_usage_kwh_equiv: Decimal | None,
    current_usage_kwh_equiv: Decimal | None,
) -> dict | None:
    if previous_usage_kwh_equiv is None or previous_usage_kwh_equiv <= 0:
        return None
    if current_usage_kwh_equiv is None:
        return None
    ratio = current_usage_kwh_equiv / previous_usage_kwh_equiv
    if ratio > Decimal("4"):
        return {
            "severity": "warning",
            "issue_code": "EUI_SPIKE_GT_300",
            "message": "Utility usage increased by more than 300% month-over-month.",
            "blocked": False,
        }
    return None


def missing_square_feet_issue(square_feet: Decimal | None) -> dict | None:
    if square_feet is not None and square_feet > 0:
        return None
    return {
        "severity": "warning",
        "issue_code": "MISSING_SQUARE_FEET",
        "message": "Square footage is missing; intensity metrics remain null until corrected.",
        "blocked": False,
    }


def intensity_band_issue(
    *,
    property_type: str | None,
    emissions_intensity_per_sf: Decimal | None,
) -> dict | None:
    if property_type is None or emissions_intensity_per_sf is None:
        return None
    band = SECTOR_INTENSITY_BANDS.get(property_type.lower())
    if not band:
        return None
    low, high = band
    if emissions_intensity_per_sf < low or emissions_intensity_per_sf > high:
        return {
            "severity": "warning",
            "issue_code": "INTENSITY_OUT_OF_BAND",
            "message": "Emissions intensity is outside the sector reference band.",
            "blocked": False,
        }
    return None

from __future__ import annotations

from decimal import Decimal


def default_region_for_asset(asset_name: str | None) -> str:
    label = (asset_name or "").lower()
    if "dallas" in label or "meridian park" in label or "ellipse" in label:
        return "ERCOT"
    if "phoenix" in label:
        return "WECC"
    if "boston" in label:
        return "ISONE"
    return "US"


def default_country_for_asset(_asset_name: str | None) -> str:
    return "US"


def build_energy_star_snapshot(profile: dict | None) -> dict:
    profile = profile or {}
    score = profile.get("energy_star_score")
    site_eui = None
    if profile.get("square_feet") and profile.get("energy_star_score") is not None:
        sf = Decimal(str(profile["square_feet"]))
        energy_star_score = Decimal(str(profile["energy_star_score"]))
        if sf > 0:
            site_eui = (Decimal("100") - energy_star_score) + (sf / Decimal("10000"))
    return {
        "provider": "energy_star_mock",
        "energy_star_score": score,
        "weather_normalized_site_eui": float(site_eui) if site_eui is not None else None,
        "source_eui": float(site_eui * Decimal("1.18")) if site_eui is not None else None,
        "data_quality_flags": [] if score is not None else ["missing_score"],
    }

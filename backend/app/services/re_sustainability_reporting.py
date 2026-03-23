from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor
from app.services import re_sustainability


REPORT_TITLES = {
    "gresb": "GRESB-aligned Sustainability Report",
    "lp_esg_summary": "LP ESG Summary",
    "sfdr_annex_ii": "SFDR Annex II",
    "tcfd_summary": "TCFD Risk Summary",
    "carbon_disclosure": "Carbon Disclosure Summary",
    "quarterly_lp_section": "Quarterly LP Sustainability Section",
}


def build_report_payload(*, fund_id: UUID, report_key: str, scenario_id: UUID | None = None) -> dict:
    if report_key not in REPORT_TITLES:
        raise ValueError("Unsupported sustainability report key.")
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(max(year), EXTRACT(YEAR FROM now())::int) AS report_year
            FROM sus_portfolio_footprint_v
            WHERE fund_id = %s
              AND ((%s::uuid IS NULL AND scenario_id IS NULL) OR scenario_id = %s::uuid)
            """,
            (str(fund_id), str(scenario_id) if scenario_id else None, str(scenario_id) if scenario_id else None),
        )
        year_row = cur.fetchone() or {}
        year = int(year_row.get("report_year") or 0)
    footprint = re_sustainability.get_fund_portfolio_footprint(
        fund_id=fund_id,
        year=year,
        scenario_id=scenario_id,
    )
    summary = footprint["summary"]
    appendix_rows = footprint["asset_rows"]
    sections = [
        {
            "key": "portfolio_footprint",
            "title": "Portfolio Footprint",
            "body": summary,
        },
        {
            "key": "asset_detail_appendix",
            "title": "Asset Detail Appendix",
            "body": appendix_rows,
        },
        {
            "key": "methodology",
            "title": "Emissions Methodology",
            "body": {
                "statement": "Annual emissions reconcile to stored monthly utility rows and the selected emission factor set.",
                "transparency": "All values are reproducible from sus_utility_monthly, sus_asset_emissions_annual, and the factor version metadata.",
            },
        },
        {
            "key": "emission_factor_disclosure",
            "title": "Emission Factor Disclosure",
            "body": re_sustainability.list_emission_factor_sets(),
        },
        {
            "key": "data_quality",
            "title": "Data Quality",
            "body": footprint["issues"],
        },
    ]
    return {
        "report_key": report_key,
        "report_title": REPORT_TITLES[report_key],
        "generated_at": summary.get("last_calculated_at") or datetime.now(timezone.utc),
        "context": {
            "fund_id": str(fund_id),
            "fund_name": summary.get("fund_name"),
            "year": year,
            "scenario_id": str(scenario_id) if scenario_id else None,
        },
        "sections": sections,
        "appendix_rows": appendix_rows,
    }

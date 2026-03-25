"""Parse SEC EDGAR filings into dim_entity and doc_store_index records."""
from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    parsed: list[dict] = []
    for filing in raw.get("filings", []):
        # Entity record for the filer
        if filing.get("company_name"):
            parsed.append({
                "_record_type": "entity",
                "name": filing["company_name"],
                "entity_type": "owner",
                "identifiers": {"cik": filing.get("cik"), "form_type": filing.get("form_type")},
                "provenance": {"source": "sec_edgar", "accession": filing.get("accession")},
            })

        # Document index record
        parsed.append({
            "_record_type": "document",
            "type": filing.get("form_type", "SEC_FILING"),
            "uri": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={filing.get('cik')}&type={filing.get('form_type')}",
            "filing_date": filing.get("filing_date"),
            "company_name": filing.get("company_name"),
            "cik": filing.get("cik"),
            "provenance": {"source": "sec_edgar"},
        })

    return parsed

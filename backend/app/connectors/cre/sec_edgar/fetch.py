"""Fetch REIT filings and institutional ownership from SEC EDGAR."""
from __future__ import annotations

import logging
import time

import httpx

from app.connectors.cre.base import ConnectorContext

log = logging.getLogger(__name__)

EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index"
EDGAR_COMPANY = "https://data.sec.gov/submissions"
_USER_AGENT = "WinstonCRE/1.0 (support@businessmachine.io)"
_RATE_LIMIT_DELAY = 0.12  # 10 req/sec max per SEC policy


def fetch(context: ConnectorContext) -> dict:
    """Fetch REIT-related filings from SEC EDGAR.

    Supports CIK lookup and 13-F/10-K/10-Q filing retrieval.
    """
    cik = context.filters.get("cik")
    form_types = context.filters.get("form_types", ["13-F", "10-K"])
    limit = int(context.filters.get("limit", 20))

    headers = {"User-Agent": _USER_AGENT, "Accept": "application/json"}
    filings: list[dict] = []

    if cik:
        # Direct company lookup
        cik_padded = str(cik).zfill(10)
        url = f"{EDGAR_COMPANY}/CIK{cik_padded}.json"
        try:
            resp = httpx.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            recent = data.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            dates = recent.get("filingDate", [])
            accessions = recent.get("accessionNumber", [])
            names = recent.get("primaryDocument", [])

            for i, form in enumerate(forms[:limit]):
                if form in form_types:
                    filings.append({
                        "cik": cik,
                        "company_name": data.get("name", ""),
                        "form_type": form,
                        "filing_date": dates[i] if i < len(dates) else "",
                        "accession": accessions[i] if i < len(accessions) else "",
                        "document": names[i] if i < len(names) else "",
                    })
            time.sleep(_RATE_LIMIT_DELAY)
        except Exception as exc:
            log.warning("EDGAR company lookup error for CIK %s: %s", cik, exc)
    else:
        # Full-text search for REIT filings
        query = context.filters.get("query", "REIT real estate investment trust")
        try:
            resp = httpx.get(
                "https://efts.sec.gov/LATEST/search-index",
                params={"q": query, "forms": ",".join(form_types), "dateRange": "custom",
                        "startdt": context.filters.get("start_date", "2024-01-01")},
                headers=headers, timeout=30,
            )
            resp.raise_for_status()
            hits = resp.json().get("hits", {}).get("hits", [])
            for hit in hits[:limit]:
                src = hit.get("_source", {})
                filings.append({
                    "cik": src.get("entity_id"),
                    "company_name": src.get("entity_name", ""),
                    "form_type": src.get("form_type", ""),
                    "filing_date": src.get("file_date", ""),
                    "accession": src.get("file_num", ""),
                })
            time.sleep(_RATE_LIMIT_DELAY)
        except Exception as exc:
            log.warning("EDGAR search error: %s", exc)

    log.info("SEC EDGAR fetch: %d filings", len(filings))
    return {"source": "sec_edgar", "filings": filings}

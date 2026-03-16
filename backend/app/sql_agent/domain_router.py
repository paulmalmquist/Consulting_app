"""Domain router — classifies questions as REPE or PDS based on keywords.

Lightweight keyword-based classifier; no LLM call needed for most cases.
Falls back to PDS when ambiguous (since PDS is the current focus).
"""
from __future__ import annotations

PDS_KEYWORDS = frozenset({
    "utilization", "timecard", "nps", "satisfaction", "survey", "employee",
    "adoption", "technology", "tool", "ingenious", "falcon", "azara",
    "corrigo", "procore", "bim", "account", "client", "revenue",
    "fee", "forecast", "budget", "billing", "billable", "bench",
    "resource", "capacity", "demand", "project management",
    "construction management", "development management", "cost management",
    "service line", "governance", "variable", "dedicated", "tier",
    "enterprise", "mid-market", "smb", "pipeline", "coverage",
    "recognition", "asc 606", "backlog", "deferred",
    "promoter", "detractor", "passive", "csat", "respondent",
    "schedule adherence", "communication", "vendor management",
    "safety", "innovation", "value engineering",
    "pds", "project delivery", "americas",
})

REPE_KEYWORDS = frozenset({
    "fund", "deal", "asset", "property", "loan", "irr", "tvpi", "dpi",
    "noi", "cap rate", "dscr", "ltv", "debt yield", "waterfall",
    "capital account", "rollforward", "monte carlo", "dcf",
    "valuation", "underwriting", "occupancy", "rent roll", "lease",
    "covenant", "vintage", "harvesting", "fundraising", "sponsor",
    "equity", "debt service", "gp", "lp", "partner",
    "repe", "real estate", "private equity",
})


def classify_domain(question: str) -> str:
    """Return 'pds' or 'repe' based on keyword matches.

    Falls back to 'pds' when ambiguous.
    """
    q = question.lower()

    pds_score = sum(1 for kw in PDS_KEYWORDS if kw in q)
    repe_score = sum(1 for kw in REPE_KEYWORDS if kw in q)

    if repe_score > pds_score:
        return "repe"
    return "pds"

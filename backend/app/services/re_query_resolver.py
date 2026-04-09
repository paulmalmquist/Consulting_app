"""
Query resolver for the portfolio command bar.

Accepts a raw user query string and returns structured results:
- filters (metric and attribute)
- entity matches
- suggested actions
- slash command detection

All semantic parsing lives here — the frontend sends the raw string
and renders whatever comes back. No regex parsing on the client.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from uuid import UUID

from app.services.entity_search import (
    search_entities_by_name,
    search_entities_by_name_fuzzy_db,
)

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class ResolvedFilter:
    field: str
    operator: str
    value: float | str


@dataclass
class ResolvedEntity:
    entity_type: str
    entity_id: str
    name: str
    secondary: str | None = None
    metric: dict | None = None  # {"label": "IRR", "value": "12.7%"}


@dataclass
class ResolvedAction:
    command: str
    label: str
    params: dict | None = None


@dataclass
class QueryResolverResult:
    filters: list[ResolvedFilter] = field(default_factory=list)
    entities: list[ResolvedEntity] = field(default_factory=list)
    actions: list[ResolvedAction] = field(default_factory=list)
    slash_command: str | None = None


# ---------------------------------------------------------------------------
# Slash command registry
# ---------------------------------------------------------------------------

_SLASH_COMMANDS: dict[str, tuple[str, dict | None]] = {
    "/open fund": ("Open a fund", None),
    "/open asset": ("Open an asset", None),
    "/compare funds": ("Compare funds", None),
    "/run model": ("Run a model", None),
    "/variance analysis": ("Open variance analysis", None),
    "/debt surveillance": ("Open debt surveillance", None),
    "/create asset": ("Create a new asset", None),
    "/create fund": ("Create a new fund", None),
    "/import data": ("Import data", None),
}

# ---------------------------------------------------------------------------
# Metric field patterns
# ---------------------------------------------------------------------------

# Maps user-facing names to DB column names
_METRIC_ALIASES: dict[str, str] = {
    "irr": "gross_irr",
    "gross irr": "gross_irr",
    "gross_irr": "gross_irr",
    "net irr": "net_irr",
    "net_irr": "net_irr",
    "tvpi": "tvpi",
    "dpi": "dpi",
    "rvpi": "rvpi",
    "dscr": "weighted_dscr",
    "ltv": "weighted_ltv",
    "nav": "portfolio_nav",
    "occupancy": "occupancy",
    "debt yield": "debt_yield",
    "debt_yield": "debt_yield",
    "noi": "noi",
}

# Regex: field_name operator value  e.g. "DSCR < 1.25" or "IRR > 12%"
_METRIC_FILTER_RE = re.compile(
    r"(?i)\b("
    + "|".join(re.escape(k) for k in sorted(_METRIC_ALIASES.keys(), key=len, reverse=True))
    + r")\s*(<=|>=|<|>|=)\s*([\d.]+)%?"
)

# ---------------------------------------------------------------------------
# Attribute dimensions
# ---------------------------------------------------------------------------

_PROPERTY_TYPES = {
    "multifamily", "office", "industrial", "retail", "hospitality",
    "senior housing", "student housing", "self storage", "data center",
    "life science", "medical office", "mixed use", "land",
}

_STRATEGIES = {"equity", "debt", "core", "core plus", "core-plus", "value add", "value-add", "opportunistic"}

_US_STATES: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA",
    "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    # Abbreviations map to themselves
    "al": "AL", "ak": "AK", "az": "AZ", "ar": "AR", "ca": "CA", "co": "CO",
    "ct": "CT", "de": "DE", "fl": "FL", "ga": "GA", "hi": "HI", "id": "ID",
    "il": "IL", "in": "IN", "ia": "IA", "ks": "KS", "ky": "KY", "la": "LA",
    "me": "ME", "md": "MD", "ma": "MA", "mi": "MI", "mn": "MN", "ms": "MS",
    "mo": "MO", "mt": "MT", "ne": "NE", "nv": "NV", "nh": "NH", "nj": "NJ",
    "nm": "NM", "ny": "NY", "nc": "NC", "nd": "ND", "oh": "OH", "ok": "OK",
    "or": "OR", "pa": "PA", "ri": "RI", "sc": "SC", "sd": "SD", "tn": "TN",
    "tx": "TX", "ut": "UT", "vt": "VT", "va": "VA", "wa": "WA", "wv": "WV",
    "wi": "WI", "wy": "WY",
}

# Vintage year pattern
_VINTAGE_RE = re.compile(r"\b(?:vintage\s+)?(\d{4})\b", re.IGNORECASE)

# "in STATE" or "in MARKET" pattern
_IN_LOCATION_RE = re.compile(r"\bin\s+(\w[\w\s]*?)(?:\s*$|\s+(?:with|and|where|vintage))", re.IGNORECASE)

# "maturing YEAR" pattern
_MATURING_RE = re.compile(r"\bmaturing\s+(\d{4})\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Signal → action suggestions
# ---------------------------------------------------------------------------

def _suggest_actions_for_filters(filters: list[ResolvedFilter]) -> list[ResolvedAction]:
    """Based on extracted filters, suggest relevant commands."""
    actions: list[ResolvedAction] = []
    fields_present = {f.field for f in filters}

    if "weighted_dscr" in fields_present or "debt_yield" in fields_present:
        actions.append(ResolvedAction(
            command="/debt-surveillance",
            label="Open Debt Surveillance",
        ))
    if "occupancy" in fields_present:
        actions.append(ResolvedAction(
            command="/variance-analysis",
            label="Open Variance Analysis",
            params={"metric": "occupancy"},
        ))
    if any(f.field in ("gross_irr", "net_irr", "tvpi") for f in filters):
        actions.append(ResolvedAction(
            command="/compare-funds",
            label="Compare Funds",
        ))
    return actions


# ---------------------------------------------------------------------------
# Main resolver
# ---------------------------------------------------------------------------

def resolve_query(
    *,
    query: str,
    business_id: UUID,
    env_id: UUID,
    quarter: str,
) -> dict:
    """
    Parse a raw query string into structured results.

    Returns a dict matching QueryResolverResult for JSON serialization.
    """
    raw = query.strip()
    if not raw:
        return asdict(QueryResolverResult())

    result = QueryResolverResult()

    # 1. Slash command detection
    if raw.startswith("/"):
        raw_lower = raw.lower()
        for cmd, (label, params) in _SLASH_COMMANDS.items():
            if raw_lower.startswith(cmd):
                result.slash_command = cmd
                result.actions.append(ResolvedAction(command=cmd, label=label, params=params))
                break
        if not result.slash_command:
            # Fuzzy match against commands
            for cmd, (label, params) in _SLASH_COMMANDS.items():
                if raw_lower[1:] in cmd[1:]:
                    result.actions.append(ResolvedAction(command=cmd, label=label, params=params))
        return asdict(result)

    remaining = raw

    # 2. Extract metric filters
    for match in _METRIC_FILTER_RE.finditer(raw):
        alias = match.group(1).lower().strip()
        op = match.group(2)
        val = float(match.group(3))
        field_name = _METRIC_ALIASES.get(alias)
        if field_name:
            # IRR values entered as whole numbers (e.g., "IRR > 12") need conversion to decimal
            if field_name in ("gross_irr", "net_irr") and val > 1:
                val = val / 100.0
            result.filters.append(ResolvedFilter(field=field_name, operator=op, value=val))
            remaining = remaining.replace(match.group(0), " ")

    # 3. Extract attribute filters
    remaining_lower = remaining.lower()

    # Property types
    for pt in _PROPERTY_TYPES:
        if pt in remaining_lower:
            result.filters.append(ResolvedFilter(field="property_type", operator="=", value=pt))
            remaining = re.sub(re.escape(pt), " ", remaining, flags=re.IGNORECASE)

    # Strategies
    for strat in _STRATEGIES:
        if strat in remaining_lower:
            result.filters.append(ResolvedFilter(field="strategy", operator="=", value=strat))
            remaining = re.sub(re.escape(strat), " ", remaining, flags=re.IGNORECASE)

    # Location: "in Texas" or "in TX"
    loc_match = _IN_LOCATION_RE.search(remaining)
    if loc_match:
        loc = loc_match.group(1).strip().lower()
        state_code = _US_STATES.get(loc)
        if state_code:
            result.filters.append(ResolvedFilter(field="state", operator="=", value=state_code))
            remaining = remaining.replace(loc_match.group(0), " ")

    # Bare state name (without "in" prefix) — check remaining tokens
    if not any(f.field == "state" for f in result.filters):
        remaining_lower_tokens = remaining.lower().split()
        for token in remaining_lower_tokens:
            state_code = _US_STATES.get(token)
            if state_code:
                result.filters.append(ResolvedFilter(field="state", operator="=", value=state_code))
                remaining = re.sub(r"\b" + re.escape(token) + r"\b", " ", remaining, flags=re.IGNORECASE)
                break

    # Vintage year
    vintage_match = _VINTAGE_RE.search(remaining)
    if vintage_match:
        year = int(vintage_match.group(1))
        if 2000 <= year <= 2040:
            result.filters.append(ResolvedFilter(field="vintage_year", operator="=", value=year))
            remaining = remaining.replace(vintage_match.group(0), " ")

    # Maturing
    maturing_match = _MATURING_RE.search(remaining)
    if maturing_match:
        year = int(maturing_match.group(1))
        result.filters.append(ResolvedFilter(field="maturity_year", operator="=", value=year))
        remaining = remaining.replace(maturing_match.group(0), " ")

    # 4. Entity search — use remaining tokens
    remaining_clean = re.sub(r"\s+", " ", remaining).strip()
    if remaining_clean and len(remaining_clean) >= 2:
        # Remove noise words
        noise = {"in", "the", "a", "an", "with", "and", "or", "for", "of", "at", "by"}
        tokens = [t for t in remaining_clean.split() if t.lower() not in noise]
        search_str = " ".join(tokens).strip()

        if search_str and len(search_str) >= 2:
            try:
                entities = search_entities_by_name(
                    query=search_str,
                    business_id=business_id,
                    env_id=env_id,
                    limit=8,
                )
                if not entities and len(search_str) >= 5:
                    entities = search_entities_by_name_fuzzy_db(
                        query=search_str,
                        business_id=business_id,
                        limit=5,
                    )
                for e in entities:
                    if e.score >= 0.3:
                        result.entities.append(ResolvedEntity(
                            entity_type=e.entity_type,
                            entity_id=e.entity_id,
                            name=e.name,
                            secondary=e.source_table,
                        ))
            except Exception:
                pass  # Entity search failure should not block filter results

    # 5. Action suggestions based on extracted filters
    result.actions.extend(_suggest_actions_for_filters(result.filters))

    return asdict(result)

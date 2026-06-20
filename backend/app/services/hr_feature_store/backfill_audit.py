"""Deterministic no-lookahead audit for the episode-embeddings backfill.

Blocks any candidate whose feature inputs or source metadata contain
future-looking / target / resolved-label fields — the cheapest way to prove a
backfill can't leak the answer into the spine. Pure; no DB, no network.
"""

from __future__ import annotations

from typing import Any

# Future-looking / label substrings that must never appear in feature inputs.
BANNED_PATTERNS = (
    "forward_return", "future_return", "target_", "resolved_",
    "actual_outcome", "max_drawdown_next", "next_30d",
)


def _banned_hits(name: str) -> list[str]:
    low = str(name).lower()
    return [p for p in BANNED_PATTERNS if p in low]


def audit_no_lookahead(candidate: dict[str, Any]) -> tuple[bool, list[str]]:
    """Return (ok, violations) for one candidate row."""
    violations: list[str] = []

    if not candidate.get("as_of_date"):
        violations.append("missing_as_of_date")

    # 1) feature inputs must not name any future/target column
    for key in (candidate.get("features_normalized") or {}):
        for p in _banned_hits(key):
            violations.append(f"feature:{key}:{p}")

    # 2) feature_vector source metadata (provenance) + lineage inputs must be clean
    prov = candidate.get("provenance") or {}
    for key in prov:
        for p in _banned_hits(key):
            violations.append(f"provenance:{key}:{p}")
    lineage = candidate.get("lineage_json") or {}
    for inp in (lineage.get("inputs") or []):
        for p in _banned_hits(inp):
            violations.append(f"lineage_input:{inp}:{p}")

    return (not violations), violations


def audit_batch(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Audit a batch; returns passed + per-row violations."""
    rows = []
    all_ok = True
    for c in candidates:
        ok, violations = audit_no_lookahead(c)
        if not ok:
            all_ok = False
            rows.append({"observation_id": c.get("observation_id"), "violations": violations})
    return {"passed": all_ok, "violations": rows}

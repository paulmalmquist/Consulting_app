from __future__ import annotations

from uuid import UUID


def normalize_key(value: str) -> str:
    key = "".join(ch.lower() if ch.isalnum() else "_" for ch in value.strip())
    while "__" in key:
        key = key.replace("__", "_")
    return key.strip("_")[:64]


def resolve_tenant_id(cur, business_id: UUID) -> UUID:
    cur.execute("SELECT tenant_id FROM business WHERE business_id = %s", (str(business_id),))
    row = cur.fetchone()
    if not row:
        raise LookupError("Business not found in canonical public.business")
    return row["tenant_id"]

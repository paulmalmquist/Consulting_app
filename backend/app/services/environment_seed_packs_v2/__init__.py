"""Seed pack registry for the v2 environment blueprint pipeline.

Each pack is deterministic and idempotent. Packs are intentionally minimal in this
first pass — they create a coherent starter shell, not a fully-populated demo.

Adding a pack:
1. Create a new module in this package exposing `apply(cur, env_id, business_id, *, actor) -> SeedResult`
   and module-level constants NAME, VERSION.
2. Register it in `SEED_PACKS` below.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol


@dataclass
class SeedResult:
    pack_name: str
    pack_version: int
    rows_created: dict[str, int]  # table -> count
    notes: list[str]


class SeedPack(Protocol):
    NAME: str
    VERSION: int

    def apply(
        self, cur: Any, env_id: str, business_id: str, *, actor: str
    ) -> SeedResult:
        ...


from . import (  # noqa: E402  (import after protocol for circular-safety)
    client_delivery_starter,
    empty,
    internal_ops_minimal,
    repe_starter,
    trading_research_starter,
)


SEED_PACKS: dict[str, SeedPack] = {
    "empty": empty,  # type: ignore[dict-item]
    "internal_ops_minimal": internal_ops_minimal,  # type: ignore[dict-item]
    "client_delivery_starter": client_delivery_starter,  # type: ignore[dict-item]
    "repe_starter": repe_starter,  # type: ignore[dict-item]
    "trading_research_starter": trading_research_starter,  # type: ignore[dict-item]
}


def get_pack(name: str) -> SeedPack:
    if name not in SEED_PACKS:
        raise LookupError(f"Unknown seed pack: {name}. Available: {sorted(SEED_PACKS)}")
    return SEED_PACKS[name]

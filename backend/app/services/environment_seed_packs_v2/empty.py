"""Empty seed pack — creates no rows. Used for bare shells."""

from __future__ import annotations

from . import SeedResult


NAME = "empty"
VERSION = 1


def apply(cur, env_id: str, business_id: str, *, actor: str) -> SeedResult:
    return SeedResult(
        pack_name=NAME,
        pack_version=VERSION,
        rows_created={},
        notes=["empty pack: no starter data created"],
    )

"""BuildContext: profile config, fixed timeline, and per-table deterministic RNG.

Determinism rules (binding):
  - MASTER_SEED is fixed; every table draws from its own named substream derived from
    a stable hash of the table name (order-independent, reproducible).
  - The timeline is fixed (no wall-clock reads anywhere in the package).
  - Re-running build with the same profile yields byte-identical artifacts.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from . import MASTER_SEED

_CONFIG_DIR = Path(__file__).parent / "config"

# Fixed timeline (convo.md §11) — never read the wall clock.
TIMELINE = {
    "start": _dt.date(2025, 10, 1),       # early build setup
    "ramp_start": _dt.date(2026, 1, 1),   # production ramp
    "test_campaign": _dt.date(2026, 4, 1),  # test campaign increases
    "current_month": _dt.date(2026, 6, 1),  # active blockers
    "as_of": _dt.date(2026, 6, 8),        # AS_OF / "now"
}

# Shift windows (convo.md §11). (label, start_hour, end_hour)
SHIFTS = [("A", 6, 14), ("B", 14, 22), ("C", 22, 6)]


def _stable_int(name: str) -> int:
    """Order-independent 64-bit seed component from a name (not Python's salted hash)."""
    return int.from_bytes(hashlib.blake2b(name.encode("utf-8"), digest_size=8).digest(), "big")


@dataclass
class BuildContext:
    profile: str = "small"
    output_dir: Path = field(default_factory=lambda: Path("output"))
    volume: dict[str, Any] = field(default_factory=dict)
    scenario: dict[str, Any] = field(default_factory=dict)
    defects: dict[str, Any] = field(default_factory=dict)
    noise: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(cls, profile: str = "small", output_dir: str | Path = "output") -> "BuildContext":
        vol = _load_yaml("volume_config.yaml")
        if profile not in vol.get("profiles", {}):
            raise ValueError(f"unknown profile {profile!r}; have {sorted(vol.get('profiles', {}))}")
        ctx = cls(
            profile=profile,
            output_dir=Path(output_dir),
            volume=vol["profiles"][profile],
            scenario=_load_yaml("scenario_config.yaml"),
            defects=_load_yaml("defect_patterns.yaml"),
            noise=_load_yaml("source_system_noise.yaml"),
        )
        return ctx

    # --- deterministic RNG --------------------------------------------------
    def rng(self, table: str) -> np.random.Generator:
        """A dedicated, reproducible Generator for `table` (order-independent)."""
        ss = np.random.SeedSequence([MASTER_SEED, _stable_int(table)])
        return np.random.Generator(np.random.PCG64(ss))

    # --- volumes ------------------------------------------------------------
    def n(self, key: str, default: int | None = None) -> int:
        if key in self.volume:
            return int(self.volume[key])
        if default is not None:
            return default
        raise KeyError(f"volume key {key!r} not in profile {self.profile!r}")

    # --- timeline helpers ---------------------------------------------------
    @property
    def as_of(self) -> _dt.date:
        return TIMELINE["as_of"]

    @property
    def start(self) -> _dt.date:
        return TIMELINE["start"]

    def days_span(self) -> int:
        return (self.as_of - self.start).days

    def date_at(self, day_offset: int) -> _dt.date:
        return self.start + _dt.timedelta(days=int(day_offset))


def _load_yaml(name: str) -> dict[str, Any]:
    with open(_CONFIG_DIR / name, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}

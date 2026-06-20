"""Versioned offline calibration evidence registry for event families."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from app.services.hr_polymarket.forecast import CalibrationEvidence


class FamilyCalibration(BaseModel):
    p_base: float
    evidence: CalibrationEvidence
    backtest_version: str
    generated_at: str
    data_lineage: dict = Field(default_factory=dict)


class CalibrationRegistry:
    def __init__(self, families: dict[str, FamilyCalibration] | None = None) -> None:
        self.families = families or {}

    @classmethod
    def from_path(cls, path: str) -> "CalibrationRegistry":
        if not path:
            return cls()
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        raw_families = payload.get("families")
        if not isinstance(raw_families, dict):
            raise ValueError("calibration artifact missing families object")
        return cls(
            {
                family: FamilyCalibration.model_validate(value)
                for family, value in raw_families.items()
            }
        )

    def get(self, family: str | None) -> FamilyCalibration | None:
        return self.families.get(family or "")

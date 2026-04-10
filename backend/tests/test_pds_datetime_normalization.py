from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path


def test_datetime_normalization_coerces_naive_aware_and_date_values():
    from app.services.datetime_normalization import coerce_utc_datetime, serialize_utc_datetime

    naive = datetime(2026, 4, 9, 10, 30, 0)
    aware = datetime(2026, 4, 9, 10, 30, 0, tzinfo=timezone.utc)
    from_date = date(2026, 4, 9)

    assert coerce_utc_datetime(naive).tzinfo == timezone.utc
    assert coerce_utc_datetime(aware).tzinfo == timezone.utc
    assert coerce_utc_datetime(from_date).isoformat() == "2026-04-09T00:00:00+00:00"
    assert serialize_utc_datetime("2026-04-09T10:30:00Z") == "2026-04-09T10:30:00+00:00"


def test_pds_services_do_not_use_raw_datetime_shortcuts():
    root = Path(__file__).resolve().parents[1]
    targets = [
        root / "app" / "services" / "pds.py",
        root / "app" / "services" / "pds_enterprise.py",
        root / "app" / "services" / "pds_executive" / "decision_engine.py",
        root / "app" / "services" / "pds_executive" / "narrative.py",
    ]
    forbidden_patterns = [
        "datetime.utcnow(",
        "datetime.min",
        ".replace(\"Z\", \"+00:00\")",
    ]

    for path in targets:
        text = path.read_text()
        for pattern in forbidden_patterns:
            assert pattern not in text, f"{path} contains forbidden datetime pattern: {pattern}"

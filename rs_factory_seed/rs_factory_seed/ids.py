"""Stable, human-readable ID formatters (convo.md §7 examples).

Readable joins matter for the demo, e.g. VEH-TR-003, PART-ENG-VALVE-014-REV-C,
SN-VALVE-014-000392, WO-2026-004829, OPX-2026-093012, NCR-2026-000442,
TEST-HOTFIRE-2026-00088, ML-8821, WLD-07, MFG-1842.
"""

from __future__ import annotations


def facility(n: int) -> str:
    return f"FAC-{n:02d}"


def work_center(n: int) -> str:
    return f"WC-{n:02d}"


def machine(kind: str, n: int) -> str:
    # kind ∈ {PRN, WLD, CNC, TS, CMM, TRQ}
    return f"{kind}-{n:02d}"


def operator(n: int) -> str:
    return f"OP-{n:04d}"


def supplier(n: int) -> str:
    return f"SUP-{n:03d}"


def customer(n: int) -> str:
    return f"CUST-{n:02d}"


def vehicle(n: int) -> str:
    return f"VEH-TR-{n:03d}"


def part(family: str, n: int) -> str:
    # family ∈ {ENG-VALVE, ENG-CHAMBER, STR-BRACKET, AVI-HARNESS, SEN-ASSY, TANK, ...}
    return f"PART-{family}-{n:03d}"


def revision(part_id: str, rev: str) -> str:
    return f"{part_id}-REV-{rev}"


def serial(part_short: str, n: int) -> str:
    return f"SN-{part_short}-{n:06d}"


def work_order(year: int, n: int) -> str:
    return f"WO-{year}-{n:06d}"


def operation(year: int, n: int) -> str:
    return f"OPX-{year}-{n:06d}"


def ncr(year: int, n: int) -> str:
    return f"NCR-{year}-{n:06d}"


def test_run(kind: str, year: int, n: int) -> str:
    # kind ∈ {HOTFIRE, PRESSURE, VIBRATION, ACCEPTANCE}
    return f"TEST-{kind}-{year}-{n:05d}"


def material_lot(n: int) -> str:
    return f"ML-{n:04d}"


def jira(n: int) -> str:
    return f"MFG-{n:04d}"


def mission(year: int, n: int) -> str:
    return f"MIS-{year}-{n:03d}"


def payload_commitment(n: int) -> str:
    return f"PLD-{n:04d}"


def build_plan(n: int) -> str:
    return f"VBP-{n:03d}"


def milestone(n: int) -> str:
    return f"MS-{n:04d}"


def eco(year: int, n: int) -> str:
    return f"ECO-{year}-{n:04d}"


def spec(n: int) -> str:
    return f"SPEC-{n:04d}"

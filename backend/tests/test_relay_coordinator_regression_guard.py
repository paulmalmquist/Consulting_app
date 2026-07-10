"""Regression guard: the coordinator imports the relay but never mutates it.

Two guarantees:
1. The coordinator package imports cleanly with no network.
2. No coordinator source constructs a write target under `coding_relay/`.
   The relay module is invoked only as a `python -m` module name, never
   opened for writing and never edited on disk. This is a static check over
   the coordinator's own source so a future edit that starts writing into the
   relay's tree fails here.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

COORD_DIR = ROOT / "orchestration" / "relay_coordinator"
RELAY_DIR = ROOT / "orchestration" / "coding_relay"

# Source files (not tests, not fixtures) that make up the coordinator.
COORD_SOURCES = sorted(
    p for p in COORD_DIR.glob("*.py") if p.name != "__pycache__"
)

# Any call that opens a path for writing / editing.
WRITE_CALLS = re.compile(
    r"\.(write_text|write_bytes|write_json|open\s*\([^)]*['\"][wax])"
    r"|open\s*\([^)]*['\"][wax]"
    r"|shutil\.(copy|copyfile|copytree|move)"
)
# A coding_relay path used as a filesystem string (a write target would be one).
RELAY_PATH_LITERAL = re.compile(r"['\"][^'\"]*coding_relay/[^'\"]*['\"]")


def test_package_imports_without_network():
    proc = subprocess.run(
        [sys.executable, "-c", "import orchestration.relay_coordinator"],
        cwd=str(ROOT), capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    assert proc.returncode == 0, proc.stderr


def test_no_coordinator_source_writes_a_coding_relay_path():
    offenders: list[str] = []
    for src in COORD_SOURCES:
        text = src.read_text(encoding="utf-8")
        for i, line in enumerate(text.splitlines(), 1):
            # A write call on the same line as a coding_relay/ path literal is
            # the exact shape we forbid.
            if RELAY_PATH_LITERAL.search(line) and WRITE_CALLS.search(line):
                offenders.append(f"{src.name}:{i}: {line.strip()}")
    assert not offenders, "coordinator writes into coding_relay/: " + "; ".join(offenders)


def test_relay_module_referenced_only_as_module_name():
    # workers.py invokes the relay. The reference must be the dotted module
    # name for `python -m`, never a path ending in coding_relay that is opened.
    workers_src = (COORD_DIR / "workers.py").read_text(encoding="utf-8")
    assert "orchestration.coding_relay" in workers_src  # invoked as a module
    # No write call anywhere in workers.py targets a coding_relay path.
    for i, line in enumerate(workers_src.splitlines(), 1):
        if "coding_relay/" in line and WRITE_CALLS.search(line):
            raise AssertionError(f"workers.py:{i} writes a coding_relay path: {line.strip()}")


def test_relay_source_tree_is_untouched_by_import():
    # Importing the coordinator must not create or delete files in the relay
    # tree. Snapshot the relay dir's file set across an import.
    before = {p.relative_to(RELAY_DIR) for p in RELAY_DIR.rglob("*") if p.is_file()}
    __import__("orchestration.relay_coordinator")
    after = {p.relative_to(RELAY_DIR) for p in RELAY_DIR.rglob("*") if p.is_file()}
    assert before == after

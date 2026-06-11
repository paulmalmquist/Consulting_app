"""Shared bootstrap for the Stargate streaming tools.

Run from anywhere: inserts the repo root (for ``rs_factory_seed`` — read-only,
owned by the generator PRs), the backend package (for
``app.events.protobuf_codec``), and this directory (for ``proto_gen``) into
``sys.path``, exactly the way scripts/streaming/publish_smoke.py does it.
"""

from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent          # scripts/streaming/stargate
_ROOT = _HERE.parents[2]                          # repo root

for p in (_ROOT / "rs_factory_seed", _ROOT / "backend", _HERE):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


class StargateTopics:
    TELEMETRY = "stargate.printer.telemetry.v1"
    AGG_5S = "stargate.printer.telemetry.agg5s.v1"
    ANOMALIES = "stargate.printer.anomalies.v1"
    DEAD_LETTER = "stargate.printer.dlq.v1"


def telemetry_message_class():
    """The generated protobuf message class (lazy so capture-mode tooling can
    run without the protobuf package installed)."""
    from proto_gen.stargate_telemetry_pb2 import StargateTelemetry

    return StargateTelemetry

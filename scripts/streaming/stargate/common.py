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


# StargateTopics + telemetry_message_class now live in the backend core (so they
# ship in the Railway image); re-export them here so producer.py / bad_producer.py
# keep importing them from `common` unchanged. The sys.path insert above makes
# `app.` importable before this runs.
from app.services.stargate_bridge import (  # noqa: E402,F401
    StargateTopics,
    telemetry_message_class,
)

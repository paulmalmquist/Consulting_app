#!/usr/bin/env python3
"""Thin laptop entrypoint for the Stargate bridge.

The bridge core ships in the backend now (app/services/stargate_bridge.py +
app/routes/stargate_bridge.py) so it deploys with Railway. This wrapper keeps
the laptop workflow unchanged:

    STARGATE_MODE=capture python -m uvicorn bridge:app --port 8100   # no broker
    STARGATE_MODE=local   python -m uvicorn bridge:app --port 8100   # Redpanda
    STARGATE_MODE=cloud   python -m uvicorn bridge:app --port 8100   # Confluent

demo_dryrun.ps1 runs `uvicorn bridge:app` from this dir and needs no changes.
"""

import common  # noqa: F401  (sys.path bootstrap: backend/, repo root, this dir)
from app.routes.stargate_bridge import create_app
from app.services.stargate_bridge import *  # noqa: F401,F403  (back-compat re-exports)

app = create_app()

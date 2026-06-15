"""Re-export shim — the implementation lives in
backend/app/services/stargate_signal_mapping.py so it ships in the Railway image
(the Docker build context is backend/ only).

The producer, capture_fixture, and the test suite import `signal_mapping` from
this scripts dir; this shim resolves to the single backend definition (common.py
has already put backend/ on sys.path). One source, no drift.
"""

import common  # noqa: F401  (sys.path bootstrap: makes `app.` importable)
from app.services.stargate_signal_mapping import *  # noqa: F401,F403

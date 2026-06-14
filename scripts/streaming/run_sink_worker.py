#!/usr/bin/env python3
"""Entrypoint for the observational BigQuery sink worker (Phase 4 / GKE).

Runs the long-running consumer loop (app.events.sink_worker.SinkWorker) with:
  - SIGTERM / SIGINT -> graceful drain (GKE sends SIGTERM on pod shutdown).
  - A tiny stdlib HTTP server exposing /healthz (liveness) and /readyz
    (readiness) for Kubernetes probes — no web framework pulled in.

Env (shared with the producer; see app/events/config.py):
  EVENTS_ENABLED=true
  EVENTS_BROKER_URL=pkc-....confluent.cloud:9092
  EVENTS_SECURITY_PROTOCOL=SASL_SSL
  EVENTS_SASL_MECHANISM=PLAIN
  EVENTS_SASL_USERNAME=<confluent api key>
  EVENTS_SASL_PASSWORD=<confluent api secret>
  EVENTS_CONSUMER_GROUP=winston-bq-sink         # default
  EVENTS_CONSUMER_TOPICS=winston.executions.v1  # default
  BQ_ENABLED=true
  BQ_PROJECT_ID=<gcp project>
  # GKE: BigQuery auth via Workload Identity (no key file). Locally: ADC.

  HEALTH_PORT=8080   # probe server port (default 8080)

Usage (local, against Confluent or Redpanda):
  python scripts/streaming/run_sink_worker.py
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.events.sink_worker import HealthState, SinkWorker  # noqa: E402

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("run_sink_worker")


def _make_health_handler(health: HealthState):
    class _Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):  # noqa: ARG002 — silence default access log
            pass

        def do_GET(self):  # noqa: N802 — BaseHTTPRequestHandler API
            if self.path == "/healthz":
                ok = health.alive
            elif self.path == "/readyz":
                ok = health.ready
            else:
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200 if ok else 503)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok" if ok else b"unavailable")

    return _Handler


def _start_health_server(health: HealthState) -> ThreadingHTTPServer:
    port = int(os.getenv("HEALTH_PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), _make_health_handler(health))
    thread = threading.Thread(target=server.serve_forever, name="health", daemon=True)
    thread.start()
    logger.info("health server on :%d (/healthz, /readyz)", port)
    return server


def main() -> int:
    health = HealthState()
    worker = SinkWorker(health=health)

    def _on_signal(signum, _frame):
        logger.info("received signal %s -> graceful drain", signum)
        worker.request_stop()

    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    health_server = _start_health_server(health)
    try:
        worker.run()
    finally:
        health_server.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Test Telemetry Go/No-Go Control Tower (MVP vertical slice).

Composes existing infrastructure into one governed flow:

    telemetry verdict (telemetry_serving.score_window)
        -> sensitivity-routed triage (ai_dispatch, scoped registry)
        -> ENFORCED human go/no-go gate (approve / reject / request_more_evidence)
        -> Ed25519-signed, hash-chained decision receipt
        -> verify endpoint

Plus a Gemma-on-Vertex private-tier lifecycle (warm / probe / teardown) so the in-boundary inference
tier can be readied before a demo and torn down after without leaving a GPU billing overnight.

Owning surface: backend/app/services/control_tower/, backend/app/routes/telemetry_control_tower.py,
repo-b/src/app/lab/env/[envId]/telemetry/control-tower/. Tables: tel_ct_* (migration 10016).
"""
from __future__ import annotations

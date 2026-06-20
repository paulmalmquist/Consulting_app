"""Simulated non-prod execution for ADE Ops (PR 5B).

Proves the approved-execution ceremony end-to-end — approval → preflight →
execute → receipt → observation window → (optional) rollback — against a
SIMULATED executor only. Real providers remain impossible: there is no provider
client, no subprocess, no CLI here, and only `execution_mode='simulation'` has an
executor at all. A real mode ('nonprod'/'prod') returns blocked with
`real_execution_not_enabled` (the real, fully-gated path lands in PR 5C).

This module deliberately does NOT flip `approvals.EXECUTION_ENABLED` (still False)
— real execution stays off. Simulation is a separate, explicitly-labelled,
non-provider capability.
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from app.services.ade_ops.approvals import (
    ApprovalRequest,
    ApprovalState,
    refresh_state,
    run_preflight,
)

# The only executor mode that exists in PR 5B. Real modes have no code path.
SIMULATION_MODE = "simulation"
REAL_MODES = ("nonprod", "prod")


class SimOutcome(StrEnum):
    SIMULATED = "simulated"
    BLOCKED = "blocked"


def _blocked(reason: str) -> dict:
    return {"outcome": SimOutcome.BLOCKED.value, "executed": False,
            "execution_mode": None, "reason": reason}


def simulate_execution(req: ApprovalRequest, *, mode: str, now: datetime) -> dict:
    """Run the simulated execution ceremony. Returns a result dict; mutates `req`
    only to record the simulated execution state (executed=True is allowed for
    simulation only). Never touches a provider.

    Gates, in order: mode must be 'simulation' (real modes blocked) → approved →
    preflight passes. Any failure → blocked, executed stays False.
    """
    if mode in REAL_MODES:
        # PR 5B has no real executor — the real path is PR 5C, fully gated.
        return _blocked("real_execution_not_enabled")
    if mode != SIMULATION_MODE:
        return _blocked(f"unknown_execution_mode:{mode}")

    refresh_state(req, now)
    if req.state is not ApprovalState.APPROVED:
        return _blocked(f"not_approved:{req.state.value}")

    pf = req.preflight or run_preflight(req)
    if not pf.passed:
        return _blocked(f"preflight_failed:{','.join(pf.missing)}")

    # Simulated "execution" — a deterministic description of what WOULD happen.
    # No provider client, no command, no subprocess. Purely a paper-trail event.
    req.executed = True                      # allowed ONLY because mode is simulation
    plan = [
        f"[SIMULATION] would address {req.category or 'finding'} on "
        f"{req.provider or 'unknown'}:{req.target_ref or 'unknown'}",
        f"[SIMULATION] rollback plan on file: {req.rollback_plan or 'none'}",
        f"[SIMULATION] observation window: {req.observation_window or 'none'}",
        "[SIMULATION] no provider command issued; no infrastructure changed.",
    ]
    return {
        "outcome": SimOutcome.SIMULATED.value,
        "executed": True,
        "execution_mode": SIMULATION_MODE,
        "executed_at": now.isoformat(),
        "observation_window_opened_at": now.isoformat(),
        "simulated_plan": plan,
        "reason": "ok",
        "note": "Simulated only. PR 5B touches no provider; a real, fully-gated write is PR 5C.",
    }


def simulate_rollback(req: ApprovalRequest, *, now: datetime) -> dict:
    """Record a simulated rollback. Requires a rollback plan on file. Touches no
    provider — it is a paper-trail event mirroring the simulated execution."""
    if not req.rollback_plan:
        return _blocked("no_rollback_plan")
    if not req.executed:
        return _blocked("nothing_to_roll_back")
    return {
        "outcome": SimOutcome.SIMULATED.value,
        "execution_mode": SIMULATION_MODE,
        "rolled_back": True,
        "rolled_back_at": now.isoformat(),
        "simulated_plan": [
            f"[SIMULATION] would roll back via: {req.rollback_plan}",
            "[SIMULATION] no provider command issued; no infrastructure changed.",
        ],
        "reason": "ok",
    }

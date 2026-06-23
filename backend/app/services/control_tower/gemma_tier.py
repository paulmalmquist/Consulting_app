"""Gemma-on-Vertex private-tier lifecycle (warm / probe / teardown).

The in-boundary inference tier is expensive to leave hot (an idle L4 endpoint bills ~$1/hr), so it is
COLD by default. Before a demo an operator warms it; after, they tear it down. This module is the
governed control surface for that lifecycle.

Safety posture (every guard must pass for warm/teardown to EXECUTE):
  * operator role,
  * CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED=true,
  * an explicit confirmation token in the request,
  * audit receipt (recorded by the route via governance),
  * production disabled unless CONTROL_TOWER_GEMMA_LIFECYCLE_ALLOW_PROD=true (when CONTROL_TOWER_IS_PROD=true).

Warm/teardown are ASYNC: the request creates a job row and returns immediately; the actual 6-20 min
Vertex call runs in a background task. Vertex `endpoint.deployedModels` is the source of truth for
billing state — DB state is only a cache. Teardown is "torn_down" only when Vertex reports zero deployed
models.

Probe is READ-ONLY and always safe. If no GEMMA_VERTEX_* config is present the tier reports `unavailable`
(fail closed); if configured but no model is deployed it reports `cold`.

Reuses the proven SDK calls from scripts/gemma_vertex_stage/{deploy,teardown}.py — but teardown here
stops at `undeploy_all` (keeps the endpoint + model + stable endpoint id/config for fast re-warm).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from app.db import get_telemetry_cursor as get_cursor

logger = logging.getLogger(__name__)

WARM_CONFIRM = "WARM-GEMMA"
TEARDOWN_CONFIRM = "TEARDOWN-GEMMA"
L4_HOURLY_USD = 1.0  # approx NVIDIA L4 serving-node cost (per the gemma-vertex-stage skill)
_GVS_MODEL = "google/gemma3@gemma-3-1b-it"
_GVS_MACHINE = "g2-standard-12"
_GVS_ACCEL = "NVIDIA_L4"
_VERTEX_TIMEOUT_S = 30.0


class LifecyclePermissionError(PermissionError):
    """Raised when a warm/teardown request fails the safety guard."""


# ── config / flags (read at call time so tests can monkeypatch) ──────

def _flag(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() == "true"


def _vertex_config() -> dict:
    from app import config

    return {
        "project_id": getattr(config, "GEMMA_VERTEX_PROJECT_ID", "") or "",
        "location": getattr(config, "GEMMA_VERTEX_LOCATION", "") or "us-central1",
        "endpoint_id": getattr(config, "GEMMA_VERTEX_ENDPOINT_ID", "") or "",
        "dedicated_dns": getattr(config, "GEMMA_VERTEX_DEDICATED_DNS", "") or "",
    }


def _configured(cfg: dict) -> bool:
    return bool(cfg["project_id"] and cfg["endpoint_id"])


def _guard(*, action: str, is_operator: bool, confirm: str | None) -> None:
    if not is_operator:
        raise LifecyclePermissionError("operator role required for Gemma lifecycle actions")
    if not _flag("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED"):
        raise LifecyclePermissionError(
            "Gemma lifecycle disabled — set CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED=true to enable"
        )
    if _flag("CONTROL_TOWER_IS_PROD") and not _flag("CONTROL_TOWER_GEMMA_LIFECYCLE_ALLOW_PROD"):
        raise LifecyclePermissionError(
            "production lifecycle disabled — set CONTROL_TOWER_GEMMA_LIFECYCLE_ALLOW_PROD=true to allow"
        )
    expected = WARM_CONFIRM if action == "warm" else TEARDOWN_CONFIRM
    if confirm != expected:
        raise LifecyclePermissionError(f"confirmation token must be '{expected}'")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Vertex probe (read-only, safe) ──────────────────────────────────

def _probe_vertex(cfg: dict) -> dict:
    """GET the endpoint resource and count deployedModels. Best-effort; never raises.

    Returns {ok, deployed_model_count, dedicated_dns, error}. ok=False with an error string when ADC or
    config is unavailable — the caller maps that to `unavailable` (fail closed)."""
    if not _configured(cfg):
        return {"ok": False, "deployed_model_count": 0, "dedicated_dns": cfg["dedicated_dns"],
                "error": "GEMMA_VERTEX_* not configured"}
    try:
        import google.auth
        import httpx
        from google.auth.transport.requests import Request as GoogleAuthRequest

        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        creds.refresh(GoogleAuthRequest())
        host = cfg["dedicated_dns"] or f"{cfg['location']}-aiplatform.googleapis.com"
        url = (f"https://{host}/v1/projects/{cfg['project_id']}/locations/{cfg['location']}/"
               f"endpoints/{cfg['endpoint_id']}")
        with httpx.Client(timeout=_VERTEX_TIMEOUT_S) as client:
            resp = client.get(url, headers={"Authorization": f"Bearer {creds.token}"})
        if resp.status_code >= 400:
            return {"ok": False, "deployed_model_count": 0, "dedicated_dns": cfg["dedicated_dns"],
                    "error": f"vertex returned {resp.status_code}"}
        data = resp.json()
        deployed = data.get("deployedModels") or []
        return {"ok": True, "deployed_model_count": len(deployed),
                "dedicated_dns": data.get("dedicatedEndpointDns") or cfg["dedicated_dns"], "error": None}
    except Exception as exc:  # noqa: BLE001 — missing ADC / SDK / network ⇒ unavailable, never raise
        return {"ok": False, "deployed_model_count": 0, "dedicated_dns": cfg["dedicated_dns"],
                "error": f"{type(exc).__name__}: {exc}"}


# ── state row ────────────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    out = dict(row)
    for k in ("id", "business_id", "active_job_id"):
        if out.get(k) is not None:
            out[k] = str(out[k])
    for k in ("last_warmed_at", "last_teardown_at", "last_probe_at", "idle_since", "updated_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


def _get_or_create_row(cur, env_id: str, business_id: str, cfg: dict) -> dict:
    cur.execute(
        "SELECT * FROM tel_ct_gemma_state WHERE env_id = %s AND business_id = %s",
        (env_id, business_id),
    )
    row = cur.fetchone()
    if row:
        return row
    initial = "cold" if _configured(cfg) else "unavailable"
    cur.execute(
        """INSERT INTO tel_ct_gemma_state
             (env_id, business_id, status, endpoint_id, dedicated_dns, region, project_id, model_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (env_id, business_id) DO UPDATE SET updated_at = now()
           RETURNING *""",
        (env_id, business_id, initial, cfg["endpoint_id"], cfg["dedicated_dns"],
         cfg["location"], cfg["project_id"], _GVS_MODEL),
    )
    return cur.fetchone()


def _est_cost(status: str, last_warmed_at) -> float:
    if status != "live" or not last_warmed_at:
        return 0.0
    hours = (_now() - last_warmed_at).total_seconds() / 3600.0
    return round(max(0.0, hours) * L4_HOURLY_USD, 4)


def get_state(*, env_id: str, business_id: str | UUID) -> dict:
    """Cached lifecycle state (no external call). Use probe() to refresh from Vertex."""
    business_id = str(business_id)
    cfg = _vertex_config()
    with get_cursor() as cur:
        row = _get_or_create_row(cur, env_id, business_id, cfg)
    out = _serialize(row)
    out["est_active_cost_usd"] = _est_cost(row["status"], row.get("last_warmed_at"))
    out["confirm_tokens"] = {"warm": WARM_CONFIRM, "teardown": TEARDOWN_CONFIRM}
    out["lifecycle_enabled"] = _flag("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED")
    return out


def probe(*, env_id: str, business_id: str | UUID) -> dict:
    """Refresh state from Vertex (read-only). Sets status to live/cold/unavailable from deployedModels."""
    business_id = str(business_id)
    cfg = _vertex_config()
    result = _probe_vertex(cfg)
    deployed = result["deployed_model_count"]
    with get_cursor() as cur:
        row = _get_or_create_row(cur, env_id, business_id, cfg)
        # Don't override an in-flight transition (warming_requested/warming/teardown_requested/tearing_down).
        in_flight = row["status"] in (
            "warming_requested", "warming", "teardown_requested", "tearing_down",
        )
        if not _configured(cfg):
            status = "unavailable"
        elif not result["ok"]:
            status = "unavailable" if not in_flight else row["status"]
        elif deployed > 0:
            status = "live"
        else:
            status = "torn_down" if row["status"] in ("tearing_down", "teardown_requested") else "cold"
        teardown_verification = (
            "verified" if (row["status"] in ("tearing_down", "teardown_requested") and deployed == 0)
            else ("failed" if row["status"] in ("tearing_down", "teardown_requested") else
                  row.get("teardown_verification"))
        )
        cur.execute(
            """UPDATE tel_ct_gemma_state
                  SET status = %s, deployed_model_count = %s, dedicated_dns = COALESCE(%s, dedicated_dns),
                      teardown_verification = %s, last_probe_at = %s, last_error = %s, updated_at = now()
                WHERE env_id = %s AND business_id = %s
                RETURNING *""",
            (status, deployed, result.get("dedicated_dns"), teardown_verification, _now(),
             result.get("error"), env_id, business_id),
        )
        row = cur.fetchone()
    out = _serialize(row)
    out["est_active_cost_usd"] = _est_cost(row["status"], row.get("last_warmed_at"))
    out["probe_ok"] = result["ok"]
    return out


# ── async job creation (guarded) ─────────────────────────────────────

def _create_job(cur, env_id: str, business_id: str, action: str, requested_by: str) -> dict:
    cur.execute(
        """INSERT INTO tel_ct_gemma_job (env_id, business_id, action, status, requested_by)
           VALUES (%s,%s,%s,'queued',%s) RETURNING *""",
        (env_id, business_id, action, requested_by),
    )
    return cur.fetchone()


def request_warm(*, env_id: str, business_id: str | UUID, requested_by: str,
                 is_operator: bool, confirm: str | None) -> dict:
    """Guarded. Creates a warm job + flips state to warming_requested. Returns {job_id, status}.
    The caller schedules run_job(job_id) in the background."""
    _guard(action="warm", is_operator=is_operator, confirm=confirm)
    business_id = str(business_id)
    cfg = _vertex_config()
    with get_cursor() as cur:
        _get_or_create_row(cur, env_id, business_id, cfg)
        job = _create_job(cur, env_id, business_id, "warm", requested_by)
        cur.execute(
            "UPDATE tel_ct_gemma_state SET status = 'warming_requested', active_job_id = %s, "
            "updated_at = now() WHERE env_id = %s AND business_id = %s",
            (job["id"], env_id, business_id),
        )
    return {"job_id": str(job["id"]), "status": "warming_requested"}


def request_teardown(*, env_id: str, business_id: str | UUID, requested_by: str,
                     is_operator: bool, confirm: str | None) -> dict:
    _guard(action="teardown", is_operator=is_operator, confirm=confirm)
    business_id = str(business_id)
    cfg = _vertex_config()
    with get_cursor() as cur:
        _get_or_create_row(cur, env_id, business_id, cfg)
        job = _create_job(cur, env_id, business_id, "teardown", requested_by)
        cur.execute(
            "UPDATE tel_ct_gemma_state SET status = 'teardown_requested', active_job_id = %s, "
            "teardown_verification = 'pending', updated_at = now() WHERE env_id = %s AND business_id = %s",
            (job["id"], env_id, business_id),
        )
    return {"job_id": str(job["id"]), "status": "teardown_requested"}


def list_jobs(*, env_id: str, business_id: str | UUID, limit: int = 20) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM tel_ct_gemma_job WHERE env_id = %s AND business_id = %s "
            "ORDER BY created_at DESC LIMIT %s",
            (env_id, str(business_id), limit),
        )
        rows = cur.fetchall()
    jobs = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        d["business_id"] = str(d["business_id"])
        for k in ("created_at", "updated_at"):
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
        jobs.append(d)
    return jobs


# ── background job runner (blocking Vertex work; gated again) ─────────

def _set_job(cur, job_id, status, *, error=None, detail=None):
    cur.execute(
        "UPDATE tel_ct_gemma_job SET status=%s, error=%s, detail=COALESCE(%s::jsonb, detail), "
        "updated_at=now() WHERE id=%s",
        (status, error, json.dumps(detail) if detail is not None else None, job_id),
    )


def _set_state(cur, env_id, business_id, **f):
    cols = ", ".join(f"{k} = %s" for k in f)
    cur.execute(
        f"UPDATE tel_ct_gemma_state SET {cols}, updated_at = now() WHERE env_id=%s AND business_id=%s",
        (*f.values(), env_id, business_id),
    )


def run_job(job_id: str) -> dict:
    """Execute a queued warm/teardown job (blocking). Intended to run in a background thread.

    Re-checks the lifecycle flag (defense in depth) and fails closed if disabled. NEVER provisions GPU
    unless CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED=true."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM tel_ct_gemma_job WHERE id = %s", (job_id,))
        job = cur.fetchone()
    if job is None:
        return {"job_id": job_id, "status": "failed", "error": "job not found"}
    env_id, business_id, action = job["env_id"], str(job["business_id"]), job["action"]

    if not _flag("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED"):
        with get_cursor() as cur:
            _set_job(cur, job_id, "failed", error="lifecycle disabled")
            _set_state(cur, env_id, business_id, status="failed",
                       last_error="lifecycle disabled at run time")
        return {"job_id": job_id, "status": "failed", "error": "lifecycle disabled"}

    cfg = _vertex_config()
    try:
        if action == "warm":
            with get_cursor() as cur:
                _set_job(cur, job_id, "running")
                _set_state(cur, env_id, business_id, status="warming")
            detail = _deploy_gemma(cfg)
            with get_cursor() as cur:
                _set_job(cur, job_id, "succeeded", detail=detail)
                _set_state(cur, env_id, business_id, status="live",
                           endpoint_id=detail.get("endpoint_id") or cfg["endpoint_id"],
                           dedicated_dns=detail.get("dedicated_dns") or cfg["dedicated_dns"],
                           deployed_model_count=1, last_warmed_at=_now(), idle_since=_now(),
                           last_error=None)
            return {"job_id": job_id, "status": "succeeded"}

        # teardown
        with get_cursor() as cur:
            _set_job(cur, job_id, "running")
            _set_state(cur, env_id, business_id, status="tearing_down")
        detail = _teardown_gemma(cfg)
        # Vertex is the truth: re-probe to confirm zero deployed models.
        verify = _probe_vertex(cfg)
        verified = verify["ok"] and verify["deployed_model_count"] == 0
        with get_cursor() as cur:
            _set_job(cur, job_id, "succeeded" if verified else "failed",
                     error=None if verified else "deployedModels not empty after undeploy",
                     detail={**detail, "verify": verify})
            _set_state(cur, env_id, business_id,
                       status="torn_down" if verified else "failed",
                       deployed_model_count=verify["deployed_model_count"],
                       teardown_verification="verified" if verified else "failed",
                       last_teardown_at=_now(), idle_since=None, est_active_cost_usd=0.0,
                       last_error=None if verified else "deployedModels not empty")
        return {"job_id": job_id, "status": "succeeded" if verified else "failed"}

    except Exception as exc:  # noqa: BLE001 — surface failure on the job + state, never crash the worker
        logger.exception("gemma lifecycle job %s (%s) failed", job_id, action)
        with get_cursor() as cur:
            _set_job(cur, job_id, "failed", error=f"{type(exc).__name__}: {exc}")
            _set_state(cur, env_id, business_id, status="failed", last_error=f"{type(exc).__name__}: {exc}")
        return {"job_id": job_id, "status": "failed", "error": str(exc)}


def _deploy_gemma(cfg: dict) -> dict:
    """Deploy the smallest Gemma to the configured endpoint (reuses scripts/gemma_vertex_stage/deploy)."""
    import vertexai
    from vertexai.preview import model_garden

    vertexai.init(project=cfg["project_id"], location=cfg["location"])
    model = model_garden.OpenModel(_GVS_MODEL)
    endpoint = model.deploy(
        accept_eula=True, machine_type=_GVS_MACHINE, accelerator_type=_GVS_ACCEL,
        accelerator_count=1, endpoint_display_name="control-tower-gemma",
        model_display_name="control-tower-gemma",
    )
    ep_id = endpoint.resource_name.rsplit("/", 1)[-1]
    return {"endpoint_id": ep_id, "dedicated_dns": cfg["dedicated_dns"]}


def _teardown_gemma(cfg: dict) -> dict:
    """Undeploy ALL models from the endpoint (stops GPU billing). KEEPS the endpoint + model + config so
    the endpoint id / dedicated DNS stay stable for a fast re-warm."""
    from google.cloud import aiplatform

    aiplatform.init(project=cfg["project_id"], location=cfg["location"])
    ep = aiplatform.Endpoint(cfg["endpoint_id"])
    ep.undeploy_all(sync=True)  # NOT ep.delete() — endpoint resource is retained
    return {"action": "undeploy_all", "endpoint_id": cfg["endpoint_id"], "endpoint_retained": True}

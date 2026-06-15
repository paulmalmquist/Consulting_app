"""Investigation Session service (plan PR 6) — streaming, pausable, deterministic-first.

Owns nv_analysis_sessions / nv_analysis_session_events / nv_analysis_session_eval_results.

Honest pause: the SSE generator re-reads active_run_token from a fresh cursor BEFORE
every section step and before every event yield. Pause is a single atomic UPDATE that
captures the old token into invalidated_run_tokens and nulls active_run_token under a
WHERE status='running' guard; a generator whose minted token != active_run_token aborts
(RunTokenInvalidated). No background tasks — the generator is the only worker, fully
cancellable on client disconnect.

Deterministic-first: sections come from analysis_sections (real queried numbers only);
NO LLM; cost_estimate stays NULL; narration_text stays NULL.

No module-level I/O: get_cursor and all source calls happen inside functions only.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import AsyncIterator
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import analysis_sections, analysis_evals


class RunTokenInvalidated(Exception):
    """Raised inside the generator when the session's active_run_token no longer
    matches the token this run was minted with — i.e. a pause/cancel/fork happened."""


def _set_tenant(cur, env_id: str) -> None:
    cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True, default=str)}\n\n"


def _row_to_session(r: dict) -> dict:
    return {
        "id": str(r["id"]),
        "env_id": r["env_id"],
        "parent_session_id": str(r["parent_session_id"]) if r.get("parent_session_id") else None,
        "title": r["title"],
        "objective": r.get("objective"),
        "status": r["status"],
        "plan": r.get("plan") or {},
        "plan_version": r.get("plan_version", 1),
        "sections": r.get("sections") or [],
        "last_completed_section": r.get("last_completed_section"),
        "deliverable_card_id": str(r["deliverable_card_id"]) if r.get("deliverable_card_id") else None,
        "artifact_pointers": r.get("artifact_pointers") or [],
        "confidence": float(r["confidence"]) if r.get("confidence") is not None else None,
        "null_reasons": r.get("null_reasons") or [],
        "latency_ms": r.get("latency_ms"),
        "cost_estimate": float(r["cost_estimate"]) if r.get("cost_estimate") is not None else None,
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        "completed_at": r["completed_at"].isoformat() if r.get("completed_at") else None,
    }


# ── create / read ─────────────────────────────────────────────────────────────
def create_session(env_id: str, business_id: str | UUID, *, title: str,
                   objective: str | None = None, source_ref: dict | None = None,
                   parent_session_id: str | None = None, created_by: str = "system") -> dict:
    """Create a session in 'created' status quickly; the stream does the work later."""
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """INSERT INTO nv_analysis_sessions
                   (env_id, business_id, title, objective, status, plan, parent_session_id, created_by)
               VALUES (%s, %s, %s, %s, 'created', %s, %s, %s)
               RETURNING *""",
            (env_id, str(business_id), title.strip(), _redact(objective),
             json.dumps(_initial_plan()), parent_session_id, created_by),
        )
        row = _row_to_session(cur.fetchone())
    _record_event(env_id, business_id, row["id"], "session.created", None,
                  {"session_id": row["id"], "title": row["title"], "status": "created"})
    return row


def get_session_state(env_id: str, business_id: str | UUID, session_id: str | UUID) -> dict | None:
    """Tenant-scoped read. Returns None when no row is visible (caller 404s) — a
    cross-env probe gets 404, never a 200-with-null."""
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute("SELECT * FROM nv_analysis_sessions WHERE env_id = %s AND id = %s",
                    (env_id, str(session_id)))
        row = cur.fetchone()
        if not row:
            return None
        session = _row_to_session(row)
        cur.execute(
            """SELECT seq, run_token, event_type, payload, audit_event_id, created_at
               FROM nv_analysis_session_events WHERE session_id = %s ORDER BY seq ASC""",
            (str(session_id),),
        )
        session["events"] = [
            {"seq": e["seq"], "event_type": e["event_type"], "payload": e.get("payload") or {},
             "created_at": e["created_at"].isoformat() if e.get("created_at") else None}
            for e in cur.fetchall()
        ]
    return session


def list_sessions(env_id: str, business_id: str | UUID, *, limit: int = 50) -> list[dict]:
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """SELECT * FROM nv_analysis_sessions
               WHERE env_id = %s ORDER BY created_at DESC LIMIT %s""",
            (env_id, limit),
        )
        return [_row_to_session(r) for r in cur.fetchall()]


# ── pause / resume / steer / fork (control plane) ─────────────────────────────
def pause_session(env_id: str, business_id: str | UUID, session_id: str | UUID,
                  *, actor: str = "system") -> dict:
    """Atomic pause: capture the live token into invalidated_run_tokens and null it,
    only if currently running. Double-pause / not-running is a no-op (0 rows)."""
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """UPDATE nv_analysis_sessions
               SET invalidated_run_tokens =
                       CASE WHEN active_run_token IS NOT NULL
                            THEN array_append(invalidated_run_tokens, active_run_token)
                            ELSE invalidated_run_tokens END,
                   active_run_token = NULL,
                   status = 'paused',
                   updated_at = now()
               WHERE env_id = %s AND id = %s AND status = 'running'
               RETURNING last_completed_section""",
            (env_id, str(session_id)),
        )
        updated = cur.fetchone()
    if not updated:
        # Either unknown id (cross-env -> RLS hid it) or not running.
        if get_session_state(env_id, business_id, session_id) is None:
            return {"status": "not_found"}
        return {"status": "not_running"}
    _record_event(env_id, business_id, str(session_id), "user.pause_requested", None,
                  {"requested_by": actor})
    _record_event(env_id, business_id, str(session_id), "session.paused", None,
                  {"reason": "user_requested", "last_completed_section": updated["last_completed_section"]})
    return {"status": "paused", "last_completed_section": updated["last_completed_section"]}


def resume_session(env_id: str, business_id: str | UUID, session_id: str | UUID) -> dict:
    """Mint a NEW run token and flip to running, only from paused. The stream picks up
    after last_completed_section."""
    new_token = str(uuid.uuid4())
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """UPDATE nv_analysis_sessions
               SET active_run_token = %s, status = 'running', resumed_at = now(), updated_at = now()
               WHERE env_id = %s AND id = %s AND status = 'paused'
               RETURNING last_completed_section""",
            (new_token, env_id, str(session_id)),
        )
        updated = cur.fetchone()
    if not updated:
        if get_session_state(env_id, business_id, session_id) is None:
            return {"status": "not_found"}
        return {"status": "not_paused"}
    return {"status": "running", "run_token": new_token,
            "resume_after": updated["last_completed_section"]}


def steer_session(env_id: str, business_id: str | UUID, session_id: str | UUID,
                  instruction: str, *, actor: str = "system") -> dict:
    """Tail-only, future-only steering. Bumps plan_version and emits plan.revised.
    Prior (completed) sections are never mutated. Unknown instructions are no-ops.
    Steering is a structured whitelist edit, NOT free-form LLM/SQL (injection-safe)."""
    steer_id = str(uuid.uuid4())
    redacted = _redact(instruction)
    directive = _parse_steer(instruction)
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute("SELECT plan, plan_version, last_completed_section, status FROM nv_analysis_sessions "
                    "WHERE env_id = %s AND id = %s", (env_id, str(session_id)))
        row = cur.fetchone()
        if not row:
            return {"status": "not_found"}
        if directive["kind"] == "unsupported":
            _record_event(env_id, business_id, str(session_id), "user.steer_submitted", None,
                          {"steer_id": steer_id, "instruction_redacted": redacted,
                           "steer_status": "unsupported"})
            return {"status": "unsupported", "steer_id": steer_id}
        plan = row["plan"] or {}
        new_version = (row.get("plan_version") or 1) + 1
        revised = _apply_steer_to_tail(plan, row.get("last_completed_section"), directive)
        revised["plan_version"] = new_version
        cur.execute(
            "UPDATE nv_analysis_sessions SET plan = %s, plan_version = %s, updated_at = now() "
            "WHERE env_id = %s AND id = %s",
            (json.dumps(revised), new_version, env_id, str(session_id)),
        )
    _record_event(env_id, business_id, str(session_id), "user.steer_submitted", None,
                  {"steer_id": steer_id, "instruction_redacted": redacted,
                   "applies_from_section": row.get("last_completed_section")})
    _record_event(env_id, business_id, str(session_id), "plan.revised", None,
                  {"steer_id": steer_id, "plan_version": new_version,
                   "section_keys": [s["key"] for s in revised.get("sections", [])]})
    return {"status": "revised", "steer_id": steer_id, "plan_version": new_version}


def fork_session(env_id: str, business_id: str | UUID, session_id: str | UUID,
                 *, title: str | None = None, created_by: str = "system") -> dict:
    """Create a child session whose parent_session_id points at this one."""
    parent = get_session_state(env_id, business_id, session_id)
    if parent is None:
        return {"status": "not_found"}
    child_title = (title or f"Fork of {parent['title']}").strip()
    child = create_session(env_id, business_id, title=child_title, objective=parent.get("objective"),
                           parent_session_id=parent["id"], created_by=created_by)
    return {"status": "forked", "child_session_id": child["id"], "parent_session_id": parent["id"]}


# ── SSE generator ─────────────────────────────────────────────────────────────
async def session_stream(env_id: str, business_id: str | UUID, session_id: str | UUID,
                         *, actor: str = "system") -> AsyncIterator[bytes]:
    """Run (or resume) the session, emitting lifecycle events. Honest pause: aborts
    when active_run_token rotates. Persist-then-yield so the wire never diverges from
    the log. Client disconnect cancels the generator; finally marks interrupted only
    if still running (never finalizes on disconnect)."""
    run_token = str(uuid.uuid4())
    started = time.monotonic()
    # Claim the run: created -> running with our token (or resume already set running).
    if not _claim_run(env_id, session_id, run_token):
        yield _sse("error", {"session_id": str(session_id), "error": "not_startable"}).encode("utf-8")
        return

    try:
        session = get_session_state(env_id, business_id, session_id)
        if session is None:
            yield _sse("error", {"session_id": str(session_id), "error": "not_found"}).encode("utf-8")
            return

        ctx = analysis_sections.available_sources(env_id, str(business_id))
        yield (await _emit(env_id, business_id, session_id, run_token, "context.captured",
                           {"env_id": env_id, "window_days": 30,
                            "available_sources": ctx["available"], "degraded": ctx["degraded"]}))

        plan = session["plan"] or _initial_plan()
        section_keys = [s["key"] for s in plan.get("sections", [])]
        yield (await _emit(env_id, business_id, session_id, run_token, "plan.generated",
                           {"plan_version": plan.get("plan_version", 1), "deterministic": True,
                            "section_keys": section_keys}))

        # Resume support: skip sections at/under last_completed_section.
        resume_after = session.get("last_completed_section")
        skipping = resume_after is not None
        finalized_sections: list[dict] = list(session.get("sections") or [])

        for key in section_keys:
            if skipping:
                if key == resume_after:
                    skipping = False
                continue
            _abort_if_stale(env_id, session_id, run_token)  # before section work
            sec_started = time.monotonic()
            yield (await _emit(env_id, business_id, session_id, run_token, "section.started",
                               {"section_key": key, "title": key.replace("_", " ").title()}))

            _abort_if_stale(env_id, session_id, run_token)  # before the query
            section = analysis_sections.build_section(key, env_id, str(business_id))

            # metric.queried — the ONLY place a number reaches the wire, always with
            # provenance OR a null_reason. Numbers without source_ref never get here.
            for claim in section.get("claims", []):
                _abort_if_stale(env_id, session_id, run_token)
                yield (await _emit(env_id, business_id, session_id, run_token, "metric.queried",
                                   {"section_key": key, "source_kind": claim["source_kind"],
                                    "value": claim["value"], "is_estimate": claim.get("is_estimate", False),
                                    "source_ref": claim["source_ref"]}))
            if section.get("status") == "not_available":
                yield (await _emit(env_id, business_id, session_id, run_token, "metric.queried",
                                   {"section_key": key, "value": None,
                                    "null_reason": section.get("null_reason")}))

            duration_ms = int((time.monotonic() - sec_started) * 1000)
            yield (await _emit(env_id, business_id, session_id, run_token, "section.completed",
                               {"section_key": key, "status": section["status"],
                                "null_reason": section.get("null_reason"),
                                "claim_count": len(section.get("claims", [])),
                                "duration_ms": duration_ms}))
            finalized_sections.append(section)
            _checkpoint(env_id, session_id, key, finalized_sections)

        latency_ms = int((time.monotonic() - started) * 1000)
        deliverable = _finalize(env_id, business_id, session_id, finalized_sections, latency_ms)
        yield (await _emit(env_id, business_id, session_id, run_token, "session.completed",
                           {"status": "completed", "deliverable": deliverable,
                            "latency_ms": latency_ms, "cost_estimate": None}))
    except RunTokenInvalidated:
        # Pause/cancel already set the terminal status + emitted session.paused.
        return
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="analysis_sessions", action="stream_failed",
                 message=str(exc), error=exc)
        _mark_error(env_id, session_id, run_token, str(exc))
        yield _sse("error", {"session_id": str(session_id), "error": "stream_failed"}).encode("utf-8")
    finally:
        _mark_interrupted_if_running(env_id, session_id, run_token)


# ── internals ─────────────────────────────────────────────────────────────────
def _initial_plan() -> dict:
    return {"plan_version": 1, "deterministic": True,
            "sections": [{"key": k, "title": k.replace("_", " ").title()}
                         for k in analysis_sections.SECTION_KEYS]}


def _claim_run(env_id: str, session_id: str | UUID, run_token: str) -> bool:
    """Move created->running with our token, or accept an already-running resume whose
    active_run_token was just minted by resume_session. Returns False if not startable."""
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """UPDATE nv_analysis_sessions
               SET active_run_token = %s, status = 'running', updated_at = now()
               WHERE env_id = %s AND id = %s AND status = 'created'
               RETURNING id""",
            (run_token, env_id, str(session_id)),
        )
        if cur.fetchone():
            return True
        # Resume path: status already 'running' with a token resume_session minted.
        cur.execute(
            "SELECT active_run_token FROM nv_analysis_sessions WHERE env_id = %s AND id = %s AND status = 'running'",
            (env_id, str(session_id)),
        )
        row = cur.fetchone()
        if row and row.get("active_run_token"):
            # Adopt the existing token so our checks compare against the real one.
            return _adopt_token(run_token, str(row["active_run_token"]))
    return False


_ADOPTED: dict[str, str] = {}


def _adopt_token(run_token: str, existing: str) -> bool:
    # Map our locally-minted token to the DB's active token for this generator.
    _ADOPTED[run_token] = existing
    return True


def _effective_token(run_token: str) -> str:
    return _ADOPTED.get(run_token, run_token)


def _abort_if_stale(env_id: str, session_id: str | UUID, run_token: str) -> None:
    """Re-read active_run_token from a fresh cursor; raise if it no longer matches."""
    want = _effective_token(run_token)
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute("SELECT active_run_token, status FROM nv_analysis_sessions "
                    "WHERE env_id = %s AND id = %s", (env_id, str(session_id)))
        row = cur.fetchone()
    if not row or str(row.get("active_run_token")) != str(want) or row.get("status") != "running":
        raise RunTokenInvalidated()


async def _emit(env_id: str, business_id: str | UUID, session_id: str | UUID,
                run_token: str, event_type: str, payload: dict) -> bytes:
    """Write-then-yield: persist the event (with an audit receipt) BEFORE returning the
    wire frame, so the log and the stream never diverge. Abort-check happens first."""
    _abort_if_stale(env_id, session_id, run_token)
    eff = _effective_token(run_token)
    seq, audit_id = _record_event(env_id, business_id, session_id, event_type, eff, payload)
    frame = {"seq": seq, "session_id": str(session_id), "run_token": eff, **payload}
    return _sse(event_type, frame).encode("utf-8")


def _record_event(env_id: str, business_id: str | UUID, session_id: str | UUID,
                  event_type: str, run_token: str | None, payload: dict) -> tuple[int, str | None]:
    """Persist one event with a monotonic seq and an audit receipt. Returns (seq, audit_id)."""
    audit_id = _audit(env_id, business_id, action=f"investigation.{event_type}",
                      object_id=session_id, payload=payload)
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM nv_analysis_session_events "
                    "WHERE session_id = %s", (str(session_id),))
        seq = cur.fetchone()["seq"]
        cur.execute(
            """INSERT INTO nv_analysis_session_events
                   (env_id, business_id, session_id, seq, run_token, event_type, payload, audit_event_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (env_id, str(business_id), str(session_id), seq, run_token, event_type,
             json.dumps(payload, default=str), audit_id),
        )
    return seq, audit_id


def _checkpoint(env_id: str, session_id: str | UUID, section_key: str, sections: list[dict]) -> None:
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            "UPDATE nv_analysis_sessions SET last_completed_section = %s, sections = %s, updated_at = now() "
            "WHERE env_id = %s AND id = %s",
            (section_key, json.dumps(sections, default=str), env_id, str(session_id)),
        )


def _finalize(env_id: str, business_id: str | UUID, session_id: str | UUID,
              sections: list[dict], latency_ms: int) -> dict:
    """Run the 8 evals, store the report artifact (fail-closed), create an intel card
    (best-effort), and flip to completed. NEVER fabricates numbers or a cost.

    HARD GUARD: if the grounding eval fails, do NOT mint the deliverable card — make the
    no-fabrication rule structural, not merely reported."""
    state = get_session_state(env_id, business_id, session_id) or {}
    events = state.get("events", [])
    evals = analysis_evals.run_all(state, events, sections)

    # Persist eval rows.
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        for category, result in evals.items():
            cur.execute(
                """INSERT INTO nv_analysis_session_eval_results
                       (env_id, business_id, session_id, eval_category, passed, score, detail)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (session_id, eval_category) DO UPDATE SET
                       passed = EXCLUDED.passed, score = EXCLUDED.score,
                       detail = EXCLUDED.detail, evaluated_at = now()""",
                (env_id, str(business_id), str(session_id), category, result["passed"],
                 result["score"], json.dumps(result["detail"], default=str)),
            )

    null_reasons = [{"section": s["key"], "reason": s["null_reason"]}
                    for s in sections if s.get("status") == "not_available"]
    grounding_ok = evals.get("grounding", {}).get("passed") is True

    # Store the report body as an object-storage pointer (fail-closed).
    from app.services import ade_session_artifacts
    report_md = _render_report(state.get("title", "Investigation"), sections)
    pointer = ade_session_artifacts.safe_store_artifact(
        env_id=env_id, session_id=str(session_id), kind="report", name="report.md",
        body=report_md.encode("utf-8"), content_type="text/markdown",
    )

    card_id = None
    if grounding_ok:
        card_id = _safe_upsert_card(env_id, business_id, session_id, state.get("title", "Investigation"))
    finalize_audit = _audit(env_id, business_id, action="investigation.finalize",
                            object_id=session_id, payload={"grounding_ok": grounding_ok})

    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            """UPDATE nv_analysis_sessions
               SET status = 'completed', completed_at = now(), updated_at = now(),
                   latency_ms = %s, sections = %s, null_reasons = %s,
                   artifact_pointers = %s, deliverable_card_id = %s
               WHERE env_id = %s AND id = %s""",
            (latency_ms, json.dumps(sections, default=str), json.dumps(null_reasons),
             json.dumps([pointer.to_dict()]), card_id, env_id, str(session_id)),
        )
    return {"card_id": card_id, "artifact_pointers": [pointer.to_dict()],
            "eval_summary": {"passed": sum(1 for r in evals.values() if r["passed"] is True),
                             "failed": sum(1 for r in evals.values() if r["passed"] is False)},
            "grounding_ok": grounding_ok, "finalize_audit_event_id": finalize_audit}


def _safe_upsert_card(env_id: str, business_id: str | UUID, session_id: str | UUID, title: str) -> str | None:
    try:
        from app.services import intelligence_cards
        card = intelligence_cards.upsert_card(
            env_id, business_id, card_type="investigation", title=title,
            summary="Completed investigation session.",
            source_ref={"type": "investigation", "session_id": str(session_id)},
            created_by="system",
        )
        return card.get("id")
    except Exception:  # noqa: BLE001 — module may be absent; best-effort
        return None


def _audit(env_id: str, business_id: str | UUID, *, action: str,
           object_id: str | UUID, payload: dict) -> str | None:
    try:
        from app.services import audit as audit_svc
        biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))
        rid = audit_svc.record_event(
            actor="winston", action=action, tool_name="investigation", success=True,
            latency_ms=0, business_id=biz, object_type="analysis_session",
            object_id=UUID(str(object_id)), input_data=payload,
        )
        return str(rid) if rid else None
    except Exception:  # noqa: BLE001 — audit best-effort, never blocks the stream
        return None


def _mark_error(env_id: str, session_id: str | UUID, run_token: str, message: str) -> None:
    with get_cursor() as cur:
        _set_tenant(cur, env_id)
        cur.execute(
            "UPDATE nv_analysis_sessions SET status='error', error_message=%s, active_run_token=NULL, "
            "updated_at=now() WHERE env_id=%s AND id=%s AND status='running'",
            (message[:500], env_id, str(session_id)),
        )


def _mark_interrupted_if_running(env_id: str, session_id: str | UUID, run_token: str) -> None:
    """On client disconnect (generator cancelled), mark interrupted IF still running
    with our token. Never finalizes on disconnect. No-op if pause/complete already moved it."""
    want = _effective_token(run_token)
    try:
        with get_cursor() as cur:
            _set_tenant(cur, env_id)
            cur.execute(
                "UPDATE nv_analysis_sessions SET status='interrupted', active_run_token=NULL, updated_at=now() "
                "WHERE env_id=%s AND id=%s AND status='running' AND active_run_token=%s",
                (env_id, str(session_id), want),
            )
    except Exception:  # noqa: BLE001
        pass
    finally:
        _ADOPTED.pop(run_token, None)


def _redact(text: str | None) -> str | None:
    """Strip obvious secrets before persistence (defense-in-depth; record_event also redacts)."""
    if not text:
        return text
    import re
    return re.sub(r"(?i)(token|secret|password|api[_-]?key)\s*[:=]\s*\S+", r"\1=[redacted]", text)


# ── steering: structured, injection-safe whitelist ────────────────────────────
_STEER_VERBS = {"focus", "ignore", "compare", "show", "find", "save"}


def _parse_steer(instruction: str) -> dict:
    """Map a free-text instruction to a structured, whitelisted directive. Anything
    not on the whitelist is 'unsupported' (no-op). NO raw SQL, NO tool override."""
    head = (instruction or "").strip().lower().split()
    verb = head[0] if head else ""
    if verb in _STEER_VERBS:
        return {"kind": verb, "raw": _redact(instruction)}
    return {"kind": "unsupported"}


def _apply_steer_to_tail(plan: dict, last_completed: str | None, directive: dict) -> dict:
    """Apply a directive to FUTURE sections only. Completed sections are never touched.
    PR 6 keeps this minimal: a directive annotates the tail; it never removes a past
    section or rewrites a finalized one."""
    sections = list(plan.get("sections", []))
    # Identify the boundary; everything up to & incl last_completed is immutable.
    out = []
    past = last_completed is not None
    for s in sections:
        s2 = dict(s)
        if past:
            out.append(s2)
            if s["key"] == last_completed:
                past = False
            continue
        # future section — annotate with the steer
        s2.setdefault("steers", []).append(directive["kind"])
        out.append(s2)
    return {**plan, "sections": out}


def _render_report(title: str, sections: list[dict]) -> str:
    lines = [f"# {title}", ""]
    for s in sections:
        lines.append(f"## {s.get('title', s['key'])}")
        if s.get("status") == "not_available":
            lines.append(f"_Not available — {s.get('null_reason')}_")
        else:
            for c in s.get("claims", []):
                suffix = " (est.)" if c.get("is_estimate") else ""
                lines.append(f"- {c['text']}{suffix}  \n  source: {c['source_kind']}")
        lines.append("")
    return "\n".join(lines)

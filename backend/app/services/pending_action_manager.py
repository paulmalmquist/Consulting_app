"""Pending Action Manager — durable confirmation state machine for Winston.

When Winston proposes an action (write tool with confirmed=false), a pending
action record is created.  On the next user turn the gateway checks for a
pending action and resolves it BEFORE normal intent routing:

  * confirm phrases  → status = confirmed, re-execute tool with confirmed=true
  * cancel phrases   → status = cancelled
  * new intent       → status = superseded, normal routing continues
  * expiration       → nightly audit marks expired rows

This replaces the fragile conversation-scanning heuristic in
``_check_pending_workflow`` with a first-class durable record.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

import psycopg.errors

from app.db import get_cursor

logger = logging.getLogger(__name__)
_PENDING_ACTIONS_TABLE_READY = False
_TOOL_NAME_COLUMN_ADDED = False

# ── Confirmation / cancellation patterns ─────────────────────────────

_CONFIRM_RE = re.compile(
    r"^(yes|yep|yeah|yup|sure|ok|okay|go ahead|proceed|do it|confirmed?|"
    r"that'?s? (?:right|correct)|looks? good|sounds? good|approve|"
    r"let'?s? go|execute|make it so)[\.\!\s]*$",
    re.IGNORECASE,
)

_CANCEL_RE = re.compile(
    r"^(no|nope|cancel|never ?mind|stop|don'?t|abort|scratch that)[\.\!\s]*$",
    re.IGNORECASE,
)

_EDIT_RE = re.compile(
    r"^(edit|change|update|modify|actually)\b",
    re.IGNORECASE,
)


def classify_user_intent(message: str) -> str:
    """Classify a short user message against pending action intent.

    Returns one of: ``confirm``, ``cancel``, ``edit``, ``other``.
    """
    text = message.strip()
    if _CONFIRM_RE.match(text):
        return "confirm"
    if _CANCEL_RE.match(text):
        return "cancel"
    if _EDIT_RE.match(text):
        return "edit"
    return "other"


def _ensure_pending_actions_table() -> None:
    """Bootstrap the durable pending-actions table for local/dev runtimes.

    The eval loop and local Winston runtime now depend on pending-action
    receipts. Some local databases do not yet have the table, so we create the
    minimal canonical schema lazily instead of failing every turn.
    """
    global _PENDING_ACTIONS_TABLE_READY
    if _PENDING_ACTIONS_TABLE_READY:
        return
    with get_cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_pending_actions (
              pending_action_id uuid PRIMARY KEY,
              conversation_id uuid NOT NULL,
              message_id uuid NULL,
              business_id uuid NOT NULL,
              env_id uuid NULL,
              actor text NULL,
              skill_id text NULL,
              action_type text NOT NULL,
              params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
              missing_fields jsonb NULL,
              status text NOT NULL DEFAULT 'awaiting_confirmation',
              resolution_message text NULL,
              scope_type text NULL,
              scope_id text NULL,
              scope_label text NULL,
              expires_at timestamptz NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              resolved_at timestamptz NULL
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_conversation_status
            ON ai_pending_actions (conversation_id, status)
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_created_at
            ON ai_pending_actions (created_at DESC)
            """
        )
    _PENDING_ACTIONS_TABLE_READY = True
    _ensure_tool_name_column()


def _ensure_tool_name_column() -> None:
    """Add tool_name column if it doesn't exist yet (safe for existing deploys)."""
    global _TOOL_NAME_COLUMN_ADDED
    if _TOOL_NAME_COLUMN_ADDED:
        return
    try:
        with get_cursor() as cur:
            cur.execute(
                """DO $$ BEGIN
                     ALTER TABLE ai_pending_actions ADD COLUMN tool_name text NULL;
                   EXCEPTION WHEN duplicate_column THEN NULL;
                   END $$;"""
            )
        _TOOL_NAME_COLUMN_ADDED = True
    except Exception:
        logger.debug("Could not add tool_name column (may already exist or table missing)")
        _TOOL_NAME_COLUMN_ADDED = True  # Don't retry


# ── CRUD ─────────────────────────────────────────────────────────────

def create_pending_action(
    *,
    conversation_id: str,
    message_id: str | None = None,
    business_id: str,
    env_id: str | None = None,
    actor: str = "anonymous",
    skill_id: str | None = None,
    action_type: str,
    tool_name: str | None = None,
    params_json: dict[str, Any] | None = None,
    missing_fields: list[str] | None = None,
    scope_type: str | None = None,
    scope_id: str | None = None,
    scope_label: str | None = None,
    expires_minutes: int = 30,
) -> dict[str, Any] | None:
    """Create a pending action record.  Supersedes any existing pending action
    for the same conversation."""
    try:
        _ensure_pending_actions_table()
        pending_action_id = str(uuid.uuid4())
        with get_cursor() as cur:
            # Supersede any existing pending actions for this conversation
            cur.execute(
                """UPDATE ai_pending_actions
                   SET status = 'superseded', resolved_at = now()
                   WHERE conversation_id = %s AND status = 'awaiting_confirmation'""",
                (conversation_id,),
            )

            cur.execute(
                """INSERT INTO ai_pending_actions (
                     pending_action_id, conversation_id, message_id, business_id, env_id, actor,
                     skill_id, action_type, tool_name, params_json, missing_fields,
                     scope_type, scope_id, scope_label,
                     expires_at
                   ) VALUES (
                     %s, %s, %s, %s, %s, %s,
                     %s, %s, %s, %s, %s,
                     %s, %s, %s,
                     now() + interval '%s minutes'
                   ) RETURNING *""",
                (
                    pending_action_id,
                    conversation_id,
                    message_id,
                    business_id,
                    env_id,
                    actor,
                    skill_id,
                    action_type,
                    tool_name,
                    json.dumps(params_json or {}),
                    json.dumps(missing_fields) if missing_fields else None,
                    scope_type,
                    scope_id,
                    scope_label,
                    expires_minutes,
                ),
            )
            return cur.fetchone()
    except psycopg.errors.UndefinedTable:
        _PENDING_ACTIONS_TABLE_READY = False
        logger.warning("Pending action table was missing; retrying after bootstrap")
        try:
            _ensure_pending_actions_table()
            pending_action_id = str(uuid.uuid4())
            with get_cursor() as cur:
                cur.execute(
                    """UPDATE ai_pending_actions
                       SET status = 'superseded', resolved_at = now()
                       WHERE conversation_id = %s AND status = 'awaiting_confirmation'""",
                    (conversation_id,),
                )
                cur.execute(
                    """INSERT INTO ai_pending_actions (
                         pending_action_id, conversation_id, message_id, business_id, env_id, actor,
                         skill_id, action_type, tool_name, params_json, missing_fields,
                         scope_type, scope_id, scope_label,
                         expires_at
                       ) VALUES (
                         %s, %s, %s, %s, %s, %s,
                         %s, %s, %s, %s, %s,
                         %s, %s, %s,
                         now() + interval '%s minutes'
                       ) RETURNING *""",
                    (
                        pending_action_id,
                        conversation_id,
                        message_id,
                        business_id,
                        env_id,
                        actor,
                        skill_id,
                        action_type,
                        tool_name,
                        json.dumps(params_json or {}),
                        json.dumps(missing_fields) if missing_fields else None,
                        scope_type,
                        scope_id,
                        scope_label,
                        expires_minutes,
                    ),
                )
                return cur.fetchone()
        except Exception:
            logger.exception("Failed to create pending action after bootstrapping table")
            return None
    except Exception:
        logger.exception("Failed to create pending action")
        return None


def get_pending_action(conversation_id: str) -> dict[str, Any] | None:
    """Get the active pending action for a conversation, if any."""
    try:
        _ensure_pending_actions_table()
        with get_cursor() as cur:
            cur.execute(
                """SELECT * FROM ai_pending_actions
                   WHERE conversation_id = %s
                     AND status = 'awaiting_confirmation'
                     AND expires_at > now()
                   ORDER BY created_at DESC
                   LIMIT 1""",
                (conversation_id,),
            )
            return cur.fetchone()
    except psycopg.errors.UndefinedTable:
        globals()["_PENDING_ACTIONS_TABLE_READY"] = False
        try:
            _ensure_pending_actions_table()
        except Exception:
            logger.exception("Failed to bootstrap pending action table while fetching")
        return None
    except Exception:
        logger.exception("Failed to fetch pending action")
        return None


def resolve_pending_action(
    pending_action_id: str,
    *,
    new_status: str,
    resolution_message: str | None = None,
) -> dict[str, Any] | None:
    """Resolve a pending action to a terminal status."""
    try:
        _ensure_pending_actions_table()
        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_pending_actions
                   SET status = %s,
                       resolution_message = %s,
                       resolved_at = now()
                   WHERE pending_action_id = %s
                   RETURNING *""",
                (new_status, resolution_message, pending_action_id),
            )
            return cur.fetchone()
    except psycopg.errors.UndefinedTable:
        globals()["_PENDING_ACTIONS_TABLE_READY"] = False
        try:
            _ensure_pending_actions_table()
        except Exception:
            logger.exception("Failed to bootstrap pending action table while resolving")
        return None
    except Exception:
        logger.exception("Failed to resolve pending action")
        return None


def _log_execution_receipt(
    *,
    actor: str,
    tool_name: str | None,
    pending_action_id: str,
    pre_status: str,
    post_status: str,
    resolved_scope: dict[str, Any],
    success: bool,
    error: str | None = None,
    result: dict[str, Any] | None = None,
) -> None:
    """Persist an execution receipt via the audit service."""
    try:
        from app.services import audit as audit_svc
        audit_svc.record_event(
            actor=actor,
            action="pending_action.executed",
            tool_name=tool_name or "unknown",
            success=success,
            latency_ms=0,
            input_data={
                "pending_action_id": pending_action_id,
                "pre_status": pre_status,
                "post_status": post_status,
                "resolved_scope": {k: str(v) for k, v in (resolved_scope or {}).items()},
            },
            output_data={"result_preview": str(result)[:500]} if result else None,
            error_message=error,
        )
    except Exception:
        logger.debug("Could not persist execution receipt audit event", exc_info=True)


def execute_confirmed_action(
    pending_action_id: str,
    *,
    resolved_scope: dict[str, Any],
    actor: str = "anonymous",
) -> dict[str, Any]:
    """Execute a confirmed pending action by re-invoking the stored tool.

    Atomically checks status == 'confirmed' to prevent double execution.
    Returns a result dict with ``success``, ``result``/``error``, and ``status``.
    """
    from app.mcp.auth import McpContext
    from app.mcp.registry import registry

    # ── 1. Atomic claim: only proceed if status is still 'confirmed' ──
    try:
        _ensure_pending_actions_table()
        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_pending_actions
                   SET status = 'executed', resolved_at = now()
                   WHERE pending_action_id = %s AND status = 'confirmed'
                   RETURNING *""",
                (pending_action_id,),
            )
            row = cur.fetchone()
    except Exception:
        logger.exception("Failed to claim pending action for execution")
        return {"success": False, "error": "Database error claiming action", "status": "failed"}

    if not row:
        return {"success": False, "error": "Action already executed or no longer confirmed", "status": "already_resolved"}

    tool_name = row.get("tool_name")
    params = row.get("params_json") or {}
    if isinstance(params, str):
        params = json.loads(params)

    # ── 2. Look up tool from MCP registry ─────────────────────────────
    tool_def = None
    if tool_name:
        tool_def = registry.get(tool_name)

    if tool_def is None:
        # Mark as failed since we can't execute
        resolve_pending_action(pending_action_id, new_status="failed",
                               resolution_message=f"Tool '{tool_name}' not found in registry")
        logger.warning("Cannot execute pending action %s: tool '%s' not in registry", pending_action_id, tool_name)
        return {"success": False, "error": f"Tool '{tool_name}' not found in registry", "status": "failed"}

    # ── 3. Reconstruct args: stored params + scope + confirmed=true ────
    merged_args = dict(params)
    merged_args["confirm"] = True

    # Inject scope fields for tools that need them
    fields = getattr(tool_def.input_model, "model_fields", {})
    if "resolved_scope" in fields:
        merged_args["resolved_scope"] = resolved_scope
    if "env_id" in fields and "env_id" not in merged_args:
        merged_args["env_id"] = resolved_scope.get("env_id") or resolved_scope.get("environment_id")
    if "business_id" in fields and "business_id" not in merged_args:
        merged_args["business_id"] = resolved_scope.get("business_id")

    # ── 4. Build McpContext and execute ────────────────────────────────
    ctx = McpContext(
        actor=actor,
        token_valid=True,
        resolved_scope=resolved_scope,
        context_envelope=None,
    )

    pre_status = "confirmed"
    try:
        from app.mcp.audit import execute_tool
        result = execute_tool(tool_def, ctx, merged_args)
        post_status = "executed"
    except Exception as exc:
        result = None
        post_status = "failed"
        error_msg = str(exc)[:500]
        resolve_pending_action(pending_action_id, new_status="failed",
                               resolution_message=error_msg)
        logger.info(
            "Pending action execution FAILED: pa_id=%s tool=%s pre=%s post=%s error=%s",
            pending_action_id, tool_name, pre_status, post_status, error_msg,
        )
        _log_execution_receipt(
            actor=actor, tool_name=tool_name, pending_action_id=pending_action_id,
            pre_status=pre_status, post_status=post_status, resolved_scope=resolved_scope,
            success=False, error=error_msg,
        )
        return {"success": False, "error": error_msg, "status": "failed", "tool_name": tool_name}

    # ── 5. Log execution receipt ──────────────────────────────────────
    logger.info(
        "Pending action execution OK: pa_id=%s tool=%s pre=%s post=%s",
        pending_action_id, tool_name, pre_status, post_status,
    )
    _log_execution_receipt(
        actor=actor, tool_name=tool_name, pending_action_id=pending_action_id,
        pre_status=pre_status, post_status=post_status, resolved_scope=resolved_scope,
        success=True, result=result,
    )

    return {"success": True, "result": result, "status": "executed", "tool_name": tool_name}


def expire_stale_actions() -> int:
    """Mark expired pending actions.  Called by nightly audit."""
    try:
        _ensure_pending_actions_table()
        with get_cursor() as cur:
            cur.execute(
                """UPDATE ai_pending_actions
                   SET status = 'expired', resolved_at = now()
                   WHERE status = 'awaiting_confirmation'
                     AND expires_at <= now()""",
            )
            return cur.rowcount
    except psycopg.errors.UndefinedTable:
        globals()["_PENDING_ACTIONS_TABLE_READY"] = False
        try:
            _ensure_pending_actions_table()
        except Exception:
            logger.exception("Failed to bootstrap pending action table while expiring")
        return 0
    except Exception:
        logger.exception("Failed to expire stale actions")
        return 0


def list_unresolved_actions(
    *,
    business_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List all unresolved (awaiting_confirmation) actions, optionally filtered."""
    clauses: list[str] = ["status = 'awaiting_confirmation'"]
    params: list[Any] = []
    if business_id:
        clauses.append("business_id = %s")
        params.append(business_id)
    where = "WHERE " + " AND ".join(clauses)
    try:
        _ensure_pending_actions_table()
        with get_cursor() as cur:
            cur.execute(
                f"""SELECT * FROM ai_pending_actions {where}
                    ORDER BY created_at DESC LIMIT %s""",
                params + [limit],
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        globals()["_PENDING_ACTIONS_TABLE_READY"] = False
        try:
            _ensure_pending_actions_table()
        except Exception:
            logger.exception("Failed to bootstrap pending action table while listing")
        return []
    except Exception:
        logger.exception("Failed to list unresolved actions")
        return []


# ── Gateway integration ──────────────────────────────────────────────

def check_and_resolve(
    conversation_id: str,
    user_message: str,
) -> dict[str, Any] | None:
    """Check for a pending action and classify the user's response.

    Returns a dict with resolution info if a pending action was found:
      {
        "pending_action": <row>,
        "intent": "confirm" | "cancel" | "edit" | "other",
        "resolved": True if confirmed or cancelled,
      }
    Returns None if no pending action exists.
    """
    pending = get_pending_action(conversation_id)
    if not pending:
        return None

    intent = classify_user_intent(user_message)
    pa_id = str(pending["pending_action_id"])

    if intent == "confirm":
        resolve_pending_action(pa_id, new_status="confirmed", resolution_message=user_message)
        return {"pending_action": pending, "intent": "confirm", "resolved": True}
    elif intent == "cancel":
        resolve_pending_action(pa_id, new_status="cancelled", resolution_message=user_message)
        return {"pending_action": pending, "intent": "cancel", "resolved": True}
    elif intent == "edit":
        # Keep pending but signal edit intent to gateway
        return {"pending_action": pending, "intent": "edit", "resolved": False}
    else:
        # New unrelated intent — supersede
        resolve_pending_action(pa_id, new_status="superseded", resolution_message=user_message)
        return {"pending_action": pending, "intent": "other", "resolved": True}

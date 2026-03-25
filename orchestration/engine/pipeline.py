from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from .contracts import Contracts
from .git_isolation import changed_files, diff_numstat, ensure_worktree, head_sha, restore_files
from .intent import classify_intent, intent_risk
from .logging import append_soft_delete_ledger, write_execution_log
from .routing import resolve_model_alias, validate_branch_not_protected, validate_model_for_intent
from .scope import enforce_scope
from .risk import detect_high_risk_requirements


@dataclass
class Plan:
    plan_id: str
    prompt_hash: str
    intent: str
    risk_level: str
    requires_double_confirmation: bool
    summary: dict[str, Any]


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def build_plan(*, session: dict[str, Any], prompt: str, contracts: Contracts, intent_override: str | None = None) -> Plan:
    intent = classify_intent(prompt, intent_override)
    if intent != session["intent"]:
        raise ValueError(f"Session intent mismatch. Session={session['intent']} requested={intent}")
    risk_level = intent_risk(contracts.intent_taxonomy, intent)
    if risk_level != session["risk_level"]:
        raise ValueError("Session risk_level mismatch with taxonomy")
    validate_model_for_intent(intent, session["model"], contracts.intent_taxonomy)

    prompt_hash = _sha(prompt)
    plan_id = _sha(f"{session['session_id']}:{prompt_hash}:{intent}:{head_sha()}")
    req_double = bool(contracts.intent_taxonomy[intent]["requires_double_confirmation"]) or risk_level == "high"
    summary = {
        "session_id": session["session_id"],
        "intent": intent,
        "risk_level": risk_level,
        "model": session["model"],
        "branch": session["branch"],
        "plan_id": plan_id,
    }
    return Plan(plan_id=plan_id, prompt_hash=prompt_hash, intent=intent, risk_level=risk_level, requires_double_confirmation=req_double, summary=summary)


def _read_prompt(prompt: str | None, prompt_file: str | None) -> str:
    if prompt and prompt_file:
        raise ValueError("Provide either --prompt or --prompt-file, not both")
    if prompt_file:
        return Path(prompt_file).read_text(encoding="utf-8")
    if prompt:
        return prompt
    raise ValueError("Prompt is required")


def _run_codex(worktree: Path, model: str, prompt: str) -> tuple[int, str, str]:
    cp = subprocess.run(
        ["codex", "exec", "-m", model, "--sandbox", "workspace-write", "-C", str(worktree), prompt],
        capture_output=True,
        text=True,
    )
    return cp.returncode, cp.stdout, cp.stderr


def execute_run(
    *,
    session: dict[str, Any],
    contracts: Contracts,
    prompt: str,
    intent_override: str | None = None,
    approval_text: str | None = None,
    plan_preview_id: str | None = None,
    simulate: bool = False,
) -> dict[str, Any]:
    started = time.time()
    plan = build_plan(session=session, prompt=prompt, contracts=contracts, intent_override=intent_override)

    model_used = resolve_model_alias(session["model"], contracts.model_routing_rules)
    approval_required = not (bool(session["auto_approval"]) and plan.risk_level == "low")
    if approval_required:
        expected = "CONFIRM HIGH RISK" if plan.requires_double_confirmation else "CONFIRM"
        if (approval_text or "").strip() != expected:
            raise ValueError(f"Approval required: type exact '{expected}'")

    worktree = ensure_worktree(session["session_id"], session["branch"])
    validate_branch_not_protected(session["branch"])

    pre_state_hash = _sha(json.dumps(changed_files(worktree), sort_keys=True))
    execution_id = str(uuid4())

    errors: list[str] = []
    status = "completed"
    rollback = False
    stdout = ""
    stderr = ""

    if simulate:
        # deterministic simulation marker
        (worktree / ".orchestration_simulate_marker.txt").write_text("simulation\n", encoding="utf-8")
        stdout = "simulated"
    else:
        rc, stdout, stderr = _run_codex(worktree, model_used, prompt)
        if rc != 0:
            status = "failed"
            errors.append(f"codex exited with {rc}")
            errors.append(stderr.strip()[:500])

    files = changed_files(worktree)
    scope_errors = enforce_scope(files, session["allowed_directories"], int(session["max_files_per_execution"]))
    if scope_errors:
        errors.extend(scope_errors)

    risk_errors, requires_high = detect_high_risk_requirements(files, plan_preview_id)
    if risk_errors:
        if requires_high and (approval_text or "").strip() != "CONFIRM HIGH RISK":
            errors.extend(risk_errors)
        elif "Detected file deletion(s); requires soft-delete ledger entry" in risk_errors:
            append_soft_delete_ledger(execution_id, files)

    if errors:
        status = "failed"
        rollback = True
        restore_files(files, worktree)
        files = changed_files(worktree)

    add, rem = diff_numstat(worktree)
    post_state_hash = _sha(json.dumps(files, sort_keys=True))

    log = {
        "execution_id": execution_id,
        "session_id": session["session_id"],
        "intent": plan.intent,
        "model_used": model_used,
        "branch": session["branch"],
        "worktree_path": str(worktree),
        "approval_required": approval_required,
        "approval_value_used": approval_text,
        "plan_hash": plan.plan_id,
        "pre_state_hash": pre_state_hash,
        "post_state_hash": post_state_hash,
        "files_modified": files,
        "lines_added": add,
        "lines_removed": rem,
        "duration_ms": int((time.time() - started) * 1000),
        "status": status,
        "errors": [e for e in errors if e],
        "rollback_required": rollback,
        "stdout_tail": stdout[-2000:],
        "stderr_tail": stderr[-2000:],
    }
    log_path = write_execution_log(log, contracts.log_schema)
    return {
        "execution_id": execution_id,
        "status": status,
        "errors": errors,
        "plan": plan.summary,
        "log_path": str(log_path),
        "files_modified": files,
    }


def prompt_from_args(prompt: str | None, prompt_file: str | None) -> str:
    return _read_prompt(prompt, prompt_file)

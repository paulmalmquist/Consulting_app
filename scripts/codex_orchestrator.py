#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.engine.contracts import load_contracts, validate_with_schema
from orchestration.engine.intent import INTENTS, intent_risk
from orchestration.engine.logging import verify_log_chain
from orchestration.engine.parallel_validation import validate_parallel
from orchestration.engine.pipeline import build_plan, execute_run, prompt_from_args
from orchestration.engine.session import create_session_payload, load_session, save_session
from orchestration.engine.paths import GITHOOKS_DIR, ROOT as REPO_ROOT, LOGS_DIR
from orchestration.engine.routing import validate_branch_not_protected
from orchestration.engine.git_isolation import ensure_worktree


def _comma_list(v: str) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()]


def cmd_session_create(args: argparse.Namespace) -> int:
    contracts = load_contracts()
    if args.intent not in INTENTS:
        raise ValueError(f"Unknown intent: {args.intent}")
    risk = intent_risk(contracts.intent_taxonomy, args.intent)
    payload = create_session_payload(
        session_id=args.session_id,
        intent=args.intent,
        model=args.model,
        reasoning_effort=args.reasoning_effort,
        allowed_directories=_comma_list(args.allowed_directories),
        allowed_tools=_comma_list(args.allowed_tools),
        max_files_per_execution=args.max_files_per_execution,
        auto_approval=args.auto_approval,
        risk_level=risk,
    )
    p = save_session(payload, contracts.session_schema)
    ensure_worktree(payload["session_id"], payload["branch"])
    print(json.dumps({"ok": True, "session_path": str(p), "branch": payload["branch"]}, indent=2))
    return 0


def cmd_session_show(args: argparse.Namespace) -> int:
    contracts = load_contracts()
    session = load_session(args.session_id, contracts.session_schema)
    print(json.dumps(session.payload, indent=2, sort_keys=True))
    return 0


def cmd_session_validate(args: argparse.Namespace) -> int:
    contracts = load_contracts()
    session = load_session(args.session_id, contracts.session_schema)
    validate_branch_not_protected(session.branch)
    print(json.dumps({"ok": True, "session_id": session.session_id, "branch": session.branch}, indent=2))
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    contracts = load_contracts()
    session = load_session(args.session_id, contracts.session_schema)
    prompt = prompt_from_args(args.prompt, args.prompt_file)
    plan = build_plan(session=session.payload, prompt=prompt, contracts=contracts, intent_override=args.intent)
    print(json.dumps(plan.summary, indent=2, sort_keys=True))
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    contracts = load_contracts()
    session = load_session(args.session_id, contracts.session_schema)
    prompt = prompt_from_args(args.prompt, args.prompt_file)
    result = execute_run(
        session=session.payload,
        contracts=contracts,
        prompt=prompt,
        intent_override=args.intent,
        approval_text=args.approval_text,
        plan_preview_id=args.plan_preview_id,
        simulate=args.simulate,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("status") == "completed" else 2


def cmd_validate_parallel(args: argparse.Namespace) -> int:
    contracts = load_contracts()
    a = load_session(args.session_a, contracts.session_schema)
    b = load_session(args.session_b, contracts.session_schema)
    report = validate_parallel(a.payload, b.payload)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


def cmd_merge_gate(args: argparse.Namespace) -> int:
    import subprocess
    from orchestration.engine.git_isolation import _clear_stale_locks

    # Clear stale locks before merge-gate (multi-step git sequence)
    _clear_stale_locks()

    tmp = f"orchestration/merge-gate-manual"
    subprocess.run(["git", "checkout", "-B", tmp, "main"], cwd=str(REPO_ROOT), check=True)
    m1 = subprocess.run(["git", "merge", "--no-ff", "--no-edit", args.branch_a], cwd=str(REPO_ROOT))
    m2 = subprocess.run(["git", "merge", "--no-ff", "--no-edit", args.branch_b], cwd=str(REPO_ROOT))
    b = subprocess.run([".venv/bin/python", "-m", "pytest", "tests/test_orchestration_*.py", "-q"], cwd=str(REPO_ROOT / "backend"))
    f = subprocess.run(["npm", "run", "build"], cwd=str(REPO_ROOT / "repo-b"))
    subprocess.run(["git", "checkout", "main"], cwd=str(REPO_ROOT), check=False)
    code = 0 if m1.returncode == 0 and m2.returncode == 0 and b.returncode == 0 and f.returncode == 0 else 2
    print(json.dumps({"merge_a": m1.returncode == 0, "merge_b": m2.returncode == 0, "backend_tests": b.returncode == 0, "frontend_build": f.returncode == 0}, indent=2))
    return code


def cmd_log_show(args: argparse.Namespace) -> int:
    logs = []
    for p in sorted(LOGS_DIR.glob(f"*-{args.session_id}-*.json")):
        logs.append(json.loads(p.read_text(encoding="utf-8")))
    print(json.dumps(logs, indent=2, sort_keys=True))
    return 0


def cmd_log_verify_chain(_: argparse.Namespace) -> int:
    ok, msg = verify_log_chain()
    print(json.dumps({"ok": ok, "message": msg}, indent=2))
    return 0 if ok else 2


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Controlled Parallel Codex Orchestration")
    sub = p.add_subparsers(dest="cmd", required=True)

    session = sub.add_parser("session")
    session_sub = session.add_subparsers(dest="session_cmd", required=True)

    sc = session_sub.add_parser("create")
    sc.add_argument("--session-id", required=True)
    sc.add_argument("--intent", required=True, choices=INTENTS)
    sc.add_argument("--model", required=True)
    sc.add_argument("--reasoning-effort", default="medium", choices=["low", "medium", "high"])
    sc.add_argument("--allowed-directories", required=True, help="Comma separated")
    sc.add_argument("--allowed-tools", required=True, help="Comma separated")
    sc.add_argument("--max-files-per-execution", type=int, default=20)
    sc.add_argument("--auto-approval", action="store_true")
    sc.set_defaults(func=cmd_session_create)

    ss = session_sub.add_parser("show")
    ss.add_argument("--session-id", required=True)
    ss.set_defaults(func=cmd_session_show)

    sv = session_sub.add_parser("validate")
    sv.add_argument("--session-id", required=True)
    sv.set_defaults(func=cmd_session_validate)

    plan = sub.add_parser("plan")
    plan.add_argument("--session-id", required=True)
    plan.add_argument("--prompt")
    plan.add_argument("--prompt-file")
    plan.add_argument("--intent", choices=INTENTS)
    plan.set_defaults(func=cmd_plan)

    run = sub.add_parser("run")
    run.add_argument("--session-id", required=True)
    run.add_argument("--prompt")
    run.add_argument("--prompt-file")
    run.add_argument("--intent", choices=INTENTS)
    run.add_argument("--approval-text")
    run.add_argument("--plan-preview-id")
    run.add_argument("--simulate", action="store_true")
    run.set_defaults(func=cmd_run)

    vp = sub.add_parser("validate-parallel")
    vp.add_argument("--session-a", required=True)
    vp.add_argument("--session-b", required=True)
    vp.set_defaults(func=cmd_validate_parallel)

    mg = sub.add_parser("merge-gate")
    mg.add_argument("--branch-a", required=True)
    mg.add_argument("--branch-b", required=True)
    mg.set_defaults(func=cmd_merge_gate)

    log = sub.add_parser("log")
    log_sub = log.add_subparsers(dest="log_cmd", required=True)

    ls = log_sub.add_parser("show")
    ls.add_argument("--session-id", required=True)
    ls.set_defaults(func=cmd_log_show)

    lv = log_sub.add_parser("verify-chain")
    lv.set_defaults(func=cmd_log_verify_chain)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

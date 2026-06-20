"""Command-line entry for the AI provider dispatch layer.

Examples:
  python -m scripts.ai_dispatch.cli providers
  python -m scripts.ai_dispatch.cli route --task "summarize logs" --mode summarization --risk low
  python -m scripts.ai_dispatch.cli route --mode code --risk high --provider gemma_gcp
  python -m scripts.ai_dispatch.cli ask --task "explain this error" --mode log_explanation --risk low --no-fallback
  python -m scripts.ai_dispatch.cli eval --suite routing_policy

`providers` and `route` are pure (registry + policy only, no DB, no network).
`ask` performs a real dispatch and writes a local receipt mirror under .ai_receipts/.
`--no-fallback` means no fallback: an unavailable provider is reported, never silently swapped.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _bootstrap_path() -> None:
    """Put backend/ on sys.path, load backend/.env, then fill DB placeholders.

    `providers` and `route` never touch the database, but importing ``app.config``
    exits if DATABASE_URL is unset. We load a real .env first (its values win), then
    set placeholders so the pure commands run without a configured database.
    """
    backend = ROOT / "backend"
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))
    try:
        from dotenv import load_dotenv

        env_file = backend / ".env"
        if env_file.exists():
            load_dotenv(env_file)
    except Exception:
        pass
    os.environ.setdefault(
        "DATABASE_URL", "postgresql://placeholder:placeholder@localhost:5432/placeholder"
    )
    os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "placeholder")


def _print_json(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


def _cmd_providers(args: argparse.Namespace) -> int:
    from app.services.ai_dispatch.registry import provider_registry

    rows = provider_registry.describe_all()
    if args.json:
        _print_json(rows)
        return 0
    print(f"{'provider':<12s} {'impl':<5s} {'avail':<6s} {'max_risk':<9s} {'max_privacy':<12s} missing_env")
    print("-" * 78)
    for r in rows:
        print(
            f"{r['name']:<12s} {str(r['implemented']):<5s} {str(r['available']):<6s} "
            f"{r['max_risk']:<9s} {r['max_privacy']:<12s} {','.join(r['missing_env']) or '-'}"
        )
    return 0


def _build_request(args: argparse.Namespace):
    from app.services.ai_dispatch.models import AIRequest, Privacy, ProviderName, RiskLevel, TaskMode

    task = args.task
    if getattr(args, "input", None):
        task = Path(args.input).read_text(encoding="utf-8")
    return AIRequest(
        task=task or "",
        mode=TaskMode(args.mode),
        risk_level=RiskLevel(args.risk),
        privacy=Privacy(args.privacy),
        allow_fallback=not args.no_fallback if hasattr(args, "no_fallback") else args.allow_fallback,
        forced_provider=ProviderName(args.provider) if args.provider else None,
        env_id=args.env_id,
        business_id=args.business_id,
    )


def _cmd_route(args: argparse.Namespace) -> int:
    from app.services.ai_dispatch.policy import select_provider

    req = _build_request(args)
    decision = select_provider(req)
    if args.json:
        _print_json(decision.model_dump(mode="json"))
        return 0
    sel = decision.selected_provider.value if decision.selected_provider else "(none)"
    print(f"status        : {decision.status.value}")
    print(f"provider      : {sel}")
    print(f"model         : {decision.selected_model or '-'}")
    print(f"null_reason   : {decision.null_reason.value if decision.null_reason else '-'}")
    print(f"fallback_used : {decision.fallback_used}")
    print(f"reason        : {decision.routing_reason}")
    if decision.rejected:
        print("rejected      :")
        for name, why in decision.rejected.items():
            print(f"  - {name}: {why}")
    return 0


def _cmd_ask(args: argparse.Namespace) -> int:
    from app.services.ai_dispatch.supervisor import run_dispatch

    req = _build_request(args)
    result = run_dispatch(req)
    payload = result.model_dump(mode="json")

    # Local receipt mirror for offline visibility (independent of the DB receipt).
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_dir = ROOT / ".ai_receipts" / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    mirror = out_dir / f"{result.request_id}.json"
    mirror.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")

    if args.json:
        _print_json(payload)
    else:
        print(f"status        : {result.status.value}")
        print(f"provider      : {result.provider.value if result.provider else '(none)'}")
        print(f"model         : {result.model or '-'}")
        print(f"receipt       : {result.receipt_status} ({result.receipt_id or 'none'})")
        print(f"null_reason   : {result.null_reason.value if result.null_reason else '-'}")
        print(f"latency_ms    : {result.latency_ms}")
        if result.answer:
            print("answer        :")
            print(result.answer)
    print(f"(receipt mirror: {mirror})", file=sys.stderr)
    return 0


def _cmd_eval(args: argparse.Namespace) -> int:
    """Minimal scaffold: route each case and compare to its expected provider/status."""
    from app.services.ai_dispatch.models import AIRequest, Privacy, ProviderName, RiskLevel, TaskMode
    from app.services.ai_dispatch.policy import select_provider

    suite_path = ROOT / "evals" / "ai_dispatch" / f"{args.suite}.jsonl"
    if not suite_path.exists():
        print(f"no such suite: {suite_path}", file=sys.stderr)
        return 2

    passed = failed = 0
    for line in suite_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        case = json.loads(line)
        req = AIRequest(
            task=case.get("task", "eval"),
            mode=TaskMode(case["mode"]),
            risk_level=RiskLevel(case.get("risk", "low")),
            privacy=Privacy(case.get("privacy", "internal")),
            allow_fallback=case.get("allow_fallback", False),
            forced_provider=ProviderName(case["forced_provider"]) if case.get("forced_provider") else None,
        )
        decision = select_provider(req)
        got_provider = decision.selected_provider.value if decision.selected_provider else None
        ok = True
        if "expect_status" in case and decision.status.value != case["expect_status"]:
            ok = False
        if "expect_provider" in case and got_provider != case["expect_provider"]:
            ok = False
        if "expect_null_reason" in case:
            got_null = decision.null_reason.value if decision.null_reason else None
            if got_null != case["expect_null_reason"]:
                ok = False
        passed += int(ok)
        failed += int(not ok)
        label = case.get("name", f"{case['mode']}/{case.get('risk', 'low')}")
        print(f"[{'PASS' if ok else 'FAIL'}] {label} -> status={decision.status.value} provider={got_provider}")

    print(f"\n{passed} passed, {failed} failed (suite: {args.suite})")
    return 0 if failed == 0 else 1


def _add_request_flags(p: argparse.ArgumentParser, *, with_fallback_toggle: bool) -> None:
    p.add_argument("--task", default="", help="prompt / instruction text")
    p.add_argument("--input", help="read the task from this file instead of --task")
    p.add_argument("--mode", required=True, help="task mode (e.g. code, planning, summarization)")
    p.add_argument("--risk", default="low", choices=["low", "medium", "high"])
    p.add_argument("--privacy", default="internal", choices=["public", "internal", "sensitive"])
    p.add_argument("--provider", help="force a specific provider (openai|anthropic|gemma_gcp)")
    p.add_argument("--env-id", dest="env_id", default=None)
    p.add_argument("--business-id", dest="business_id", default=None)
    p.add_argument("--json", action="store_true", help="emit JSON")
    if with_fallback_toggle:
        p.add_argument("--no-fallback", action="store_true", help="never fall back to another provider")
    else:
        p.add_argument("--allow-fallback", dest="allow_fallback", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ai-dispatch", description="AI provider dispatch CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_providers = sub.add_parser("providers", help="list providers + availability")
    p_providers.add_argument("--json", action="store_true")
    p_providers.set_defaults(func=_cmd_providers)

    p_route = sub.add_parser("route", help="dry-run routing (no model call)")
    _add_request_flags(p_route, with_fallback_toggle=False)
    p_route.set_defaults(func=_cmd_route)

    p_ask = sub.add_parser("ask", help="real dispatch (writes a receipt)")
    _add_request_flags(p_ask, with_fallback_toggle=True)
    p_ask.set_defaults(func=_cmd_ask)

    p_eval = sub.add_parser("eval", help="run a routing eval suite (scaffold)")
    p_eval.add_argument("--suite", required=True, help="suite name under evals/ai_dispatch/<suite>.jsonl")
    p_eval.set_defaults(func=_cmd_eval)

    return parser


def main(argv: list[str] | None = None) -> int:
    _bootstrap_path()
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

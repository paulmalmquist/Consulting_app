#!/usr/bin/env python3
"""Chat with Winston through Anthropic Managed Agents.

Supports both creating a new session and resuming an existing session. The
script reads the local bootstrap summary file for the Anthropic resource IDs by
default so operators do not need to paste them around manually.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.winston_managed_agent import (  # noqa: E402
    ManagedAgentError,
    SessionStreamError,
    ToolConfirmationDecision,
    build_anthropic_client,
    create_session,
    default_state_path,
    read_json,
    run_session_turn,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chat with Winston via Anthropic Managed Agents.")
    parser.add_argument(
        "--state-file",
        default=str(default_state_path()),
        help="Bootstrap summary JSON written by winston_managed_agent_bootstrap.py.",
    )
    parser.add_argument(
        "--session-id",
        help="Resume an existing managed-agent session instead of creating a new one.",
    )
    parser.add_argument(
        "--agent-version",
        type=int,
        help="Pin a specific Anthropic agent version when creating a new session.",
    )
    parser.add_argument(
        "--title",
        default="Winston managed-agent operator session",
        help="Title for new sessions.",
    )
    parser.add_argument(
        "--auto-approve",
        action="store_true",
        help="Automatically approve all requested tool confirmations for this turn.",
    )
    parser.add_argument(
        "message",
        nargs="*",
        help="Message to send. If omitted, the script reads stdin or prompts interactively.",
    )
    return parser.parse_args()


def resolve_message(args: argparse.Namespace) -> str:
    if args.message:
        return " ".join(args.message).strip()
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    return input("Message: ").strip()


def prompt_for_confirmation(tool_event: object | None) -> ToolConfirmationDecision:
    if tool_event is None:
        return ToolConfirmationDecision(result="deny", deny_message="Operator could not resolve the pending tool event.")
    name = getattr(tool_event, "name", "unknown-tool")
    server = getattr(tool_event, "mcp_server_name", None)
    payload = getattr(tool_event, "input", None)
    label = f"{server}.{name}" if server else name
    print(f"\nTool confirmation required: {label}")
    if payload:
        print(json.dumps(payload, indent=2, sort_keys=True))
    answer = input("Allow this tool call? [y/N]: ").strip().lower()
    if answer in {"y", "yes"}:
        return ToolConfirmationDecision(result="allow")
    deny_message = input("Optional deny reason (press enter for default): ").strip()
    return ToolConfirmationDecision(
        result="deny",
        deny_message=deny_message or "Denied by operator.",
    )


def render_event(event: object) -> None:
    event_type = getattr(event, "type", "")
    if event_type == "agent.message":
        for block in getattr(event, "content", []) or []:
            text = getattr(block, "text", None) or (block.get("text") if isinstance(block, dict) else None)
            if text:
                print(text, end="", flush=True)
        return
    if event_type in {"agent.tool_use", "agent.mcp_tool_use", "agent.custom_tool_use"}:
        name = getattr(event, "name", "unknown-tool")
        server = getattr(event, "mcp_server_name", None)
        label = f"{server}.{name}" if server else name
        print(f"\n[tool] {label}")
        return
    if event_type == "agent.thinking":
        print("\n[thinking]", flush=True)
        return
    if event_type.startswith("session.status_"):
        stop = getattr(event, "stop_reason", None)
        suffix = f" stop_reason={getattr(stop, 'type', None)}" if stop else ""
        print(f"\n[{event_type}]{suffix}", flush=True)
        return
    if event_type == "session.error":
        error = getattr(event, "error", None)
        message = getattr(error, "message", None) or str(error or event)
        print(f"\n[session.error] {message}", flush=True)


def main() -> int:
    args = parse_args()
    message = resolve_message(args)
    if not message:
        raise ManagedAgentError("A message is required.")

    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_api_key:
        raise ManagedAgentError("ANTHROPIC_API_KEY is required.")

    state = read_json(args.state_file)
    agent_id = ((state.get("resources") or {}).get("agent") or {}).get("id")
    environment_id = ((state.get("resources") or {}).get("environment") or {}).get("id")
    vault_id = ((state.get("resources") or {}).get("vault") or {}).get("id")
    if not all((agent_id, environment_id, vault_id)):
        raise ManagedAgentError(
            "State file is missing agent/environment/vault IDs. Re-run winston_managed_agent_bootstrap.py first."
        )

    client = build_anthropic_client(anthropic_api_key)
    session_id = args.session_id
    if not session_id:
        session = create_session(
            client,
            agent_id=agent_id,
            agent_version=args.agent_version or None,
            environment_id=environment_id,
            vault_id=vault_id,
            title=args.title,
            metadata={
                "purpose": "operator_chat",
                "integration": "winston_managed_agent_v1",
            },
        )
        session_id = getattr(session, "id")
        state.setdefault("last_session", {})
        state["last_session"] = {
            "id": session_id,
            "agent_version": args.agent_version,
            "title": args.title,
        }
        write_json(args.state_file, state)

    print(f"Session ID: {session_id}\n")

    if args.auto_approve:
        confirmation_callback = lambda _tool_event: ToolConfirmationDecision(result="allow")
    elif sys.stdin.isatty():
        confirmation_callback = prompt_for_confirmation
    else:
        def _deny_without_tty(tool_event: object | None) -> ToolConfirmationDecision:
            name = getattr(tool_event, "name", "unknown-tool") if tool_event else "unknown-tool"
            raise ManagedAgentError(
                f"Tool confirmation required for {name}, but no TTY is available. Re-run with --auto-approve or attach a terminal."
            )
        confirmation_callback = _deny_without_tty

    try:
        result = run_session_turn(
            client,
            session_id=session_id,
            message=message,
            confirmation_callback=confirmation_callback,
            on_event=render_event,
        )
    except SessionStreamError:
        raise

    print("\n")
    print(json.dumps(
        {
            "session_id": result.session_id,
            "status": result.final_status,
            "stop_reason_type": result.stop_reason_type,
            "tool_use_count": len(result.tool_uses),
            "usage": result.session_snapshot.get("usage"),
            "stats": result.session_snapshot.get("stats"),
        },
        indent=2,
        sort_keys=True,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

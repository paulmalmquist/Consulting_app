#!/usr/bin/env python3
"""Bootstrap Winston as an Anthropic Managed Agent.

Creates or reuses the Anthropic Agent, Environment, Vault, and credential
needed for operator-side Winston sessions, then runs a smoke session that
verifies the managed-agent runtime can authenticate to Winston's remote MCP
server and execute at least one read-only tool flow.
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
    build_anthropic_client,
    build_bootstrap_summary,
    default_state_path,
    ensure_agent,
    ensure_environment,
    ensure_static_bearer_credential,
    ensure_vault,
    allow_all_confirmation,
    perform_mcp_preflight,
    retrieve_latest_agent,
    write_json,
    ManagedAgentProfile,
    create_session,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bootstrap Winston Managed Agent resources.")
    parser.add_argument(
        "--profile",
        default=str(REPO_ROOT / "scripts" / "winston_managed_agent_profile.json"),
        help="Path to the tracked Winston managed-agent profile JSON.",
    )
    parser.add_argument(
        "--state-file",
        default=str(default_state_path()),
        help="Where to write the local bootstrap summary JSON.",
    )
    parser.add_argument(
        "--no-state-file",
        action="store_true",
        help="Print the summary only and skip writing a local state file.",
    )
    parser.add_argument(
        "--skip-smoke",
        action="store_true",
        help="Create or reuse resources without running a smoke session.",
    )
    parser.add_argument(
        "--mcp-timeout",
        type=float,
        default=15.0,
        help="HTTP timeout in seconds for Winston MCP preflight checks.",
    )
    parser.add_argument(
        "--smoke-title",
        default="Winston managed-agent bootstrap smoke",
        help="Title for the smoke session created during bootstrap.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    state_path = None if args.no_state_file else Path(args.state_file)
    profile = ManagedAgentProfile.load(args.profile)

    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    mcp_api_token = os.environ.get("MCP_API_TOKEN", "").strip()
    if not anthropic_api_key:
        raise ManagedAgentError("ANTHROPIC_API_KEY is required for bootstrap.")
    if not mcp_api_token:
        raise ManagedAgentError("MCP_API_TOKEN is required to seed the Winston MCP static bearer credential.")

    preflight = perform_mcp_preflight(
        profile.mcp_url,
        token=mcp_api_token,
        timeout=args.mcp_timeout,
    )
    preflight.raise_for_failure()

    client = build_anthropic_client(anthropic_api_key)

    agent, agent_action = ensure_agent(client, profile)
    latest_agent = retrieve_latest_agent(client, getattr(agent, "id"))
    environment, environment_action = ensure_environment(client, profile)
    vault, vault_action = ensure_vault(client, profile)
    credential, credential_action = ensure_static_bearer_credential(
        client,
        vault_id=getattr(vault, "id"),
        mcp_url=profile.mcp_url,
        token=mcp_api_token,
        display_name=profile.credential_display_name,
        metadata=profile.credential_metadata,
    )

    smoke_session = None
    smoke_turn = None
    if not args.skip_smoke:
        smoke_session = create_session(
            client,
            agent_id=getattr(agent, "id"),
            agent_version=profile.pinned_agent_version,
            environment_id=getattr(environment, "id"),
            vault_id=getattr(vault, "id"),
            title=args.smoke_title,
            metadata={
                "purpose": "bootstrap_smoke",
                "integration": "winston_managed_agent_v1",
            },
        )
        from app.services.winston_managed_agent import run_session_turn  # local import keeps startup light

        smoke_turn = run_session_turn(
            client,
            session_id=getattr(smoke_session, "id"),
            message=profile.smoke_prompt,
            confirmation_callback=allow_all_confirmation,
        )
        if not smoke_turn.tool_uses:
            raise ManagedAgentError(
                "Smoke session completed without any tool use. Winston MCP auth or tool wiring may still be broken."
            )

    summary = build_bootstrap_summary(
        profile=profile,
        preflight=preflight,
        agent=agent,
        agent_action=agent_action,
        latest_agent=latest_agent,
        environment=environment,
        environment_action=environment_action,
        vault=vault,
        vault_action=vault_action,
        credential=credential,
        credential_action=credential_action,
        smoke_session=smoke_session,
        smoke_turn=smoke_turn,
        state_path=state_path,
    )

    if state_path is not None:
        write_json(state_path, summary)

    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

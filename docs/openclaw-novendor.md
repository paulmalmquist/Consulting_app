# OpenClaw Novendor Layout

This repository now carries two connected OpenClaw layers:

- Winston delivery layer: `dispatcher-winston`, `commander-winston`, `architect-winston`, `builder-winston`, `qa-winston`, `data-winston`, `sync-winston`, `deploy-winston`, and the Claude/Codex harness workers.
- Novendor business layer: `outreach`, `proposals`, `content`, `operations`, `demo`.

Control plane rules:
- Telegram DM entrypoint stays `dispatcher-winston`.
- Winston repo work stays rooted in this repo.
- Novendor business work stays rooted in `~/.openclaw/workspaces/novendor-*`.
- Non-Claude control agents now run on `codex-cli/gpt-5.4` rather than the OpenAI API-backed default path.

Phone command surface:
- `/research` -> `architect-winston`
- `/build` -> Lobster dev pipeline via `commander-winston`
- `/propose` -> Lobster proposal pipeline via `operations`
- `/outreach` -> `outreach`
- `/content` -> `content`
- `/ops_status` -> `commander-winston`
- `/brief` -> `operations`
- `/cost` -> `operations`

OpenClaw `2026.3.8` reserves `/status` as a native Telegram command. Use `/ops_status`, plain `status`, or the forum `Status` topic for the Novendor status rollup on this install.

Workflow files live in `orchestration/openclaw/`.

Forum topic plan:
- `General` -> `commander-winston`
- `Research` -> `architect-winston`
- `Builds` -> `builder-winston`
- `Client Ops` -> `operations`
- `Sales` -> `outreach`
- `Status` -> `commander-winston`

The live topic bindings are patched into `~/.openclaw/openclaw.json` by `scripts/openclaw_setup_forum.mjs` once the Telegram bot has been added to a forum supergroup and a real chat id is available.

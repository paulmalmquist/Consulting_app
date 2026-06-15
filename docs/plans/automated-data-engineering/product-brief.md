# Product brief — Automated Data Engineering

## Positioning

Winston is a governed connector/skill fabric. A data request comes in; ADE routes it
through intake, a registered skill with a typed contract, governed execution, tests, a PR,
and an audit receipt. The model layer is a swappable component behind the fabric, not the
product. Today it is Winston-managed OpenAI (ADR 0001); the contract, permissioning, and
receipts are what a client is buying.

The pitch is honesty as a feature: the control room shows exactly which skills exist,
which connectors are live versus declared, and the receipt for every execution. Nothing on
the surface claims a capability the backend cannot evidence.

## The five layers

1. **Intake** — work arrives as ADO items. PR 1 ships an import-ready backlog file
   (`ado/`); live board mutation stays with `azure-devops-intake`.
2. **Skill registry** — typed tool contracts from `backend/app/mcp/registry.py`:
   permission, side-effect class, confirmation requirements, lane and skill tags,
   per-tool redaction policy. ~82 tools registered today.
3. **Cloud execution** — connectors to external systems. PR 1 declares their real status
   (`connector-inventory.md`); it does not probe or extend them.
4. **Workbench** — the control-room frontend: skill registry table, connector map,
   execution receipts, playbooks. Portable package, mounted per environment.
5. **Evidence** — audit receipts from `backend/app/mcp/audit.py` and
   `turn_receipts.py`, surfaced read-only as Execution Receipts.

## Ships in PR 1

- This docs folder and two ADRs.
- Read-only `/api/ade` API: skill registry list/detail, declared connector inventory,
  audit receipt feed (fail-closed with `null_reason` where reads are unsafe).
- Portable control-room frontend, first mounted in the telemetry environment.
- Import-ready ADO backlog files.

## Roadmap (not in PR 1)

- Model access modes beyond Winston-managed: BYO-key and enterprise connectors (ADR 0001).
- Net-new connectors: GitHub PRs, Vercel, Railway, BigQuery, real Databricks, governed
  Confluent skill.
- Analytical engine: grain detection, fanout/join risk, metric-conflict detection, data
  contracts, entity resolution.
- Full playbook set and a marketing page on novendor.ai.

See `roadmap.md` for the full list.

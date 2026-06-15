# Backlog

The work-item source of truth is the import-ready ADO file set in
`docs/plans/automated-data-engineering/ado/`:

- `gen_ade_backlog.py` — single-source generator (data → CSV + PS1)
- `ade_backlog.csv` — import file
- `create_ado_backlog.ps1` — board-creation script (not run; file only)

Every item carries `DeliveryPhase` (PR1 | PR2+), `StatusOnMerge` (Done for PR 1 items),
and `ImplementationMode` (ExistingFabricSurface | NetNew), so a later import does not make
PR 1 look unimplemented.

## PR 1 status

In flight. Scope: docs folder, two ADRs, read-only `/api/ade` backend route +
`ade_connectors.py` + tests, portable frontend package with telemetry mount, ADO import
files. No live board mutation.

## Area path

A dedicated ADO area path is an intake-time decision for `azure-devops-intake`. Current
candidates: `Novendor\RS-Analytics\AgentPlatform`,
`Novendor\RS-Analytics\DevOpsAutomation`, `Novendor\RS-Analytics\WinstonPrototype`.

"""ADE Ops Orchestrator — a governed agentic data-engineering operations layer.

PR 1 is a read-only skeleton: a supervisor that routes a command to one of a
catalog of risk-tiered skills, runs only read-only/recommendation skills
(tiers 0-1), and records an immutable receipt. Write-capable skills (tier >= 2)
are registered and visible but cannot execute in PR 1.

Built ONLY on durable primitives (the MCP registry, ai_decision_audit_log via
``governance``, and ``audit``). It deliberately imports nothing from the
``ade_connectors`` / ``ade_connector_*`` product surface, which is being removed
on another branch — this layer must survive that removal.
"""

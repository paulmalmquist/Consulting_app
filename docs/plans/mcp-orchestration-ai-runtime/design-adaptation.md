# MCP / Orchestration / AI Runtime — Design Adaptation

## Purpose in the design system

This is a developer and admin surface. It should feel like a technical control panel — minimal chrome, data-forward, no decorative accents. The primary users are engineers and AI operators, not end-user clients.

## Accent choices
- Primary: `--nv-purple-400` (minimal use)
- Tool status: `--nv-success` (healthy), `--nv-error` (failed), `--nv-amber-400` (degraded)
- Model routing: use neutral labels with status chips, not colored bars

## Density
High. Tool registry, AI usage logs, and gateway stats must all be scannable in table form.

## Component emphasis
- AI usage table must show: env_id, model_used, call_count, cost, as-of date
- Tool registry must show: tool_name, category, confirmation_required, status
- Gateway health must show: current status, model availability, latency p50/p95
- Prompt health must show: prompt_id, last_tested, pass/fail

## What this environment must NOT do
- Use decorative charts for data that is better in a table
- Hide gateway errors behind a generic "unhealthy" state (must show specific failure reason)
- Show AI usage data without env_id context (always scoped)

# ADR 0002 — ADE ships as a platform-core package, mounted per environment

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Paul Malmquist (owner)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** `PORTABILITY.md`, [`0001-model-access-strategy.md`](0001-model-access-strategy.md), `docs/plans/automated-data-engineering/architecture.md`

## Context

The ADE control room debuts as a marketing demo inside the telemetry environment, but the
product is meant to transfer to any environment and eventually to client deployments. The
trap is the easy build: wire it into the telemetry surface directly, pick up telemetry
branding and assumptions, and then face a fork-and-edit job for every new mount.
`PORTABILITY.md` already defines the three-layer split (platform core / environment
package / client config); the decision is where each ADE piece sits.

## Decision

ADE ships as a platform-core package: `repo-b/src/components/automated-data-engineering/`
plus its lib (`repo-b/src/lib/automated-data-engineering/`) and the backend route
(`backend/app/routes/automated_data_engineering.py`). The package is env-agnostic,
parameterized by `envId`/`businessId`, and carries no environment branding — no RS or
telemetry references anywhere in it.

Each environment mounts it as a full-bleed lab domain route at
`/lab/env/[envId]/automated-data-engineering`. The first mount is the telemetry
environment: one `isDomainRoute` entry and one sidebar link, and nothing else. That mount
wiring is the environment package.

Connector inventory entries are client-config-shaped data: a per-deployment declaration
(`backend/app/services/ade_connectors.py` mirroring
`docs/plans/automated-data-engineering/connector-inventory.md`), not platform behavior.

## Alternatives considered

- **Build inside the telemetry package.** Rejected — fastest to demo, but every later
  mount becomes a copy-edit job and the core inherits telemetry naming. This is
  portability trap #4 in the plan.
- **Standalone top-level app route (outside `/lab/env/`).** Rejected — loses env scoping
  and the existing full-bleed domain-route mechanism; environments are the unit of
  client delivery here.
- **Connector inventory in platform core code as constants.** Rejected — per-client
  deployments will declare different connectors; that is config, not core.

## Consequences

- Positive: a second mount is one regex entry and one link; the core package can be
  shown to any prospect without rebadging; connector lists vary per client without code
  forks.
- Negative / cost: the md/py inventory mirror needs manual sync discipline (PR 2 may
  generate both from JSON); the neutral-branding rule needs review attention since
  nothing enforces it mechanically yet.
- Follow-ups: telemetry mount in PR 1; later mounts and the generated inventory source
  tracked in `docs/plans/automated-data-engineering/roadmap.md`.

## Validation

The second mount is the test: if adding ADE to another environment takes more than the
mount wiring (regex entry + link), the core leaked environment assumptions and this ADR
gets a follow-up. Also check at PR 1 review that grep for "telemetry" and "RS" inside the
core package returns nothing.

## Follow-up (2026-06-24) — composed telemetry mount

The standalone `/lab/env/[envId]/automated-data-engineering` mount read as its own
environment (its own left rail) and presented a generic tool/connector/receipt inventory
rather than data engineering. The telemetry environment now presents ADE through a
**composed** mount instead: a `Data Engineering` group in the telemetry sidebar
(`/lab/env/[envId]/telemetry/data-engineering/*`) whose data-semantics pages (grain,
relationships, lineage, pipelines/quality) reuse the telemetry **metadata catalog**, and
whose agent/governance pages (Agent Workbench, Run Autopsy, Source & Platform Map) read the
portable ADE endpoints (`/api/ade/*`). The old standalone routes now 307-redirect into the
new section.

This **does not change** the ADR decision: the ADE core package
(`repo-b/src/components/automated-data-engineering/`, its lib, and the backend route) is
**unchanged and still portable** — the composition lives entirely in the telemetry package
(`repo-b/src/components/telemetry/data-engineering/`), which is allowed to import the ADE
lib. The grep-for-"telemetry"-in-core test still holds. The standalone domain route remains
the portability contract for future environment mounts (a non-redirecting mount re-adds its
own route/link); only telemetry, which has a richer metadata layer to compose with,
redirects today.

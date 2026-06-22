# Healthcare Subscription Analytics — environment route

SYNTHETIC / NO-PHI. Standalone Winston lab environment with no app shell beyond the
shared `LabEnvTopBar`.

## Route map

- `/lab/env/{env_id}/healthcare-subscription` — Exec Overview (HHA-1, shipped).
- `/lab/env/{env_id}/healthcare-subscription/funnel` — HHA-2, in review.
- `/lab/env/{env_id}/healthcare-subscription/cohorts` — HHA-2, in review.
- `/lab/env/{env_id}/healthcare-subscription/operations` — HHA-2, in review.

HHA-2 is not shipped or deployed. Copilot, governance, event-level data, writes, and
provisioning are outside this phase.

## API contracts

- `GET /api/hha/v1/health?env_id=...`
- `GET /api/hha/v1/overview?env_id=...`
- `GET /api/hha/v1/funnel?env_id=...`
- `GET /api/hha/v1/cohorts?env_id=...`
- `GET /api/hha/v1/operations?env_id=...`

Browser calls use `repo-b/src/lib/healthcare-subscription/client.ts` and the same-origin
`/bos` proxy. Do not fetch the backend origin directly.

Every surface response includes environment ID, as-of date, source freshness,
provenance, disclaimer, synthetic/PHI flags, and metric definitions. Money is decimal
dollars at the API edge; rates remain `[0,1]` fractions for client formatting.

Suppressed cohort markers contain only cohort month, channel, `masked: true`, and
`"< 11 members - suppressed"`. The service does not select or serialize suppressed
counts, rates, revenue, or LTV.

## Design

The thin route pages render their client components directly. Shared palette, formatting,
banner, drawer, footer, KPI card, and four-surface navigation live in
`repo-b/src/components/healthcare-subscription/primitives.tsx`.

See `PROOF.md` for evidence and `DEMO.md` for the click-through.

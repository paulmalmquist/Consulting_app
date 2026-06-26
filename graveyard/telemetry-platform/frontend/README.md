# Pointer — the dashboard does not live here

The telemetry dashboard is a Winston lab environment inside the monorepo frontend, not a standalone
app in this folder. Shipping it as a real Winston tenant is intentional: the demo doubles as proof
the platform is multi-tenant.

Real locations (built in Phase 4):

- Pages: `repo-b/src/app/lab/env/[envId]/telemetry/` (root + `runs/`, `replay/`, `model-performance/`,
  `monitoring/`, optional `copilot/`)
- Components: `repo-b/src/components/telemetry/`
- Industry registration + route resolver: `repo-b/src/components/lab/environments/constants.ts`
- API client: `repo-b/src/lib/api.ts` (`apiFetch`, same-origin `/v1/*` proxy)
- Provisioned via `POST /v2/environments` (template `telemetry`, seed pack `telemetry_starter`)

Wireframe and panel→endpoint binding: `../docs/frontend-wireframe.md`.

Do not build a second frontend implementation in this folder.

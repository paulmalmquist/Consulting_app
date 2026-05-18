# Senior Housing — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — needs repo verification

## Frontend map

- Senior Housing likely uses the REPE environment type with healthcare-specific configuration
- Needs repo verification — check whether there is a dedicated `senior-housing` route prefix or if it uses `/lab/env/[envId]/re/` with a healthcare template

### Likely shared routes (from REPE)
| Route | Purpose |
|---|---|
| `/lab/env/[envId]/re/portfolio` | Portfolio overview |
| `/lab/env/[envId]/re/assets` | Asset list (senior housing properties) |
| `/lab/env/[envId]/re/funds` | Fund/portfolio view |
| `/lab/env/[envId]/re/operator-diagnostics` | Operator performance |

### Healthcare-specific routes (verify)
- Needs repo verification — check for any `healthcare`, `medical`, or `senior` prefixed routes
- `/app/finance/healthcare` exists in `repo-b/src/app/app/finance/healthcare/` — verify relevance

## Backend map

- Likely shares REPE backend routes (`re_*.py`)
- Healthcare-specific data may come from HUD connectors:
  - `backend/app/connectors/cre/hud_fmr/` — HUD Fair Market Rents
  - `backend/app/connectors/cre/hud_usps_crosswalk/` — HUD/USPS crosswalk
- Medical/healthcare route: `backend/app/routes/medical.py` (verify if exists)
- `/app/medical` exists in frontend — check corresponding backend

## Data map

- Likely shares REPE fund/asset tables with healthcare-specific property types
- HUD data connectors may provide market rent benchmarks
- Needs repo verification for any senior-housing-specific tables

## AI / MCP / Runtime map

- Likely shares REPE intelligence routes
- Needs repo verification for any healthcare-specific AI prompts

## Needs verification

- [ ] Whether a "Senior Housing" environment template exists in the provisioning system
- [ ] Whether there are dedicated backend routes for healthcare/senior housing
- [ ] Whether the `/app/finance/healthcare` and `/app/medical` routes are Senior Housing surfaces
- [ ] Which HUD connectors are active and what data they provide
- [ ] Whether senior housing uses separate Supabase tables or shares REPE tables with a property_type filter

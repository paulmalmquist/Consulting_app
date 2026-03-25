# Domain Command Workspaces

This document summarizes the new environment templates and route families.

## Templates
- `pds_command`
- `credit_risk_hub`
- `legal_ops_command`
- `medical_office_backoffice`

## Canonical Routes
- PDS: `/lab/env/[envId]/pds`
- Credit: `/lab/env/[envId]/credit`
- Legal Ops: `/lab/env/[envId]/legal`
- Medical Office: `/lab/env/[envId]/medical`

Legacy compatibility redirects are provided from:
- `/app/pds/*`
- `/app/credit/*`
- `/app/legal/*`
- `/app/medical/*`

## API Namespaces
- `/api/pds/v1/*`
- `/api/credit/v1/*`
- `/api/legalops/v1/*`
- `/api/medoffice/v1/*`

Each namespace includes:
- `/context` (resolves `env_id -> business_id`)
- primary entity list/create/get endpoints
- seed endpoint for environment bootstrap data

## Document Attachments
Document entity linking is now multi-domain.

Canonical `virtual_path` format:
- `re/env/<envId>/fund/<fundId>/...`
- `re/env/<envId>/deal/<dealId>/...`
- `re/env/<envId>/asset/<assetId>/...`
- `pds/env/<envId>/project/<projectId>/...`
- `pds/env/<envId>/program/<programId>/...`
- `credit/env/<envId>/case/<caseId>/...`
- `legalops/env/<envId>/matter/<matterId>/...`
- `medoffice/env/<envId>/property/<propertyId>/...`
- `medoffice/env/<envId>/tenant/<tenantId>/...`

Backend remains authoritative through `app.document_entity_links`.

## Environment Context Rules
- Domain workspaces resolve environment context once at layout/provider level.
- No business selector is shown in domain workspace shells.
- All domain API calls are environment-scoped.


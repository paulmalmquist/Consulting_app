# Winston Portability

## Purpose

Turn Winston from a strong internal codebase into a portable engagement platform that can be cloned, configured, and verified for a new client without tribal knowledge.

## Portability Standard

Winston is portable when a competent operator can:

1. Clone the repo into a new org, account, or project.
2. Provision infrastructure from templates.
3. Bind secrets and load client configuration.
4. Connect source systems through adapters and mappings.
5. Run bootstrap and seed steps.
6. Verify a golden-path workflow end to end.

If any of those still require source edits, hidden one-off scripts, or "ask Paul what to patch," the platform is not portable yet.

## Correct Mental Model

Do not think in terms of "make it transferable by environment type."

The durable shape is:

- `platform core`
- `environment package`
- `client config`

That is the boundary that keeps Winston opinionated without turning it into a bespoke client fork every time.

## Three-Layer Model

| Layer | Owns | Examples | Must not contain |
|---|---|---|---|
| `platform core` | reusable product primitives | auth, documents, tasks, connectors, audit, permissions, chat shell, reporting shell, shared navigation, execution concepts | client branding, client secrets, raw source field names, one-off client workflows |
| `environment package` | domain-specific behavior | REPE metrics, PDS pages, Trading Lab screens, environment prompts, dashboards, entity-specific flows | client-specific branding or connector credentials |
| `client config` | engagement-specific variation | branding, enabled capabilities, connector settings, canonical mappings, role templates, report wrappers, prompt vocabulary, seed recipes | forks of shared business logic |

## Non-Negotiable Guardrails

### 1. Canonical model plus adapter layer

- UI and shared business logic should consume canonical entities and typed view models.
- Source-specific weirdness belongs in adapters, mappings, transforms, and sync pipelines.
- The app should care that canonical `market` exists, not whether the source column was `market_name`, `region_desc`, or an Excel header.

### 2. Client pack or tenant pack

- A new engagement should feel like: `install platform -> load client config -> bind secrets -> run bootstrap`.
- It should not feel like: `search the repo for Winston, JLL, or Paul's defaults and hand-edit a dozen files`.
- The config shape should cover branding, capabilities, connector settings, mappings, role templates, prompt overrides, and demo seeds.

### 3. Capability-driven surfaces

- Navigation, routes, tools, and modules should be enabled through manifests or feature flags.
- Avoid scattered environment or client `if` statements across the frontend and backend.
- Smaller engagements should be able to carry only the surfaces they need.

### 4. White-label isolation

- App name, logos, colors, module labels, homepage copy, prompt copy, report headers, and email templates should be overridable.
- Shared product surfaces must not leak Winston, OpenClaw, Novendor, JLL, or personal sandbox assumptions into client instances.

### 5. Configurable security

- Roles should be capability-based and data-scoped, not tightly bound to one org chart.
- A client should be able to express permissions through configuration instead of code surgery.
- Approval and audit flows must survive cross-client deployment.

### 6. Bootstrap automation

- Fresh setup should script database migrations, storage setup, baseline roles, admin creation, environment registration, capability enablement, connector registration, seed data, and health checks.
- If first deploy success depends on manual notebook runs or patching rows by hand, portability is still incomplete.

### 7. Secrets and environment manifests

- No personal keys, hardcoded URLs, local-only assumptions, or hidden dependencies on one developer account.
- Keep a clear manifest of required and optional environment variables and what each one powers.
- Distinguish local dev, demo, client staging, and client production cleanly.

### 8. Golden-path verification

- Portability is proven by automation, not confidence.
- A fresh client instance should be testable end to end: provision, seed, sync, open app, run a report, ask AI a question, and verify output.

### 9. Hardcode audit

- Regularly search for hardcoded branding, domains, invite codes, seed labels, environment IDs, local ports, report titles, route assumptions, and prompt language tied to one client or one operator.
- Hidden hardcodes are where client spin-up usually breaks.

### 10. AI and reporting portability

- AI should be client-aware through configuration and canonical metadata, not code rewrites.
- Tool availability should respect enabled capabilities.
- Excel and reporting should connect to canonical contracts and stable APIs, not one environment's schema quirks.

## What New Client Onboarding Should Feel Like

1. Clone repo.
2. Provision infrastructure.
3. Load client pack.
4. Bind secrets.
5. Run bootstrap.
6. Connect source adapters.
7. Seed sample data.
8. Run golden-path verification.

That is the target experience.

## What To Build Now Versus Later

Do not stop momentum and disappear into a giant portability rewrite too early.

The right move is:

- keep building the product depth that proves Winston is worth deploying
- force clean seams now so that future portability is cleanup, not a rewrite

Generalize only where repetition or future pain is already obvious.

## Working Rule For Every Meaningful Feature

Before adding something, ask:

1. Is this `platform core`?
2. Is this an `environment package` concern?
3. Is this `client config`?
4. Is this a temporary hack we need to label and revisit?

If that cannot be answered, the feature is not scoped clearly enough yet.

## Recommended Near-Term Priorities

1. Define the client config or tenant-pack schema.
2. Keep pushing a canonical model plus connector adapter contracts.
3. Script bootstrap for a fresh instance.
4. Add capability flags and environment manifests.
5. Run a hardcode and branding audit.
6. Add golden-path client spin-up tests.
7. Build infra templates for single-tenant and client-hosted deployment.
8. Add tooling for source-to-canonical field mapping.

## Practical Review Checklist

- Are raw source fields leaking into UI or shared business logic?
- Did we hardcode branding, labels, routes, prompts, URLs, or permissions?
- Can this be enabled or disabled per environment or client through configuration?
- Would a fresh client instance be able to run this from code, config, and secrets alone?
- If a new client used different source systems tomorrow, would this still hold?

## Standard To Keep In Mind

The real question is simple:

If you disappeared for two weeks, could someone competent deploy Winston for a new client without calling you every hour?

If not, that is the gap.

The target is not a generic framework nobody wants and not a brilliant personal machine nobody else can deploy.

The target is a sharp, opinionated product whose bones stay clean enough to be forked through `platform core + environment package + client config`.

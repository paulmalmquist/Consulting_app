# Novendor Migration Engine — Feature Spec

> **Date:** 2026-03-26
> **Author:** Paul Malmquist + Claude
> **Status:** Draft
> **Core thesis:** Novendor doesn't compete with SaaS. Novendor liberates firms from SaaS. The migration engine is the mechanism that makes that liberation fast, safe, and repeatable.

---

## The Problem We're Solving

Every mid-market REPE firm is locked into at least one of these: Yardi, Juniper Square, Dealpath, ARGUS, or some combination. They're paying per-seat, per-year, with no ownership of the tooling or the data layer underneath it. Switching costs are the #1 reason they stay, not satisfaction.

The migration engine removes switching costs. It gives a firm a clear, fast path from "renting software" to "owning their stack."

---

## Design Principles

1. **You own it on the other side.** Every migration ends with the client holding their own infrastructure, their own data, their own AI layer. No Novendor lock-in either. If they want to leave us too, they can export everything we built.

2. **30-day target.** A complete migration from any single competitor platform should take no more than 30 calendar days from signed engagement to production cutover. That's the promise.

3. **Side-by-side verification before cutover.** No firm will trust a migration they can't verify. The engine must produce a reconciliation report showing the old system and new system agree on every number that matters.

4. **Compounding knowledge.** Every migration teaches us more about the source platform's data model. That knowledge gets encoded into reusable extractors and mappers, making the next migration faster and cheaper.

5. **No SaaS dependency in the output.** The migrated stack runs on infrastructure the client controls (their cloud account, their database, their domain). Novendor provides the build and the ongoing evolution, not a hosted platform.

---

## Where This Lives in the App

The migration engine is not a standalone system. It's a new provisioning path into the existing lab environment infrastructure. When a client says yes, the end result is a fully working environment identical to what Meridian Capital looks like today, just with the client's name, funds, assets, investors, and documents.

### How Meridian Capital Gets Built Today

This is the reference implementation. Understanding it is understanding what the migration engine produces.

1. `repo-c/scripts/create_env.py` creates a row in `app.environments` (industry_type="repe"), auto-creates a business, and binds them via `app.env_business_bindings`
2. Environment schema gets created (e.g., `env_{uuid}`) with backbone tables, modules, object types, dimensions
3. Industry template fires, enabling the REPE department set (fund management, asset management, deal pipeline, LP/investor, financial modeling, portfolio analytics, quarter close, covenant tracking, debt surveillance, document management, CRM, governance)
4. Seeders run in sequence:
   - `re_fi_seed_v2.py`: Creates "Institutional Growth Fund VII" with 16 assets (deterministic UUID5 namespace for re-runnability), 15 months of NOI/accounting data, property addresses, cap rates, occupancy, loan structures, 2 distressed assets
   - `dev_bridge_seed.py`: Creates 5 PDS-linked development projects with scenarios and monthly draw schedules
   - `323_re_capital_events_seed.sql`: 8 staggered capital calls, distributions based on 80% net cash flow, operating cash per asset per quarter, management fees
   - `324_re_waterfall_seed.sql`: Waterfall definitions and computations
   - `288_re_sustainability_seed.sql`: Emission factors, regulation catalogs, asset environmental profiles
   - Document seeding via `ingest_doc.py`: Placement memos, financials, valuation reports linked to entities
5. Result: A fully working REPE environment with funds, deals, assets, investors, capital accounts, documents, AI copilot, dashboards, and reporting. Everything scoped to that env_id + business_id pair.

### What Changes for a Real Client

Only step 4. Instead of synthetic seeders, the migration engine runs:

```
extract(source_platform, client_credentials)
  → raw staging tables
    → map(raw_data, platform_mapping_registry)
      → canonical Novendor schema (repe_fund, repe_deal, repe_asset, etc.)
        → verify(source_totals, migrated_totals)
          → reconciliation report
```

The environment shell, the department set, the AI copilot, the dashboards, the reporting layer — all of that is already built. The client walks into the same app Meridian Capital uses, just with their data.

### Directory Structure

```
backend/app/services/migration/
├── __init__.py
├── provisioner.py          # Orchestrator: create_env → extract → map → load → verify
├── extractors/
│   ├── __init__.py
│   ├── juniper_square.py   # JS REST API client
│   ├── yardi.py            # Yardi ETL + API client
│   ├── dealpath.py         # Dealpath REST API client
│   ├── argus.py            # ARGUS model import
│   ├── cherre.py           # Cherre GraphQL enrichment
│   └── csv_generic.py      # Generic CSV/Excel ingest (for firms that just export files)
├── mappers/
│   ├── __init__.py
│   ├── registry.py         # Platform → canonical schema mapping definitions
│   ├── juniper_to_repe.py  # JS fields → repe_fund, repe_entity, fin_capital_event, etc.
│   ├── yardi_to_repe.py    # Yardi fields → repe_asset, repe_property_asset, etc.
│   ├── dealpath_to_repe.py # Dealpath fields → repe_deal, repe_asset, etc.
│   ├── argus_to_repe.py    # ARGUS models → repe_fund_scenario, fin calculations
│   ├── entity_resolver.py  # Cross-platform dedup (same investor in JS and Dealpath)
│   └── custom_fields.py    # Detect and classify source custom fields
├── loaders/
│   ├── __init__.py
│   ├── fund_loader.py      # Insert into repe_fund, repe_fund_term, repe_fund_entity_link
│   ├── deal_loader.py      # Insert into repe_deal, repe_asset, repe_property_asset
│   ├── investor_loader.py  # Insert into repe_entity, fin_capital_account, fin_participant
│   ├── capital_loader.py   # Insert into fin_capital_event, fin_capital_rollforward, re_cash_event
│   ├── waterfall_loader.py # Insert into repe_fund_waterfall_definition, repe_fund_term
│   ├── document_loader.py  # Insert into app.documents, document_versions, document_entity_links
│   └── accounting_loader.py# Insert into re_asset_acct_quarter_rollup, fin_capital_rollforward
├── verification/
│   ├── __init__.py
│   ├── reconciler.py       # Side-by-side comparison engine
│   ├── capital_reconciler.py # Capital account balance tie-out
│   ├── nav_reconciler.py   # NAV / IRR / TVPI / DPI verification
│   └── coverage_report.py  # What migrated, what didn't, what needs review
└── readiness/
    ├── __init__.py
    └── assessment.py        # Free readiness assessment (read-only scan of source platform)

backend/app/routes/migration.py  # API endpoints for provisioning + readiness assessment
```

### The Canonical Data Model (Migration Targets)

These are the tables the loaders write into. They already exist and are fully functional.

**Fund Structure:**
- `repe_fund` (fund_id, business_id, name, vintage_year, fund_type, strategy, target_size, term_years, status)
- `repe_fund_term` (management_fee_rate, preferred_return_rate, carry_rate, waterfall_style, catch_up_style)
- `repe_fund_entity_link` (fund_id → entity_id, role ∈ {gp, lp, manager}, ownership_percent)
- `repe_fund_scenario` (scenario_type ∈ {base, stress, upside, downside, custom}, assumptions_json)
- `repe_fund_waterfall_definition` (style ∈ {european, american}, definition_json)

**Investments & Assets:**
- `repe_deal` (deal_id, fund_id, name, deal_type, stage, committed_capital, invested_capital, realized_distributions)
- `repe_asset` (asset_id, deal_id, asset_type ∈ {property, cmbs})
- `repe_property_asset` (property_type, units, market, current_noi, occupancy, address, gross_sf, year_built, acquisition_date, cost_basis)
- `repe_cmbs_asset` (tranche, rating, coupon, maturity_date, collateral_summary_json)

**Entities & Ownership:**
- `repe_entity` (entity_type ∈ {fund_lp, gp, holdco, spv, jv_partner, borrower}, jurisdiction)
- `repe_ownership_edge` (from_entity_id → to_entity_id, percent, effective_from/to — time-traveled)
- `repe_asset_entity_link` (role ∈ {owner, borrower, collateral_owner, manager})
- `re_jv` (legal_name, ownership_percent, gp_percent, lp_percent, promote_structure_id)

**Capital & Accounting:**
- `fin_capital_account` (opening/closing dates, status)
- `fin_capital_event` (event_type ∈ {commitment, capital_call, contribution, distribution, fee, accrual, clawback}, direction ∈ {debit, credit})
- `fin_capital_rollforward` (quarter-level: opening_balance, contributions, distributions, fees, accruals, clawbacks, closing_balance)
- `re_cash_event` (env_id, fund_id, investment_id, asset_id, event_type ∈ {CALL, DIST, OPERATING_CASH, FEE}, amount)
- `re_asset_acct_quarter_rollup` (quarter, noi, net_cash_flow)
- `re_loan_detail` (original_balance, current_balance, coupon, maturity_date, ltv, dscr)

**Documents:**
- `app.documents` (domain, classification, title, virtual_path, status)
- `app.document_versions` (bucket, object_key, original_filename, mime_type, size_bytes, content_hash)
- `app.document_entity_links` (env_id, entity_type ∈ {fund, investment, asset, ...}, entity_id)
- `app.document_text` (extracted_text per version)
- `app.document_chunks` (chunk_id, content, token_count — for RAG/AI copilot)

### The Provisioner Flow (What Happens When a Client Says Yes)

```python
# backend/app/services/migration/provisioner.py

async def provision_client(
    client_name: str,
    source_platform: str,          # "juniper_square" | "yardi" | "dealpath" | ...
    credentials: dict,             # API keys or file upload references
    options: MigrationOptions,     # what to migrate, custom field decisions, etc.
) -> ProvisioningResult:

    # Step 1: Create the environment (same as Meridian Capital)
    env = await create_environment(
        client_name=client_name,
        industry="real_estate",
        industry_type="repe",
    )
    # Result: env_id, business_id, env_business_binding, department set, empty REPE schema

    # Step 2: Extract from source platform
    extractor = get_extractor(source_platform)
    raw_data = await extractor.extract(credentials, options)
    # Result: raw staging tables with everything the source platform had

    # Step 3: Map to canonical schema
    mapper = get_mapper(source_platform)
    mapped_data = await mapper.transform(raw_data, options.custom_field_decisions)
    # Result: canonical records ready for insertion (funds, deals, assets, investors, etc.)

    # Step 4: Load into the environment
    await fund_loader.load(env.env_id, env.business_id, mapped_data.funds)
    await deal_loader.load(env.env_id, env.business_id, mapped_data.deals)
    await investor_loader.load(env.env_id, env.business_id, mapped_data.investors)
    await capital_loader.load(env.env_id, env.business_id, mapped_data.capital_events)
    await waterfall_loader.load(env.env_id, env.business_id, mapped_data.waterfall_defs)
    await document_loader.load(env.env_id, env.business_id, mapped_data.documents)
    await accounting_loader.load(env.env_id, env.business_id, mapped_data.accounting)
    # Result: fully populated environment identical to Meridian Capital, with client's real data

    # Step 5: Verify
    reconciliation = await reconciler.verify(
        source=raw_data,
        target_env_id=env.env_id,
        target_business_id=env.business_id,
    )
    # Result: side-by-side reconciliation report

    # Step 6: Run AI copilot bootstrap (index documents for RAG, seed assistant context)
    await bootstrap_ai_copilot(env.env_id, env.business_id)
    # Result: Winston AI ready to answer questions about the client's portfolio

    return ProvisioningResult(
        env_id=env.env_id,
        business_id=env.business_id,
        reconciliation=reconciliation,
        url=f"https://{client_slug}.novendor.app/lab/env/{env.env_id}",
    )
```

### What the Client Sees After Provisioning

The exact same interface Meridian Capital has. Not a reduced version, not a "migration view." The full thing:

- Fund dashboard with their funds, vintage years, AUM, performance metrics
- Asset detail pages with their properties, NOI trends, occupancy, cap rates
- Deal pipeline with their active deals, stages, scoring
- LP/Investor portal with their LPs, capital accounts, waterfall computations
- Document library with their placement memos, financials, valuations (RAG-indexed for AI)
- Winston AI copilot that can answer "what's our IRR on Fund III?" using their actual data
- Reporting engine that produces investor statements, quarterly reports, variance analysis
- All of it running on infrastructure they own

---

## Architecture (Technical Detail)

### Extraction Layer

| Source Platform | API Type | Key Data Types | Extraction Complexity |
|---|---|---|---|
| Juniper Square | REST API (public) | Investor contacts, capital transactions, fund structures, positions, NAV data, documents | LOW — clean API, CSV exports, no partnership gatekeeping |
| Yardi Voyager | ETL + SIPP + Commercial API (partnership-gated) | Property, unit, lease, rent roll, vendor, payables, financial transactions | HIGH — ~$25K/year per interface, 3-6 month typical timeline, data quality issues common |
| Dealpath | REST API (public) | Deal pipeline, property info, contacts, custom fields, analytics | MEDIUM — clean API but behind developer portal, deal-focused scope |
| Cherre | GraphQL API | Property characteristics, valuation, transactions, ownership, regulatory | LOW — complementary data layer, not primary fund management |
| ARGUS/Altus | REST API (partial, professional services often required) | Valuation models, calculation results, scenarios, assumptions, pro formas | MEDIUM — calculation-centric, CSV/JSON/XML export, may need professional services |

For each connector:
- Authenticated API client (or file-based ingestion for platforms that rely on SFTP/CSV)
- Raw data staging area (everything comes in as-is before transformation)
- Extraction manifest logging exactly what was pulled, when, and any gaps
- Existing template: `re_sustainability_ingestion.py` already implements CSV ingest with SHA256 hashing, row counting, status tracking, and data quality detection

### Mapping & Transformation Layer

This is the hard part and the real IP. Every Yardi instance is configured differently. Every Juniper Square workspace has custom fields.

- **Schema mapping:** Source fields → Novendor canonical schema. Mapping registry per platform grows with every migration.
- **Relationship resolution:** Hierarchical data (portfolio → property → unit → tenant → lease) rebuilt with correct foreign keys. Existing template: `re_fi_seed_v2.py` already handles deterministic UUID5 generation for stable entity relationships.
- **Custom field handling:** Detect custom fields in source, prompt client to classify (keep, discard, rename), map into extensible field system.
- **Cross-platform deduplication:** Match entities when migrating from multiple platforms simultaneously.
- **Calculation rebuilding:** Waterfall logic, IRR, allocation formulas reconstructed in Novendor's engine and verified against source outputs.
- **Document migration:** Binary files, PDFs, scanned docs move to client-controlled storage. Existing template: `ingest_doc.py` already handles chunking, embedding, and vector storage for RAG.

Transformation log: every record, every field, every decision. Full audit trail.

### Verification & Reconciliation Layer

This is what gives the client confidence to cancel the old contract.

- **Side-by-side reports:** For every major output the old system produced (investor statements, fund performance, rent rolls, deal pipeline summaries), generate the same report from migrated data and compare.
- **Numeric reconciliation:** NAV, IRR, capital account balances, distribution waterfalls must tie to the penny or discrepancy must be explained.
- **Coverage report:** What percentage of source data made it over? What was intentionally excluded? What needs manual review?
- **Signoff workflow:** Client team reviews reconciliation, flags issues, formally signs off before cutover.

---

## Phased Build Sequence

### Phase 1: Juniper Square Migration Kit (Weeks 1-4)

**Why first:** Lowest extraction complexity (public REST API, clean data model), most direct competitor in REPE, and the capital rotation back to CRE means firms on Juniper Square are actively evaluating their stack right now.

Build:
- Juniper Square API client (investor contacts, capital transactions, fund structures, positions, documents)
- Mapping registry: JS schema → Novendor canonical schema
- Basic reconciliation: investor list match, capital account balance tie-out, fund structure comparison
- Migration dashboard: progress tracker showing extraction %, mapping %, verification status
- "Migration readiness assessment" tool: connects to a prospect's JS instance (read-only) and produces a report showing data volume, complexity, and estimated migration timeline

Deliverable: A working demo where we connect to a Juniper Square sandbox, extract sample data, map it, and show the reconciliation. This becomes a sales tool immediately.

### Phase 2: Dealpath Migration Kit (Weeks 5-8)

**Why second:** Deal pipeline is a common pain point, Dealpath's API is public, and the data scope is narrower (deals, not fund administration). Quick win.

Build:
- Dealpath API client (deals, properties, contacts, custom fields)
- Mapping registry: Dealpath schema → Novendor canonical schema
- Deal pipeline reconciliation: deal count, stage distribution, value totals
- Custom field migration wizard

### Phase 3: Yardi Migration Kit (Weeks 9-16)

**Why third and longer:** Yardi is the biggest installed base but also the highest complexity. Partnership-gated APIs, ~$25K/year per interface, heavily customized instances, data quality issues are the #1 migration blocker.

Build:
- Yardi ETL connector (file-based ingestion for firms that can't/won't pay for API access)
- Yardi API client (for firms with existing API access)
- Heavy-duty mapping layer: property/unit/lease/tenant hierarchy reconstruction
- Data quality analyzer: scan the Yardi extract, flag duplicates, missing relationships, orphaned records
- Reconciliation: rent roll tie-out, GL balance comparison, vendor ledger match

This phase also builds the "data quality cleanup" offering — most firms' Yardi instances are messy. We can position the migration as a cleanup + upgrade, not just a move.

### Phase 4: Multi-Platform Consolidation (Weeks 17-20)

Many firms run multiple systems (e.g., Juniper Square for IR + Dealpath for pipeline + Yardi for property management + ARGUS for valuations). Phase 4 handles:

- Cross-platform entity matching (same property in Yardi and Dealpath, same investor in Juniper Square and the firm's CRM)
- Unified data model: one canonical record per entity, with lineage tracking back to source
- Gap analysis: what capabilities does the firm currently get from each platform, and which ones map to existing Novendor capabilities vs. need to be built?

### Phase 5: ARGUS/Altus + Cherre (Weeks 21-24)

Lower priority because these are more specialized (valuation modeling and property data enrichment). Build connectors for:
- ARGUS model import (valuation assumptions, scenarios, pro formas → Novendor's financial modeling engine)
- Cherre data enrichment (property intelligence layer as an ongoing feed, not a one-time migration)

---

## Positioning Language

### One-Liner
"We don't sell you software. We build you a stack you own and migrate you off the one you're renting."

### The Pitch (3 sentences)
"Every dollar you spend on Yardi or Juniper Square is rent. You're paying for access to your own data, on someone else's terms, on someone else's roadmap. We build you the same capabilities on infrastructure you control, migrate your data in 30 days, and you never pay per-seat again."

### Objection Handling

**"We're already on Juniper Square and it works fine."**
"It works fine until you want something they haven't built yet. Or until they raise prices. Or until you acquire a portfolio and need to integrate data they don't support. We build you something that works the way you work, not the way their product team decided you should work. And we'll migrate everything over in 30 days."

**"Switching costs are too high."**
"That's exactly the point. Switching costs are how SaaS vendors keep you paying. Our migration engine handles the data extraction, transformation, and verification automatically. We produce a side-by-side reconciliation that proves every number ties before you cancel anything."

**"We don't have the technical team to manage our own stack."**
"You don't need one. We manage the ongoing evolution of your platform. The difference is you own the code, the data, and the infrastructure. If you ever want to bring it in-house or hire someone else to maintain it, you can. Try doing that with Yardi."

**"What if Novendor goes away?"**
"Then you still have everything. Your code is in your repo, your data is in your database, your AI is running on your keys. That's the whole point. With SaaS, if the vendor goes away, you lose everything. With us, you lose a service provider but keep all the assets."

### Email Subject Lines
- "You're paying rent on your own data"
- "What if you owned your fund management stack instead of renting it?"
- "30-day migration off [Juniper Square / Yardi / Dealpath]"
- "The case for owning your REPE technology"

---

## Sales Integration

### Migration Readiness Assessment (Free)
Offer a free, no-commitment "migration readiness assessment" as the top-of-funnel. We connect to their existing platform (read-only), analyze their data volume and complexity, and produce a report showing:
- How much data they have and what it would take to move
- Data quality issues in their current system (this alone creates urgency)
- Estimated migration timeline and cost
- What they're currently paying in annual SaaS fees vs. what ownership would cost

This is the sales wedge. Once they see their own data quality issues and the total cost of their SaaS stack, the conversation shifts from "why would we switch" to "how fast can you do this."

### Demo Script
"Let me show you what a migration looks like. I'm going to connect to a sample Juniper Square workspace, pull the investor data, map it into your own system, and show you the reconciliation — all in about 10 minutes. What you're seeing is exactly what happens with your real data, except yours would be in a private environment you control."

---

## Cost Model

The migration engine is a revenue generator, not just a feature. Pricing structure:

- **Migration Readiness Assessment:** Free (lead gen)
- **Single-Platform Migration:** Fixed fee based on data volume and complexity. Target: $15K-$40K depending on source platform and firm size.
- **Multi-Platform Consolidation:** Premium engagement. $50K-$100K for firms migrating off 2-3 platforms simultaneously.
- **Ongoing Platform Evolution:** Monthly retainer for continued development, AI tuning, and infrastructure management. This replaces their SaaS spend at a lower total cost while giving them ownership.

The key insight: the migration fee is a one-time cost that replaces an ongoing SaaS expense. A firm paying $100K/year to Juniper Square + $150K/year to Yardi is spending $250K/year in perpetuity. A $75K migration + $10K/month retainer ($120K/year) saves them $130K/year AND they own the result.

---

## Success Metrics

- **Migration completion time:** < 30 days per platform (target)
- **Data accuracy:** 100% reconciliation on financial figures (NAV, IRR, capital accounts)
- **Coverage:** > 95% of source data migrated (remainder documented and explained)
- **Client signoff:** Formal verification signoff before cutover
- **Connector reuse:** Each migration should improve the mapping registry, reducing the next migration's effort by 10-20%
- **Sales conversion:** Migration readiness assessments should convert to engagements at > 30%

---

## Next Steps

1. Build the Juniper Square API client and mapping registry (Phase 1, start immediately)
2. Draft 3 outreach emails using the positioning language above, targeting mid-market REPE firms currently fundraising
3. Build the "migration readiness assessment" as a standalone tool that can be demoed in sales calls
4. Create a demo environment showing a simulated Juniper Square → Novendor migration
5. Add "Migration Engine" as a new capability domain in the repo

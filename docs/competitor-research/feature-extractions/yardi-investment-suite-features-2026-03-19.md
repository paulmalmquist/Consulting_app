# Feature: Yardi Voyager-to-Investment Suite Live Data Bridge — Yardi — 2026-03-19

**Source:** Yardi — https://www.yardi.com/products/yardi-investment-management/investment-manager/

## What It Does (User-Facing)
Property-level financial data (budgets, actuals, operating metrics) recorded in Yardi Voyager (the property management platform) flows automatically up into the Investment Suite's investor portal and performance dashboards — no manual data transfer, no reconciliation step.

## Functional Components
- **Data source:** Yardi Voyager property management data (rent rolls, budgets, actuals, lease data)
- **Processing:** Native schema-level sync (Voyager and Investment Suite share the same underlying Yardi database infrastructure); no ETL required
- **Trigger:** Real-time on Voyager record save/update
- **Output:** Updated asset-level metrics visible in investor dashboards, performance reports, and LP-facing portal
- **Delivery:** In-platform dashboards; LP portal self-service; report generation

## Winston Equivalent
Winston has asset-level P&L, GL trial balance, debt metrics (DSCR, LTV), and valuation — but these are entered/uploaded, not auto-synced from a property management system. Winston has no Yardi Voyager or MRI/AppFolio integration. **Gap:** Winston doesn't pull live from PM systems. This is a moderate-to-major build requiring a Voyager/MRI API connector.

## Architectural Pattern
Native database-level integration (same vendor, shared schema) → real-time record propagation → UI layer reads from unified data model. Not replicable with a standard REST integration — requires deep PM system connector or the PM system to push data via webhook/API.

---

# Feature: Yardi Debt Manager — Covenant & Collateral Tracking — Yardi — 2026-03-19

**Source:** Yardi — https://www.yardi.com/products/yardi-investment-management/ (Investment Suite overview)

## What It Does (User-Facing)
Debt Manager provides a centralized view of every loan across the portfolio — loan terms, covenant conditions, collateral assets, and compliance status — with automated alerts when covenants approach breach thresholds.

## Functional Components
- **Data source:** Loan agreements (manually entered or imported), asset financials (from Voyager integration), calculated ratios (DSCR, LTV, debt yield)
- **Processing:** Rule-based covenant evaluation against live financial metrics → breach probability scoring → alert generation
- **Trigger:** Scheduled (monthly/quarterly financial close) + on-demand
- **Output:** Covenant compliance dashboard, breach alerts, loan summary reports
- **Delivery:** In-platform dashboard; email alerts for covenant violations

## Winston Equivalent
Winston tracks DSCR and LTV at the asset level already. It has debt data in the asset financial model. **Partial match:** Winston has the underlying data but lacks a dedicated covenant-tracking module with automated breach alerts, a multi-loan portfolio view with compliance scoring, and collateral mapping. This is a **Quick Win / Partial** build — the data exists, needs a covenant rules engine and alert layer.

## Architectural Pattern
Structured loan data model + calculated metric triggers → rule evaluation engine → alerting pipeline. Standard financial compliance monitoring architecture — similar to what banks use for portfolio-level covenant management.

---

# Feature: Yardi Acquisition Manager — Deal Lifecycle Pipeline — Yardi — 2026-03-19

**Source:** Yardi — https://www.yardi.com/products/yardi-investment-management/ (Acquisition Manager module)

## What It Does (User-Facing)
Centralized deal pipeline that tracks every acquisition and disposition from initial opportunity through close — with customizable workflow stages, document management per deal, and collaboration tools for the investment team.

## Functional Components
- **Data source:** Deal data (manually entered); documents attached to deal records; team activity/notes
- **Processing:** Stage-gate workflow engine → task assignment per stage → document version tracking → deal status aggregation
- **Trigger:** Manual deal creation; stage advancement by user
- **Output:** Pipeline dashboard with deal stages, task lists, document repository per deal, pipeline summary reports
- **Delivery:** In-platform deal pipeline view; team collaboration within deal record

## Winston Equivalent
Winston has Deal Radar — a pipeline visualization with radar chart scoring. **Partial match:** Winston has pipeline visualization and deal scoring but likely lacks the workflow stage management (task assignment, stage gates), per-deal document repository, and team collaboration layer. This is a **Moderate build** to add structured workflow stages and document threading to Deal Radar.

## Architectural Pattern
Kanban/stage-gate workflow engine + document attachment per entity + team assignment model. Standard CRM deal pipeline pattern, extended with document management.

---

# Feature: Yardi Automated Capital Calls + Distribution Processing — Yardi — 2026-03-19

**Source:** Yardi Investment Management overview page

## What It Does (User-Facing)
Capital calls and distribution payments are generated, calculated, and processed automatically based on fund agreement terms — eliminating manual calculation and reducing the cycle from days to hours.

## Functional Components
- **Data source:** Fund agreement terms (commitment amounts, waterfall structure, called/distributed capital history), investor roster
- **Processing:** Triggered calculation of each investor's pro-rata share → generation of capital call notices → payment instruction file creation
- **Trigger:** GP-initiated (when new capital call event is declared) or automated at scheduled interval
- **Output:** Per-investor capital call notice (PDF), payment instruction batch file, updated investor capital account balances
- **Delivery:** Investor portal notification + downloadable notice; payment file sent to bank/custodian

## Winston Equivalent
Winston has LP/waterfall calculations and capital account snapshots. **Partial match:** Winston calculates waterfall allocations and tracks LP capital, but there is no automated capital call notice generation, no payment file creation, and no investor notification workflow. This is an **Easy-to-Moderate build** using existing waterfall data + document templating + email notification.

## Architectural Pattern
Trigger-based calculation → templated document generation → payment batch file → investor notification. Standard fund administration automation pattern.

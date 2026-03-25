# Winston Feature Comparison vs Altus Group — 2026-03-18

| Feature | Classification | Winston Gap | Effort |
|---|---|---|---|
| Fund Management (ARGUS Taliance) — LP waterfall, capital accounts, fund-level returns | Already in Winston | Winston has LP/waterfall, capital accounts, LP Summary. Verify end-to-end integration with asset valuation data. | 0 |
| Portfolio Scenario Analysis — simultaneous what-if across all assets | Partial | Winston has stress testing; gap is a structured UI for running parameterized scenarios across all assets at once without rebuilding models | 3–5 days |
| Benchmark Manager — portfolio vs. external peer benchmarks | Major build | Winston has UW vs. Actual (internal benchmark). Lacks external peer benchmark dataset. Data acquisition is the real barrier, not the UI. | 3–5 weeks |
| Asset Manager — real-time performance dashboards per asset | Already in Winston | Winston has asset-level P&L, GL trial balance, DSCR, LTV, Direct Cap | 0 |
| Automated Excel model ingestion (SFTP/S3) — auto-capture, map, validate | Easy build | Winston likely ingests documents but may not auto-map Excel model data into GL/valuation data model | 2–3 days |
| Valuation lifecycle management (ARGUS ValueInsight) — manage full cycle from instruction to delivery | Moderate build | Winston has valuation outputs (Direct Cap) but not a workflow management layer tracking appraisal lifecycle status | 1–2 weeks |
| Rent roll → cash flow model integration | Partial | Winston ingests operating data; need to confirm structured rent roll parsing into NOI/cash flow assumptions | 2–4 days |
| Attribution analysis — what drove variance (cap rate, NOI, leverage) | Moderate build | Winston has UW vs. Actual reporting; lacks formal attribution decomposition by driver | 1–2 weeks |

---

## Top Gaps (Not in Winston, High Enterprise Value)

1. **Peer Benchmark Manager** — Major build but high enterprise value. REPE GPs want to know how their assets stack up against market. Altus has this because they own the dataset. Winston would need to partner with or ingest third-party benchmark data (MSCI Real Estate, Green Street, NCREIF). High GP value, but data acquisition is the real complexity.

2. **Valuation Lifecycle Management** — Moderate build. Managing the appraisal process (scheduling, instructions, review, delivery) is a real workflow pain point at mid-size GPs that don't have a dedicated valuation team system.

3. **Formal Attribution Analysis** — Moderate build. Winston has all the underlying data (UW vs. Actual across assets). Building a decomposition layer (what % of variance came from cap rate compression vs. NOI shortfall vs. debt cost) would turn existing UW vs. Actual data into a much more powerful LP-facing narrative tool.

---

## Quick Wins (Already Partial — Just Need Assembly)

1. **Portfolio Scenario Analysis UI** — Winston has stress testing capabilities. Building a clean UI that lets a GP run "cap rate +75bps across all 15 assets simultaneously" and see the fund-level IRR impact would be a 3–5 day build on existing infrastructure. High demo value.

2. **Automated Excel/Rent Roll Ingestion** — Winston has document ingestion. Extending it to auto-map rent roll columns to the cash flow data model (tenant, SF, rent/SF, expiry) would eliminate a manual step GPs currently do in Excel. Reuses the document pipeline with a structured extraction layer.

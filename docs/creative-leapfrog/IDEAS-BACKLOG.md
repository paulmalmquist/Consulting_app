# Creative Leapfrog — Ideas Backlog

> Running backlog of all leapfrog ideas scoring 7+ on build priority.
> Maintained by `creative-leapfrog-engine` (daily, 9 AM).
> New entries appended at bottom. Most recent date = most recently generated.

---

## 2026-03-23

### Deal Signal Radar — Pre-Market Deal Intelligence
**Score:** 9/10 | **Lens:** AI-Native Reimagination + Workflow Elimination | **Complexity:** High
**Competitor signal:** Dealpath Connect secured all three major global brokerages; Juniper Square LP NLP
**Idea:** Monitor property-level distress signals (county records, DSCR patterns, loan maturities, ownership behavioral signals) to surface likely-to-transact assets 6-18 months before they hit any marketplace.
**Code entrypoints:** `market_regime_engine.py` (signal scoring pattern), MSA zone tables (`msa_zone`, `msa_zone_intel_brief`), Deal Radar, `scoring_weights.json`
**Dependencies:** MSA Phase 1 sweep unblocked, county assessor connector (MSA card #2), BLS/FRED connector (MSA card #5)

---

### Portfolio Pulse — Continuous LP Intelligence
**Score:** 9/10 | **Lens:** Workflow Elimination + Time Travel | **Complexity:** Medium
**Competitor signal:** Juniper Square quarterly report compilation, ARGUS portfolio scenarios
**Idea:** Kill the quarterly report cadence. Winston's portfolio is always current — LP reports are on-demand snapshots, not assembled deliverables.
**Code entrypoints:** `finance.lp_summary`, `finance.nav_rollforward`, `finance.fund_metrics`, `finance.generate_waterfall_memo`, BUILD-02 (LP report auto-assembly)
**Dependencies:** BUILD-02 foundation (3-5 days); frame it as "Portfolio Pulse" at shipping time

---

### Covenant Intelligence — Lender Relationship OS
**Score:** 9/10 | **Lens:** Time Travel + AI-Native Reimagination | **Complexity:** Medium
**Competitor signal:** Yardi Debt Manager covenant tracking
**Idea:** Predict covenant breaches 90 days out, model lender behavior, auto-draft waiver packages before you need them. Cross-loan lender exposure aggregation.
**Code entrypoints:** BUILD-01 (covenant alert engine), `finance.check_covenant_compliance`, `finance.list_covenant_alerts`, `market_regime_engine.py` (forward projection input), rate_sensitivity MCP tools
**Dependencies:** BUILD-01 must ship first (3-5 days)

---

### Context-Aware Delegation Engine
**Score:** 9/10 | **Lens:** Network Effects + Negative Space | **Complexity:** Medium
**Competitor signal:** Cherre Agent.STUDIO (user-orchestrated AI), Juniper Square NLP CRM
**Idea:** When a managing partner delegates a task, Winston auto-assembles full context brief (conversations, fund data, LP history, commitments) and pre-drafts the response. Full spec in `docs/feature-radar/context-aware-delegation.md`.
**Code entrypoints:** `ai_gateway.py` (context assembly), `ai_conversations`, `ai_messages`, `actor`, `actor_role`, `capital_call`, `distribution` tables; ECC environment (`repo-b/src/app/lab/env/[envId]/ecc/`)
**Dependencies:** ECC environment health; no architectural unknowns — **READY TO BUILD**

---

### Investor Sentiment Radar — Behavioral NLP
**Score:** 8/10 | **Lens:** Cross-Pollination + Time Travel | **Complexity:** Medium
**Competitor signal:** Juniper Square AI-powered CRM with NLP on investor communications
**Idea:** Combine communication pattern NLP with capital behavior signals (call response timing, reinvestment rates) to predict LP re-up probability and redemption risk 2 quarters in advance.
**Code entrypoints:** `backend/app/services/extraction_engine.py`, CRM service suite (9 files), `finance.list_capital_activity`, engagement tracking service
**Dependencies:** CRM LP communication history seeded; base classifier can ship this week

---

### OM Autopilot — Zero-Touch Deal Ingestion
**Score:** 8/10 | **Lens:** AI-Native Reimagination + Workflow Elimination | **Complexity:** Medium
**Competitor signal:** Dealpath AI Data Extract (90+ fields, 95% accuracy)
**Idea:** Email-triggered OM ingestion — broker sends deal to a monitored inbox, Winston extracts 90+ fields, scores against fund criteria, computes preliminary IRR, surfaces ranked summary before analyst opens the email.
**Code entrypoints:** Document extraction pipeline (`extraction_engine.py`), Deal Radar, `finance.deal_geo_score`, `finance.pipeline_radar`, Gmail MCP connector
**Dependencies:** OM extraction schema (90+ fields), email webhook routing (new infrastructure ~3 days)

---

### Winston MCP Plugin Registry — Extensible Tool Layer
**Score:** 8/10 | **Lens:** Network Effects + Negative Space | **Complexity:** High
**Competitor signal:** Cherre Agent.STUDIO, NVIDIA Agent Toolkit (17 enterprise partners)
**Idea:** Firms register their own MCP tools (proprietary models, internal data connectors) that Winston executes alongside first-party tools. Network effect: shared anonymized tools compound platform intelligence.
**Code entrypoints:** `backend/app/mcp/` (tool registry), tool schema definitions, `agents/mcp.md`
**Dependencies:** MCP registry (deployed ✓); needs registration API, schema validator, sandboxed execution

---

### Market Regime → Portfolio Action
**Score:** 8/10 | **Lens:** Cross-Pollination + AI-Native Reimagination | **Complexity:** Medium
**Competitor signal:** ARGUS portfolio scenarios (manual trigger), IBM/Confluent real-time pipelines
**Idea:** When market regime shifts (risk_on → risk_off), Winston automatically cascades: re-runs stress tests, re-evaluates covenant proximity under new rate assumptions, surfaces Portfolio Impact Brief in chat.
**Code entrypoints:** `market_regime_engine.py` (just deployed ✓), `RegimeClassifierWidget.tsx`, `finance.stress_cap_rate`, `finance.check_covenant_compliance` (BUILD-01), SSE notification layer
**Dependencies:** `market_regime_engine.py` deployed ✓; BUILD-01 recommended first — **CODING SESSION CAN START TODAY**

---

### Acqui-Intelligence — Pre-LOI DD Accelerator
**Score:** 7/10 | **Lens:** Time Travel + Cross-Pollination | **Complexity:** High
**Competitor signal:** Dealpath AI Data Extract + MSCI/RCA comp recommendations
**Idea:** Automated multi-source synthesis from OM entry to pre-LOI brief: OM extraction + public records cross-reference + market regime check + historical lease roll patterns + cap rate spread analysis + go/no-go conviction score. Analyst starts at the 20% requiring human judgment.
**Code entrypoints:** Document pipeline, Deal Radar, `market_regime_engine.py`, MSA zone data, `finance.stress_cap_rate`, `finance.run_sale_scenario`
**Dependencies:** OM Autopilot (#6) and Market Regime → Portfolio Action (#8) must ship first

---

### Winston for Lenders — CRE Credit Portfolio Surveillance
**Score:** 7/10 | **Lens:** Negative Space + Network Effects | **Complexity:** Medium
**Competitor signal:** Yardi Nova Credit integration (tenant screening, consumer credit)
**Idea:** Point Winston's 1,427-line consumer credit decisioning engine at the REPE debt stack — AI-native surveillance of your entire loan portfolio, flagging credit events, maturity risks, cross-collateralization exposure, and lender behavioral profiles.
**Code entrypoints:** `backend/app/services/credit*.py` (1,427-line engine ✓), credit schema (`credit_decision`, `credit_policy`, `credit_case` tables), credit MCP tools, 15-page credit environment
**Dependencies:** Credit decisioning fully deployed ✓; BUILD-01 covenant alerts as complement

---

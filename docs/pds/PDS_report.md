# Winston: Building JLL PDS's AI-Powered BI Platform

**Winston can unify JLL PDS Americas' fragmented data landscape into a single AI-driven analytics platform spanning fee revenue, utilization, client satisfaction, technology adoption, and account management — powered by a text-to-SQL agent on Databricks' gold layer.** This report provides the architectural blueprint, domain-specific metrics, benchmark data, and synthetic data strategies needed to build production-grade dashboards across all nine functional areas. The research draws on JLL's public organizational data, professional services industry benchmarks (SPI 2025, Deltek Clarity), competitor intelligence (CBRE, Cushman & Wakefield), and current best practices for LLM-powered analytics platforms.

---

## 1. JLL PDS governance splits along variable and dedicated lines

JLL PDS Americas operates under two distinct governance tracks that should form the **primary segmentation axis** across every Winston dashboard.

**Variable (markets-focused)** work is led by Louis Molinini (Head of PDS Americas) and organized geographically through regional market leads. This track covers project-by-project, competitively bid engagements — classified as "Transactional" revenue in JLL's corporate reporting. Revenue is lumpy and pipeline-dependent, with forecasting driven by **probability-weighted deal funnels** (pipeline value × win probability). The Americas variable business spans at least 8–9 regions: Northeast & Canada, Mid-Atlantic, Southeast, Midwest, South Central, Southwest, Mountain States & Pacific Northwest, and Northwest, plus Latin America.

**Dedicated (account/portfolio-based)** work is led by Julie Hyson (Head of Americas PDS Portfolio Clients, Services and Industries) with Jaymie Gelino serving as Global Head of Work Dynamics Accounts and Operations. This track covers long-term MSA-based client relationships with embedded JLL teams — revenue is **recurring and predictable**, driven by contract terms, renewals, and scope expansions. Dedicated arrangements often bundle PDS with JLL's broader Integrated Portfolio Services.

The data model in `ds_pds_global` already contains `account_key` and `service_line_key` dimensions in `dim_project`, mapping to source systems including DSSF (Salesforce), Ingenious (sub-project phases), Clarizen (time tracking), and finance systems. Winston should expose every metric through a variable/dedicated toggle, since the two tracks have fundamentally different revenue profiles, forecasting approaches, and performance benchmarks.

PDS operates across **nine service lines**: Project Management, Development Management, Construction Management, Cost Management, JLL Design (600+ designers), Multi-site Program Management, Location Strategy, Tétris (EMEA interiors), and Landmark/Large Development Advisory. At scale, PDS manages **$87.4 billion** in projects annually across **30,000 projects** with **9,300 project managers** in 80 countries. Industry verticals span Corporate/Office, Healthcare, Life Sciences, Financial Services, Industrial, Retail, Hospitality, Data Centers, Education, and Sports & Entertainment.

### Competitor positioning shapes the analytics opportunity

CBRE's Turner & Townsend combination (completed January 2025) created a **$3B+ standalone Project Management segment** with 20,000+ employees — now reported separately and powered by Vantage Analytics, the Kahua PM platform, and Ellis AI (65,000+ users). Cushman & Wakefield's PDS is smaller but deploying an AI+ platform on Azure OpenAI with an 80% reduction in operational cycle time. JLL's advantage lies in INGENIOUS.BUILD (1,000+ PMs, expanding through 2026), JLL Falcon AI, JLL Azara on Azure Databricks, and the first CRE-industry LLM (JLL GPT, launched August 2023). Winston fills the PDS-specific analytics gap that neither JLL Azara nor INGENIOUS.BUILD fully addresses today.

---

## 2. Fee revenue dashboards must handle four financial reference points simultaneously

Corporate CRE finance operates on a vocabulary that Winston must precisely implement: **Plan** (3–5 year strategic financial plan, top-down), **Budget** (annual operating plan, bottom-up, fixed for the year), **Forecast** (dynamic updated projection), and **Actual** (recorded results from the GL). The dashboard needs all four as selectable overlays for any time-series view.

### The 6+6 forecast is PDS's midyear course-correction tool

A **6+6 forecast** combines 6 months of actual results with 6 months of updated projections, typically produced in July. It replaces the original budget's remaining months with current-reality projections. The full family of reforecasts:

- **3+9** (end of Q1): Early recalibration, highest uncertainty — 3 months actual + 9 months forecast
- **6+6** (end of Q2): Midyear correction, most commonly used — often serves as "Year 0" for long-term planning
- **9+3** (end of Q3): Late-year fine-tuning, most accurate — frequently used as the base for next year's budget
- **Rolling forecast**: Maintains a constant 12–18 month horizon, adding a new month as each month closes — eliminates the "fiscal year cliff" but demands more planning resources

Winston should implement a **forecast version selector** (Original Budget, 3+9, 6+6, 9+3, Latest Forecast) with clear visual demarcation between actual and forecasted months — solid bars for actuals, dashed lines or lighter fills for forecast periods.

### Revenue recognition follows ASC 606 with multiple methods

PDS revenue recognition varies by engagement type. **Percentage-of-completion** (cost-to-cost or hours-expended method) applies to most long-term PM and development services contracts. **Time & materials** billing applies to advisory and variable-scope work, recognized at the right-to-invoice amount. **Fixed-fee/milestone-based** recognition applies to phased deliverables. **Retainer/standing charges** for dedicated accounts are recognized ratably over the service period. The dashboard should track **recognized revenue, billed revenue, unbilled revenue (WIP), deferred revenue, and revenue backlog** — displaying a revenue waterfall from backlog through recognition to collection.

### Variable and dedicated revenue require different forecasting dashboards

Variable work needs a **pipeline-to-revenue funnel** (Prospect → Proposal → Negotiation → Won) with probability-weighted values and pipeline coverage ratios (pipeline ÷ quota, target >2×). Dedicated work needs a **contract portfolio view** showing total contract value, monthly run-rate, renewal timeline, and scope utilization. The revenue mix percentage (variable vs. dedicated) is itself a critical risk indicator — higher dedicated share means more revenue stability.

Variance analysis should cover four comparison types: Budget vs. Actual (accountability), Forecast vs. Actual (forecast accuracy), Forecast vs. Budget (direction of change), and Prior Year vs. Actual (growth trend). **Waterfall charts** bridge plan to actual with labeled drivers (new wins, scope changes, delays, cancellations). Set materiality thresholds (>5% or >$50K) for exception-based alerting.

---

## 3. Utilization tracking needs dual timecard and assignment views

Resource utilization is the operational heartbeat of any professional services firm. Winston must implement **both backward-looking timecard utilization** (actual hours worked / available hours) and **forward-looking assignment utilization** (planned allocation % across projects), creating a closed-loop planned-vs-actual comparison.

### Industry benchmarks anchor the threshold definitions

The **2024 professional services industry average** billable utilization stands at **68.9%** (SPI Research 2025 PS Maturity Benchmark), down from 73.2% in 2021. The established optimal target is **75%** billable utilization. High-performing organizations achieve **77.7%**. Architecture & engineering firms — the closest analog to PDS — show a median of **61%** firm-wide but target **75–85%** for technical staff.

Winston should implement these thresholds for PDS:

| Status | Range | Dashboard Color |
|--------|-------|----------------|
| Severely underutilized | <50% | Blue/Gray |
| Underutilized | 50–70% | Yellow |
| Target zone | 70–90% (role-adjusted) | Green |
| High utilization / Monitor | 90–110% | Orange |
| Overworked | >110% sustained | Red |

**Role-based targets** are essential: Junior/technical staff should target **80–90%**, mid-level PMs **75–85%**, senior managers **65–75%**, directors **50–65%**, and executives **40–50%**. A flat utilization target across all roles will produce misleading dashboards.

### Five essential utilization visualizations

The staffing dashboard should include: (1) a **resource utilization heatmap** (people × time periods, color-coded by threshold) as the primary view; (2) a **capacity vs. demand chart** showing available FTE capacity against booked + pipeline-weighted demand over a rolling 3–12 month horizon; (3) a **bench analysis view** listing unassigned resources by skill, market, and availability window; (4) a **regional allocation map** with bubble sizes representing headcount and colors representing utilization levels across JLL PDS's Americas regions; and (5) a **workload distribution histogram** revealing whether utilization is clustered at target or showing dangerous variance.

For capacity planning, implement a **supply-demand gap model**: supply = (headcount × standard hours) − PTO − admin; demand = confirmed assignments + (pipeline × probability weights). Pipeline conversion weights should follow: Prospect 10–15%, Proposal submitted 25–40%, Shortlisted 50–65%, Verbal commitment 80–90%, Signed 100%.

---

## 4. Client satisfaction analytics combines Qualtrics structure with NLP pipelines

Qualtrics exports follow a specific structure: CSV with **two header rows** (internal QIDs + full question text), ~17 metadata columns (StartDate, EndDate, ResponseId in `R_XXXXXXXXXX` format, Duration, Progress, DistributionChannel, embedded data), then question columns. The NPS question type auto-generates 0–10 scoring with Promoter/Passive/Detractor groupings.

### CRE-specific survey design goes beyond likelihood to recommend

A PDS client satisfaction survey should include: **NPS** (0–10), overall satisfaction (1–5), plus driver questions covering **project schedule adherence, budget management, communication quality, team responsiveness, problem resolution, vendor/subcontractor management, safety performance, and innovation/value engineering**. Open-text questions should ask "What is the single biggest improvement?" and "What did we do particularly well?" — these verbatims feed the NLP pipeline.

MIT Center for Real Estate research (2024, 104,586 responses) demonstrates the business case: a **1-point increase** in tenant satisfaction drives **8.6% higher lease renewal likelihood** and **11.5% higher recommendation likelihood**. A **10% improvement** in building-level satisfaction yields **0.9% higher effective gross rent growth**.

### The NLP stack should combine BERTopic, RoBERTa, and LLM extraction

For topic modeling, **BERTopic** is the recommended primary approach — it chains Sentence-BERT embeddings → UMAP dimensionality reduction → HDBSCAN clustering → c-TF-IDF representation, and handles short survey text (typically 4–10 words per response) significantly better than LDA. Its `topics_over_time()` method enables tracking satisfaction themes across quarters. For backup on very short text, the **Biterm Topic Model** is specifically designed for sparse short-text corpora.

For sentiment classification, deploy a **two-tier system**: VADER or TextBlob for real-time lightweight scoring, and **fine-tuned RoBERTa** (F1 ~87% on sentiment tasks) for higher-accuracy batch processing. Use **GPT-4 for aspect-based sentiment extraction** — identifying which specific service dimension each comment addresses.

For churn and satisfaction prediction, **XGBoost/LightGBM** with SHAP interpretability provides the best balance of accuracy and explainability. Key predictive features: NPS score and trend, schedule variance, budget variance, change order frequency, relationship tenure, and communication frequency. Use **Shapley Value regression** for Key Driver Analysis — it calculates each satisfaction dimension's relative contribution to overall NPS while handling multicollinearity. Display results in an **Importance × Performance quadrant chart** to instantly identify priority improvement areas.

---

## 5. Technology adoption tracking follows a four-tier metrics framework

Winston should track technology adoption across JLL PDS's client portfolio using four metric tiers:

**Tier 1 — Engagement volume**: DAU/MAU ratio (stickiness; SaaS average 13–25%, >40% excellent), login frequency, active vs. licensed users (>70% healthy, <50% waste), session duration. **Tier 2 — Depth and breadth**: Feature adoption rate, usage depth per feature, feature breadth score (distinct features used / total available), power user ratio. **Tier 3 — Velocity and lifecycle**: Time-to-value (first login to first key action), time-to-adoption (provisioning to sustained usage, displayed as a Kaplan-Meier survival curve), onboarding completion rate. **Tier 4 — Segmentation**: All metrics sliced by client segment, region, account type, and user role.

JLL's own 2025 Global Real Estate Technology Survey (1,000+ decision-makers) found that **only 5% of companies** have achieved most technology program goals despite 92% piloting AI, and **80% lack an actionable technology strategy**. Companies are 3× more likely to succeed when C-suite leaders actively track progress. This makes a technology adoption dashboard a high-value differentiator for PDS client conversations.

### Health scores should combine four weighted components

A recommended composite health score weights **product usage rate at 35%** (DAU/MAU, feature breadth, login frequency benchmarked by segment), **NPS/CSAT at 20%** (latest score + trend), **product setup at 20%** (features configured, integrations connected), and **CSM qualitative pulse at 25%** (relationship strength, escalation history). Use lifecycle-stage weighting — onboarding customers weight setup heavily; mature customers weight usage depth and expansion signals.

---

## 6. Account management dashboards need portfolio-to-project drill-through

The executive portfolio view follows Stephen Few's mantra: **"Overview first, zoom and filter, then details on demand."** Winston should implement four drill-through levels:

**Level 0 (C-Suite overview)**: Total revenue with YoY growth, portfolio margin trend, health distribution (% Green/Amber/Red), top 5 accounts by revenue, top 5 at-risk accounts. Keep to 5–7 KPIs maximum. **Level 1 (Regional)**: Revenue and margin by region, account count and health distribution, regional budget vs. actual, comparative bar charts across regions. **Level 2 (Account 360)**: Full P&L (revenue, gross margin, operating margin), active project count with RAG breakdown, utilization gauge, NPS trend, contract value and renewal timeline, engagement log. **Level 3 (Project)**: Timeline/Gantt, budget vs. actual, team utilization, deliverable status, EVM metrics.

**RAG scoring should be quantitatively defined**: Green = within 5% of target, Amber = 5–15% below, Red = >15% below — applied independently across revenue, margin, satisfaction, delivery, and contract status. An account is Red if **any** dimension is Red. Include trend arrows showing directional movement.

For strategic analysis, implement **quadrant scatter plots**: Revenue × Growth (BCG-style; identifies Stars, Cash Cows, Question Marks, Underperformers), Satisfaction × Revenue (identifies high-value at-risk accounts), and Cost-to-Serve × Revenue (identifies resource-disproportionate accounts).

---

## 7. Advanced analytics should prioritize project health scoring and delay prediction

### Project health scoring uses four weighted dimensions

Build a composite health score integrating **schedule health (25–30%)** using SPI and critical path float consumption, **budget health (25–40%)** using CPI, burn rate, and contingency drawdown rate, **quality health (15–25%)** using defect rates and inspection pass rates, and **risk health (10–20%)** using open risk count/severity. Use **trailing 30-day performance** rather than cumulative metrics to capture current momentum. The Construction Industry Institute's PHI tool provides an established framework with **43 leading indicators** across 11 categories that PDS could adapt.

Earned Value Management metrics are essential: CPI = EV/AC (cost efficiency), SPI = EV/PV (schedule efficiency), EAC = AC + ((BAC − EV) / CPI). Research from 2025 shows **Earned Schedule provides the most accurate predictions during early project stages**, while **Earned Duration is more reliable at later stages** — Winston should switch automatically based on project phase.

### Predictive models for delays and cost overruns

Up to **80% of construction projects experience delays globally**, and **32% of cost overruns** stem from estimating errors. Random Forest and XGBoost models achieve the best balance of accuracy and interpretability for delay prediction — a study on 191 construction projects achieved **R² = 0.94** for time overruns using neural networks. Most predictive features: critical path float erosion, change order velocity, subcontractor performance history, labor productivity deviations, and RFI response lag.

### Additional high-value analytics for PDS

Beyond the core dashboards, Winston should consider: **Client Lifetime Value** tracking (total fees, project count, satisfaction trend, cross-sell potential), **Win/Loss analytics** (rates by competitor, market, project type), **Vendor/Subcontractor scorecards** (cost reliability, schedule reliability, quality ratings), a **real-time Portfolio Command Center** (geographic heatmap of all active projects color-coded by health), **ESG/sustainability analytics** (carbon tracking, LEED/WELL certification progress, GRESB benchmarking — only 7% of CRE firms use data analytics for ESG strategy, making this a major differentiation opportunity), and **automated narrative generation** from data using LLMs for executive reporting.

---

## 8. The AI query tool architecture chains intent classification through SQL generation to chart rendering

### Text-to-SQL on Databricks gold layer

Winston's SQL agent should **exclusively query the gold layer** — pre-computed business metrics in Delta Lake tables scoped by Unity Catalog. The canonical pattern uses LangChain's `SQLDatabase.from_databricks()` with `catalog` and `schema` parameters to restrict access. Safety controls include: SELECT-only service principal permissions via Unity Catalog, enforced `LIMIT 1000` clauses, query timeouts via warehouse configuration, table whitelisting with `include_tables`, and pre-execution SQL parsing with **sqlglot** to reject any DDL/DML.

**GPT-4o achieves ~52.5% execution accuracy on the BIRD benchmark** (general SQL), but multi-agent correction loops improve accuracy by **~10%**. The recommended pipeline:

1. **Intent classification** → route to financial, utilization, satisfaction, or adoption domain
2. **Schema retrieval** → RAG from Supabase pgvector to select relevant gold tables
3. **SQL generation** → GPT-4o with schema as CREATE TABLE + 3–5 sample rows + business glossary + domain-specific few-shot examples (DAIL-SQL approach)
4. **Validation** → sqlglot syntax check + safety validation
5. **Execution** → Databricks Serverless SQL Warehouse
6. **Error correction** → Up to 3 retries with error context fed back to the LLM
7. **Chart detection** → If data suits visualization, generate chart config
8. **Response assembly** → Stream text + chart JSON via SSE

For schema representation, research conclusively shows that **CREATE TABLE format with sample rows and business glossary annotations** is the most effective for LLM SQL generation. Include primary/foreign keys (0.6–2.9% accuracy improvement) and CRE-specific term definitions (NOI, cap rate, utilization, NPS).

### Chart generation uses declarative Vega-Lite specs

The strongest pattern for AI chat → chart visualization is having the LLM output a **Vega-Lite JSON specification** (declarative, safe, more reliable than imperative code) that the Next.js frontend transforms into Recharts components. Embed chart-type selection rules in the system prompt: time series → line chart, categorical comparison → bar chart, part-to-whole → donut (max 6–7 slices), correlation → scatter plot. Use `<!--CHART_START-->` / `<!--CHART_END-->` delimiters in the streaming response for the frontend to detect and render chart configs inline.

### MCP provides future-proof integration extensibility

Anthropic's **Model Context Protocol** (November 2024) standardizes LLM-to-external-system connections via three primitives: Tools (model-invoked functions), Resources (app-provided data), and Prompts (reusable templates). Databricks now offers **native MCP server support** — pre-configured for Unity Catalog functions, Vector Search, and SQL. Build a custom Winston MCP server using FastMCP that exposes `query_gold_layer` and `get_available_tables` tools, with Supabase storing schema metadata, few-shot examples, and query audit logs.

### The FastAPI ↔ Next.js pipeline uses Vercel AI SDK streaming

The recommended architecture: Next.js frontend uses Vercel AI SDK's `useChat` hook → SSE connection to FastAPI backend → FastAPI orchestrates the full AI query pipeline → streams responses using Data Stream Protocol. Configure `next.config.js` rewrites to proxy `/api/*` to FastAPI. Authentication flows through Supabase Auth (JWT tokens) validated by FastAPI middleware, with user permissions mapping to Databricks Unity Catalog roles.

---

## 9. Synthetic data generation should use rule-based approaches with statistical distributions

For a demo/development environment without real data to train on, **rule-based generation with Faker + NumPy** is optimal over ML-based approaches (SDV/CTGAN), because it provides full control over distributions, business logic, and narrative "stories" in the data.

### Financial data uses log-normal distributions with seasonality

Generate accounts with tier distribution (15% Enterprise, 35% Mid-Market, 50% SMB) and log-normal contract values: Enterprise median ~$700K, Mid-Market ~$160K, SMB ~$50K. Apply **Pareto distribution** — top 20% of accounts should generate ~70% of revenue. Monthly revenue uses multiplicative seasonality factors (Q1: 85–90%, Q2: 105–110%, Q3: 105%, Q4: 90–105%) with 5–10% random noise and 3–12% annual growth rates. Fee structures follow CRE norms: **3–15% of construction cost** (most common), with margins averaging **~35%** (SPI benchmark: 35.9%).

### NPS data follows a right-skewed mixture distribution

The CRE professional services NPS benchmark is approximately **+28**, with **51% Promoters** (9–10), **26% Passives** (7–8), and **23% Detractors** (0–6). Within detractors, scores cluster at 5–6 (~60%), not 0–2. Generate correlated survey dimensions: NPS ↔ CSAT (r ≈ 0.7–0.85), NPS ↔ likelihood to renew (r ≈ 0.8), budget satisfaction ↔ schedule satisfaction (r ≈ 0.5). Use GPT-4 to generate realistic open-text responses conditioned on the NPS score and specific service dimensions.

### Timecard data models multi-project allocation with weekly patterns

Daily hours follow a normal distribution (μ=8.0, σ=0.75), clipped to 4–12 hours. Most employees work **2–4 projects simultaneously** (primary at 50–70%, secondary at 20–30%, remaining at 5–15%). Non-billable time represents 20–30% of hours. Seasonal effects: December −15–20% (holidays), July/August −10% (vacations), quarter-ends +5–10%. Overtime occurs in 10–15% of weeks (>45 hours) and concentrates around project milestones.

### Supabase schema design

The PostgreSQL schema should include: `accounts` (with parent_account_id for hierarchies, tier, industry, region, annual_contract_value), `projects` (with account_id FK, project_type, market, status, budget, fee_type, fee_percentage), `revenue_entries` (monthly grain with project_id, period, service_line, revenue, cost, margin_pct), `survey_responses` (response_id, account_id, project_id, nps_score, dimension ratings, open_comments), `timecards` (employee_id, project_id, date, hours, billable flag, task_code, billing_rate), and `assignments` (employee_id, project_id, allocation_pct, start/end dates). Seed with Faker for entity data, NumPy for statistical distributions, and enforce referential integrity top-down: accounts → projects → assignments → timecards → revenue → surveys.

---

## Conclusion: Winston's architecture should be configuration-driven and domain-aware

The most critical architectural decision is making Winston **domain-aware at every layer** — the SQL agent, chart selection, threshold definitions, and drill-through patterns should all adapt based on which of the five core domains (financial, utilization, satisfaction, adoption, account management) the user is querying. The Databricks gold layer provides the single source of truth, Supabase stores the configuration metadata that makes the system adaptable (schema definitions, few-shot examples, business glossary, health score weights), and the FastAPI pipeline orchestrates the intelligence.

Three insights stand out from this research. First, the **variable vs. dedicated segmentation** is not just an organizational detail — it fundamentally changes how revenue is forecasted, how utilization is benchmarked, and how client health is scored, making it the primary filter across every dashboard. Second, the **professional services industry is in a utilization downturn** (68.9% in 2024, down from 73.2% in 2021), which means PDS leadership will be especially hungry for granular utilization analytics that identify where capacity is being wasted versus where overwork creates burnout risk. Third, **text-to-SQL accuracy with GPT-4o alone (~52% on BIRD) is insufficient for production** — the multi-agent correction loop with schema RAG, few-shot retrieval, and validation is not optional but essential to achieving the 80%+ accuracy needed for executive trust.
# RS Demo Capability Checklist — Winston on novendor.ai

*Derived from the Relativity Space Director of Data & AI job description. Deadline: June 30, 2026 (3 weeks from June 9). Companion to `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md` and `TELEMETRY_TEMPLATE/03_RELATIVITY_INSTANTIATION.md`.*

**Premise:** every bullet in the JD must map to something a Relativity interviewer can watch run live on novendor.ai — not a slide.

**Correction (2026-06-09):** the March capability inventory was stale — a telemetry platform already exists (`tel_` tables, champion anomaly scorer trained on NASA SMAP/MSL via Databricks, replay/runs/monitoring/model-performance/copilot pages under `lab/env/[envId]/telemetry/`). Items previously marked `BUILD` in §1/§2/§4 are partially covered; the true gap is the live streaming ingestion path + medallion ETL + stream monitoring. See `docs/plans/TELEMETRY_STREAMING_SLICE_PLAN.md` for the first build.

**Status legend:** `EXISTS` = built, demo as-is or reskin · `ADAPT` = existing Winston capability, needs telemetry-domain data/config · `BUILD` = net new.

**Data sources (decided 2026-06-09):** hybrid real + synthetic.

| Source | Type | Feeds | Why |
|---|---|---|---|
| ISS live telemetry (NASA public Lightstreamer feed) | Real stream | 2.1 live channels, 1.2/1.10 monitoring | Actual spacecraft telemetry, uncontrolled — demos the controlled-data architecture on ITAR-free data (mirrors ADR 0002's de-controlled path) |
| OpenSky ADS-B | Real stream (fallback) | 2.1 | Demo-day insurance if the ISS feed is down; high-rate, free |
| NASA C-MAPSS turbofan degradation | Real batch (labeled) | 4.1 LSTM anomaly, 4.2 forecast | Run-to-failure engine sensor data; model cards cite a recognizable benchmark with honest eval numbers instead of self-generated data |
| Synthetic Terran R / Aeon R / Stargate generator | Synthetic | 1.1 facts/dims, 2.3 factory dashboards, 4.3 NCRs | No public dataset covers factory ops; this models the domain, not ingestion |

**First build (this week): the streaming vertical slice** — ISS feed → stream intake → bronze landing → incremental silver/gold → live chart with latency overlay → status row + assertion board + SLA monitor. One slice proves 1.1, 1.2, 1.5, 2.1, 2.4 and carries the riskiest external dependency, so it goes first. Fallback switch to ADS-B must be a config change, not a rebuild.

Each item carries a **Verify** block: the exact action, the expected on-screen result, and what counts as failure. A demo item is not "done" until its Verify block passes on production novendor.ai.

---

## 1. Data Engineering — JD: "scalable data architectures, ETL pipelines, data modeling, data warehouse management, reporting infrastructure, high-quality actionable data"

- [ ] **1.1 Telemetry medallion warehouse** — `BUILD` — Bronze/Silver/Gold tables for hot-fire runs, sensor channels, build/print events, NCRs (DIM_VEHICLE, DIM_ENGINE, DIM_PART, DIM_TEST_STAND, DIM_DATE; FACT_HOT_FIRE_RUN, FACT_SENSOR_READING, FACT_BUILD_EVENT, FACT_NCR_EVENT). Seeded with synthetic Terran R / Aeon R / Stargate data.
  **Progress (2026-06-11):** RS Factory generator PR 2 is complete through deterministic g01-g11 master/CRM/PLM/ERP/MES/QMS/test/Jira/docs/AI/gold artifacts. The small profile emits CSV, SQLite, Parquet, JSONL, generated DDL, gold views, Q01-Q12 queries, one-to-one intentional-defect findings, and a byte-identical determinism gate. Postgres medallion integration, ETL status/assertions, and stage lineage verification remain open, so this capability is not yet marked complete.
  **Progress (2026-06-11, PR 5):** a Databricks medallion now runs over the medium-profile build in `novendor_1.rs_factory`: 16 bronze tables loaded with fail-closed manifest-count reconciliation and `_build_sha` provenance, silver window features along the layer axis, and a gold feature store joined to QMS outcomes (`skills/rs-factory-ml/`). This is the lakehouse twin of the Postgres path, not a replacement for it.
  **Verify:** Pick one gold number (e.g., total nominal firing seconds for engine serial AR-014). Trace it: gold fact row → silver staging row → bronze raw record → original landed file, with matching values at each hop. *Fail:* any hop missing, or values diverge without a documented transform.
- [ ] **1.2 Scheduled, fail-closed ETL loop** — `ADAPT` (Winston cron/pipeline infra) — ingestion runs on schedule, writes a "mark refreshed" status row; downstream surfaces read it and display fresh/stale state.
  **Verify (3 tests):** (a) Watch one scheduled run complete; status row timestamp updates and dashboard header shows "data as of <ts>". (b) Remove a source file, trigger run; pipeline halts, dashboards show "Not available — source missing since <ts>", no stale numbers rendered as current. (c) Restore file, rerun; state clears without manual cleanup. *Fail:* silent zeros, stale data presented as fresh, or manual DB surgery needed to recover.
- [ ] **1.3 Data quality assertion board** — `BUILD` — freshness, row-count delta, schema-drift, and value-range checks on every silver/gold table, with a visible pass/fail board and history.
  **Verify:** Inject one bad row (negative thrust value) into bronze; next run flags the range assertion, the offending table is marked quarantined on the board, and the bad row is excluded from gold with a logged reason. *Fail:* bad row propagates to gold or assertion passes.
- [ ] **1.4 Reporting infrastructure** — `ADAPT` — governed report surface (the "Report Center" analog): fixed, certified reports distinct from ad-hoc exploration.
  **Verify:** Test Campaign Summary report renders from gold tables only (confirm via lineage drawer, 3.2), carries a certification badge + owner + refresh timestamp, and exports to PDF with the same numbers shown on screen. *Fail:* report queries raw/bronze, or export diverges from screen.
- [ ] **1.5 Incremental processing + idempotency** — `BUILD` — silver/gold loads are incremental with explicit watermarks (high-water-mark column per source), merged via keyed upsert. No full-table rebuilds on the scheduled path.
  **Verify (2 tests):** (a) Run the pipeline twice in a row with no new source data: second run processes 0 rows, gold row counts and checksums unchanged — bit-identical, no duplicates. (b) Land a file containing 50% already-processed records: only the net-new rows insert; replayed rows update in place, no double-counting in any gold fact. *Fail:* duplicate rows, inflated metrics, or a "rerun" that requires truncate-and-reload.
- [ ] **1.6 Backfill + replay from raw** — `BUILD` — the immutable bronze landing zone supports rebuilding any silver/gold date range from raw, on demand, without touching other partitions.
  **Verify:** Drop the gold partitions for one campaign week; run the backfill job for that range only. Rebuilt rows match pre-drop checksums exactly; partitions outside the range have untouched load timestamps; the run appears in the DAG history (2.4) tagged as backfill. *Fail:* checksum mismatch, collateral rewrites outside the range, or backfill requiring manual SQL.
- [ ] **1.7 Partitioning, clustering, and query right-sizing** — `BUILD` — FACT_SENSOR_READING partitioned by date (Postgres native partitioning at demo scale; BigQuery partition+cluster by date/serial as the named production target), with the high-rate raw waveform channels routed to object storage rather than the warehouse — the "right store for the shape of the data" decision made visible.
  **Verify:** Run the same campaign query with and without the partition filter; show `EXPLAIN (ANALYZE, BUFFERS)` side by side — pruned plan touches only the target partitions, rows/buffers scanned drop by ≥10x, and the comparison is rendered as a demo exhibit with the BigQuery bytes-scanned/cost crosswalk. Confirm waveform blobs are absent from the warehouse and fetched from object storage on the channel-detail view. *Fail:* no measurable pruning, or waveforms stored as warehouse rows.
- [ ] **1.8 Late-arriving + out-of-order data** — `BUILD` — late sensor packets and corrected test results land after their period was processed; the pipeline restates affected aggregates and flags the restatement instead of silently mutating history.
  **Verify:** Land a packet timestamped 2 days into an already-loaded campaign: the affected gold aggregates update on the next run, the metric surface shows a "restated <ts>" marker, and the lineage drawer (3.2) shows both the original and restated values with reasons. *Fail:* late data dropped, or history mutates with no restatement trail.
- [ ] **1.9 Schema evolution + SCD handling** — `BUILD` — a new column appearing at the source is detected (1.3 drift check), quarantined to bronze, and promoted via a versioned migration — never auto-merged into silver. DIM_PART tracks revisions as SCD Type 2 (part rev changes get a new row with validity window; facts join to the revision in effect at event time).
  **Verify (2 tests):** (a) Add a column to a source file: run completes, drift assertion fires, column visible in bronze, silver unchanged until a migration (following `NNN_module_description.sql` convention) promotes it. (b) Rev a part (Rev B): historical hot-fire facts still report Rev A attributes; post-change facts report Rev B; the dimension shows both rows with correct validity windows. *Fail:* auto-propagated schema change, or historical facts retroactively showing Rev B.
- [ ] **1.10 Pipeline right-sizing + SLA evidence** — `BUILD` — documented sizing decisions (batch window, incremental chunk size, partition grain, what streams vs what batches) plus an SLA board: per-job run duration trend, freshness target vs actual, and a load test proving headroom.
  **Verify:** Scale the synthetic generator to 10x demo volume and run the full pipeline: it completes inside the stated SLA window with no assertion failures, and the SLA board shows the run's duration against the trend. The exhibit page states each sizing decision with its trigger for revisiting ("move to streaming ingestion when X exceeds Y"). *Fail:* 10x run blows the SLA, or sizing choices exist only as undocumented defaults.

## 2. Data Platform — JD: "distributed data platform, mission-critical applications, real-time data ingestion, access, and orchestration for test and launch and factory operations"

- [ ] **2.1 Live hot-fire stream** — `BUILD` — simulated test-stand feed (chamber pressure, thrust, temps) streaming to a live dashboard at 1–10 Hz with threshold classification (nominal / anomaly / abort).
  **Verify:** Start a campaign; charts update at ≥1 Hz with end-to-end latency under 2 s (timestamp overlay vs wall clock). Drive chamber pressure past redline via the sim control; alert banner fires within 3 s, event is written to FACT_HOT_FIRE_RUN, and appears in the post-run report. *Fail:* latency >5 s, missed threshold crossing, or alert with no persisted event.
- [ ] **2.2 Batch vs. streaming split + stack crosswalk** — `EXISTS` (architecture) + `BUILD` (one exhibit page) — an architecture page in the environment showing which surfaces are streaming vs scheduled, and the explicit crosswalk: simulated stream ↔ Pub/Sub/Kafka topics; raw landing zone ↔ Cloud Storage data lake; Postgres serving layer ↔ BigQuery warehouse; pipeline jobs ↔ Dataform/Composer. This is how the JD's "Kafka, Spark, data lakes" line gets addressed honestly: same shapes, demo-scale substrate, production target named.
  **Verify:** Page exists, every component on it links to the live surface it describes, and each crosswalk row names the production-scale equivalent and the reason for the demo substitution. *Fail:* any dead link or unexplained substitution.
  **Progress (2026-06-11, PRs 3–5):** the "Kafka, Spark" line now has direct receipts instead of crosswalk-only coverage: the Stargate lane runs Protobuf through Schema Registry into Kafka with managed-Flink window/anomaly statements and a visible DLQ (`scripts/streaming/stargate/`, `infra/confluent/stargate/`; cloud verification pending one `confluent login`), and the Factory ML lane runs PySpark window features + an explicit salted join on Databricks serverless (`skills/rs-factory-ml/`).
- [ ] **2.3 Factory + launch operations dashboards** — `ADAPT` (Winston dashboard composition) — Stargate first-pass yield, work-center throughput, NCR/anomaly trend, supplier-risk view, Flight Readiness snapshot.
  **Verify:** All five surfaces load in <3 s against gold tables; FPY recomputes correctly when a synthetic build event is added (hand-calc one work center and compare); Flight Readiness rolls up only from released snapshot data and shows its as-of date. *Fail:* hand-calc mismatch, or readiness view mixes refreshed and stale inputs without flagging.
- [ ] **2.4 Orchestration visibility** — `ADAPT` — a pipeline DAG/run-history view: which jobs ran, in what order, duration, status.
  **Verify:** The DAG view shows the dependency order matching the actual schedule; clicking a failed run (from test 1.2b) opens its error log. *Fail:* run history disagrees with status rows.

## 3. Trusted Metrics — JD: "high-quality, actionable data across all systems"

- [ ] **3.1 Governed metric registry** — `ADAPT` (REPE authoritative-state pattern) — "first-pass yield," "nominal firing seconds," "FRR readiness %" defined once (name, owner, formula, source model, grain); every dashboard and every AI answer resolves through it.
  **Verify:** Query "first-pass yield" in three places — factory dashboard, Report Center, and Winston chat — and get the identical value and identical displayed definition. Then change the definition in the registry (test env): all three surfaces reflect it; nothing required editing a dashboard. *Fail:* any surface carries its own copy of the formula.
- [ ] **3.2 KPI-to-source lineage drawer** — `ADAPT` (AuditDrawer / `?audit_mode=1`) — click any governed number: metric definition → SQL model → source tables → refresh timestamp → null reasons.
  **Verify:** Drawer opens on every number used in the demo script (enumerate them in the script; spot-check 100%). For one metric, execute the displayed SQL manually against gold and confirm it reproduces the on-screen value exactly. *Fail:* any scripted number without a drawer, or SQL that doesn't reproduce the number.

## 4. Machine Learning & AI — JD: "design, development, deployment of AI/ML models... automation, decision-making, predictive analytics... scalable, reliable, move the needle on critical metrics" + About You: "deep learning, LSTM, time-series forecasting, predictive analytics for real-time decision-making, mathematical underpinnings"

- [ ] **4.1 Deep-learning anomaly detection on sensor channels** — `BUILD` — sequence model (LSTM autoencoder — deliberately, to hit the JD's LSTM line) flagging off-nominal hot-fire segments, wired into the live stream (2.1) for real-time scoring.
  **Verify:** Held-out test campaign with labeled injected anomalies: report precision, recall, and F1 on the model card; live demo catches a seeded anomaly the static threshold misses (drift pattern within redlines). Reproducibility: rerun the eval notebook/job and get the same metrics. *Fail:* metrics not reproducible, or model only catches what thresholds already catch.
- [ ] **4.2 Time-series forecast** — `BUILD` (historyrhymes ML harness reusable) — factory throughput or test-cadence forecast with confidence intervals.
  **Verify:** Walk-forward backtest over the synthetic history; MAPE/MAE shown next to the forecast chart; forecast beats a naive seasonal baseline (show both). Confidence bands: ~80% of held-out actuals fall inside the 80% interval (±10 pts). *Fail:* no baseline comparison, or intervals decorative rather than calibrated.
- [ ] **4.3 NCR recurrence detection (NLP)** — `BUILD` — embed NCR free-text descriptions, cluster similar nonconformances, surface "this defect pattern recurred Nx on part family X."
  **Verify:** Seed 3 known defect families in synthetic NCR text; clustering recovers all 3 with ≤1 misassigned record per family; clicking a cluster lists its member NCRs with the matched text highlighted. *Fail:* known families split or merged wholesale.
- [ ] **4.4 Model lifecycle / MLOps view** — `BUILD` (small) — a model registry page: each deployed model's version, training data window, eval metrics, deploy date, and an eval-over-time chart. This is the JD's "deploying and managing ML models in production" made visible.
  **Progress (2026-06-11, PR 5):** the factory-ml page's Registry section renders the seed's governed champion/challenger registry beside the live MLflow run (run id, GroupKFold metrics, SHAP drivers, registered `rs_print_strength`/`rs_print_passfail`); the provenance footer pins every number to the seed build sha. The telemetry-domain LSTM registry of this item remains separate work.
  **Verify:** Both models (4.1, 4.2) appear with complete cards; retrain one model and the registry shows the new version alongside the old with metric deltas; the live scorer (2.1) reports which model version produced each score. *Fail:* scores not attributable to a version.
- [ ] **4.5 "Move the needle" framing** — every model view states the operational decision it changes (anomaly → abort/review call; forecast → capacity plan; NCR clusters → corrective-action priority).
  **Verify:** Each model page has a "decision this informs" line and links to the dashboard/metric it affects. *Fail:* model presented as output without a consumer.

*Reinforcement learning (JD: "proficient in... reinforcement learning"):* not demoable credibly in 3 weeks. Addressed as a talk track + one paragraph in the strategy doc (§ AI roadmap) naming where RL legitimately fits (test-sequence optimization, agent policy tuning) and why it is deliberately not in the 90-day plan. Honest scoping is the director-level answer here.
*Mathematical underpinnings:* carried by the model cards (4.4) — loss functions, validation methodology, and calibration shown, plus interview talk track. No separate demo item.

## 5. Grounded AI Analyst — JD: "NLP," "Transformers/LLMs," "actionable insights, automate decision-making"

- [ ] **5.1 RAG over program corpus with citations** — `ADAPT` (Winston copilot + credit walled-garden pattern) — index strategy doc, ADRs, operating-model pages, metric definitions, test reports. Every answer cites sources.
  **Verify:** 10-question scripted eval set with known answers in the corpus: ≥9/10 answered correctly, 10/10 carry at least one citation, and every citation link opens the exact source passage. One question whose answer was deliberately removed from the corpus returns "not in the indexed corpus" — not an invented answer. *Fail:* any uncited claim or fabricated citation.
- [ ] **5.2 Metric-grounded numeric answers** — `ADAPT` — numeric questions resolve through the metric registry (3.1), never free SQL against raw columns.
  **Verify:** Ask "what is first-pass yield this month?" — answer matches the dashboard value exactly and the response exposes the governed definition used (lineage drawer or inline). Ask a paraphrase ("what fraction of prints pass first time?") — same number. Banned-path check: logs show no raw-table SQL generated for either. *Fail:* dashboard/chat divergence or raw-column query in the log.
- [ ] **5.3 Fail-closed nulls** — `EXISTS` (REPE null_reason pattern) — unanswerable questions return explicit "not available + reason."
  **Verify:** Three scripted unanswerables — (a) data not collected ("turbine blade temp on stand 3"), (b) period not yet released, (c) out-of-scope calc. Each returns a distinct, accurate null reason; none returns an estimate. *Fail:* any approximation or generic error.

## 6. AI Infrastructure & Agentic Architecture — JD: "building and scaling AI infrastructure... managing ML models in production... agentic architectures (e.g., MCP)" + "cloud platforms, containerization (Docker, Kubernetes), orchestration"

- [ ] **6.1 MCP tool registry view** — `PARTIAL` — the **platform** MCP registry exists (31 tool categories in `backend/app/mcp`: typed, permissioned, audited), but the **telemetry** copilot uses an inline allow-list, *not* the MCP registry, and there is no telemetry-environment MCP registry view or denied-call demo yet. Honest framing already lives in the How-It-Works exhibit (`MCP_REGISTRY_HEADER` in `repo-b/src/components/telemetry/howItWorksData.ts`). **Ticket 3** of the telemetry research-gap plan registers telemetry-specific MCP tools and the denied-call demo.
  **Verify:** Registry page lists the telemetry-environment tools with input/output schemas and permission scopes; calling a tool the demo role lacks permission for is refused with the policy named. *Fail:* unscoped tool execution.
- [ ] **6.2 Ticket-to-PR loop** — `ADAPT` (ADO intake + feature-dev chain) — the strategy doc's prototype loop: ADO ticket → plan → AI-generated SQL with dry-run cost estimate → PR with evidence → one-way DONE. Run live on a small item from the 109-item RS-Analytics backlog.
  **Verify:** End-to-end on one real backlog item in <10 min on stage: ticket transitions are visible on the ADO board; the PR contains the plan, generated SQL, dry-run cost, and test evidence; DONE is one-way (attempt to reopen is blocked or flagged); a human approval gate is demonstrably required before merge. *Fail:* any step hand-faked, or merge possible without the gate.
- [ ] **6.3 Agent audit trail** — `EXISTS` — every agent action leaves a receipt.
  **Verify:** Immediately after the 6.2 run, pull the audit log filtered to that session: every tool call, model call, and write is present with timestamps, actor, and inputs/outputs; count matches the steps just watched. *Fail:* gaps between observed actions and the log.
- [ ] **6.4 Deployment infrastructure exhibit** — `BUILD` (one page) — how this actually runs: containerized services (Docker on Railway), Vercel frontend, CI/CD pipeline with gates, environment promotion, and the GCP-target mapping (Cloud Run/GKE, Cloud Build) for production scale. Covers the JD's cloud/containerization/orchestration line with the real deploy chain, not a diagram of someone else's.
  **Verify:** Page shows the live CI run for the most recent deploy (link to actual pipeline run, green), the container/service inventory matches `railway status`, and a rollback path is documented with the command that executes it. *Fail:* described infra disagrees with live status.

## 7. Cost Governance — implied by "warehouse management" + strategy doc budget guardrail

- [ ] **7.1 Query cost guardrail** — `BUILD` (small) — dry-run estimate before execution; over-budget queries blocked with the estimate shown.
  **Verify:** Ask Winston for a deliberately expensive full scan: refusal shows estimated cost, the per-session budget, and the cheaper alternative (partition-filtered query) it offers instead; accepting the alternative executes and reports actual cost ≤ estimate. The block event appears in the audit log (6.3). *Fail:* expensive query executes, or estimate absent from the refusal.
- [ ] **7.2 Cost attribution view** — `ADAPT` (AI usage attribution service) — spend by pipeline/agent/user/day.
  **Verify:** The 6.2 run and the 7.1 blocked attempt both appear attributed to the demo session within 5 min; daily totals reconcile with the audit log event count. *Fail:* unattributed spend rows.

## 8. Leadership, Mentorship & Strategy — JD: "lead, mentor, grow a team... innovation, continuous learning, technical excellence... long-term strategy... technical roadmap aligned with company goals... organizational change... strategic roadmaps, cross-functional collaboration"

These are artifacts and operating-system evidence, surfaced inside the environment so they're part of the same demo:

- [ ] **8.1 Program control tower page** — `ADAPT` — live render of the 30/60/90 plan, 10 epics / 109-item ADO backlog (with live board state, not a static export), and the costed budget ($258k–$428k + pending-pricing items).
  **Verify:** Backlog counts on the page match the live ADO board at demo time (automated check, not manual sync); budget line items sum to the stated range; each epic links to its backlog items. *Fail:* page disagrees with the board.
- [ ] **8.2 Decision records (ADRs)** — `EXISTS` — `docs/adr/rs-analytics/` (0001 Google-native operating model; 0002 ITAR boundary AI scoping) linked from the control tower. The ITAR ADR is the strongest director-judgment exhibit: it changed the architecture (Looker/Dataform/Vertex out of the controlled boundary) based on primary-source research.
  **Verify:** Both ADRs reachable in one click; each states context, decision, alternatives rejected, and consequences; the ITAR ADR cites the Google control-package page with retrieval date. *Fail:* ADRs are summaries without the decision/alternatives structure.
- [ ] **8.3 Operating-model narrative (organizational change)** — `EXISTS` — the NCF → Relativity crosswalk: proof the operating model ran somewhere real and translates. This answers "have you driven organizational change" with receipts.
  **Verify:** Crosswalk page maps all five load-bearing patterns to both the NCF instantiation and the Relativity target, and each pattern links to the live demo surface that implements it (e.g., fail-closed loop → 1.2's pipeline page). *Fail:* patterns asserted without a live counterpart.
- [ ] **8.4 Engineering culture & mentorship exhibit** — `BUILD` (one page, assembled from existing assets) — how technical excellence is enforced here: the governance layer (CLAUDE.md routing contract, mandatory DB guardrails, state-lock lint that fails CI, mass-deletion protection), the review gates (human approval on risky changes), and the continuous-learning loop (nightly regression, AI test reports, code-quality scorecards feeding Monday planning). Framed as: "this is what I'd build for a team of engineers — standards as code, not as wiki pages."
  **Verify:** Each claimed mechanism links to its live evidence: the lint test that actually fails on a banned pattern (run it on a seeded violation), a real PR blocked by a gate, and the most recent nightly regression report with date. The mentorship talk track (growing engineers, goal alignment) is written into the demo script with two concrete NCF examples. *Fail:* any mechanism described but not demonstrable.

*Education & 10+ years experience:* resume/credential territory, not platform demo. Covered by the application materials and the visual-resume environment (`META_PROMPT_VISUAL_RESUME.md`) if time permits — explicitly out of scope for this checklist's June 30 gate.

---

## 9. JD Coverage Matrix

Every JD line, where it's addressed, and the form of evidence:

| JD requirement | Addressed by | Evidence form |
|---|---|---|
| Data engineering: ETL, modeling, warehouse, reporting | 1.1–1.4 | Live demo |
| Scalable architectures: incrementality, backfill, partitioning, right-sizing | 1.5–1.7, 1.10 | Live demo + EXPLAIN/SLA exhibits |
| Data modeling depth: SCD, late data, schema evolution | 1.8, 1.9 | Live demo |
| High-quality, actionable data | 1.3, 3.1, 3.2 | Live demo |
| Distributed platform, mission-critical | 2.2, 6.4 | Exhibit + live infra |
| Real-time ingestion (test/launch/factory) | 2.1, 2.3 | Live demo |
| Orchestration | 1.2, 2.4 | Live demo |
| ML/AI driving automation + decisions | 4.1–4.5, 6.2 | Live demo + model cards |
| Scalable, reliable models; critical metrics | 4.4, 4.5 | Model registry + eval history |
| Predictive analytics, time-series, LSTM | 4.1 (LSTM AE), 4.2 (forecast) | Live demo + backtest |
| Deep learning | 4.1 | Model card |
| NLP | 4.3, 5.1–5.2 | Live demo |
| Transformers/LLMs | 5.1–5.3 (grounded analyst) | Live demo |
| Reinforcement learning | Strategy doc § AI roadmap + talk track | Document (honest non-demo) |
| Mathematical underpinnings of ML | 4.4 model cards + talk track | Model cards + interview |
| AI infrastructure, models in production | 4.4, 6.4 | Registry + infra exhibit |
| Agentic architectures (MCP) | 6.1–6.3 | Live demo |
| Kafka, Spark, SQL, NoSQL, data lakes | 2.2 stack crosswalk; SQL throughout | Exhibit + live demo |
| Cloud (AWS/GCP), Docker, K8s, orchestration | 6.4 + GCP-target plan §4 | Live infra + strategy doc |
| Leadership: mentor, grow team, culture | 8.4 + talk track | Exhibit + script |
| Innovation, continuous learning, excellence | 8.4 (nightly loops, scorecards) | Live evidence |
| Strategy: long-term roadmap, company alignment | 8.1, strategy doc, ADRs | Control tower + docs |
| Cross-functional collaboration | 8.1 (epics span subsystems), 8.3 | Control tower + crosswalk |
| Organizational change | 8.3 | Crosswalk with receipts |
| Strategic roadmaps | 8.1 (30/60/90 + backlog + budget) | Live board |
| Education, 10+ yrs, 5+ yrs leadership | Application materials / visual resume | Out of demo scope |
| Aerospace/manufacturing (nice-to-have) | Entire telemetry domain model | Whole environment |

Unaddressed-by-demo items are exactly three — RL, math underpinnings, credentials — and each has a named non-demo carrier. Nothing is silently dropped.

---

## Build sequence (June 9 → 30)

| Week | Dates | Focus | Exit criteria |
|---|---|---|---|
| 1 | Jun 9–14 | **Spine:** RS Telemetry environment scaffold (`winston-create-environment`), synthetic data generator, medallion schema partitioned from day one (1.1, 1.7), incremental/idempotent ETL loop + assertions (1.2, 1.3, 1.5), metric registry (3.1) | Verify blocks 1.1, 1.2(a–c), 1.3, 1.5(a–b), 3.1 pass on stage; double-run is bit-identical |
| 2 | Jun 15–21 | **Surfaces + DE depth + AI:** dashboards + reports (1.4, 2.3, 2.4), backfill/replay (1.6), late-data restatement (1.8), schema evolution + SCD2 (1.9), lineage drawer (3.2), grounded analyst (5.1–5.3), live stream (2.1) | 10-question RAG eval ≥9/10; stream latency <2 s; backfill checksum match; Rev A/Rev B test passes |
| 3 | Jun 22–28 | **Differentiators:** LSTM anomaly + forecast + registry (4.1, 4.2, 4.4), 10x load test + SLA board (1.10), ticket-to-PR loop (6.2), cost guardrail (7.1), control tower + culture exhibit (8.1, 8.4), crosswalk pages (2.2, 6.4) | Full 20-min demo runs end to end on production; 10x run inside SLA; all Verify blocks green |
| Buffer | Jun 29–30 | Rehearsal, recorded backup, demo script freeze | Recording exists; script frozen |

Cut order if time runs short: 4.3 (NCR clustering) → 7.2 (cost attribution view) → 1.9 SCD2 half only (keep schema-drift quarantine) → 4.2 (forecast, keep anomaly) → 2.4 (DAG view, keep status rows). Do not cut 1.5–1.7 or 1.10 (incrementality, backfill, partitioning, right-sizing — these ARE the data engineering depth), 3.2 (lineage), 5.x (grounded analyst), 6.2 (ticket-to-PR), or 8.4 (culture exhibit) — those carry the JD's core claims.

## Suggested 20-minute demo arc

1. Control tower (8.1) — what we're building, the backlog, the budget — 2 min
2. Live hot-fire stream + LSTM anomaly catch (2.1, 4.1) — 4 min
3. Factory dashboards → click a number → lineage drawer (2.3, 3.2) — 3 min
4. Three-question AI analyst: cited / governed / refused (5.1–5.3) — 4 min
5. Ticket-to-PR loop with dry-run cost gate (6.2, 7.1) — 5 min
6. Culture exhibit + ADRs + ITAR scoping as the closer (8.4, 8.2) — 2 min

## Master verification gate (June 28)

- [ ] Every item's Verify block executed on **production novendor.ai** (not local/stage) with result logged in a run sheet (item, tester, timestamp, pass/fail, screenshot)
- [ ] All fail-closed paths re-tested in the same session: missing source (1.2b), bad row (1.3), duplicate-replay file (1.5b), unapproved schema change (1.9a), unanswerable ×3 (5.3), over-budget query (7.1), unpermissioned tool (6.1)
- [ ] DE depth re-proven cold: double-run idempotency check (1.5a), one-week backfill with checksum match (1.6), pruned-vs-unpruned EXPLAIN captured as screenshot (1.7), 10x volume run inside SLA (1.10)
- [ ] Lineage drawer opens on 100% of numbers named in the demo script
- [ ] Both model cards show reproducible eval metrics; one retrain executed to prove the registry versioning (4.4)
- [ ] RAG eval set rerun cold (fresh session): ≥9/10 with citations
- [ ] 6.2 loop run on a backlog item not used in rehearsal
- [ ] Coverage matrix (§9) re-read against the JD line by line; any drift documented
- [ ] Backup recording of the full arc captured before any live showing
- [ ] Demo script frozen; cut-order decision (if any) recorded in CHANGELOG

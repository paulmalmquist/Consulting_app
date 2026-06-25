# Borrowable Reference Projects to Make Winston's Resume Claims Airtight

## TL;DR
- For each of the 16 audit gaps there is at least one strong, actively maintained open-source reference; the highest-leverage borrows are **NASA Telemanom** (anomaly detection + per-channel attribution), **NASA C-MAPSS RUL projects + MAPIE** (RUL with conformal intervals), **Feast** (point-in-time feature store), **MLflow Model Registry** (promotion gates), **Evidently/NannyML** (drift dashboards), and **NASA Open MCT / Yamcs** (operator go/no-go surfaces).
- The gaps that are about making proof *visible* are best served by visualization-heavy projects: Open MCT, Yamcs, Evidently/NannyML dashboards, DataHub/OpenMetadata lineage graphs, and Plotly-Dash/Streamlit RUL dashboards. The gaps about *infrastructure rigor* are best served by Feast, MLflow, OpenLineage/Marquez, pgvector, and MAPIE.
- Recommended sequence: borrow the aerospace-native visual surfaces first (they map directly to the Relativity framing), then the MLOps rigor patterns, then wire a single "evidence card" surface that links every claim to its proof.

## Key Findings

Paul's resume (verified in Drive) frames Winston as an AI-native execution platform with governed RAG, MCP tool orchestration, audit drawers, "authoritative-state contracts," and fail-closed reads. The Relativity instantiation reframes this around engine/test/flight telemetry and go/no-go loops. The references below are organized by the 16 audit gaps, flagged as **[VISUAL]** (strong UI to borrow) or **[INFRA]** (pipeline/architecture to borrow).

## Details

### 1. Multivariate time-series anomaly detection via autoencoder reconstruction — [INFRA + some VISUAL]
- **NASA Telemanom** (github.com/khundman/telemanom). The canonical reference: LSTM-based prediction of spacecraft telemetry, with prediction error used as the anomaly score and a nonparametric dynamic thresholding (NDT) approach for flagging off-nominal sequences. Per the canonical Hundman et al. SMAP/MSL benchmark, the dataset comprises **82 unique telemetry channels total (SMAP = 55, MSL = 27), 105 labeled anomaly sequences (SMAP = 69, MSL = 36; 62 point + 43 contextual), and 496,444 telemetry values evaluated (SMAP = 429,735, MSL = 66,709)**. Per the repo README, this is "real spacecraft telemetry data and anomalies from the Soil Moisture Active Passive satellite (SMAP) and the Curiosity Rover on Mars (MSL)... all telemetry values are pre-scaled between (-1,1)... Channel IDs are also anonymized, but the first letter ... indicates the type of channel (P = power, R = radiation, etc.)." Includes a `result-viewer.ipynb` notebook to visualize per-stream results. Borrow: the error-scoring + dynamic-threshold pattern and the channel-by-channel results layout. Maps directly to Winston's "reconstruct a high-dimensional state vector and flag OOD inputs."
- **OmniAnomaly** (github.com/NetManAIOps/OmniAnomaly). Stochastic RNN + VAE reconstruction; uses POT (Peaks-Over-Threshold / EVT) to set the anomaly threshold. Same SMAP/MSL/SMD datasets. Borrow: reconstruction-probability scoring and EVT thresholding as a more statistically grounded alternative to fixed percentiles.
- **vincrichard/LSTM-AutoEncoder-Unsupervised-Anomaly-Detection**. A true LSTM-autoencoder (not just predictor) producing per-feature error vectors via cosine similarity, plus a two-stage isolation-forest scoring stage. Borrow: the explicit per-feature reconstruction-error vector, which is exactly what Winston needs for the 256-D state-vector framing.
- For turbofan-specific anomaly detection, the C-MAPSS projects in section 3 double as off-nominal detectors.

### 2. Channel divergence / anomaly attribution — [VISUAL]
This is a well-supported pattern: decompose the reconstruction error per input dimension and rank channels by contribution.
- **Telemanom** already scores each channel independently, so the "which channel drove it" ranking falls out naturally.
- **SHAP on autoencoder reconstruction error** (documented in arXiv:2112.08442). Uses SHAP waterfall/force plots to show which input features pushed the reconstruction error from its base value to the anomalous value, color-coded red (push up) / blue (push down). Borrow: the waterfall visualization for a single flagged event — a very strong, recognizable "proof surface."
- **Explainable autoencoder per-feature error** (arXiv:2601.09287, IEC 61850 GOOSE; CERN CMS DQM arXiv:1811.05269; metricgate.com docs). All compute per-feature error contributions and visualize them as ranked bar charts / time plots. Borrow: a ranked horizontal bar chart of channel contributions next to the anomaly timeline.
- Note: the CMS/CERN and spacecraft examples (LIME on channel G-7, etc., from ScienceDirect S0952197624002410) show domain-credible "this sensor caused the anomaly" framing for an aerospace audience.

### 3. RUL regression with calibration / prediction intervals — [INFRA + VISUAL]
- **NASA C-MAPSS** is the canonical turbofan RUL benchmark (Saxena & Goebel, 2008). It has four sub-datasets **FD001–FD004 with 21 sensor signals + 3 operational settings** (26 channels including engine ID and cycle); **FD001 = 100 training units / 100 test units, single operating condition and one failure mode, while FD004 = six operating conditions and two failure modes** — pick FD001 for a clean demo and FD004 to show robustness. Strong reference implementations:
  - **Al-Moccardi/Conformal-Predictive-Maintenance** ("Conformal-PdM"). Single-notebook end-to-end RUL on C-MAPSS *with conformal prediction* for calibrated, statistically valid bounds, plus a monotonicity-regulation step and an EoL/"proximity to end-of-life" score. Best single match for "RUL + calibration + intervals."
  - **shining0611armor/Predicting-...-C-MAPSS** — CNN-LSTM, LSTM, and CNN variants, regression and classification, with early-stopping comparisons. Good architecture-comparison reference.
  - **boemer00/jet-engine-degradation-prediction** (Transformer-based) and **zhmou/Turbofan-engine-RUL-prediction** (attention; uses the asymmetric scoring function that penalizes late predictions — the risk-averse aerospace metric). Borrow: the asymmetric late-prediction penalty, which is exactly the right framing for go/no-go.
  - The arXiv:2212.14612 reference implementation conformalizes DCNN and Gradient Boosting RUL estimators with split conformal (SCP), normalized nonconformity, and CQR — directly relevant to PICP/PINAW coverage.
- **Visualization**: see section 14 dashboards (Plotly Dash / Streamlit) that plot RUL with prediction-interval bands and color-coded risk tiers.

### 4. PySpark feature pipelines with point-in-time correctness — [INFRA]
- **Feast** (github.com/feast-dev/feast, docs.feast.dev). The reference open-source feature store. `get_historical_features` performs point-in-time joins; per the Feast docs, "Feast joins these tables with battle-tested logic that ensures point-in-time correctness so future feature values do not leak to models." The `entity_df` uses a reserved `event_timestamp` key where each timestamp acts as the upper bound for the point-in-time join: Feast retrieves the latest feature values at or before this time, preventing data leakage from future events. Compute-engine abstraction supports Spark, Snowflake, Flink, Ray. Borrow: the entity-dataframe + event-timestamp join pattern as the literal mechanism that proves no-look-ahead.
- **Scaling Feature Engineering with Feast and Ray** (Towards Data Science) shows rolling-cutoff snapshots (nine 90-day windows spaced 30 days apart) computed in parallel — a concrete "point-in-time feature backfill" pattern for time-series.
- For "pipeline receipts" / raw→features→prediction lineage, combine with OpenLineage/Marquez (section 8).

### 5. Feature store / registry / feature contracts — [INFRA + VISUAL]
- **Feast** again: it ships a feature **registry** ("centralized catalog of feature definitions and metadata ... single source of truth"), feature **views**, feature **services** (named feature sets consumed by a model), entities with join keys, and a **UI for viewing and exploring features**. Borrow: the FeatureView/Field schema as the basis for a "feature contract" table, and the Feast UI as the model for a feature-registry surface.
- The PyTorch-ecosystem Feast post and Red Hat OpenShift AI integration give credible enterprise framing (training-serving skew elimination, governance/lineage).

### 6. MLflow model registry with promotion gates — [INFRA + VISUAL]
- **MLflow Model Registry** (mlflow.org). Provides model versioning, stage transitions (Staging→Production→Archived), champion/challenger **aliases** (`models:/name@champion`), model lineage (which run/experiment produced it), and annotations. Borrow: the alias-based champion/challenger pattern and the `can_promote()` gate function (e.g., promote only if candidate AUPR ≥ champion − 0.002 AND calibration_psi ≤ 0.1 AND p95_ms ≤ 25) — a clean, demonstrable promotion gate.
- **Databricks MLOps workflow** docs show the full champion-vs-challenger comparison and validation-task pattern.
- The "7 MLflow Model Registry Practices" and Markaicode end-to-end guides show logging lineage (data commit SHA, feature view versions), calibration plots, and decision notes as artifacts — exactly the "model evidence card" content.
- Visualization: the MLflow UI itself shows versions, run IDs, stages, and metrics; borrow its layout for Winston's model-versions table.

### 7. Drift monitoring (PSI / data / concept drift) — [VISUAL]
- **Evidently AI** (github.com/evidentlyai/evidently). The strongest visual reference. `DataDriftPreset(method="psi")` and per-column drift with auto-selected tests (PSI, KS, Jensen-Shannon, Wasserstein). Produces interactive HTML reports and a monitoring UI; the drift table sorts drifting features first and shows distribution overlays with mean ± std bands. Borrow: the drift table + distribution-overlay visualization and PSI threshold bands.
- **NannyML** (github.com/nannyml/nannyml). Best for *performance estimation without labels* (CBPE for classification, DLE for regression) and PCA-reconstruction-error multivariate drift with a threshold band (solid line = reconstruction error, shaded = confidence bound, dotted red = alert threshold). Borrow: the "estimated performance vs realized performance" plot and the reconstruction-error-with-threshold band — both very strong proof surfaces, and the PCA approach echoes Winston's autoencoder theme.
- **whylogs/WhyLabs** for lightweight profiling at scale (privacy-preserving statistical profiles).
- Note: Evidently = best out-of-the-box dashboards; NannyML = best at linking drift to actual performance impact (reduces false alarms).

### 8. Metric lineage / data lineage visualization — [VISUAL + INFRA]
- **OpenLineage + Marquez** (openlineage.io, github.com/MarquezProject/marquez). OpenLineage is the LF AI&Data open standard for run/job/dataset lineage; Marquez is the reference implementation with a web UI lineage graph showing dataset/job dependencies, run-level metadata, and table- and column-level lineage. Borrow: the DAG visualization and the run-ID-keyed metadata model for "pipeline receipts." Native integrations with Spark, Airflow, dbt. (Caveat: Marquez's column-level lineage UI is limited — it shows column lineage as JSON rather than a polished graph.)
- **DataHub** (github.com/datahub-project/datahub). **11,815 GitHub stars** (per modern-datatools.com, citing release v1.5.0.2, April 2026; the GitHub topic page now shows 12k), Apache 2.0, originally built at LinkedIn and open-sourced in 2020, 70+ native integrations. Polished cross-platform lineage graph; column-level lineage in open-source Core since v0.9.0; click an expand button (with dependency count) to traverse upstream/downstream; click a column breadcrumb to isolate one field's path to source. Per official docs: "If there is column-level lineage to hidden assets or the table-level view is getting too busy, you can visualize lineage focused on a single column by clicking on the breadcrumb on a column." Strongest clickable end-to-end "source → transformation → metric" trace.
- **OpenMetadata** (github.com/open-metadata/OpenMetadata). **14.2k GitHub stars**; the project cites "14,000+ GitHub Stars, 4,000+ Enterprise Deployments, 450+ Code Contributors, 130+ Data Connectors." Native "metric lineage" and "ML model lineage" as first-class concepts; column-level layer on by default; drag anchor points on either side of columns to trace individual columns. Per docs: "Use the anchor points on either side of the columns to create links and trace individual columns through their lineage."
- **dbt docs DAG + exposures**. Auto-generated left-to-right lineage graph; `exposures` tie a dashboard/metric (via `metric()`/`ref()` dependencies) back to models; exposures render as distinctive orange nodes. Open-source dbt Core is table-level only; column-level lineage is a dbt Cloud/Explorer feature. Borrow: the exposures concept to declaratively bind a KPI to its upstream models in code.
- Recommendation: DataHub or OpenMetadata for the live click-through; dbt exposures to show metrics tied to models in code.

### 9. Conformal prediction / prediction intervals for time-series — [INFRA + VISUAL]
- **MAPIE** (github.com/scikit-learn-contrib/MAPIE, mapie.readthedocs.io). The reference open-source library for distribution-free prediction intervals; wraps any scikit-learn/TF/PyTorch model. For time series it implements **EnbPI** (Ensemble Batch Prediction Intervals) via `MapieTimeSeriesRegressor` + `BlockBootstrap`, with `regression_coverage_score` (PICP) and `regression_mean_width_score` (PINAW). Borrow: the coverage-vs-width evaluation and interval visualization; pair with the C-MAPSS RUL models in section 3.
- The "awesome-conformal-prediction" list (github.com/valeman/awesome-conformal-prediction) is a good curated index.

### 10. pgvector + HNSW analog retrieval with composite similarity — [INFRA + VISUAL]
- **pgvector** (github.com/pgvector/pgvector). Postgres extension for vector similarity with HNSW indexing (since 0.5.0); cosine `<=>`, L2 `<->`, inner product `<#>`; iterative index scans in 0.8.0. Borrow: HNSW index + cosine query as the base analog-retrieval mechanism (and it fits Paul's existing PostgreSQL/Supabase stack).
- **Composite similarity**: combine pgvector cosine (on a state-vector embedding) with **DTW** via **tslearn** (`tslearn.metrics.dtw` / `dtw_path`, supports multivariate series and Sakoe-Chiba/Itakura constraints) for shape similarity, plus categorical matching. tslearn's gallery includes the classic DTW cross-similarity-matrix-with-warping-path visualization — a strong "why these are analogs" proof surface. Borrow: cosine (coarse top-K) → DTW re-rank (shape) → categorical filter, with a top-K analogs panel showing each component score.

### 11. Walk-forward validation for time-series — [VISUAL]
- **scikit-learn `TimeSeriesSplit`** (expanding-window walk-forward; supports `gap` to prevent leakage). The sklearn "Visualizing cross-validation behavior" example renders the canonical train/test fold chart (training folds blue, test folds orange, iterations on the y-axis) — borrow this exact visualization for the methodology surface.
- **BlockingTimeSeriesSplit** (goldinlocks.github.io) for non-overlapping blocks. MachineLearningMastery's backtesting tutorial gives the rolling/expanding-window reference code.
- Borrow: the fold-by-fold chart as the visible proof of "no look-ahead in validation," directly supporting the no-look-ahead control on the model evidence card.

### 12. RAG with citations + governed retrieval + refusals — [VISUAL + INFRA]
- **Aayush-Mishra-11/Rag-Workflow**. A compact, on-point reference: a RAG system over the AWS Customer Agreement that **refuses when the document lacks the answer**, **cites source page + section**, and **logs every Q&A to SQLite** with retrieved chunk IDs, cosine scores, citations, latency, and refusal status. This is almost exactly Winston's "citation chain + audit drawer + refusal" claim in miniature — strongest single borrow.
- **Citation-enforced / auditable RAG** patterns (arXiv:2603.14170 fiscal docs; the Nemotron "EvidenceQA" Medium walkthrough that even adds a citation to refusals). Borrow: enforced claim→source mapping and the verifier step.
- **Governed retrieval** framing (Kiteworks, Atlan, InformationWeek): pre-retrieval RBAC/ABAC scoping, honoring source ACLs, preserving the retrieval trail (source corpus, doc versions, retrieval results, timestamps). Borrow: the "preserve the retrieval trail" checklist as the audit-drawer spec.
- Over-refusal evaluation (arXiv:2510.10452, OR-Bench) for measuring appropriate vs over-refusal.

### 13. MCP governed tool registry / agentic workflows — [VISUAL + INFRA]
- **agentic-community/mcp-gateway-registry**. Enterprise MCP gateway + registry: OAuth, dynamic tool discovery, per-tool RBAC, audit trails, "registry cards" for each asset, plan/approve/execute governance. Strong match for Winston's MCP tool registry with permission policy + audit logging.
- **microsoft/agent-governance-toolkit**. Policy engine (YAML/OPA/Cedar) → identity → tamper-evident audit log, with Allowed→execute / Denied→GovernanceDenied decision records, and a fail-closed `govern()` primitive. Covers OWASP Agentic Top 10. Borrow: the decision-record / "plan → approve → execute → receipt" flow and fail-closed default — directly mirrors Paul's "deterministic guardrails, full provenance" claim.
- **Bifrost MCP gateway** (getmaxim.ai) shows an audit-log UI: every tool call with tool name, server, arguments, result, latency, virtual key, and parent LLM request; manual-approval vs autonomous execution modes. Borrow: the audit-log table layout for an "agent control tower."
- TrueFoundry/JFrog/Arcade registries give vocabulary (vetting workflow, approval tiers, virtual MCP server) for the governed-registry UI.

### 14. Go/No-Go decision dashboards / operator surfaces — [VISUAL]
- **NASA Open MCT** (github.com/nasa/openmct, nasa.github.io/openmct). The flagship: web-based mission-control framework, drag-and-drop composable telemetry displays (plots, tables, layouts), real-time + historical data. Per NASA's official "Who's Using Open MCT" page, deployments include ASTERIA (JPL), Cold Atom Laboratory (JPL/ISS), ICESat-2 (Goddard), JASON-3, Jason-CS/Sentinel-6 (JPL+ESA), Landsat 9, LightSail 2 (Planetary Society), Mars 2020 (JPL), and Mars Cube One/MarCO (the CubeSats that accompanied the InSight lander); developed at NASA Ames in collaboration with JPL under Apache 2.0. Has a **live demo** and a tutorial repo. Borrow: the composable operator-display paradigm and the look-and-feel for Winston's go/no-go surface — maximally credible for a Relativity audience.
- **Yamcs** (yamcs.org, github.com/yamcs). Open-source mission control (C3) used by NASA VIPER, ESA, Astrobotic; real-time telemetry dashboards, configurable widgets, event/rule-based alerting, archive + playback, and explicit support for "assembly, integration and testing" — i.e., test-stand use. Often paired with Open MCT (openmct-yamcs). Borrow: the alerting/event-rule engine and the AIT/test-stand framing.
- **Plotly Dash / Streamlit RUL dashboards** (Mihai Timoficiuc Medium; shankara-93 and devwithmohit C-MAPSS repos). Concrete three-tier GO/REVIEW/NO-GO color coding: HEALTHY (green) / WARNING (orange, <80 cycles) / CRITICAL (red, <30 cycles). Borrow: the color-coded risk-status function and the at-a-glance fleet view — the literal go/no-go proof surface.

### 15. Model evidence cards / model cards / trust centers — [VISUAL]
- **Google Model Card Toolkit** (TensorFlow) — open-source toolkit generating standardized model cards (provenance, intended use, metrics, limitations). The foundational reference for the "evidence card" format.
- **Hugging Face model cards** and **AWS SageMaker Model Cards** (built-in generation, versioning, governance) for enterprise card patterns.
- **arXiv:2411.12275** ("Building Trust") proposes extending model cards with precise Intent/Use/Scope fields — useful for Winston's card to expose feature set, training/scoring windows, validation methodology, promotion gates, drift status, and no-look-ahead controls.
- Borrow: a single Winston "Model Evidence Card" surface that aggregates the MLflow promotion gate (§6), walk-forward methodology (§11), conformal coverage (§9), drift status (§7), and feature contract (§5) — this is the keystone that ties every claim to a visible proof.

### 16. NASA Open MCT and mission-control visualization frameworks — [VISUAL]
Covered in §14: **Open MCT** is the primary borrow; **Yamcs** (+ openmct-yamcs integration), **NOS3** (which bundles Open MCT, Yamcs, COSMOS for a simulated spacecraft ground system), and **Ball Aerospace/OpenC3 COSMOS** are the surrounding ecosystem. Open MCT's plugin/telemetry-adapter architecture (object providers, historical + realtime adapters) is the cleanest thing to study for wiring Winston's telemetry into a composable operator UI.

## Recommendations

**Stage 1 — Aerospace-native visual surfaces (highest credibility-per-effort for the Relativity framing):**
1. Stand up a **go/no-go operator surface** styled after **Open MCT / Yamcs**, with the three-tier GREEN/ORANGE/RED risk coding from the C-MAPSS Dash dashboards. Threshold to change approach: if the demo audience is engineering-leadership (not operators), prioritize the evidence card (Stage 3) over pixel-perfect mission control.
2. Wire **Telemanom-style per-channel anomaly attribution** (ranked bar chart + SHAP waterfall) next to the anomaly timeline.

**Stage 2 — MLOps rigor (the "airtight" proof):**
3. Implement **Feast** point-in-time joins + a feature-contract table, and emit **OpenLineage** events to **Marquez/DataHub** for the raw→features→prediction "pipeline receipt."
4. Add **MLflow** champion/challenger with an explicit `can_promote()` gate; surface versions/run-IDs/gates in a model-versions table.
5. Add **MAPIE EnbPI** conformal intervals on the RUL model and report **PICP/PINAW**; render interval bands.
6. Add **Evidently** (PSI drift table) and/or **NannyML** (estimated-vs-realized performance, PCA reconstruction-error band).
7. Render the **`TimeSeriesSplit` walk-forward fold chart** as the validation proof.

**Stage 3 — The keystone:**
8. Build one **Model Evidence Card** (Google Model Card Toolkit format) that aggregates: model type, feature contract, training/scoring windows, walk-forward methodology, conformal coverage, drift status, promotion gate, and no-look-ahead control — each linking to its live surface from Stages 1–2. This single artifact is what makes every resume claim traceable.
9. For the agentic/RAG claims, mirror **Rag-Workflow** (citations + refusals + SQLite audit log) and the **microsoft/agent-governance-toolkit** decision-record flow for the MCP "plan→approve→execute→receipt" control tower.

**Benchmarks that would change the plan:** If interval coverage (PICP) falls well short of nominal (e.g., 95% target, <90% empirical), switch from split conformal to EnbPI/CQR before demoing. If PSI on key channels stays <0.1 in the demo data, inject a synthetic drift scenario so the drift dashboard visibly fires. If the anomaly detector's per-channel attribution is unstable, fall back to Telemanom's prediction-error channels rather than a full autoencoder.

## Caveats
- Several "trust center"/MCP-governance sources are vendor blogs (TrueFoundry, JFrog, Bifrost/Maxim, Arcade) with marketing framing — use them for UI/vocabulary patterns, not as neutral benchmarks.
- Marquez column-level lineage UI is weak (JSON, not graph); DataHub/OpenMetadata are stronger for visual column-level traces, but their richest features sometimes assume enterprise deployments.
- dbt's interactive column-level lineage (dbt Explorer) is a paid Cloud feature; open-source dbt Core lineage is table-level and static.
- GitHub star counts cited are approximate point-in-time figures (DataHub showed 11.8k–12.1k across different repo pages).
- C-MAPSS is *simulated* turbofan data and SMAP/MSL are *spacecraft* (not engine test-stand) telemetry; they are credible analogs for Relativity's domain but should be framed as transferable patterns, not identical use cases.
- Many time-series anomaly benchmarks (SMAP/MSL) have documented labeling caveats in the literature; don't over-claim F1 numbers without noting the dataset's known issues.
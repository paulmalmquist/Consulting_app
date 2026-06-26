# Phase 9 — Telemetry Demo Rehearsal + Narrative Hardening

Companion to the Phase 8 plan ([`0012-telemetry-presentation-readiness.md`](./0012-telemetry-presentation-readiness.md))
and its acceptance note ([`0012-telemetry-phase8-acceptance.md`](./0012-telemetry-phase8-acceptance.md)).

**Audience:** a technical interview panel (software + data engineers). Depth is welcome — every claim on screen
drills to its source, and the script is built to invite "show me how that number is computed" questions.

**Live-data posture:** warm the stream consumer *before* the demo so Mission Control shows live anomaly rows.
The cold-state recovery path is documented and is itself an honesty proof point.

The site is live at `https://novendor.ai` on backend `e28f2c73`; `verify_lineage --base https://novendor.ai`
= 6 PASS / 1 WARN / 0 FAIL.

---

## 0. Pre-demo setup (run T-10 minutes)

**Demo env base URL:** `https://novendor.ai/lab/env/telemetry-demo/telemetry`

1. **Log in with the scoped reviewer credential, not admin.** Go to `https://novendor.ai/login`, sign in as
   username **`telemetry`** (password = `TELEMETRY_REVIEWER_PASSWORD`, in `docs/reference/ENV_KEYS.md`). Never
   show the `info@novendor.ai` admin credential in a demo. The reviewer login is env-scoped to the telemetry
   demo, which is exactly the access story you want a panel to see.
2. **Warm the stream consumer.** Open **Mission Control** (`/telemetry/stream`) and click **"Start stream"**.
   That POSTs `/api/telemetry/stream/control`, which brings the ingest worker online in **capture mode**
   (deterministic recorded replay — *no live Confluent broker, no serving cost*). Idempotent: clicking twice is
   safe. Wait ~30–60s, then confirm the **LIVE ANOMALY EVENTS** panel shows rows and the **Export XLSX** button
   is enabled. (If you would rather demo cold, skip this — see §7 Recovery; the empty state is honest, not broken.)
3. **Sanity-check prod** in a terminal (optional, off-screen):
   - `curl -s https://novendor.ai/api/version` → `e28f2c73`
   - `python scripts/streaming/stargate/verify_lineage.py --base https://novendor.ai` → 6/1/0
4. **Pre-open tabs** in demo order: Overview, Mission Control, Replay, Model Performance, RUL Calibration,
   Model Registry, Factory · NCR, Flight Readiness, Metric Lineage. Have a terminal ready for the one XLSX
   `curl` (§ technical proof) if the panel wants to see the binary + the fail-closed 404.
5. **Cost hygiene (post-demo):** the warm-up uses capture mode, so there is nothing to stop. If anyone warms the
   *live* Confluent path during Q&A, use the `confluent-stargate-lifecycle` skill's lossless stop-serving after.

---

## 1. The narrative arc (the spine of the whole demo)

> **Launch became a data problem.** A modern launch program emits more telemetry than any team can watch.
> → **Telemetry creates operational burden** — streams, anomalies, dead-letter queues, thousands of runs.
> → **Models help only when the evidence is honest** — a model that hides its uncertainty is worse than none.
> → **So every number on this product drills to its source, context, and export.**
> → **And lineage + null states are visible, not hand-waved** — when something is empty, it says *why*.

Every page below advances one beat of that arc. The product's thesis is not "we have dashboards"; it's
"this is a *governed data product* — you can trust each number because you can take it apart."

---

## 2. Guided demo script (8–10 minutes)

Timings are targets; the **bold** lines are the talk track, the `›` lines are the click path.

### Beat 1 — The thesis (Overview, ~1:30)
`›` Open **Overview** (`/telemetry/telemetry`).
- **"This is a launch-telemetry operating console. The premise: the launch became a data problem — more signal
  than any team can watch, and the cost of missing the wrong anomaly is a vehicle."**
- **"Notice the framing is honest from the first screen."** `›` Click a **Big Number** → the drawer opens a
  `SourceRowsTable` labeled **fixture** for the cadence/anchor rows, and the Timeline shows an honest *no-rows*
  state rather than inventing a series.
- **"Each number carries a source-kind tag — live rows, computed artifact, fixture, or unavailable. Nothing is
  dressed up as live when it isn't."** `›` Point to the bridge links (Mission Control / Replay / Model Performance /
  Metric Lineage) — **"the thesis hands off to the proof."**

### Beat 2 — The operational burden (Mission Control → Stargate → Replay, ~2:30)
`›` **Mission Control** (`/telemetry/stream`).
- **"Here's the live serving layer."** With the consumer warmed, the channel strips animate and **LIVE ANOMALY
  EVENTS** lists rows from `tel_anomaly_events`.
- **"These are real rows, and I can take them with me."** `›` Click **Export CSV**, then **Export XLSX** — the
  XLSX is a server-generated workbook from the allowlisted `anomaly_events` dataset, not a client toy.
- `›` **Stargate Live** (`/telemetry/stargate`) — **"the printer-floor analog: a recorded capture replayed over
  real SSE, labeled as a capture, never as a live printer."** `›` Show the anomalies + DLQ CSV exports.
- `›` **Replay** (`/telemetry/replay`) → open the **ReplayForensicsDrawer** (Signal / Model / Evidence / Operator
  / Lineage). **"This is the autopsy. Watch what it does when a field isn't available —"** `›` point to a `NaRow`:
  **"it says exactly why, e.g. the fixture's recorded champion run differs from the live registry run. It surfaces
  the mismatch instead of silently reconciling it."**

### Beat 3 — Models, but only with honest evidence (Model Performance → RUL → Registry, ~3:00)
`›` **Model Performance** (`/telemetry/model-performance`).
- **"Models earn their place only when the evidence is honest."** `›` Open a model's drawer → the **champion /
  challenger** role tags, the **live rows · tel_model_runs** chip, and a real **DatabricksRunLink** per
  `mlflow_run_id`. **"That link goes to the actual MLflow run. Where we only have an id and no resolvable URL, the
  link is disabled and the id is copyable — we never fabricate a URL."**
- `›` **RUL Calibration** (`/telemetry/calibration`). **"Remaining-useful-life with split-conformal intervals.
  The honest headline is PICP 0.778 at 80% and 0.903 at 90% — and we say outright this is not SOTA."** `›` Open
  **"Unit-level rows + export"** → the per-cycle drawer (true vs predicted, the 80/90 bounds, the derived coverage
  hit). **"The scalars are a computed artifact from the FD001 evidence run; the trajectory is a labeled replay
  fixture. CSV exports the displayed rows; the server-XLSX button is honestly disabled because this isn't a
  `tel_*` table."**
- `›` **Model Registry** (`/telemetry/registry`). **"Lifecycle and lineage. Where a challenger isn't registered,
  the cell says so with a null_reason instead of going blank; training window and validation method that aren't
  recorded are labeled, not guessed."** `›` Export **Models XLSX**.

### Beat 4 — Every number drills and exports (Factory NCR → Flight Readiness, ~2:00)
`›` **Factory · NCR** (`/telemetry/factory`).
- **"Non-conformance reports — the unstructured quality record. This is the launch-became-a-data-problem thesis in
  miniature: the failure signal is buried in free text, so we embed and cluster it into defect families."** `›`
  Filter exemplars by **severity**, then click a record → the drawer shows id/severity/workcell + the cluster's
  Databricks run, and fail-closes detected_at/disposition because the corpus grain doesn't carry them. `›` Export
  the clusters + exemplars CSV.
- `›` **Flight Readiness** (`/telemetry/factory-ml`). **"Per-vehicle readiness and the layer-window heat-map.
  Everything here is a labeled fixture."** `›` On the heat-map, **"each cell is a rolling-std z-score; the amber
  golden pair is the inconclusive run that *rhymes* with the failed one — the case for similarity-based review."**
  `›` Export the heat-map cells CSV. **"We show ingredient counts but say plainly that per-ingredient weight isn't
  published in the rollup — null_reason, not a fabricated weight."**

### Beat 5 — Lineage and null states are first-class (Metric Lineage + close, ~1:00)
`›` **Metric Lineage** (`/telemetry/metric-lineage`). **"Every metric maps to its source table and artifact; the
LineageDrawer walks the chain to the Databricks lake."**
- **Close on the honesty proof:** `›` (terminal, optional) show `anomaly_events.xlsx` returns a valid workbook and
  `bogus.xlsx` returns **404 + null_reason**. **"The product fails closed. An unknown export is a 404 with a
  reason, not a silent empty file. That's the whole pitch: you can trust the numbers because the system tells the
  truth when it doesn't have them."**

---

## 3. Executive version (2 minutes)

- **"A launch program drowns in telemetry — the launch became a data problem. This console turns that flood into a
  governed data product."** (Overview)
- **"It's live: real anomaly streams, a forensic autopsy on every run."** (Mission Control + one Replay drawer)
- **"Models are here, but only with honest evidence — calibrated uncertainty, champion-vs-challenger, and we say
  out loud where a model isn't state-of-the-art."** (Model Performance + one RUL line)
- **"And the trust mechanism is simple: every number drills to its source and exports, and when data is missing
  the system says *why* and fails closed."** (one CSV/XLSX export + the 404)
- **Land it:** **"This isn't a demo reel. It's a product you can audit. That's the difference between a dashboard
  and a system of record."**

---

## 4. Page-by-page click path (modular — new features slot in as rows)

Base: `https://novendor.ai/lab/env/telemetry-demo/telemetry`

| # | Page | Route | Demo action | Proof shown |
|---|---|---|---|---|
| 0 | (warm-up) | `/stream` | click "Start stream" | consumer warms, anomaly rows appear |
| 1 | Overview | `/telemetry` | click a Big Number | fixture `SourceRowsTable`, honest no-rows Timeline, source-kind tags |
| 2 | Mission Control | `/stream` | Export CSV + XLSX | live `tel_anomaly_events` → server XLSX |
| 3 | Stargate Live | `/stargate` | anomalies/DLQ CSV | recorded-capture honesty label |
| 4 | Replay | `/replay` | open ReplayForensicsDrawer | 5-tab autopsy, `NaRow` null_reasons, lineage links |
| 5 | Test Runs | `/runs` | click a run | live `tel_test_runs`, run-link fields fail-closed + copyable id; CSV |
| 6 | Model Performance | `/model-performance` | open model drawer + CSV/XLSX | champion/challenger, real DatabricksRunLink |
| 7 | RUL Calibration | `/calibration` | "Unit-level rows + export" | computed-artifact + fixture, PICP 0.778/0.903, CSV |
| 8 | Model Registry | `/registry` | Models XLSX | lifecycle + null_reasons, no blank cells |
| 9 | Factory · NCR | `/factory` | severity filter + record drill + CSV | computed-artifact vs fixture, fail-closed fields |
| 10 | Flight Readiness | `/factory-ml` | heat-map cells CSV | fixture label, z-score meaning, weight null_reason |
| 11 | Metric Lineage | `/metric-lineage` | LineageDrawer | source→artifact→lake chain |
| 12 | (close) | terminal | `anomaly_events.xlsx` + `bogus.xlsx` | valid binary + fail-closed 404 |

---

## 5. "What this proves technically" (for the SWE/DE panel)

- **Source-kind as a first-class type.** `SourceKind = live-rows | computed-artifact | fixture | unavailable`
  threads from the data layer to the chip on screen. It's not a label someone typed — the page derives it from
  the data's provenance (e.g. NCR is `computed-artifact` when provenance=`databricks` because a real *batch* run
  is not live serving).
- **Read-only, allowlisted server exports.** The XLSX route (`/api/telemetry/export/{dataset}.xlsx`) only accepts
  allowlisted dataset keys, builds **no SQL from request input**, reuses the page's existing tenant-scoped read
  service, bounds the row count, and returns a header-only-but-valid workbook with a null_reason when empty.
  Unknown dataset → 404. The Next.js proxy forwards the binary via `arrayBuffer` (a `.text()` pass would corrupt
  the xlsx) — a real engineering subtlety worth surfacing if asked.
- **Fail-closed by construction.** Every drawer field uses an `isPresent` check → "Not available" + a specific
  reason. Waterfall-dependent and unrecorded fields return `null` + `null_reason`, never an approximation.
- **Lineage you can walk.** `verify_lineage` is a real script you can run against prod; its **WARN** ("serving
  slice may be empty") is the system being honest about a cold consumer, not a failure.
- **Evidence is frozen and tested.** `test_evidence_freeze.py` guards every shipped value, so a refactor can't
  quietly drift a headline metric. The degenerate autoencoder stays labeled a *judgment artifact*, and pointwise
  F1 0.313 stays primary over the flattering point-adjusted 0.645.
- **The nav is governed too.** `telemetryNav.test.ts` locks the visible/hidden split and asserts hidden routes
  still resolve — rationalization is hide-before-delete, enforced by a test, not vibes.

---

## 6. Expected objections + answers

| Objection | Answer |
|---|---|
| "Is this real data or a mock?" | Both, **and the screen tells you which** — the source-kind tag. Live serving rows (`tel_*`), computed evidence artifacts (FD001 conformal), and labeled public/replay fixtures. Nothing fixture is shown as live. |
| "Your model isn't state-of-the-art." | Correct, and **we say so on the page** (RUL "not SOTA", RMSE 17.33 vs the ~13 literature bar). The product's value is calibrated honesty, not a leaderboard score. |
| "The autoencoder anomaly score looks weak." | It's labeled a **degenerate / judgment artifact**, not a champion. We kept the honest negative result instead of hiding it. |
| "F1 looks low." | We show the **pointwise** F1 (0.313) as primary, not the inflated point-adjusted 0.645. Lower honest number beats a higher misleading one. |
| "Anomaly export is empty." | Because the live consumer is cold — the export returns a **valid header-only workbook + null_reason**. Warm the stream (one click) and it fills. Empty ≠ broken. |
| "Can I trust the lineage?" | Run `verify_lineage --base https://novendor.ai` yourself; walk the Metric Lineage → LineageDrawer chain to the Databricks lake; click the MLflow run links. |
| "What happens on a bad request?" | `bogus.xlsx` → 404 + `export_dataset_not_allowed`. Fails closed, no silent fallback. |
| "Why are some links disabled?" | When only an id exists with no resolvable URL, we render the id copyable and disable the link with a reason — **no fabricated URLs**. |

---

## 7. Recovery path (if something is cold or breaks mid-demo)

- **Anomaly stream is empty / XLSX disabled** → *don't apologize, reframe*: "This is the honest empty state —
  header-only workbook, null_reason, no fake rows." Then click **Start stream** and continue; it warms in ~30–60s.
  If it won't warm, the recorded **Stargate** capture and the **Replay** autopsy are fully self-contained.
- **A page is slow to load** → it's a real prod fetch. Talk through the source-kind chip while it loads; the
  acceptance note confirms all 12 routes resolve.
- **`verify_lineage` shows WARN** → that's expected and *on-message*: "the system is telling me the serving slice
  is cold." A FAIL would be different — none are expected at `e28f2c73`.
- **An export link 404s for an unknown dataset** → that's the intended fail-closed behavior; use it as the closing
  proof, not an error.
- **Worst case (route down)** → fall back to the **acceptance note** ([`0012-telemetry-phase8-acceptance.md`](./0012-telemetry-phase8-acceptance.md))
  as the receipt of what's shipped, and the local test suite (225 telemetry + 8 frozen-evidence) as proof the
  behavior is real.

---

## 8. One-page evidence receipt summary (hand-out / leave-behind)

**Live:** `https://novendor.ai` · backend `e28f2c73` · `verify_lineage` 6 PASS / 1 WARN / 0 FAIL.

**Source-kind honesty** — every number is one of `live-rows` / `computed-artifact` / `fixture` / `unavailable+null_reason`.

**Drill + export** — 12 surfaces, CSV broadly available; server XLSX on `model_runs` + `anomaly_events`
(allowlisted, read-only, bounded, fail-closed 404 on unknown).

**Real links** — Databricks/MLflow run links where an id resolves; copyable id + disabled link where it doesn't;
no fabricated URLs.

**Frozen evidence (test-guarded):** Spin 1 90% FP reduction (η² 1.0→0) · Spin 2 93% redundant at failure,
leads 9/14/11, ~11-cycle lag · Spin 3 PICP 0.86, 15/100 flips · Spin 5 FD001 98.9% in / FD004 90.5% out ·
Spin 6 +8% lift, 9% overlap · degenerate autoencoder = judgment artifact · honest metrics primary (F1 0.313).
RUL FD001 PICP 0.778/0.903, RMSE 17.33 (not SOTA, stated). Flight Readiness VEH-TR-003 0.58, pr_auc 0.84.

**Governance** — fail-closed null_reasons throughout; nav rationalized hide-before-delete (test-locked);
Phase 8 (8A–8I) shipped to prod with acceptance receipts.

---

## Phase 9 deliverables checklist

- [x] 8–10 minute guided demo script (§2)
- [x] 2-minute executive version (§3)
- [x] Page-by-page click path (§4)
- [x] "What this proves technically" notes (§5)
- [x] Expected objections + answers (§6)
- [x] Recovery path for cold route/export/consumer (§7)
- [x] One-page evidence receipt summary (§8)
- [x] Pre-demo warm-up step (§0)

**Note for upcoming scope:** the panel-driven feature additions slot into §4 as new rows and §5 as new proof
points without disturbing the arc (§1). When a feature lands, add its row + a one-line "what it proves" and,
if it ships a new export dataset, a line in §8.

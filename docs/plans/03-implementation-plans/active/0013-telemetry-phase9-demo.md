# Phase 9: Relativity Onsite Demo Package

Canonical demo + conversation package for the Relativity onsite. Built from three source files
(`relativity_MES_architecture.md`, `relativity_questions_and_demo_path.md`, `relativity_questions_demo.md`)
and the live telemetry app shipped in Phase 8. Companion to
[`0012-telemetry-presentation-readiness.md`](./0012-telemetry-presentation-readiness.md) and the acceptance
note [`0012-telemetry-phase8-acceptance.md`](./0012-telemetry-phase8-acceptance.md). Top-level pointer:
[`docs/DEMO_TELEMETRY.md`](../../../DEMO_TELEMETRY.md).

House style: no em dashes, no hype, claims traceable, synthetic data labeled synthetic. Say "operating
model," not "nice dashboard." Say "shaped like Manufacturo," not "Manufacturo's schema." The pitch is a
governed-ML and data-product operating model that transfers, not a claim of aerospace domain expertise.

The site is live at `https://novendor.ai`, backend `e28f2c73`; `verify_lineage --base https://novendor.ai`
returns 6 PASS / 1 WARN / 0 FAIL.

---

## The three layers

1. **Live novendor.ai telemetry demo (primary proof).** The deployed product. It demonstrates the operating
   model: governed ML, champion/challenger, promotion gates, conformal uncertainty, abstention / fail-closed
   behavior, lineage and drill-through, export and source-kind honesty. This is the working evidence. It is
   not replaced by the MES facsimile.
2. **Relativity MES/Lakebase facsimile (the "I understand your world" bridge).** A synthetic, shaped-like
   the Relativity stack architecture artifact for the whiteboard and as a possible future demo. It talks
   build-to-flight lineage, MES/ERP/PLM seams, Manufacturo-like One View genealogy, cost reconciliation,
   Lakebase, the medallion, and Unity Catalog lineage. It is synthetic and shaped-like, not actual Relativity
   schema, and not a claim that the live app already implements Relativity's MES.
3. **Room-specific conversation plan.** Tailor by who is in the room. Pick four or five questions live per
   person, do not fire all twenty, let the conversation choose the rest.

---

## 1. Executive demo thesis

**Launch became a data problem.** Each era of spaceflight solved a hardware constraint and created a larger
burden of data: more telemetry, more test evidence, more manufacturing genealogy to interpret. Going to rate
production, the binding constraint is speed of judgment: reading the telemetry, trusting the model, tracing
the number, and acting before delay becomes risk.

That problem spans the whole stack, and the operating model is the same across all of it:

- **Telemetry and test** generate the signal. It arrives with dropouts, clock skew, and sensor failures.
- **Factory quality** (NCRs, as-built genealogy) is the unstructured record of what actually happened.
- **MES / ERP / PLM seams** are where the same part has three identities and the numbers stop agreeing.
- **Model governance** decides whether a model is trustworthy enough to inform a real decision.
- **Data lineage** makes every number traceable back to its source.
- **Financial and operational trust** is the payoff: finance and ops working from the same number.

The point is not "I built an aerospace app." The point is "I built the operating model around how modern
launch, test, and factory data should be governed," and that model is what transfers.

---

## 2. Five-minute live demo script (the Gold Demo Path)

The demo is evidence behind the story and a backstop for the technical rooms, not the centerpiece you steer
everyone toward. Lead with the deployed product. Narrate to the operating model, not the pixels. Each beat is
mapped to the exact route and the exact on-screen number so the click path does not surprise you.

Env base: `https://novendor.ai/lab/env/telemetry-demo/telemetry`. Two beats live on the hidden-but-resolving
`/evidence` page, so **pre-open that deep-link tab** (see Pre-flight). Total runs about four and a half minutes.

**Beat 0, frame before touching the screen (about 15 sec).**
"This is a telemetry anomaly workbench. I built it to demonstrate an operating model for governed ML, not
aerospace expertise. The pattern is what transfers."

**Beat 1, Overview and thesis (about 40 sec).** Route: `/telemetry` (Overview, the Bottleneck Map).
"The thesis is that launch became a data problem. Each era solved a hardware constraint and created a larger
burden of telemetry, test, and manufacturing evidence to interpret. This platform operates on that problem."
Tie: the decision-velocity problem going to rate production.

**Beat 2, model lifecycle and promotion gate (about 45 sec).** Route: `/model-performance`.
Show champion versus challenger (champion `tel_anomaly_mad` v3, challenger `tel_anomaly_pca` v2) and the
promotion gate. "Every model has a champion and a challenger, and promotion runs through a gate declared
before training, on held-out data, not a judgment call. The gates here are anomaly F1 at least 0.30 and RUL
RMSE at most 25. A challenger only takes over if it clears the gate." Tie: how models stay trustworthy in a
mission-critical environment.

**Beat 3, conformal lower-bound RUL (about 45 sec).** Route: `/evidence` (deep-link; the `RulConformalCard`).
"This is uncertainty done honestly. The lower bound is a conformal prediction with measured coverage of 0.86
against a 0.90 target, so I can tell you exactly how often the interval actually contains the truth. Fifteen
of a hundred test units clear on the point estimate but the conformal lower bound demands review or no-go. I
would rather show calibrated uncertainty than one confident number that is wrong." Tie: maintenance and capex
timing, knowing what you do not know on a test stand.
Note: the RUL Calibration nav page (`/calibration`) is a separate, complementary surface (the FD001
conformal bands and unit-level drill, PICP 0.778 at 80% and 0.903 at 90%). The 0.86 two-sided coverage and
the 15-of-100 flips live on the Evidence card. Click the right one for the number you say.

**Beat 4, competence envelope and abstention (about 45 sec).** Route: `/evidence` (deep-link; the
`CompetenceEnvelopeCard`).
"This is fail-closed governance. An FD001-trained model's competence envelope holds for its own held-out
units, 98.9 percent in-envelope. But 90.5 percent of FD004, a regime-shift stress test the model was never
trained for, falls out of that envelope. The pre-test gate abstains and routes to review on those shifted
inputs instead of issuing a confident score. A system that knows when to say I do not know is worth more than
one that always answers." Tie: print-quality and test models that fail closed when out of distribution.

**Beat 5, lineage and drill-through (about 30 sec).** Route: `/metric-lineage`.
"Every number on every page traces to its source: the table, the run, the method, and the claim boundary.
Nothing is a mystery number. If finance or an engineer asks where a figure came from, the answer is one
click away." Tie: trustworthy build-cost, audit, ITAR-adjacent traceability.

**Beat 6, close on honest evaluation (about 20 sec).** Route: `/model-performance` (Honest Metrics panel).
"And the evaluation itself is honest. The pointwise F1 is 0.313, shown as primary, not the flattering
point-adjusted 0.645, because point-adjusted F1 will rank a random detector near the top. Where a vetted
range-aware metric like VUS-PR is available it is used; where the library is not installed the page says so
rather than faking it. The discipline is the product. That is what I would bring to wrap around your data and
models."

If they want more, the regime-conditioned anomaly view (false-positive reduction) is the natural extension,
but stop unless asked.

---

## 3. Ninety-second version (when time is short)

Overview thesis (15s) → promotion gate, `/model-performance` (20s) → abstention case, `/evidence` deep-link
(25s) → lineage one click, `/metric-lineage` (15s) → honest-evaluation close, F1 0.313 not 0.645 (15s).
Skip the RUL deep dive.

---

## 4. Whiteboard version (works with zero connectivity)

This is the real centerpiece for the architecture rooms and for Marzilli's tour. Draw left to right.

**Live platform (real, deployed):**

```
Sources              Ingestion        Databricks Unity Catalog medallion      MLflow                 Serving
telemetry  ---+                       Bronze raw                              experiment tracking
test       ---+--> Kafka /       -->  Silver contracts + quality gates  -->   registry          -->  FastAPI (Railway)
factory    ---+    Confluent          Gold trusted features + metrics         promotion gates        Next.js (Vercel, novendor.ai)
                                                                              champion / challenger   Lakebase Postgres serves the
                                                                                                      telemetry slice (real)
                                                                                                      Supabase for app persistence
   -- lineage and provenance across the bottom: every number traces back --
   == governance on top: abstention, fail-closed, promotion gates ==
```

Say while drawing: "Sources land raw in Bronze. Silver is where contracts and quality gates live. Gold is
the trusted features and metrics. Models train and register in MLflow with promotion gates. The API serves
only promoted models. The telemetry slice is already served from Databricks Lakebase Postgres. Lineage
underneath means every number traces back, and governance on top means it abstains when it is out of
competence."

**The MES/Lakebase facsimile extension (synthetic, shaped-like the Relativity stack):** same pattern, applied
to build-to-flight.

```
Synthetic source systems        Medallion                                Serving
PLM (as-designed eBOM)     --+   Bronze raw 1:1 copies             --+
MES (Manufacturo-shaped,   --+-> Silver contracts + part-identity   +-> Gold as-built genealogy      --> Lakebase synced tables
   as-built genealogy)       |      crosswalk (PLM/MES/ERP)         |    Gold build-cost rollup           (read-only) + app-owned
ERP (planning, valuation,  --+   Gold marts                       --+    Gold MES-to-ERP reconciliation    Lakebase tables for acks
   cost settlement)                                                                                     Unity Catalog lineage:
                                                                                                        Gold number -> Bronze extract
```

---

## 5. Relativity MES/Lakebase bridge appendix

Concise summary of `relativity_MES_architecture.md`. Use this when an architecture or finance room wants the
build-to-flight story. Everything here is a design artifact, not a built capability.

**Caveats, stated first and often.**
- All data is synthetic. No real Relativity figures, part numbers, costs, or program data. Every table carries
  a `synthetic = true` column.
- The schema is shaped like Manufacturo MES plus a generic ERP and a generic PLM. Manufacturo's true API is
  not public (no OpenAPI spec, no developer portal), so the business-object names are real but the exact REST
  paths, field names, and cardinalities are credible reconstructions, not the literal data dictionary.
- "Digital twin" here means a data model of the as-built instance, not a physics simulation. Do not overclaim.
- AS9100 traceability language is used to frame the evidence package, but this is not a certification claim.

**System ownership (the ISA-95 seam the demo narrates).**
- **PLM owns the as-designed engineering definition:** part master, item revisions, EBOM, engineering change
  (ECR/ECO/ECN), effectivity, CAD links, approved-manufacturer list. System of record for design.
- **MES (Manufacturo-shaped) owns execution and as-built genealogy at ISA-95 Level 3:** work orders
  (independent of production orders), routing and operations, time-stamped as-built tree, material
  consumption, inspections, nonconformances and dispositions.
- **ERP owns planning and financial accountability at ISA-95 Level 4:** material master, inventory valuation,
  purchase orders and goods receipts, production-order cost collectors, standard cost, and settled variance.
- **The canonical flow:** PLM releases the EBOM via an ECO with effectivity and a serial range; ERP/MES derive
  the MBOM through documented transformation rules; ERP releases a production order; MES executes and reports
  actual consumption, labor, and completion; ERP settles the order at period end and computes standard-versus
  -actual variance by category (input price, input quantity, resource usage, remaining).

**Data platform.** Bronze holds raw 1:1 copies of all 46 synthetic source tables (append-only, ingest
metadata). Silver applies the PLM/MES/ERP part-identity crosswalk and data-quality contracts. Gold has three
marts: `gold.as_built_genealogy` (edge plus closure tables for recursive tree traversal), `gold.build_cost_
rollup` (per-part and per-vehicle material, labor, overhead), and `gold.mes_erp_reconciliation` (MES actuals
versus ERP settled variance). The three Gold marts are synced to **Lakebase** Postgres (reverse ETL, read-only
on the Postgres side, minimum 15-second refresh). App writes (for example a user acknowledging an NCR) land in
a native app-owned Lakebase table, not a synced one. The Lakebase database is registered in **Unity Catalog**,
so every number on screen traces through lineage back to its Bronze source extract. This is the same pattern
the live telemetry app already uses for its telemetry slice, which makes the Lakebase story real, not
hypothetical.

**Hero screen 1, Build-to-Flight Genealogy Explorer.** Input a vehicle serial; render the as-built tree
(parent/child) with color-coded install status and open NCRs, mirroring Manufacturo One View's "what is in
it, what is remaining, where is the problem, where is it used." Backward trace walks the serial down to every
component, lot, operation, inspection, and NCR. Reverse mode (where-used): input a suspect lot, return every
vehicle serial that consumed it. Narration: "Every serial, lot, operation, and NCR on this vehicle traces to
its source record. This is the AS9100 8.5.2 evidence package generated from data, not reconstructed after the
fact."

**Hero screen 2, MES-to-ERP Cost Reconciliation.** Pick a vehicle or work order; show MES actual execution
(material consumed, labor minutes, NCR rework) next to ERP standard cost and settled variance by category.
Narration: "MES owns what physically happened at Level 3. ERP owns the financial truth at Level 4. Here is the
variance, decomposed and traceable to the work order that caused it. Finance and ops are reading the same
number."

**Optional screen 3, governance/lineage panel:** Unity Catalog lineage from a Gold KPI back to its Bronze
source extract.

**ML extension (clearly a roadmap slide, not built):** an NCR/defect-probability classifier or an
end-of-order cost-overrun regression on the synthetic data, framed as decision support, with an explicit
"accuracy not validated on real data" caveat. Lakebase can serve as the online feature store behind the same
app.

---

## 6. Room-by-room talk track

Read the room. Pick four or five questions live, lead with the one-sentence thesis, then let them pull the
thread. The starred questions are the sharpest two or three per person.

### Matt Marzilli, Sr Director SWE (Terrestrial / Enterprise Apps / DevOps), MES sponsor, ex-Google
Emphasize platform maturity, build-versus-buy, data products that act, ownership seams. Use the novendor demo
(thesis, governance, and lineage inside the tour) plus the MES/Lakebase bridge on the whiteboard.
Starred questions:
- If you could have one data capability exist tomorrow across factory and test, what would you pick, and why
  hasn't it been built yet?
- Where are the ownership collisions waiting to happen between a new Data and AI org, your enterprise apps and
  DevOps org, Umer Khan's group, and Horizon's data science team?
- How does the company hold the line on reliability when the cultural default is move fast: where does fast
  stop being allowed?

### Ted Witkamp, Principal / Sr Eng Manager, industrial telemetry, regulated devices, computer vision
Emphasize telemetry reality, validation, model trust, drift, abstention, honest evaluation. Give him the full
technical path: model lifecycle and gate, conformal RUL, competence envelope and abstention, lineage, the
VUS-PR honest-evaluation close. If he asks the ninety-percent-false-positive-reduction question, answer with
the honest framing: the first thing to check is whether the metric is point-adjusted, because point-adjusted
F1 ranks a random detector near the top; the platform reports pointwise F1 0.313 as primary.
Starred questions:
- What does test-stand telemetry actually look like when it arrives: clean and aligned, or full of dropouts,
  clock skew, and sensor failures you reason around?
- Coming from regulated medical devices, how does this company think about validation and change control for
  software that influences engineering or build decisions?
- Where has ML or analytics overpromised at Relativity, and what did the team learn from it?

### Nick Robitaille, Data Engineering, Factory Platform, ex-Kitty Hawk
Emphasize the data platform, build-to-flight lineage, MES/ERP/PLM identity, schema evolution, quality
contracts. He may prefer you skip the UI and talk lineage and pipelines. Use the Lakebase/MES architecture
heavily: the 46-table facsimile, the part-identity crosswalk, the recursive genealogy with a closure table,
the medallion, Lakebase synced tables, Unity Catalog lineage.
Starred questions:
- What does the factory data platform look like under the hood today, and what part of it would you rebuild
  if you had the room?
- How is build-to-flight lineage modeled: can you trace a part's process data, NCRs, and as-built genealogy
  to a vehicle serial, and how painful is that query?
- If a Data and AI org stands up above you, what is the worst thing it could do to your team, and what is the
  best?

### Damon Gangi, VP Finance Systems
Emphasize build-cost visibility, MES-to-ERP reconciliation, variance, finance trust, controls. He probably
does not need the workbench. Give him the lineage-to-trusted-number idea verbally and translate it to build
cost using the MES-to-ERP Cost Reconciliation hero screen. Do not over-show the ML.
Starred questions:
- Where does build-cost visibility break down today: getting real per-part and per-vehicle cost out of MES
  and ERP into something you and ops both trust?
- How do you reconcile MES as-built execution data with ERP financial and inventory valuation, and where do
  the seams hurt at close or in forecasting?
- What would it take for you to trust a number that came out of an AI model enough to put it in front of the
  CFO or the board?

### Maria Seferian, Executive Vice Chair
Emphasize judgment, risk, leadership, the ITAR and national-security dimension, and what AI should not decide.
Do not open a laptop unless asked. Talk to the operating model: abstention as the discipline of knowing what a
model should not decide, fail-closed governance, and traceability for an ITAR-adjacent environment.
Starred questions:
- Eric has framed Relativity around software and AI applied to manufacturing. From your seat with him, where
  do data and AI rank against first flight in the next two years?
- You led MOCA through a hard financial turnaround. What did that teach you about leadership under pressure
  that you look for in people now?
- Relativity operates in an ITAR and defense-adjacent environment with a national-security dimension. How
  should that shape how a data and AI leader thinks about risk?

---

## 7. Objection handling

| Objection | Answer |
|---|---|
| "This is synthetic." | Yes, and it is labeled synthetic on every table and every screen. The live telemetry app runs on real public NASA datasets and a real Databricks Lakebase deployment; the MES/ERP/PLM facsimile is synthetic on purpose, because using real Relativity data would be the wrong thing to do. The operating model is what transfers, and that is real. |
| "You are not from aerospace." | Correct. I am not selling domain expertise. I am bringing the data-product and governed-ML operating model: contracts, lineage, promotion gates, abstention, honest evaluation. The aerospace specifics I learn from your team; the discipline I bring on day one. |
| "How do we know the model is trustworthy?" | It has to clear a promotion gate declared before training, on held-out data. It carries calibrated uncertainty with measured coverage, not one confident number. And it abstains when an input falls outside its competence envelope. Trust is a process here, not a claim. |
| "What happens when the model is out of distribution?" | It fails closed. The FD004 regime-shift case shows 90.5 percent of inputs out of the competence envelope, and the pre-test gate abstains and routes to review instead of scoring. A model that always answers is the dangerous one. |
| "How would this map to Manufacturo?" | The facsimile is shaped like Manufacturo's documented objects: One View genealogy, work orders independent of production orders, iTag, nonconformance and disposition. The exact fields are inferred because the API is not public, so in a real build the first step is mapping to your actual Manufacturo instance through its integration surface. |
| "How would this map to ERP and finance?" | Through the production-order cost collector and standard-versus-actual variance settlement at ISA-95 Level 4. MES owns what physically happened, ERP owns the financial truth, and the Gold reconciliation mart joins them so finance and ops read the same number, decomposed by variance category. |
| "Where would Lakebase actually fit?" | Lakebase serves the Gold marts to the app as read-only synced Postgres tables, with app-owned native tables for transactional writes, and Unity Catalog registration for lineage. The live telemetry app already serves its telemetry slice from Lakebase, so this is not hypothetical. |
| "What would you do in the first 90 days?" | Listen first: map the real MES/ERP/PLM seams and the data contracts that break when a sensor changes. Then prove one trustworthy number end to end, build-to-flight or build-cost, with lineage and a gate. Ship the operating model on one real problem before scaling it. |
| "What would you not automate?" | Anything where the model should abstain rather than decide: a disposition that affects flight safety, a number going to the board without a human owner, anything ITAR-sensitive where the judgment and the accountability have to stay with a person. The system's job is to surface the evidence and say when it does not know. |

---

## 8. Pre-flight checklist (run before every technical slot)

About ten minutes before:
1. **Warm the frontend and backend.** Load `https://novendor.ai`, hit the backend health endpoint, and click
   into two or three pages. A spun-down backend (Railway) or a cold Lakebase slice hangs for twenty to thirty
   seconds while someone watches. Note: the source notes that say "fly.io" are stale; the backend is FastAPI
   on Railway (`authentic-sparkle`).
2. **Run the preflight script:** `python scripts/streaming/stargate/preflight_demo.py --base https://novendor.ai`.
   It checks `/api/version` (expect `e28f2c73`), backend health, the lineage posture, the `model_runs` and
   `anomaly_events` XLSX routes, the unknown-dataset 404, and whether Mission Control has live anomaly rows. It
   prints, per surface, whether it is safe to show, show only as a cold fail-closed example, or avoid unless
   the replay or capture is started. It is read-only and does not mutate data.
3. **Confirm `/api/version` is `e28f2c73`** and `verify_lineage.py --base https://novendor.ai` is 6/1/0.
4. **Log in with the scoped reviewer credential, not admin.** `https://novendor.ai/login`, username `telemetry`
   (password `TELEMETRY_REVIEWER_PASSWORD`, in `docs/reference/ENV_KEYS.md`). Never show the admin credential.
5. **Warm the anomaly stream if you will show Mission Control.** On `/telemetry/stream`, click "Start stream"
   (capture mode, deterministic, idempotent, no live Confluent broker, no serving cost). Wait 30 to 60 seconds
   for the LIVE ANOMALY EVENTS panel to fill. If you would rather demo cold, the empty header-only state is
   honest, not broken.
6. **Pre-open tabs in demo order:** Overview (`/telemetry`), Model Performance (`/model-performance`), and the
   **Evidence deep-link** `https://novendor.ai/lab/env/telemetry-demo/telemetry/evidence` (this is where the
   RUL conformal 0.86 / 15-of-100 card and the FD004 abstention card live; it is hidden from the nav by design,
   so the deep-link is the way in). Close every other tab.
7. **Have a 3 to 4 minute local screen recording** saved and reachable without wifi, as a cold-start fallback.
8. **Have the whiteboard architecture ready to draw from memory.** It works with zero connectivity and is the
   real centerpiece for the architecture rooms.
9. **Do not open the repo root.** If you open code, open straight to the telemetry directory; the bare root is
   a large monorepo with unrelated work next to it.

---

## 9. Demo route classification

Documentation only. No nav changes.

- **Main path:** Overview, Model Performance, RUL Calibration, Model Registry, Metric Lineage, and Replay or
  the Evidence deep-link as needed.
- **Deep-dive only (open if a technical room pulls the thread):** Mission Control, Stargate Live, Test Runs,
  System Health, Factory NCR, Flight Readiness.
- **Avoid unless asked:** Metadata Explorer, Agent Control Tower.

---

## Rules of engagement

- Open with the one-sentence thesis every time, then let them pull the thread.
- Narrate to the operating model. Say promotion gate, champion challenger, abstains, traces to source. Do not
  say here is a nice chart.
- Read the room. Witkamp gets the full technical path. Marzilli gets thesis, governance, and lineage inside
  the tour. Robitaille may prefer you skip the UI and talk lineage and pipelines. Gangi gets the
  lineage-to-trusted-number idea translated to build cost, probably without the workbench. Do not open a
  laptop with Seferian.
- Know when to stop. The demo earns the right to a conversation. Do not tour all the pages. Hit the path and
  get back to dialogue.

## Preserved evidence values (do not drift)

Spin 1 90% false-positive reduction, eta-squared 1.0 to 0 · Spin 2 93% redundant at failure, leads 9/14/11,
about 11-cycle lag · Spin 3 PICP 0.86, 15 of 100 flips (Evidence `RulConformalCard`) · Spin 5 FD001 98.9%
in-envelope, FD004 90.5% out-of-envelope · Spin 6 about +8% lift, 9% overlap · degenerate autoencoder is a
judgment artifact, not a champion · honest metrics primary, pointwise F1 0.313, not point-adjusted 0.645 ·
RUL Calibration FD001 PICP 0.778/0.903, RMSE 17.33 (stated as not SOTA) · Flight Readiness VEH-TR-003 0.58,
pr_auc 0.84.

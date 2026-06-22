# Consolidated Backlog

Single source of truth for open work across all former in-flight coding sessions, as of 2026-06-22.

This supersedes the per-workstream `next-session.md` notes for **status**. The detailed implementation
spec for each open item still lives in its linked source (`.claude/plans/*.md` locally, or
`docs/plans/.../*.md` in-repo) — this file is the index and the priority call, not a re-statement.

Built by reconciling 15 `next-session.md` files, 20 active plan docs, and 23 local plan-scratch files
against what shipped during the 2026-06-22 consolidation session. Most items the source docs called
"next" had already shipped; what remains below is the genuinely-open set.

---

## 🔴 P0 — do first

- **React #438 production-crash fix.** `repo-b/package.json` still pins `react`/`react-dom` at `18.2.0`;
  the dual-instance skew crashes `/lab/env/[envId]` workspaces. Bump both to `18.3.1`, `npm install`,
  reproduce-and-verify the workspace loads, merge (Vercel auto-deploys), confirm novendor.ai workspaces
  render in prod. Confirmed open. Source: `.claude/plans/please-read-new-big-one-md-and-wise-scott.md`.

---

## 🟢 Active coding workstreams (open, ready to pick up)

1. **Control Tower Ticket 2 = EnvironmentContract Phases 2–5** — one workstream; the kept branch is the
   in-flight start.
   - Branch `feat/environment-contract-promotion-gate` already carries migrations `10005–10008`, the
     `promote_environment()` state machine in `environment_contract_v2.py` (1001 lines vs main's 523),
     capability binding, AI-behavior contract, and the EnvironmentContractCard promote/quarantine UI.
   - Open: **renumber migrations `10005–10008 → 10029+`** (they now collide with telemetry/ai_roi_leads
     migrations on main), rebase onto main, wire `POST /v2/environments/{id}/promote` + `/quarantine`,
     the fail-closed gate, the promotion-drift health check; run state-lock invariants + frontend tests.
   - Sources: `docs/plans/control-tower/next-session.md`, branch `feat/environment-contract-promotion-gate`.

2. **AI Provider Dispatch PRs 2–6.** PR1 is live in prod. Remaining: PR2 read-only admin panel + real
   eval grading + Gemma promotion criteria; PR3 real Gemma-on-Vertex adapter; PR4 cost/latency metering
   + budget guard; PR5 integrate into the live gateway behind a flag; PR6 explicit fallback chains
   (`fallback_chain_exhausted`). Source: `docs/plans/03-implementation-plans/active/0007-ai-provider-dispatch.md`.

3. **Telemetry research-gap remediation Tickets 4–12.** Tickets 1–3 shipped this session (security
   posture #245, honesty pass #278, MCP tools #283). Open: T4 entity ontology v1 + part/lot genealogy;
   T5 TRR packet assembly + approval gate; T6 model-vs-measured residual chart + prediction-receipt
   viewer; T7 agent safe-write demo (dry-run / blast-radius / approval); T8–12 hardening. Sources:
   `docs/plans/03-implementation-plans/active/telemetry-research-gap-remediation.md`,
   `.claude/plans/read-agentic-setup-md-and-create-glimmering-treehouse.md`.

4. **Event Streaming Phase 6B.** Scheduled / materialized rollups + replay-aware refresh on top of the
   shipped 6A analytics views. Source: `docs/plans/03-implementation-plans/active/0004-event-streaming-bigquery-gke.md`.

5. **Polymarket streaming rollout** — code landed (#279); external provisioning remains. Provision
   Confluent topics / identities / Secret Manager versions; build + publish the backend image; deploy
   the GKE overlay with `HR_POLYMARKET_ENABLED=true`; prove feed → Confluent → Postgres → API → BigQuery;
   24-hour soak; walk-forward per-family calibration gates; 7-day UI shadow; enable the flag. **Deferred
   pending Confluent provisioning.** Source: `docs/plans/03-implementation-plans/active/0004a-history-rhymes-polymarket-streaming.md`.

6. **ADE governed-fabric Phase 2** — distinct from the shipped ADE-Ops orchestrator (#259/#263).
   Candidates: import the ADO backlog via `azure-devops-intake`; expose Confluent as a governed MCP
   skill (transport exists, surface it through the registry); GitHub PR/issue connector (first read →
   live move); regenerate the connector inventory if the md/py mirror has drifted. Source:
   `docs/plans/automated-data-engineering/next-session.md`.

7. **winston-plan-relay skill** — kept branch `feat/winston-plan-relay`. Land the skill (plan-routing
   relay + Claude/Codex CLI adapters + the `session.py` launcher) or formally drop it. This branch is
   the superset cut; the copy bundled in `feat/environment-contract-promotion-gate` lacks `session.py`,
   so if landing, land this one.

8. **Market Rotation creative dashboard charts** — confirmed not in `repo-b` (separate market-rotation
   dashboard, runs on :4200). Ridgeline on booking lead-time, heat curve replacing the advance-cost
   bar, passenger-recurrence heatmap; backend lead-time-distribution endpoint; register the ECharts
   Heatmap/VisualMap modules. Source: `.claude/plans/lets-get-up-on-nested-unicorn.md`.

9. **RS Factory Digital Thread (PR 3)** — active. The `rs_factory_seed` generator is shipped and in
   CI; the digital-thread extension is the current telemetry-platform workstream (a thin
   `GET /api/telemetry/findings` route landed 2026-06-19; PR 3 is next). Sources:
   `docs/plans/telemetry-platform/next-session.md`, `.claude/plans/convo-md-please-make-a-golden-star.md`.

---

## 🟡 Blocked / gated (need a decision or a prerequisite)

- **HHA-2 review gate (PR #136).** Review-only: confirm every service read sets `app.env_id` and filters
  by it; masked-cohort queries leak no size/retention/revenue; money converts at the service edge; the
  4 pages are standalone with the NO-PHI banner; test suites + `db:verify` pass. **Do not merge or
  deploy without explicit approval.** If approved → merge, deploy backend separately, prod smoke, close
  Story #508. Then HHA Phase 3 (event-grain + derived rollups, migration ~10014) and HHA Phase 4
  (PHI-safe governed copilot). Sources:
  `docs/plans/03-implementation-plans/active/0005-healthcare-subscription-analytics-lab.md`,
  `.claude/plans/did-we-already-do-ancient-forest.md`.

- **Novendor CRM Ticket 8** — assistant-driven task create/edit write-path. **Scope decision required
  before coding**: create-only vs edit vs both, the confirmation flow, intent-confidence threshold,
  audit trail (`cro_execution_task.updated_at` + `evidence` JSONB), rollback path. Source:
  `docs/plans/novendor-crm-accounting/next-session.md`.

---

## 📦 Appendix — captured, not expanded

- **Dormant exploratory architecture audits** — each a "waiting for next session" checklist, no code
  started: Stone PDS, Supply Chain / Databricks, Winston Legal, Senior Housing, Demo Lab / RAG, Excel
  Add-in, Marketing / Domain-Routing, MCP-Orchestration / AI-Runtime. Sources: the respective
  `docs/plans/*/next-session.md`.
- **Sales / outreach (non-code):** REPE trigger-led cold-email batch to 10 firms. Source:
  `.claude/plans/recommended-show-off-but-idempotent-petal.md`.
- **Doc / strategy:** RS Analytics Platform strategy-doc expansion — Gold-layer DDL, LookML examples,
  ITAR validation checklist, the Delivery/Board and Budget/Stack-crosswalk sections, pricing research.
  Source: `.claude/plans/rs-analytics-platform-md-please-take-a-squishy-russell.md`.
- **8 parked git stashes** in the canonical repo (mostly stale WIP): pre-bottleneck-map gitignore/ENV
  edits, wip-during-backend-deploy, wip-during-hha-merge, environment-contract loose docs, hr-research-
  bridge WIP, evidence-ledger proof cards, and 2× outreach-personalizer temp stashes. Review-and-drop
  candidates — none block anything.

---

## ✅ Closed during the 2026-06-22 consolidation (for the record — no action)

Shipped to main: Flow Explorer (#280), Metadata Explorer (#281), Control Tower MVP / Ticket 1 (#258),
Trades page (#269), HR feature-store A1–C15 (#268), HR ML-lab + Polymarket pulse (#279), HR cockpit
refactor (migration 10017 + cockpit components on main), AI dispatch PR1 (#270/#275), gap-remediation
T1–T3 (#245/#278/#283), ADE-Ops watcher + incidents (#259/#263), HappyCo landing polish (#111),
Meridian REPE roadmap T1–T6, Telemetry Platform Phases 0–6, Outreach Personalizer Phases 1–4.
Removed: legalfin orphaned frontend (#284).

Killed (deliberate, do not revive without a fresh falsification): Telemetry Trust Layer /
Factory-Pattern RUL-divergence (Gate 0 KILL), `telemetry-trust-gate0-ticket`, `factory-pattern-intelligence`,
the ProfitSolv legalfin demo (frontend removed, branch + standalone repo discarded).

# Documentation Index

This folder contains all project documentation. The **Canonical Docs Map** below is the current, hand-maintained entry point to the source-of-truth doc for each area. The older folder-oriented index (March 2026) is preserved further down under **Historical index**.

## Canonical Docs Map (current — maintained 2026-06-25)

> Hand-maintained and freshness-tagged. **Not** in the morning-ops-digest auto-overwrite set (unlike `LATEST.md` / `CAPABILITY_INVENTORY.md`, which are regenerated daily). All paths are **relative to the repo root**. `CLAUDE.md` remains the top-level routing contract; this is a discoverability map, not a router.

### Planning
- `docs/plans/CONSOLIDATED_BACKLOG.md` — single source of truth for open work across workstreams
- `docs/plans/00-dispatch/README.md` — routes every new idea/bug/feature to the right plan folder
- `docs/plans/03-implementation-plans/active/` — numbered `NNNN-*` dispatch records (the active plans CLAUDE.md points at)
- `docs/plans/PLAN_MAINTENANCE_RULES.md` — how plan folders are read/updated each session
- `docs/plans/01-shared-standards/README.md` — platform-wide contracts every environment obeys

### Architecture
- `ARCHITECTURE.md` — durable architecture + DB guardrail contract (table prefixes, RLS/tenant rules); mandatory pre-read for SQL/schema work
- `docs/AI_ARCHITECTURE_AND_WORKFLOWS.md` — map of the distinct AI systems and their workflows
- `docs/REPE_ARCHITECTURE.md` — snapshot/rollup REPE platform architecture
- `docs/adr/` — Architecture Decision Records, namespaced by subsystem (investment-engine, rs-analytics, automated-data-engineering, telemetry-lineage)
- `PORTABILITY.MD` — the platform-core / environment-package / client-config three-layer portability contract

### Telemetry
- `docs/plans/telemetry-platform/architecture.md` — current telemetry platform architecture (Bronze/Silver/Gold Delta, models+gates, `tel_*` serving)
- `docs/plans/telemetry-platform/README.md` — telemetry platform overview and scope
- `docs/plans/telemetry-platform/control-tower-runbook.md` — control-tower operational runbook
- `skills/telemetry-data-interrogation/SKILL.md` — read-only slices/pivots/freshness over `tel_*`

### Lineage
- `docs/runbooks/telemetry-confluent-databricks-lineage.md` — Confluent→Databricks→Postgres lineage runbook (start/check/shutdown, honesty boundary)
- `docs/plans/03-implementation-plans/active/telemetry-confluent-databricks-supabase-lineage.md` — lineage workstream plan (Tickets A/B/C, ADR 0001)
- `backend/app/services/telemetry_stream_lineage.py` — service backing the `/api/telemetry/stream/*` lineage routes

### Deployment
- `CLAUDE.md` (Infrastructure CLI Guardrails + Production Surface + credentials flow) — authoritative deploy contract (Vercel/Railway/Supabase/GitHub CLI, prod URLs, secret flow)
- `docs/SHIP_STATUS.md` — what is in flight vs shipped, by what deploys when
- `docs/LOCAL_DEV_PORTS.md` — local service/port map
- `infra/k8s/README.md` — GKE event-sink worker deploy (recreate-from-IaC for the streaming spine)
- `docs/ops-reports/deploy/` — daily post-deploy smoke-test results

### Constraint / governance — **preserve, never delete or move**
- `CLAUDE.md` — top-level router + governance (routing precedence, intent taxonomy, owning-surface map, mass-deletion protection, work-intake gate)
- `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` — non-negotiable REPE authoritative-state lockdown invariants (enforced by lint + tests)
- `docs/WINSTON_CODING_SESSION_INSTRUCTIONS.md` — coding-session lifecycle (PLAN vs CODE, intake gate, trivial-bypass standard)
- `docs/AUTONOMOUS_RELIABILITY_PROTOCOL.md` — anti-hallucination / refusal protocols for autonomous runs
- `ARCHITECTURE.md`, `AGENTS.md`, `PORTABILITY.MD` — DB/agent-workspace/portability contracts
- `docs/anti-ai-style.md` — mandatory writing-style constraints CLAUDE.md binds for all prose
- `claim_coverage_matrix.md`, `PLAN_DIVERGENCE_REVIEW.md`, `DIVERGENCE_FINDINGS_DEMO_SCRIPT.md`, `DIVERGENCE_RECEIPTS_MANIFEST.md` — the claim→proof accuracy record + divergence program (load-bearing accuracy/provenance)
- `docs/reference/RULES.MD` — Business OS core system rules
- `.githooks/pre-commit`, `.githooks/pre-push` — local enforcement of the mass-deletion + merge-gate policies

### Security / compliance
- `docs/security-architecture.md` — SOC 2 MVP security architecture (evidence-first, append-only auditability)
- `docs/soc2-gap-analysis.md` — SOC 2 Type II readiness inventory + gaps
- `docs/identity-oidc.md` — identity/OIDC auth design
- `compliance/README.md` — compliance evidence entry point

### Intelligence / autonomous (auto-generated — read-first situational awareness)
- `docs/LATEST.md` — daily manifest of every scheduled-task output (read first in a new session)
- `docs/CAPABILITY_INVENTORY.md` — daily inventory of what's already built (read before suggesting new builds)
- `docs/daily-intel/`, `docs/feature-radar/`, `docs/ops-reports/digests/` — daily market/feature/ops outputs

### Tips
- `docs/tips.md` is the **canonical repo-wide tips file**. See its top **"Tips files in this repo"** map for the domain-scoped tips (`docs/podcast-intelligence/tips.md`, `repo-b/tips.md`, `repo-b/src/components/ui/tips.md`).

### Related indexes (different axes — not superseded by this map)
- `docs/instruction-index.md` — routing registry for agents/skills/prompts (companion to `CLAUDE.md`)
- `docs/LATEST.md` / `docs/CAPABILITY_INVENTORY.md` — auto-generated manifests (see Intelligence section; do not hand-edit, they are overwritten daily)

---

> ## ⚠️ Historical index (last updated 2026-03-02 — kept for reference)
>
> The sections below predate the current workstreams and reference the retired `paulmalmquist.com`
> test environment and the "Wave 1 + Wave 2" status. They are preserved for provenance — use the
> **Canonical Docs Map** above for current navigation.

## 📋 Quick Navigation

### 🚀 Getting Started
- [**HOW_WE_WORK.md**](guides/HOW_WE_WORK.md) — Project workflow, decision-making, code standards
- [**QUICK_START_MCP.md**](guides/QUICK_START_MCP.md) — MCP server setup and configuration
- [**README_ROOT.md**](guides/README_ROOT.md) — Original project README

### 📚 Plans & Architecture
- [**business_machine_master_plan.md**](plans/business_machine_master_plan.md) — High-level product strategy and roadmap
- [**WINSTON_DEVELOPMENT_META_PROMPT.md**](plans/WINSTON_DEVELOPMENT_META_PROMPT.md) — Wave 1 + Wave 2 implementation spec with verification tests (current work)
- [**ROADMAP.md**](plans/ROADMAP.md) — Feature roadmap and timeline
- [**PDS_DEEP_RESEARCH_PLAN.md**](plans/PDS_DEEP_RESEARCH_PLAN.md) — Property Data System research plan
- [**REPO_DEEP_RESEARCH_BRIEF.md**](plans/REPO_DEEP_RESEARCH_BRIEF.md) — Repository structure and architecture analysis
- [**FIX_REMAINING_FAILURES_META_PROMPT.md**](plans/FIX_REMAINING_FAILURES_META_PROMPT.md) — Production fixes (completed)
- [**FIX_ALL_TEST_FAILURES_META_PROMPT.md**](plans/FIX_ALL_TEST_FAILURES_META_PROMPT.md) — Test failure analysis
- [**CLAUDE_CODE_FIX_ALL_AUDIT_ISSUES.md**](plans/CLAUDE_CODE_FIX_ALL_AUDIT_ISSUES.md) — Audit issue fixes

### 📊 Test Reports & Results
- [**SITE_TEST_REPORT_2026-03-02_RUN3.md**](reports/SITE_TEST_REPORT_2026-03-02_RUN3.md) — Latest test run (Run 3)
- [**SITE_TEST_REPORT_2026-03-02_RUN2.md**](reports/SITE_TEST_REPORT_2026-03-02_RUN2.md) — Run 2 results
- [**SITE_TEST_REPORT_2026-03-02.md**](reports/SITE_TEST_REPORT_2026-03-02.md) — Initial run results

### 📖 Reference & Technical Details
- [**TEST_PLAN.md**](reference/TEST_PLAN.md) — Comprehensive test plan and test cases
- [**FINANCIAL_INTELLIGENCE_AGENT_TEST.md**](reference/FINANCIAL_INTELLIGENCE_AGENT_TEST.md) — FI agent test specifications
- [**AUDIT_NOTES.md**](reference/AUDIT_NOTES.md) — Audit findings and notes
- [**RULES.MD**](reference/RULES.MD) — System rules and constraints
- [**karpathy.md**](reference/karpathy.md) — Research notes

### 📁 Asset Files
- [**assets/**](assets/) — PDFs and Word documents
  - Executive summaries
  - JLL vs Winston analysis
  - Loop Intelligence research synthesis
  - Meridian Capital platform audit

---

## 🏗️ Project Structure Overview

```
BusinessMachine/Consulting_app/
├── docs/                           # All documentation (you are here)
│   ├── guides/                     # How-to guides and setup
│   ├── plans/                      # Architecture and implementation plans
│   ├── reports/                    # Test results and reports
│   ├── reference/                  # Technical reference and specs
│   └── assets/                     # PDFs, documents, research
├── repo-b/                         # Winston RE Platform (Next.js 14 App Router)
│   ├── src/
│   │   ├── app/                    # Next.js App Router routes
│   │   ├── components/             # React components
│   │   ├── lib/                    # Utilities and business logic
│   │   └── styles/                 # Global styles
│   ├── db/                         # Database migrations
│   └── package.json
├── excel-addin/                    # Excel integration against backend /v1/*
├── scripts/                        # Development scripts
├── backend/                        # Backend services
├── orchestration/                  # Orchestration configurations
└── [other folders]
```

---

## 🎯 Current Work Status

**Wave 1 + Wave 2 Implementation:** ✅ COMPLETE

All foundation fixes (FIX 1-A through 1-E) and new features (BUILD 2-A through 2-D) have been implemented:

### Wave 1 — Foundation Fixes
- ✅ FIX 1-A: Seed endpoint returns 200
- ✅ FIX 1-B: Investment detail seed data (acquisition date, debt, LTV, cap rate)
- ✅ FIX 1-C: Quarter Close pipeline → Returns write-back
- ✅ FIX 1-D: LP Summary API reshape
- ✅ FIX 1-E: Fund NAV column in investment overview

### Wave 2 — New Features
- ✅ BUILD 2-A: LP Waterfall Calculator (4-tier European waterfall)
- ✅ BUILD 2-B: Benchmark Comparison (NCREIF ODCE + alpha)
- ✅ BUILD 2-C: Debt & Capital Stack (LTV gauge, DSCR, covenant alerts)
- ✅ BUILD 2-D: Sensitivity Matrix (2D heat map, cap rate × exit cap rate → IRR)

**Build Status:**
- ✅ TypeScript clean (no compilation errors)
- ✅ Next.js build passes
- ✅ Ready for production testing

See [WINSTON_DEVELOPMENT_META_PROMPT.md](plans/WINSTON_DEVELOPMENT_META_PROMPT.md) for verification tests.

---

## 🔗 Key Files by Use Case

### "I need to understand the current architecture"
1. Start: [business_machine_master_plan.md](plans/business_machine_master_plan.md)
2. Deep dive: [REPO_DEEP_RESEARCH_BRIEF.md](plans/REPO_DEEP_RESEARCH_BRIEF.md)
3. Reference: [RULES.MD](reference/RULES.MD)

### "I need to set up the environment"
1. Start: [QUICK_START_MCP.md](guides/QUICK_START_MCP.md)
2. Workflow: [HOW_WE_WORK.md](guides/HOW_WE_WORK.md)

### "I need to understand the Winston RE Platform"
1. Start: [WINSTON_DEVELOPMENT_META_PROMPT.md](plans/WINSTON_DEVELOPMENT_META_PROMPT.md) — Wave 1 + Wave 2 spec
2. Architecture: [REPO_DEEP_RESEARCH_BRIEF.md](plans/REPO_DEEP_RESEARCH_BRIEF.md) — RE module structure
3. Tests: See `reports/` for latest test results

### "I need to debug a failing test"
1. Latest results: [SITE_TEST_REPORT_2026-03-02_RUN3.md](reports/SITE_TEST_REPORT_2026-03-02_RUN3.md)
2. Test plan: [TEST_PLAN.md](reference/TEST_PLAN.md)
3. FI specs: [FINANCIAL_INTELLIGENCE_AGENT_TEST.md](reference/FINANCIAL_INTELLIGENCE_AGENT_TEST.md)

### "I need to understand the verification tests"
→ See [WINSTON_DEVELOPMENT_META_PROMPT.md](plans/WINSTON_DEVELOPMENT_META_PROMPT.md) **PART 3 — VERIFICATION TESTS**

---

## 📝 Document Categories Explained

### Guides (`guides/`)
How-to documentation and setup instructions. Start here when setting up locally or onboarding.

### Plans (`plans/`)
Architecture decisions, implementation specs, and development roadmaps. Reference these when planning new features.

### Reports (`reports/`)
Test results, QA findings, and run reports. Use to track quality metrics and identify issues.

### Reference (`reference/`)
Technical specifications, test plans, and detailed documentation. Use as detailed reference material.

### Assets (`assets/`)
Research documents, PDFs, and supplementary materials. Use for context and market research.

---

## 🚦 How to Use This Documentation

1. **New to the project?** → Start with [HOW_WE_WORK.md](guides/HOW_WE_WORK.md)
2. **Need setup help?** → See [QUICK_START_MCP.md](guides/QUICK_START_MCP.md)
3. **Want the big picture?** → Read [business_machine_master_plan.md](plans/business_machine_master_plan.md)
4. **Debugging a feature?** → Check the corresponding test report in `reports/`
5. **Need technical details?** → Look in `reference/`

---

## 📌 Last Updated
- **Wave 1 + Wave 2:** March 2, 2026 (COMPLETE)
- **Documentation:** March 2, 2026
- **Test Environment:** Meridian Capital Management (paulmalmquist.com)

---

*Maintained by Claude Code. Questions? Check [HOW_WE_WORK.md](guides/HOW_WE_WORK.md) for workflow and communication.*

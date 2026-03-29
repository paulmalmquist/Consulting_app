# Documentation Index

This folder contains all project documentation, organized by category. Start here to navigate the knowledge base.

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

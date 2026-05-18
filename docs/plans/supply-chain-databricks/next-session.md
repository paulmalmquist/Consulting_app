# Next Session — Supply Chain / Databricks

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on the Supply Chain / Databricks Demo Environment in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/supply-chain-databricks/architecture.md
- docs/plans/supply-chain-databricks/backlog.md
- agents/lab-environment.md

Objective:
1. Audit all supply chain sub-pages to determine which are stubs and which render real data.
2. Find the backend route(s) that serve supply chain data.
3. Determine whether Genie is wired to a real Databricks endpoint or a UI mockup.
4. Document findings in docs/plans/supply-chain-databricks/architecture.md.

Files to inspect:
- repo-b/src/app/lab/env/[envId]/supply-chain/ (list and scan all subdirectories)
- backend/app/routes/lab.py
- backend/app/routes/lab_v2.py
- notebooks/ (list any Databricks-related notebooks)

Acceptance criteria:
- [ ] Stub vs. live status documented for each supply chain sub-page
- [ ] Backend route(s) identified for supply chain data
- [ ] Genie integration status documented
- [ ] Architecture.md updated with findings

Tests to run:
cd backend && python -m pytest tests/ -k "lab or supply" -v

Update docs/plans/supply-chain-databricks/next-session.md and backlog.md before finishing.
```

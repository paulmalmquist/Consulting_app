# Documentation depth — what "deep" means and where it lives

Deep documentation isn't more words; it's the right artifact in the right place, owned and dated, so the trusted answer is fast to reach and easy to verify. This mirrors NCF's "one source of truth" pattern.

## The artifacts and when each is written

| Artifact | When | Lives in | Owner |
|---|---|---|---|
| Idea record | every fuzzy idea (phase 1) | repo `docs/ideas/` or the idea folder from `new_idea.py` | proposer |
| ADR | a durable decision with trade-offs | repo `docs/adr/` (append-only, numbered) | decision owner |
| Design doc | a build big enough that the *how* needs its own doc | repo `docs/plans/` or ADO Wiki | tech lead |
| Work items + acceptance criteria | phase 2 | Azure DevOps board | subsystem owner |
| Paired code+DevOps plan | phase 3, per story | attached to the work item / `docs/plans/` | implementer |
| Runbook | when a thing now runs in production | ADO Wiki / Confluence | operator |
| Wiki / Confluence page | program-level knowledge home | ADO Wiki (`Novendor.wiki`) / Confluence | program |
| Changelog entry | every shipped change | repo `CHANGELOG` / doc changelog | implementer |

## Rules that keep documentation trustworthy

- **Owned and dated.** Every page shows who owns it and when it was last updated (NCF practice). Stale, unowned docs are worse than none.
- **Cross-linked.** Each doc links to its ADR(s), its work items, and its dashboards, so the space is traversable, not a flat dump.
- **Decisions are append-only.** ADRs supersede; they don't get rewritten. The record of *why we chose X over Y* must survive.
- **Lineage stays intact.** A KPI or data product traces KPI → semantic metric → model → source; a doc that quotes a number links to where the number comes from.
- **Receipts, not assertions.** Claims of "tested" / "deployed" link to evidence (CI output, dry-run cost, lineage check), not a verbal "it's fine."
- **Flag unknowns.** Where status is uncertain (e.g., ITAR service support), the doc says "validate in discovery" rather than asserting — and links the work item that will resolve it.

## Depth bar (quick test)

A doc is deep enough when a competent colleague could, from it alone: understand the problem and why it matters, see the options and why this one won, know what's out of scope, find the work items and the evidence, and reproduce or roll back the change. If any of those requires asking the 
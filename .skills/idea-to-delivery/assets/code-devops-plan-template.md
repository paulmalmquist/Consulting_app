# Code + DevOps Plan — <work item AB#__> <story title>

*Designed in tandem: the code change and the delivery path decided together, before the first commit.*

| | Code plan | DevOps plan |
|---|---|---|
| **Surfaces / branch** | files, routes, schema, models touched | branch `feat/<slug>` carrying `AB#<id>` |
| **Approach** | smallest change to meet AC; rejected alternatives | pipeline change (new stage/gate?) |
| **Tests** | unit + assertions + dry-run cost (if data) + regression guard | CI stages that must pass (the 7 jobs + dataform compile/test) |
| **Quality** | Definition of Done: docs, review, non-functional | risk class + gate (peer / owner / CCB / FRR) |
| **Evidence / done** | what proves it works | receipts to attach: test output, dry-run bytes, lineage, dashboard link, screenshots |
| **Undo** | — | rollback / backout steps; Bronze reprocess if data |

## Definition of Done (flight/test-ready)
- [ ] Docs updated (design/ADR if approach changed)
- [ ] Peer review passed
- [ ] Tests + assertions green; dry-run cost under policy
- [ ] Non-functional checks (reuse / perf / data quality)
- [ ] Responsible Engineer sign-off + FRR criterion *(if flight-facing)*
- [ ] Evidence attached to the work item
- [ ] Gate cleared for the risk class
- [ ] Documentation + changelog reflect reality

## Hand-off
Plan approved → branch created → implementation to `feature-dev`. Evidence + docs return in phase 
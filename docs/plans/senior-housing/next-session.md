# Next Session — Senior Housing

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on the Senior Housing / Healthcare Real Estate environment in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/senior-housing/architecture.md
- docs/plans/senior-housing/backlog.md
- docs/plans/meridian-repe/architecture.md (Senior Housing likely shares REPE infrastructure)
- backend/app/services/environment_templates_v2.py

Objective:
1. Determine whether a Senior Housing environment template exists in the provisioning system.
2. Identify which frontend routes are active for Senior Housing (dedicated or shared with REPE).
3. Determine whether there are dedicated backend routes for healthcare/senior housing.
4. Check HUD connector status.
5. Document findings in docs/plans/senior-housing/architecture.md.

Files to inspect:
- backend/app/services/environment_templates_v2.py
- backend/app/connectors/cre/hud_fmr/
- backend/app/connectors/cre/hud_usps_crosswalk/
- repo-b/src/app/app/finance/healthcare/ (check if this is relevant)
- repo-b/src/app/app/medical/ (check if this is relevant)
- backend/app/routes/ (grep for "medical" or "healthcare" or "senior")

Acceptance criteria:
- [ ] Senior Housing template existence confirmed or absence documented
- [ ] Active routes identified and documented
- [ ] HUD connector status documented
- [ ] Relationship to REPE tables documented in architecture.md

Tests to run:
cd backend && python -m pytest tests/ -k "housing or medical or healthcare" -v

Update docs/plans/senior-housing/next-session.md and backlog.md before finishing.
```

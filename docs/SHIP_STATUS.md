# Ship Status — Cowork session work pending deploy

Single page summarizing everything in flight from this session, organized by what ships when.

## Deploy in one command

From your repo root:

```powershell
.\scripts\host_runner.ps1 -Script .\scripts\pending\prod_deploy_full.ps1
```

That deploys backend (Railway) + frontend (Vercel) + verifies the live API. Wall-clock 4–5 minutes.

If you want to stage:

```powershell
# Backend only
.\scripts\host_runner.ps1 -Script .\scripts\pending\prod_deploy_full.ps1 -Arguments "-SkipFrontend"

# Frontend only
.\scripts\host_runner.ps1 -Script .\scripts\pending\prod_deploy_full.ps1 -Arguments "-SkipBackend"
```

## What's in this deploy

### Backend changes (Railway)

| File | Change | Why |
|------|--------|-----|
| `backend/app/routes/altered_mind.py` | Predicate widening at lines 81-105 | Fixes the live empty-state on `/lab/env/.../altered-mind`. `has_data` now returns `true` if ANY of the four `am_*` tables has rows for the env_id, not just `am_weekly_summary AND clients_seen > 0`. |

### Frontend changes (Vercel)

| File | Change | Why |
|------|--------|-----|
| `repo-b/src/lib/fetchJson.ts` | NEW helper | Standardized fetch wrapper that throws `ApiError` on non-2xx instead of silently passing error JSON to render. |
| `repo-b/src/components/altered-mind/AlteredMindDashboard.tsx` | Migrated to fetchJson | Surfaces backend errors instead of swallowing them into the empty-state. |
| `repo-b/src/components/altered-mind/AlteredMindTrends.tsx` | Migrated to fetchJson | Same pattern. |
| `repo-b/src/components/altered-mind/AlteredMindWeekDetail.tsx` | Migrated to fetchJson | Same pattern. |
| `repo-b/src/components/ai-usage/AiUsageDashboard.tsx` | Migrated to fetchJson | New dashboard, ships clean from day one. |
| `repo-b/src/app/lab/system/ai-usage/page.tsx` | Migrated to fetchJson | System-level AI Usage overview. |
| `repo-b/src/components/lab/LabEnvironmentShell.tsx` | Added AI Usage tab | Lab nav strip + mobile drawer. |
| `repo-b/src/app/app/page.tsx` | Added AI Usage system link | Post-login workspace home. |
| 11 other components | Migrated to fetchJson | RE dashboards, REPE statements, debug footer, etc. See `docs/LAB_DASHBOARD_FETCH_AUDIT.md`. |

## What's NOT in this deploy

These are ready but require additional steps before deploy:

| Item | Status | Reason |
|------|--------|--------|
| AI Usage attribution service (schema + routes + rules) | Untracked, needs migration applied | Run `.\scripts\host_runner.ps1 -Script .\scripts\pending\ai_usage_deploy.ps1` separately. Two-line edit to `backend/app/main.py` required to register the router. |
| Hallboys deck v3 + proposal v2 | Final | Sitting in `demo_docs/hall_boys/governance_pitch/`. Ready to send to Sarat. |
| Triaged-execution skill + cost ledger | Untracked | Persists in `skills/triaged-execution/` for any future Claude session via CLAUDE.md routing. |
| Host bypass scripts | Untracked | All scripts in `scripts/` (bootstrap, check, host_runner, pending/*). |

## Skills available to any future Claude session

These persist across chats. Mention any of the trigger phrases and the next session will pick up where we left off:

| Trigger | Skill |
|---------|-------|
| "fix altered mind", "altered mind shows empty state" | `skills/altered-mind-prod-fix/SKILL.md` |
| "fix the X page", "X dashboard isn't loading" | `skills/lab-page-prod-fix/SKILL.md` |
| "triaged execution", "model triage", "cost-aware execution" | `skills/triaged-execution/SKILL.md` |

## Audit trail

Every change in this session is recorded somewhere durable.

| Artifact type | Where it lives |
|--------------|----------------|
| Per-step CLI run cost | `skills/triaged-execution/runs/<plan>/_costs.json` |
| Per-call AI usage event | `nv_ai_usage_event` (production Postgres, RLS-isolated) |
| Detected waste / rec | `nv_ai_recommendation` (production Postgres) |
| Host script execution receipt | `scripts/results/<timestamp>_<script>.json` |
| Pending plan step output | `skills/triaged-execution/runs/<plan>/step_<n>.md` |
| Deploy report | `skills/triaged-execution/runs/prod_deploy/deploy_<timestamp>.md` |
| Backend predicate audit | `docs/LAB_DASHBOARD_FETCH_AUDIT.md` |
| AI Usage architecture | `docs/AI_USAGE_ATTRIBUTION_SERVICE.md` |
| This summary | `docs/SHIP_STATUS.md` (you are here) |

## Open items for next session

These are not blocking the deploy but are worth tracking:

1. **AI Usage service deploy** — separate from the predicate fix. Run `ai_usage_deploy.ps1`.
2. **Two remaining fetchJson migrations** — `useDecisionEngine.ts` and `GrantFrictionKpiTile.tsx`. Lower priority, fix on next touch.
3. **The 4,700-file line-ending churn** — cosmetic. Either commit as-is or run the cleanup script in the audit doc.
4. **Hallboys send-out** — the deck and proposal are ready; needs your green-light to go to Sarat.

## What to expect on the page after deploy

`https://novendor.ai/lab/env/bf5c5b10-9a17-4fe7-9f5b-e7de9a380122/altered-mind` should render:

- Header strip with "Altered Mind · Therapy practice analytics · Week of …"
- Four large KPI cards: Clients This Week / Weekly Revenue / Capacity / YTD Revenue
- Three medium cards: YTD Sessions / Total Referrals (~63) / Conversion Rate
- 8-Week Trend table with sparkline-style utilization bars
- Recent Check-ins table showing 10 of 355 total
- Latest Reflection card with theme + wins/challenges/adjustment

If after deploy the page still shows empty-state, the new `fetchJson` migration means the dashboard will now show an explicit `API <status>: <detail>` panel instead, telling us which backend layer failed.

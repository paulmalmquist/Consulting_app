# PDS Executive Automation v1 Operator Playbook

## 1. Admin Setup
1. Apply DB migrations `313_pds_executive_automation.sql` and `314_pds_executive_integration.sql`.
2. Deploy backend and frontend changes.
3. Enable integrations in `pds_exec_integration_config`:
   - `pds_m365_mail`
   - `pds_m365_calendar`
   - `pds_market_external`
4. Seed/validate decision catalog has `D01..D20`.
5. Run first connector cycle:
   - `POST /api/pds/v1/executive/runs/connectors`
6. Run full cycle:
   - `POST /api/pds/v1/executive/runs/full`
7. Open `PDS > Executive` and validate Overview, Queue, Messaging, and Memory tabs.

## 2. Executive Daily Loop
1. Open `PDS > Executive`.
2. On Overview, run full cycle if queue is stale.
3. Work queue top-down by priority (`critical` then `high`).
4. For each item, choose one action:
   - `approve`
   - `delegate`
   - `escalate`
   - `defer`
   - `reject`
5. Add rationale in the decision drawer before final action.
6. Review Strategic Messaging drafts and approve as needed.

## 3. Weekly Calibration
1. Open Decision Memory tab.
2. Review outcome trends and recommendation alignment.
3. Tune trigger sensitivity in `pds_exec_threshold_policy` for noisy decisions.
4. Re-run full cycle and verify queue quality improvements.

## 4. Monthly Board/Investor Briefing Flow
1. Generate board pack:
   - `POST /api/pds/v1/executive/briefings/generate` with `briefing_type=board`
2. Generate investor pack:
   - `POST /api/pds/v1/executive/briefings/generate` with `briefing_type=investor`
3. Review summary and sections.
4. Publish through your existing distribution process.

## 5. API Quick Reference
- `GET /api/pds/v1/executive/overview`
- `GET /api/pds/v1/executive/queue`
- `POST /api/pds/v1/executive/queue/{queue_item_id}/actions`
- `GET /api/pds/v1/executive/memory`
- `POST /api/pds/v1/executive/runs/connectors`
- `GET /api/pds/v1/executive/runs/connectors`
- `POST /api/pds/v1/executive/runs/decision-engine`
- `POST /api/pds/v1/executive/runs/full`
- `POST /api/pds/v1/executive/messaging/generate`
- `GET /api/pds/v1/executive/messaging/drafts`
- `POST /api/pds/v1/executive/messaging/{draft_id}/approve`
- `POST /api/pds/v1/executive/briefings/generate`
- `GET /api/pds/v1/executive/briefings/{briefing_pack_id}`

# Meridian Surface Contract Map

- `/api/re/v2/environments/[envId]/portfolio-kpis` -> released authoritative fund snapshots only.
- `/api/re/v2/funds/[fundId]/returns/[quarter]` -> released authoritative fund state + released structured gross-to-net bridge.
- `backend/app/sql_agent/query_templates.py` fund performance templates -> released authoritative fund snapshots.
- Legacy comparison surfaces kept for drift analysis only: quarter-close route, `re_fund_quarter_state`, `re_fund_metrics_qtr`, `re_gross_net_bridge_qtr`.
- Snapshot version under review: `meridian-20260419T170258Z-eb7e1153`.
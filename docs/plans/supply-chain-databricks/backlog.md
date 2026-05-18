# Supply Chain / Databricks — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Stub vs. live audit** — All supply chain sub-pages need a pass to determine which render real data vs. UI shells. Start at `/lab/env/[envId]/supply-chain`.

## UX improvements
- [ ] **Medallion architecture view** — `.../supply-chain/medallion` — Verify this shows a real Bronze/Silver/Gold layer diagram with table counts, not a static image.
- [ ] **Genie query interface** — `.../supply-chain/genie` — Confirm this is wired to a real Databricks Genie endpoint or clearly marked as demo.

## Backend / API
- [ ] **Databricks backend route** — Needs repo verification. Find or create the backend route that proxies supply chain queries to Databricks.
- [ ] **Genie integration** — Determine whether Genie NL queries go through the backend or directly to Databricks from the browser.

## Data / migrations
- [ ] **Supabase vs. Databricks** — Determine whether any supply chain data is mirrored to Supabase, or if all data lives in Databricks Unity Catalog.

## Tests
- [ ] **No known tests for supply chain routes** — Needs test coverage after backend routes are identified.

## Documentation
- [ ] **Databricks workspace config** — Document the Databricks workspace URL and catalog name when confirmed.

## Nice-to-have
- [ ] Real-time demand signal integration
- [ ] Slack alerts for supply chain anomalies

## Completed
_(none yet)_

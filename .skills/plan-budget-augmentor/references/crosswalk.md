# Crosswalk format (`CROSSWALK.md`)

The crosswalk records, for each platform component, what the source system was (NCF/Azure), what the target is for this deployment, and the pricing SKU once known. It stays **stack-agnostic** until research pins a choice — the target columns start as `TBD`.

Keep it to **one row per component**. When research decides a component, update that row in place (don't add a second).

## Table format

```markdown
| Component | NCF / source | Target product | Pricing unit / SKU | Status | Source + date |
|---|---|---|---|---|---|
| Warehouse | Snowflake | TBD | TBD | open | — |
| Orchestrator | Azure Data Factory | TBD | TBD | open | — |
| BI / semantic | Power BI + Tabular Model | TBD | TBD | open | — |
| Object storage | Azure Blob | TBD | TBD | open | — |
| Relational staging | SQL Managed Instance | TBD | TBD | open | — |
| Controlled-data enclave | Azure (whitelisted, encrypted) | TBD | TBD | open | — |
| Knowledge base | Confluence | TBD | TBD | open | — |
| Issue tracker | Jira | TBD | TBD | open | — |
| High-rate eng dashboards | (none / Power BI) | TBD | TBD | open | — |
```

`Status` values: `open` (not decided), `chosen` (product picked, price may be TBD), `priced` (product + price known), `superseded` (replaced — keep a one-line note pointing to the new row or changelog entry).

## How it connects to the budget

Each `chosen`/`priced` component should have matching `budget.csv` rows under the relevant `work_item_id`. When a row moves from `open` → `chosen` → `priced`, the corresponding budget placeholder moves from `NEEDS-RESEARCH` toward a real line item with rising confidence. The crosswalk is the index of stack decisions; the budget is where those decisions become numbers.

## Keeping it agnostic

Until the user's research names a product, leave `Target product = TBD` and don't guess. The template plans (`02_OPERATING_MODEL_TEMPLATE.md`) intentionally use placeholder tokens; the crosswalk is where a token becomes a concrete product for a specific deployment, and only when there's a source for it.

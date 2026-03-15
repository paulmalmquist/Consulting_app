# Development Tips

## Fund-to-Investment-to-Asset Rollup Patterns

### Data Chain
All fund-level portfolio metrics flow through this hierarchy:

```
Fund (repe_fund)
  -> Investment / Deal (repe_deal)
    -> Asset (repe_asset)
      -> Property Details (repe_property_asset)  -- property_type, msa, city, state
      -> Quarter State (re_asset_quarter_state)   -- noi, occupancy, asset_value, debt_balance
      -> Loan Detail (re_loan_detail)             -- ltv, dscr, coupon
```

### Common Pitfall: Missing `repe_asset` Records
If a `repe_deal` has no linked `repe_asset` entries, ALL asset-derived metrics in the investment rollup will be null — including NOI, occupancy, LTV, property type, and market. The seed endpoint (step 6c) now ensures every deal has at least one asset.

### Market / MSA Resolution
The `addSectorAndMarket()` function in the investment-rollup route uses `COALESCE(pa.msa, pa.market, pa.city)` to resolve the primary market for each investment. Always populate `msa` when seeding or inserting property assets. Fall back to `market` or `city` if `msa` is not available.

### Enrichment Paths
The investment-rollup API has two paths:

1. **Direct path**: When `re_investment_quarter_state` rows exist for the quarter, the route uses those for NAV/IRR/equity_multiple and enriches with asset-level aggregates (NOI, occupancy, LTV) via a separate query.

2. **Fallback path**: When no investment quarter state exists, the route aggregates directly from `re_asset_quarter_state`, computing weighted occupancy, LTV, and DSCR inline.

Both paths call `addSectorAndMarket()` to attach `sector_mix` and `primary_market`.

### Latest-As-Of Logic
- Sector/market queries use `LATERAL (ORDER BY quarter DESC LIMIT 1)` — always latest available.
- The main rollup query uses the exact quarter from the URL parameter.
- Occupancy is value-weighted: `SUM(occupancy * asset_value) / SUM(asset_value)`.
- LTV is computed as: `SUM(debt_balance) / SUM(asset_value)`.

### Frontend Mapping (buildPortfolioTableRows)
The `buildPortfolioTableRows()` function in `overviewNarrative.ts` maps rollup fields to table columns with cascading fallbacks:
- `equityInvested`: rollup.invested_capital -> rollup.committed_capital -> investment.invested_capital
- `currentValue`: rollup.total_asset_value -> rollup.gross_asset_value -> rollup.nav
- `irr`: rollup.gross_irr -> rollup.net_irr -> investment.gross_irr
- `noi`: rollup.total_noi -> investment.total_noi
- `occupancy`: rollup.weighted_occupancy (no fallback — requires asset data)
- `ltv`: rollup.computed_ltv -> investment.ltv (no fallback — requires asset + debt data)
- `propertyTypeKey`: dominant key from rollup.sector_mix
- `market`: rollup.primary_market

---

## Data Coherence Patterns (from March 2026 audit)

### Sector-Specific Revenue Scaling
When seeding operating financials, scale revenue to actual property dimensions:
- **Office**: `square_feet * $32/SF/yr / 4` per quarter
- **Multifamily**: `units * $1,850/mo * 3` per quarter
- **Industrial**: `square_feet * $12/SF/yr / 4` per quarter
- **Hotel**: `keys * $185 ADR * 90 days * occupancy` per quarter
- **Senior Housing**: `beds * $5,500/mo * 3` per quarter

Never use a flat revenue base across all assets — it breaks NOI consistency when different-sized assets get identical revenue.

### Deterministic UUID Conventions for Seeds
Use structured UUIDs for idempotent seeds (ON CONFLICT DO NOTHING):
```
Pipeline deals:     b1b2c3d4-0001-{table}-{seq}-000000000001
  table codes: 0001=deal, 0002=property, 0003=tranche, 0004=contact, 0005=activity
Partners:           e0a10000-0001-0001-{seq}-000000000001
Waterfall defs:     e0b10000-0001-0001-{seq}-000000000001
Lease tenants:      b0010000-{asset_group}-0001-{seq}-000000000001
Lease spaces:       b0020000-{asset_group}-0001-{seq}-000000000001
Leases:             b0030000-{asset_group}-0001-{seq}-000000000001
```

### Lease Stack Seeding Pattern
For each leased asset, seed in this order:
1. `re_tenant` — tenant master (name, industry, credit_rating, is_anchor)
2. `re_asset_space` — leaseable units (suite_number, floor, rentable_sf, status)
3. `re_lease` — lease header (tenant_id, space_id, dates, rent_psf, type)
4. `re_lease_step` — rent escalation schedule (annual_rent_psf, escalation_pct)
5. `re_lease_charge` — NNN charges (CAM, taxes, insurance per SF)
6. `re_lease_event` — critical dates (option notices, expirations)
7. `re_lease_document` — document metadata (doc_type, parser_status)
8. `re_rent_roll_snapshot` — point-in-time summary (occupancy, WALT, market rent)

### Capital Ledger Pro-Rata Pattern
When seeding capital calls/distributions, always distribute across ALL partners:
```sql
FOR p IN SELECT partner_id, committed_amount / total_committed AS pct
  FROM re_partner_commitment WHERE fund_id = v_fund_id
LOOP
  INSERT INTO re_capital_ledger_entry (...)
  VALUES (..., ROUND(total_amount * p.pct, 2), ...);
END LOOP;
```
Never use `LIMIT 1` — it creates a single-partner ledger that breaks LP statements.

### SQL Integrity Check Pattern
Each check function returns `TABLE(check_name text, passed boolean, detail text)`:
```sql
CREATE OR REPLACE FUNCTION re_check_example()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE v_violations int;
BEGIN
  SELECT COUNT(*) INTO v_violations FROM ... WHERE <violation_condition>;
  RETURN QUERY SELECT 'example'::text, v_violations = 0,
    CASE WHEN v_violations = 0 THEN 'OK' ELSE v_violations || ' violations' END;
END; $$ LANGUAGE plpgsql;
```
Master runner: `SELECT * FROM re_run_all_integrity_checks();`
API endpoint: `GET /api/re/v2/integrity/coherence`

### Key Financial Relationships to Validate
- `NOI = Revenue - OpEx` (tolerance: 1%)
- `NCF = NOI - CapEx - DebtService - TI/LC - Reserves` (tolerance: 2%)
- `TVPI = DPI + RVPI` (tolerance: 0.05)
- `LTV = Debt / Value` (range: 0-100%)
- `DSCR = NOI / DebtService` (must be > 0)
- Occupancy must be in [0%, 100%]
- Cap rates must be in [3%, 15%] unless intentionally stressed

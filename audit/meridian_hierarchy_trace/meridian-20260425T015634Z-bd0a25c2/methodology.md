# Methodology

- Authoritative state is computed once by this runner, persisted to versioned snapshot tables, and then served read-only.
- Asset accounting receipts come from `acct_gl_balance_monthly`, `acct_mapping_rule`, `acct_normalized_noi_monthly`, and `re_asset_acct_quarter_rollup`.
- Asset operating metrics use:
  NOI = operating revenue - operating expenses
  net cash flow = NOI - capex - TI/LC - reserves - debt service
- Investment attributable cash flow uses:
  attributable cash flow = asset net cash flow * effective fund ownership %
- Fund gross-to-net bridge uses:
  net operating cash flow = gross operating cash flow - management fees - fund expenses
- Fund gross IRR uses dated `CALL` and `DIST` events plus terminal ending NAV.
- Fund net IRR uses dated `CALL`, `DIST`, `FEE`, and `EXPENSE` events plus terminal ending NAV.
- Promotion states:
  draft_audit -> verified -> released
- Only `released` snapshots are served to general API/UI/assistant consumers.
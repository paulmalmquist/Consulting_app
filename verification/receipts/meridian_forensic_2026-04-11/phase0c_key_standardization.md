# Phase 0c — Canonical Metrics Key Standardization Receipt

**Date:** 2026-04-11  
**Status:** INVESTIGATION COMPLETE — no active data corruption; lint scanner to be added in Phase 7  

---

## Finding Summary (NF-2)

Phase 0 baseline showed the `canonical_metrics` JSONB blob in `re_authoritative_fund_state_qtr`
uses key `tvpi` (not `gross_tvpi`) for the gross total value paid-in metric.

**Concern raised:** any code reading `canonical_metrics->>'gross_tvpi'` or
`canonical_metrics.get('gross_tvpi')` would silently return `null`.

---

## Investigation Results

**All active consumers of `canonical_metrics` for TVPI already use the correct key `tvpi`:**

| File | Line | Code | Status |
|---|---|---|---|
| `meridian_structured_executor.py` | 173 | `canonical_metrics->>'tvpi'` | ✓ CORRECT |
| `meridian_structured_runtime.py` | 515 | `s.canonical_metrics->>'tvpi'` | ✓ CORRECT |
| `meridian_structured_runtime.py` | 865 | `canonical_metrics.get("tvpi")` | ✓ CORRECT |
| `unified_query_builder.py` | 348 | `"gross_tvpi": "tvpi"` (alias mapping) | ✓ CORRECT |

**No code anywhere performs `canonical_metrics->>'gross_tvpi'` or `canonical_metrics.get('gross_tvpi')`.**

---

## Key Name Convention (confirmed)

The codebase uses TWO names for the same metric, at different layers:

| Layer | Key name | Location |
|---|---|---|
| JSONB blob in DB | `tvpi` | `re_authoritative_fund_state_qtr.canonical_metrics` |
| External API field | `gross_tvpi` | API responses, `re_fund_metrics_qtr` column, Python variables |
| Python computation | `gross_tvpi` | Local variable in `re_fund_metrics.py`, scenario services |
| Query builder alias | `"gross_tvpi": "tvpi"` | `unified_query_builder.py:348` — correct translation layer |

This is a dual-name pattern, not a bug. The translation is correctly handled by
`unified_query_builder.py`. The risk is that future contributors add a direct
`canonical_metrics.get('gross_tvpi')` read bypassing the translation layer.

---

## Action Required

**No code changes needed.** All active reads are correct.

**Lint scanner to be added in Phase 7** (scanner #7: `canonical_metrics_key_drift`):
- Pattern: `canonical_metrics.*gross_tvpi` in Python string literals (SQL)
- Pattern: `canonical_metrics\.get\(["\']gross_tvpi["\']` in Python code
- Pattern: `canonical_metrics\[['"]gross_tvpi['"]\]` in Python code
- Severity: HARD
- Rationale: `canonical_metrics` JSONB key is `tvpi`; reading `gross_tvpi` from the blob
  silently returns `null` without error, causing invisible downstream metric corruption.

---

## Files Referencing `gross_tvpi` (audit-reviewed, all safe)

| File | Usage | Verdict |
|---|---|---|
| `re_fund_metrics.py` | Local Python variable in computation | ✓ Safe — never reads from blob |
| `re_sale_scenario.py` | Local computation variable / response dict key | ✓ Safe |
| `re_waterfall_scenario.py` | Local computation variable / response dict key | ✓ Safe |
| `re_excel_export.py` | Column header / response key | ✓ Safe |
| `ai_gateway.py` | Response serialization field | ✓ Safe |
| `unified_query_builder.py` | Alias mapping `"gross_tvpi": "tvpi"` | ✓ Safe — correct translation |
| `schemas/re_financial_intelligence.py` | Pydantic field name | ✓ Safe — external schema |
| `mcp/tools/repe_finance_tools.py` | Tool response field | ✓ Safe |
| `tests/*` | Test fixture keys matching API schema | ✓ Safe — testing API layer |

---

## No Migration Required

The JSONB blob already uses `tvpi`. No data repair is needed.
The lint scanner (Phase 7) prevents future regression.

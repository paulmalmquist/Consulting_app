# Bug Fix Queue — Duplicate Function Consolidation
**Source:** Coherence Audit 2026-03-22
**Status:** OPEN — awaiting autonomous coding sessions

---

## How This Queue Works

This file is read by the autonomous coding sessions (3 PM `autonomous-coding-session`, 10:30 AM `stone-pds-coding`, 1 PM `meridian-coding`, 12:30 PM `msa-coding-session`). Each session should:
1. Check this queue before starting feature work
2. Pick up the highest-priority uncompleted item that matches their environment scope
3. Mark the item as IN PROGRESS with the session name and date
4. After completing, mark as DONE with commit hash

Bug fixes in this queue take priority over P2+ features but yield to CI failures and P0/P1 bugs found during planning tours.

---

## BF-001: Consolidate `fmtMoney()` — 57 duplicates → 1 canonical
**Priority:** P0 CRITICAL
**Owner:** `autonomous-coding-session` (3 PM) — this is cross-environment
**Status:** OPEN

### Problem
`fmtMoney()` is copy-pasted into 57 files across all environments. Each copy formats a number as USD currency. Variants exist with different null handling.

### Canonical Location
`repo-b/src/lib/format-utils.ts`

If this file doesn't exist yet, create it with:
```typescript
export function fmtMoney(value: number | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function fmtMoneyExact(value: number | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtPct(value: number | null | undefined, decimals = 1, fallback = '—'): string {
  if (value == null) return fallback;
  return `${value.toFixed(decimals)}%`;
}

export function fmtMultiple(value: number | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  return `${value.toFixed(2)}x`;
}
```

### Implementation Steps
1. Create or verify `repo-b/src/lib/format-utils.ts` with the canonical implementations above
2. Run `grep -rl "function fmtMoney" --include="*.ts" --include="*.tsx" repo-b/src/` to find all 57 files
3. For each file: add `import { fmtMoney } from '@/lib/format-utils';` and delete the local definition
4. Run full lint: `cd repo-b && npx next lint && npx tsc --noEmit`
5. Commit: `refactor: consolidate fmtMoney to canonical format-utils.ts (57 files)`

### Verification
- `npx tsc --noEmit` passes
- `grep -r "function fmtMoney" --include="*.ts" --include="*.tsx" repo-b/src/` returns ONLY `format-utils.ts`

---

## BF-002: Consolidate `_d()` Decimal helper — 14 duplicates → 1 canonical
**Priority:** P1 HIGH
**Owner:** `meridian-coding` (1 PM) — most copies are in REPE/financial code
**Status:** OPEN

### Problem
`_d()` Decimal wrapper duplicated in 14 Python backend files. Pattern: `def _d(v): return Decimal(str(v))`. Some copies add rounding, others don't.

### Canonical Location
`backend/app/services/re_math.py`

If this file doesn't exist or lacks `_d`, add:
```python
from decimal import Decimal, ROUND_HALF_UP

def _d(v) -> Decimal:
    if v is None:
        return Decimal('0')
    return Decimal(str(v))

def round_money(v: Decimal, places: int = 2) -> Decimal:
    return v.quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)
```

### Implementation Steps
1. Verify/create `backend/app/services/re_math.py`
2. Run `grep -rl "def _d" --include="*.py" backend/` to find all 14 files
3. For each file: add `from app.services.re_math import _d` and delete the local definition
4. Run `cd backend && python -m ruff check app tests`
5. Commit: `refactor: consolidate _d() Decimal helper to re_math.py (14 files)`

---

## BF-003: Consolidate `_quarter_end_date()` — 8 duplicates → 1 canonical
**Priority:** P2 MEDIUM
**Owner:** `autonomous-coding-session` (3 PM) — after BF-001 if time permits
**Status:** OPEN

### Problem
`_quarter_end_date()` duplicated in 8 files with no canonical source. One copy has a known Dec 30 vs Dec 31 bug.

### Canonical Location
Create `backend/app/services/date_utils.py`

### Implementation Steps
1. Create `backend/app/services/date_utils.py` with canonical implementation
2. Run `grep -rl "quarter_end_date" --include="*.py" backend/` to find all 8 files
3. For each file: import from canonical and delete local definition
4. Lint and commit: `refactor: consolidate quarter_end_date to date_utils.py (8 files) — fixes Dec 30 bug`

---

## BF-004: Consolidate `fmtDate()`, `fmtPct()`, `scoreColor()` — misc frontend duplicates
**Priority:** P2 MEDIUM
**Owner:** `stone-pds-coding` (10:30 AM)
**Status:** OPEN

### Problem
Multiple formatting and color utility functions duplicated across market components and environment pages.

### Canonical Location
`repo-b/src/lib/format-utils.ts` (same file as BF-001)

### Implementation Steps
1. After BF-001 is complete, verify `format-utils.ts` includes `fmtDate`, `fmtPct`
2. Search and replace local definitions with imports
3. Lint and type-check

---

## Queue Rules
- Items are processed in priority order (P0 first)
- A coding session should only pick up ONE item per session
- Mark items IN PROGRESS before starting work
- Cross-environment items (BF-001) should be handled by the general `autonomous-coding-session`
- After all BF items are complete, the `ai-coherence-checker` should verify the consolidation

---
*Queue created: 2026-03-22 — from coherence audit findings*

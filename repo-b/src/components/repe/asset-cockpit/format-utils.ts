/**
 * format-utils.ts — asset-cockpit shim
 *
 * Re-exports from the canonical @/lib/format-utils.
 * Kept for backwards compatibility with cockpit components that import locally.
 * New code should import directly from '@/lib/format-utils'.
 */
export {
  fmtMoney,
  fmtPct,
  fmtText,
  fmtYear,
  fmtSfPsf,
  fmtBps,
} from '@/lib/format-utils';

// fmtX is the cockpit name for fmtMultiple — re-export with local alias
export { fmtMultiple as fmtX } from '@/lib/format-utils';

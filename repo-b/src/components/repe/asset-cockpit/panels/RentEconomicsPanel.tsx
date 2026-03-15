"use client";

import type { ReV2AssetDetail, ReLeaseEconomics } from "@/lib/bos-api";
import SectionHeader from "../shared/SectionHeader";
import SecondaryMetric from "../shared/SecondaryMetric";
import { BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockRentEconomics } from "../mock-data";
import { fmtSfPsf } from "../format-utils";

interface Props {
  detail: ReV2AssetDetail;
  /** Real economics from /leasing/economics API. When provided, overrides mock. */
  realEconomics?: ReLeaseEconomics | null;
}

export default function RentEconomicsPanel({ detail, realEconomics }: Props) {
  const mock = getMockRentEconomics(detail);
  const re = {
    avg_rent_psf:       realEconomics?.in_place_psf       ?? mock.avg_rent_psf,
    market_rent_psf:    realEconomics?.market_rent_psf     ?? mock.market_rent_psf,
    mark_to_market_pct: realEconomics?.mark_to_market_pct != null
      ? Number(realEconomics.mark_to_market_pct) * 100
      : mock.mark_to_market_pct,
  };
  const isPositive = re.mark_to_market_pct >= 0;

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader eyebrow="RENT ECONOMICS" title="Rent Analysis" />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <SecondaryMetric label="Avg Rent PSF" value={fmtSfPsf(re.avg_rent_psf)} />
        <SecondaryMetric label="Market Rent PSF" value={fmtSfPsf(re.market_rent_psf)} />
        <div
          className={`rounded-xl border px-4 py-3 ${
            isPositive
              ? "border-green-200 bg-green-50 dark:border-green-500/20 dark:bg-green-500/5"
              : "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5"
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Mark-to-Market
          </p>
          <p
            className={`mt-1 text-sm font-medium tabular-nums ${
              isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {re.mark_to_market_pct.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}

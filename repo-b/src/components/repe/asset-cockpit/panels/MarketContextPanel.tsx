"use client";

import type { ReV2AssetDetail } from "@/lib/bos-api";
import SectionHeader from "../shared/SectionHeader";
import SecondaryMetric from "../shared/SecondaryMetric";
import { BRIEFING_CONTAINER } from "../shared/briefing-colors";
import { getMockMarketContext } from "../mock-data";

interface Props {
  detail: ReV2AssetDetail;
}

export default function MarketContextPanel({ detail }: Props) {
  const mc = getMockMarketContext();
  const market = detail.property?.market ?? detail.property?.msa ?? "Market";

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader
        eyebrow="MARKET & CONTEXT"
        title={`${market} Fundamentals`}
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <SecondaryMetric label="Market Vacancy" value={`${mc.market_vacancy.toFixed(1)}%`} />
        <SecondaryMetric label="Submarket Vacancy" value={`${mc.submarket_vacancy.toFixed(1)}%`} />
        <SecondaryMetric label="YoY Rent Growth" value={`+${mc.rent_growth.toFixed(1)}%`} />
      </div>
    </div>
  );
}

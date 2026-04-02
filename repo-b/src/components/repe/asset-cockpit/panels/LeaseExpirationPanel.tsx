"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import SectionHeader from "../shared/SectionHeader";
import { BRIEFING_COLORS, BRIEFING_CONTAINER, BRIEFING_CARD } from "../shared/briefing-colors";
import type { ReLeaseExpirationBucket } from "@/lib/bos-api";

interface Props {
  realBuckets?: ReLeaseExpirationBucket[];
}

export default function LeaseExpirationPanel({ realBuckets }: Props = {}) {
  if (!realBuckets || realBuckets.length === 0) return null;
  const data = realBuckets;

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader
        eyebrow="LEASE ROLLOVER"
        title="Lease Expiration Schedule"
        description="Percentage of GLA expiring by year"
      />

      <div className={`mt-5 ${BRIEFING_CARD}`}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              formatter={(v: number) => [`${v}%`, "Expiring"]}
              contentStyle={{
                background: "rgba(15,23,42,0.92)",
                border: "none",
                borderRadius: 12,
                fontSize: 12,
                color: "#e2e8f0",
              }}
            />
            <Bar dataKey="pct_expiring" radius={[6, 6, 0, 0]} maxBarSize={48}>
              {data.map((entry) => (
                <Cell
                  key={entry.year}
                  fill={
                    entry.pct_expiring >= 20
                      ? BRIEFING_COLORS.risk
                      : BRIEFING_COLORS.performance
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

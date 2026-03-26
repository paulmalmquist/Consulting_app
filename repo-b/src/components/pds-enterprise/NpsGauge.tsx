"use client";

import { NPS_BENCHMARK } from "@/lib/pds-thresholds";

type Props = {
  score: number;
  benchmark?: number;
};

function npsColor(score: number): string {
  if (score < 0) return "#ef4444";    // red
  if (score < 30) return "#eab308";   // yellow
  if (score < 50) return "#22c55e";   // green
  return "#15803d";                    // dark green
}

export function NpsGauge({ score, benchmark = NPS_BENCHMARK }: Props) {
  // Guard against NaN/undefined — display 0 instead of NaN
  const safeScore = Number.isFinite(score) ? score : 0;
  // Map NPS (-100 to +100) to 0-180 degrees for a semicircular gauge
  const normalizedScore = Math.max(-100, Math.min(100, safeScore));
  const angle = ((normalizedScore + 100) / 200) * 180;
  const benchmarkAngle = ((benchmark + 100) / 200) * 180;
  const color = npsColor(safeScore);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-48 h-auto">
        {/* Background arc */}
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke="#374151"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 283} 283`}
        />
        {/* Benchmark tick */}
        <line
          x1={100 + 90 * Math.cos((Math.PI * (180 - benchmarkAngle)) / 180)}
          y1={100 - 90 * Math.sin((Math.PI * (180 - benchmarkAngle)) / 180)}
          x2={100 + 75 * Math.cos((Math.PI * (180 - benchmarkAngle)) / 180)}
          y2={100 - 75 * Math.sin((Math.PI * (180 - benchmarkAngle)) / 180)}
          stroke="#9ca3af"
          strokeWidth="2"
        />
        {/* Score text */}
        <text x="100" y="90" textAnchor="middle" fill={color} fontSize="28" fontWeight="bold">
          {safeScore > 0 ? "+" : ""}{Math.round(safeScore)}
        </text>
        <text x="100" y="108" textAnchor="middle" fill="#9ca3af" fontSize="10">
          NPS Score
        </text>
      </svg>
      <div className="text-xs text-zinc-500 mt-1">
        Benchmark: +{benchmark}
      </div>
    </div>
  );
}

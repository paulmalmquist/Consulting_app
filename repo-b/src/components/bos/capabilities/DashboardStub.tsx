"use client";

import { Card, CardContent } from "@/components/ui/Card";

interface Props {
  deptKey: string;
  capKey: string;
  capLabel: string;
}

const METRIC_PLACEHOLDERS = [
  { label: "Total", color: "bm-accent" },
  { label: "Active", color: "bm-success" },
  { label: "Pending", color: "bm-warning" },
  { label: "Flagged", color: "bm-danger" },
];

export default function DashboardStub({ capLabel }: Props) {
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-xl font-bold">{capLabel}</h1>

      {/* KPI metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {METRIC_PLACEHOLDERS.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-xs text-bm-muted2 uppercase tracking-wider mb-1">{m.label}</p>
              <div className={`h-8 w-20 bg-${m.color}/20 rounded animate-pulse`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart placeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-bm-muted2 uppercase tracking-wider mb-3">Trend</p>
            <div className="h-48 bg-bm-surface/40 border border-bm-border/40 rounded-lg flex items-center justify-center">
              <div className="flex items-end gap-2 h-32">
                {[40, 65, 50, 80, 60, 75, 90, 70, 85, 55, 95, 80].map((h, i) => (
                  <div
                    key={i}
                    className="w-3 bg-bm-accent/30 rounded-t"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-bm-muted2 uppercase tracking-wider mb-3">Distribution</p>
            <div className="h-48 bg-bm-surface/40 border border-bm-border/40 rounded-lg flex items-center justify-center">
              <div className="w-32 h-32 rounded-full border-[12px] border-bm-accent/30 border-t-bm-accent/60 border-r-bm-success/40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table section */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider mb-3">Details</p>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-bm-border/30">
                <div className="h-4 w-32 bg-bm-surface/60 rounded animate-pulse" />
                <div className="h-4 w-20 bg-bm-surface/60 rounded animate-pulse" />
                <div className="flex-1" />
                <div className="h-4 w-16 bg-bm-surface/60 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

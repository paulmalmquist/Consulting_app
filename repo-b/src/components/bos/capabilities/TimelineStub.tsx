"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Props {
  deptKey: string;
  capKey: string;
  capLabel: string;
}

const MOCK_ROWS = [
  { label: "Phase 1", width: "40%", left: "5%", variant: "success" as const },
  { label: "Phase 2", width: "30%", left: "25%", variant: "accent" as const },
  { label: "Phase 3", width: "35%", left: "45%", variant: "warning" as const },
  { label: "Phase 4", width: "20%", left: "65%", variant: "default" as const },
  { label: "Phase 5", width: "25%", left: "75%", variant: "default" as const },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function TimelineStub({ capLabel }: Props) {
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{capLabel}</h1>
        <Badge variant="accent">Timeline View</Badge>
      </div>

      <Card>
        <CardContent className="p-5">
          {/* Month headers */}
          <div className="flex border-b border-bm-border/40 mb-4">
            {MONTHS.map((m) => (
              <div
                key={m}
                className="flex-1 text-center text-[10px] text-bm-muted2 uppercase tracking-wider py-2"
              >
                {m}
              </div>
            ))}
          </div>

          {/* Gantt bars */}
          <div className="space-y-3">
            {MOCK_ROWS.map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-xs text-bm-muted w-20 flex-shrink-0 text-right">
                  {row.label}
                </span>
                <div className="flex-1 relative h-7 bg-bm-surface/20 rounded">
                  <div
                    className="absolute top-0 h-full rounded bg-bm-accent/25 border border-bm-accent/40 flex items-center px-2"
                    style={{ width: row.width, left: row.left }}
                  >
                    <span className="text-[10px] text-bm-muted truncate">{row.label}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Today marker */}
          <div className="relative mt-4 h-px bg-bm-border/40">
            <div
              className="absolute -top-2 h-5 w-px bg-bm-accent"
              style={{ left: "35%" }}
            />
            <span
              className="absolute -top-5 text-[9px] text-bm-accent font-medium"
              style={{ left: "33%" }}
            >
              Today
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

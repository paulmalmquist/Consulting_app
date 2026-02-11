"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Props {
  deptKey: string;
  capKey: string;
  capLabel: string;
}

const COLUMNS = [
  { title: "New", variant: "default" as const, count: 3 },
  { title: "In Progress", variant: "accent" as const, count: 2 },
  { title: "Review", variant: "warning" as const, count: 1 },
  { title: "Done", variant: "success" as const, count: 2 },
];

export default function KanbanStub({ capLabel }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{capLabel}</h1>
        <Badge variant="accent">Board View</Badge>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div
            key={col.title}
            className="flex-shrink-0 w-72 bg-bm-surface/20 border border-bm-border/40 rounded-xl"
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-bm-border/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{col.title}</span>
                <Badge variant={col.variant}>{col.count}</Badge>
              </div>
            </div>

            {/* Cards */}
            <div className="p-3 space-y-2.5 min-h-[200px]">
              {Array.from({ length: col.count }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-bm-surface/60 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-bm-surface/40 rounded animate-pulse" />
                    <div className="flex items-center justify-between pt-1">
                      <div className="h-5 w-5 bg-bm-surface/60 rounded-full animate-pulse" />
                      <div className="h-3 w-12 bg-bm-surface/40 rounded animate-pulse" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

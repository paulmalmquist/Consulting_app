"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Props {
  deptKey: string;
  capKey: string;
  capLabel: string;
}

const MOCK_COLS = ["Name", "Status", "Owner", "Updated", "Actions"];

export default function DataGridStub({ capLabel }: Props) {
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{capLabel}</h1>
        <Badge variant="accent">0 records</Badge>
      </div>

      {/* Search & filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-9 bg-bm-surface/60 border border-bm-border/60 rounded-lg px-3 flex items-center">
          <span className="text-bm-muted2 text-sm">Search {capLabel.toLowerCase()}...</span>
        </div>
        <div className="h-9 w-24 bg-bm-surface/60 border border-bm-border/60 rounded-lg flex items-center justify-center">
          <span className="text-bm-muted2 text-xs">Filters</span>
        </div>
      </div>

      {/* Table skeleton */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/70">
                {MOCK_COLS.map((col) => (
                  <th
                    key={col}
                    className="text-left text-xs text-bm-muted2 uppercase tracking-wider px-4 py-3 font-medium"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="border-b border-bm-border/30">
                  {MOCK_COLS.map((col) => (
                    <td key={col} className="px-4 py-3">
                      <div className="h-4 bg-bm-surface/60 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between text-xs text-bm-muted2">
        <span>Showing 0 of 0</span>
        <div className="flex items-center gap-2">
          <div className="h-7 w-16 bg-bm-surface/60 border border-bm-border/60 rounded" />
          <div className="h-7 w-16 bg-bm-surface/60 border border-bm-border/60 rounded" />
        </div>
      </div>
    </div>
  );
}

"use client";

import { FileSpreadsheet, Download, Upload } from "lucide-react";

export function ExcelSyncTab() {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
      <div className="text-center max-w-md">
        <FileSpreadsheet size={32} className="mx-auto mb-3 text-bm-muted" />
        <h3 className="text-sm font-medium text-bm-text mb-2">Excel Sync</h3>
        <p className="text-xs text-bm-muted2 mb-4">
          Pull JV and tier cash flow tables into Excel, edit detailed assumptions in draft scenarios,
          and push changes back into the same canonical scenario object.
        </p>
        <div className="flex gap-3 justify-center">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border/50 px-4 py-2 text-xs text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text">
            <Download size={12} /> Export to Excel
          </button>
          <button
            disabled
            className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border/30 px-4 py-2 text-xs text-bm-muted/50 cursor-not-allowed"
          >
            <Upload size={12} /> Import from Excel
          </button>
        </div>
        <p className="text-[10px] text-bm-muted mt-3">
          Import will be enabled once the Excel add-in is connected. Export is available now.
        </p>
      </div>
    </div>
  );
}

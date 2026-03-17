"use client";

import { AlertTriangle, RefreshCw, Database } from "lucide-react";

interface SchemaNotReadyProps {
  onRetry?: () => void;
}

export function SchemaNotReady({ onRetry }: SchemaNotReadyProps) {
  return (
    <div className="m-6 flex flex-col items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/5 py-16 text-center">
      <div className="mb-4 rounded-full border border-amber-500/30 bg-amber-500/10 p-4">
        <Database size={28} className="text-amber-400" />
      </div>
      <h2 className="text-base font-semibold text-bm-text">
        Modeling Environment Not Initialized
      </h2>
      <p className="mt-2 max-w-md text-sm text-bm-muted2">
        The modeling schema has not been applied to this environment.
        Contact your administrator to run the required database migrations.
      </p>
      <div className="mt-6 flex items-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-4 py-2 text-sm text-bm-text transition-colors hover:bg-bm-surface/30"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

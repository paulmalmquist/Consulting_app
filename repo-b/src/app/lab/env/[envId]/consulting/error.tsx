"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function ConsultingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Consulting workspace error]", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-red-300">Consulting workspace error</h2>
      <p className="text-sm text-bm-muted2 font-mono break-all">{error.message || "Unknown error"}</p>
      {error.digest && <p className="text-xs text-bm-muted2">Digest: {error.digest}</p>}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={reset}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90">
          Retry
        </button>
        <Link href="/app"
          className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40">
          Back to Workspaces
        </Link>
      </div>
    </div>
  );
}

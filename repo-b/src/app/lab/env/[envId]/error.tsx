"use client";

import React, { useEffect } from "react";
import Link from "next/link";

// Route-segment error boundary for the whole `/lab/env/[envId]/...` subtree.
// Sub-segments without their own error.tsx (e.g. operator) fall back here, so a
// render or hydration crash degrades to a recoverable state instead of leaving
// the page frozen on a loading screen.
export default function LabEnvironmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Lab environment error]", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 lg:px-6">
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-red-300">Workspace failed to load</h2>
        <p className="text-sm text-bm-muted2">
          Something went wrong rendering this environment. This is recoverable —
          retry below, or return to your workspaces.
        </p>
        <p className="text-sm text-bm-muted2 font-mono break-all">
          {error.message || "Unknown error"}
        </p>
        {error.digest && <p className="text-xs text-bm-muted2">Digest: {error.digest}</p>}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
          >
            Retry
          </button>
          <Link
            href="/app"
            className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
          >
            Back to Workspaces
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

export default function PdsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PDS Error Boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-2xl border border-pds-divider bg-pds-card/40 p-8 shadow-lg backdrop-blur max-w-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <svg
            className="h-6 w-6 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-white/60">
          {error.message?.includes("pds_pipeline_deals")
            ? "The PDS pipeline table hasn't been migrated yet. Please run the schema migration to resolve this."
            : error.message || "An unexpected error occurred while loading this page."}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-white/40">Error ID: {error.digest}</p>
        )}
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-pds-gold px-4 py-2 text-sm font-medium text-pds-bg transition hover:bg-pds-gold/90"
          >
            Try again
          </button>
          <button
            onClick={() => window.history.back()}
            className="rounded-lg border border-pds-divider px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { logError } from "@/lib/logging/logger";
import ResumeFallbackCard from "@/components/resume/ResumeFallbackCard";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("resume.route_error", "Resume route error boundary triggered", {
      error_message: error.message,
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <ResumeFallbackCard
      eyebrow="Visual Resume"
      title="Resume data unavailable"
      body="The visual resume hit an unexpected render error. The failure was contained so the rest of the app stays healthy."
      meta={error.digest ? `Digest: ${error.digest}` : null}
      tone="error"
      action={
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-bm-text transition hover:bg-white/15"
        >
          Retry resume route
        </button>
      }
    />
  );
}

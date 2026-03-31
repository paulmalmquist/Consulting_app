"use client";

import { useCallback, useEffect, useState } from "react";
import { getResumeWorkspace } from "@/lib/bos-api";
import ResumeWorkspace from "@/components/resume/ResumeWorkspace";
import ResumeFallbackCard from "@/components/resume/ResumeFallbackCard";
import {
  normalizeResumeWorkspace,
  type ResumeWorkspaceViewModel,
} from "@/lib/resume/workspace";

/**
 * Public read-only resume page.
 *
 * This page does not require authentication. It loads the resume workspace
 * using the default resume environment and renders in read-only mode
 * (no assistant dock, no editing capabilities).
 */

const DEFAULT_RESUME_ENV_ID = "7160a57b-59e7-4d72-bf43-5b9c179021af";

type LoadState = "idle" | "loading" | "ready" | "error";

export default function PublicResumePage() {
  const [workspace, setWorkspace] = useState<ResumeWorkspaceViewModel | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const retry = useCallback(() => {
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setLoadState("loading");
      setErrorMessage(null);

      try {
        const payload = await getResumeWorkspace(DEFAULT_RESUME_ENV_ID);
        if (cancelled) return;

        const normalized = normalizeResumeWorkspace(payload);
        setWorkspace(normalized.workspace);
        setLoadState("ready");
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : "Failed to load resume workspace";
        setWorkspace(null);
        setLoadState("error");
        setErrorMessage(message);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if ((loadState === "idle" || loadState === "loading") && !workspace) {
    return (
      <ResumeFallbackCard
        eyebrow="Visual Resume"
        title="Loading visual resume"
        body="Preparing the profile, timeline, architecture, modeling, and analytics layers."
      />
    );
  }

  if ((loadState === "error" || !workspace)) {
    return (
      <ResumeFallbackCard
        eyebrow="Visual Resume"
        title="Resume data unavailable"
        body={errorMessage ?? "The visual resume could not be loaded right now."}
        tone="error"
        action={
          <button
            type="button"
            onClick={retry}
            className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-bm-text transition hover:bg-white/15"
          >
            Retry
          </button>
        }
      />
    );
  }

  return (
    <ResumeWorkspace
      envId={DEFAULT_RESUME_ENV_ID}
      businessId={null}
      workspace={workspace}
      readOnly
    />
  );
}

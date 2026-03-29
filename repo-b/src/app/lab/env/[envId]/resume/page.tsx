"use client";

import { useCallback, useEffect, useState } from "react";
import { getResumeWorkspace, type BosApiError } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import ResumeWorkspace from "@/components/resume/ResumeWorkspace";
import ResumeFallbackCard from "@/components/resume/ResumeFallbackCard";
import { logError, logInfo, logWarn } from "@/lib/logging/logger";
import {
  isValidEnvId,
  normalizeResumeWorkspace,
  type ResumeWorkspaceViewModel,
} from "@/lib/resume/workspace";

type LoadState = "idle" | "loading" | "ready" | "error";

function extractRequestId(error: unknown): string | null {
  return (error as BosApiError | undefined)?.requestId ?? null;
}

export default function ResumeOsPage() {
  const {
    envId,
    businessId,
    loading: contextLoading,
    error: contextError,
    requestId: contextRequestId,
    retry: retryContext,
  } = useDomainEnv();
  const [workspace, setWorkspace] = useState<ResumeWorkspaceViewModel | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const validEnvId = isValidEnvId(envId);

  const retryWorkspace = useCallback(() => {
    if (contextError) {
      void retryContext();
      return;
    }
    setRefreshKey((value) => value + 1);
  }, [contextError, retryContext]);

  useEffect(() => {
    if (!validEnvId) {
      setWorkspace(null);
      setLoadState("error");
      setErrorMessage("This route needs a valid environment id before the visual resume can load.");
      setErrorRequestId(null);
      return;
    }

    if (contextLoading) {
      setLoadState("loading");
      return;
    }

    if (contextError) {
      setWorkspace(null);
      setLoadState("error");
      setErrorMessage(contextError);
      setErrorRequestId(contextRequestId);
      return;
    }

    let cancelled = false;

    async function loadWorkspace() {
      setLoadState("loading");
      setErrorMessage(null);
      setErrorRequestId(null);

      try {
        const payload = await getResumeWorkspace(envId, businessId || undefined);
        if (cancelled) return;

        const normalized = normalizeResumeWorkspace(payload);
        logInfo("resume.workspace_loaded", "Resume workspace loaded", {
          env_id: envId,
          business_id: businessId,
          ...normalized.stats,
        });
        if (normalized.issues.length > 0) {
          logWarn("resume.workspace_normalized", "Resume workspace payload required normalization", {
            env_id: envId,
            business_id: businessId,
            issues: normalized.issues,
            issue_count: normalized.issues.length,
            ...normalized.stats,
          });
        }

        setWorkspace(normalized.workspace);
        setLoadState("ready");
      } catch (cause) {
        if (cancelled) return;
        const requestId = extractRequestId(cause);
        const message = cause instanceof Error ? cause.message : "Failed to load resume workspace";
        logError("resume.workspace_failed", "Resume workspace request failed", {
          env_id: envId,
          business_id: businessId,
          request_id: requestId,
          error_message: message,
        });
        setWorkspace(null);
        setLoadState("error");
        setErrorMessage(message);
        setErrorRequestId(requestId);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [businessId, contextError, contextLoading, contextRequestId, envId, refreshKey, validEnvId]);

  if ((contextLoading || loadState === "idle" || loadState === "loading") && !workspace) {
    return (
      <ResumeFallbackCard
        eyebrow="Visual Resume"
        title="Initializing visual resume"
        body="Loading the profile, timeline, architecture, modeling, and analytics layers for this environment."
      />
    );
  }

  if (!validEnvId) {
    return (
      <ResumeFallbackCard
        eyebrow="Visual Resume"
        title="Resume data unavailable"
        body="The requested resume route does not include a valid environment id, so the page cannot load safely."
        tone="error"
      />
    );
  }

  if ((loadState === "error" || !workspace) && !contextLoading) {
    return (
      <ResumeFallbackCard
        eyebrow="Visual Resume"
        title="Resume data unavailable"
        body={errorMessage ?? "The visual resume workspace could not be loaded right now."}
        meta={errorRequestId ? `Request ID: ${errorRequestId}` : null}
        tone="error"
        action={
          <button
            type="button"
            onClick={retryWorkspace}
            className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-bm-text transition hover:bg-white/15"
          >
            Retry visual resume
          </button>
        }
      />
    );
  }

  if (!workspace) {
    return null;
  }

  return <ResumeWorkspace envId={envId} businessId={businessId} workspace={workspace} />;
}

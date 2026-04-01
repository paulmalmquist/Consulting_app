"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getResumeWorkspace, type BosApiError } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import ResumeWorkspace from "@/components/resume/ResumeWorkspace";
import { logError, logInfo, logWarn } from "@/lib/logging/logger";
import {
  isValidEnvId,
  normalizeResumeWorkspace,
  type ResumeWorkspaceViewModel,
} from "@/lib/resume/workspace";
import { getResumeSeedPayload } from "@/data/visualResumeSeed";

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

  // Seed renders immediately — no loading state, no blank screen.
  const seedWorkspace = useMemo(
    () => normalizeResumeWorkspace(getResumeSeedPayload()).workspace,
    [],
  );

  const [workspace, setWorkspace] = useState<ResumeWorkspaceViewModel>(seedWorkspace);
  const [hydrating, setHydrating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const validEnvId = isValidEnvId(envId);

  const retryWorkspace = useCallback(() => {
    if (contextError) {
      void retryContext();
      return;
    }
    setRefreshKey((value) => value + 1);
  }, [contextError, retryContext]);

  // Attempt DB fetch as an enhancement. Never blank the UI.
  useEffect(() => {
    if (!validEnvId || contextLoading || contextError) return;

    let cancelled = false;
    setHydrating(true);

    async function loadWorkspace() {
      try {
        const payload = await getResumeWorkspace(envId, businessId || undefined);
        if (cancelled) return;

        const normalized = normalizeResumeWorkspace(payload);
        logInfo("resume.workspace_loaded", "Resume workspace loaded from DB", {
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

        // Only upgrade if DB data has meaningful content beyond the seed
        const dbHasTimeline = normalized.stats.milestones > 0 || normalized.stats.roles > 0;
        if (dbHasTimeline) {
          // Merge: use DB workspace but preserve seed's precomputed curves
          // and identity (seed identity is the authoritative source of truth
          // from the resume document; backend may lag behind).
          const merged: ResumeWorkspaceViewModel = {
            ...normalized.workspace,
            identity: seedWorkspace.identity,
            timeline: {
              ...normalized.workspace.timeline,
              precomputed_capability_growth:
                normalized.workspace.timeline.precomputed_capability_growth ??
                seedWorkspace.timeline.precomputed_capability_growth,
            },
          };
          setWorkspace(merged);
        }
      } catch (cause) {
        if (cancelled) return;
        const requestId = extractRequestId(cause);
        const message = cause instanceof Error ? cause.message : "Failed to load resume workspace";
        logWarn("resume.workspace_db_failed", "DB fetch failed — seed data active", {
          env_id: envId,
          business_id: businessId,
          request_id: requestId,
          error_message: message,
        });
        // Keep seed workspace — never blank
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }

    void loadWorkspace();
    return () => { cancelled = true; };
  }, [businessId, contextError, contextLoading, envId, refreshKey, validEnvId]);

  return (
    <div className="relative">
      {hydrating ? (
        <div className="absolute right-4 top-0 z-10 rounded-full bg-bm-surface/60 px-3 py-1 text-[10px] text-bm-muted backdrop-blur-sm">
          Hydrating live data…
        </div>
      ) : null}
      <ResumeWorkspace envId={envId} businessId={businessId} workspace={workspace} />
    </div>
  );
}

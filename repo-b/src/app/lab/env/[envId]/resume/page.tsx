"use client";

import { useEffect, useState } from "react";
import { getResumeWorkspace, type ResumeWorkspacePayload } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import ResumeWorkspace from "@/components/resume/ResumeWorkspace";

export default function ResumeOsPage() {
  const { envId, businessId } = useDomainEnv();
  const [workspace, setWorkspace] = useState<ResumeWorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await getResumeWorkspace(envId, businessId || undefined);
        setWorkspace(payload);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load resume workspace");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [envId, businessId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-bm-muted">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
          </span>
          Initializing interactive resume workspace...
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-300">{error ?? "Resume workspace unavailable."}</p>
      </div>
    );
  }

  return <ResumeWorkspace envId={envId} businessId={businessId} workspace={workspace} />;
}

"use client";

import { useEffect, useState } from "react";
import {
  listResumeProjects,
  listResumeSystemComponents,
  listResumeDeployments,
  getResumeSystemStats,
  type ResumeProject,
  type ResumeSystemComponent,
  type ResumeDeployment,
  type ResumeSystemStats,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";
import { PerspectiveProvider } from "@/components/resume/PerspectiveContext";
import SystemHero from "@/components/resume/SystemHero";
import SystemArchitectureMap from "@/components/resume/SystemArchitectureMap";
import DeploymentCards from "@/components/resume/DeploymentCards";
import ProjectShowcase from "@/components/resume/ProjectShowcase";
import SystemChat from "@/components/resume/SystemChat";

export default function ResumeOsPage() {
  const { envId, businessId } = useDomainEnv();
  const [projects, setProjects] = useState<ResumeProject[]>([]);
  const [components, setComponents] = useState<ResumeSystemComponent[]>([]);
  const [deployments, setDeployments] = useState<ResumeDeployment[]>([]);
  const [stats, setStats] = useState<ResumeSystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/resume`,
      surface: "resume",
      active_module: "resume",
    });
    return () => resetAssistantPageContext();
  }, [envId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const bid = businessId || undefined;
        const [p, sc, d, s] = await Promise.all([
          listResumeProjects(envId, bid),
          listResumeSystemComponents(envId, bid),
          listResumeDeployments(envId, bid),
          getResumeSystemStats(envId, bid),
        ]);
        setProjects(p);
        setComponents(sc);
        setDeployments(d);
        setStats(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load system data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [envId, businessId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
          </span>
          <span className="text-sm text-bm-muted2">Initializing system...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <PerspectiveProvider>
      <div className="space-y-6">
        <SystemHero stats={stats} />
        {components.length > 0 && <SystemArchitectureMap components={components} />}
        {deployments.length > 0 && <DeploymentCards deployments={deployments} />}
        {projects.length > 0 && <ProjectShowcase projects={projects} />}
        <SystemChat envId={envId} businessId={businessId} />
      </div>
    </PerspectiveProvider>
  );
}

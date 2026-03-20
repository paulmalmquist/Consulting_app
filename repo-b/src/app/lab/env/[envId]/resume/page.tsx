"use client";

import { useEffect, useState } from "react";
import {
  listResumeRoles,
  listResumeProjects,
  getResumeCareerSummary,
  getResumeSkillMatrix,
  ResumeRole,
  ResumeProject,
  ResumeCareerSummary,
  ResumeSkillMatrix,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";
import ResumeKpiStrip from "@/components/resume/ResumeKpiStrip";
import CareerTimeline from "@/components/resume/CareerTimeline";
import SkillsRadar from "@/components/resume/SkillsRadar";
import ExperienceBreakdown from "@/components/resume/ExperienceBreakdown";
import ProjectShowcase from "@/components/resume/ProjectShowcase";
import ResumeStarterPrompts from "@/components/resume/ResumeStarterPrompts";

export default function ResumeDashboardPage() {
  const { envId, businessId } = useDomainEnv();
  const [roles, setRoles] = useState<ResumeRole[]>([]);
  const [projects, setProjects] = useState<ResumeProject[]>([]);
  const [summary, setSummary] = useState<ResumeCareerSummary | null>(null);
  const [matrix, setMatrix] = useState<ResumeSkillMatrix[]>([]);
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
        const [r, p, s, m] = await Promise.all([
          listResumeRoles(envId, bid),
          listResumeProjects(envId, bid),
          getResumeCareerSummary(envId, bid),
          getResumeSkillMatrix(envId, bid),
        ]);
        setRoles(r);
        setProjects(p);
        setSummary(s);
        setMatrix(m);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load resume data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [envId, businessId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-bm-muted2">Loading resume data...</div>
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
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-2xl font-bold">Paul Malmquist</h1>
        <p className="text-sm text-bm-muted2">
          {summary?.current_title} &middot; {summary?.current_company} &middot; {summary?.location}
        </p>
      </div>

      {/* KPI Strip */}
      {summary && <ResumeKpiStrip summary={summary} />}

      {/* Career Timeline — full width hero */}
      {roles.length > 0 && <CareerTimeline roles={roles} />}

      {/* Skills Radar + Experience Breakdown — side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {matrix.length > 0 && <SkillsRadar matrix={matrix} />}
        {roles.length > 0 && <ExperienceBreakdown roles={roles} />}
      </div>

      {/* Projects */}
      {projects.length > 0 && <ProjectShowcase projects={projects} />}

      {/* Starter Prompts */}
      <ResumeStarterPrompts onSelect={() => {}} />
    </div>
  );
}

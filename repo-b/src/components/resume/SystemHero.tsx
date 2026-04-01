"use client";

import { useEffect, useRef } from "react";
import type { ResumeSystemStats } from "@/lib/bos-api";
import PerspectiveToggle from "./PerspectiveToggle";
import { usePerspective } from "./PerspectiveContext";

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const duration = 800;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = `${Math.round(value * eased)}${suffix}`;
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, suffix]);

  return <span ref={ref}>0{suffix}</span>;
}

const PERSPECTIVE_KPIS = {
  executive: [
    { key: "properties_managed" as const, label: "Properties Managed", suffix: "+" },
    { key: "hours_saved_monthly" as const, label: "Hours Saved / Month", suffix: "+" },
    { key: "performance_gain_pct" as const, label: "Performance Gain", suffix: "x" },
    { key: "mcp_tools" as const, label: "AI Tools Deployed", suffix: "" },
  ],
  engineer: [
    { key: "mcp_tools" as const, label: "MCP Tools", suffix: "" },
    { key: "pipelines_built" as const, label: "Pipelines Deployed", suffix: "" },
    { key: "properties_managed" as const, label: "Properties Integrated", suffix: "+" },
    { key: "performance_gain_pct" as const, label: "Perf Improvement", suffix: "x" },
  ],
  investor: [
    { key: "properties_managed" as const, label: "Properties Under Management", suffix: "+" },
    { key: "hours_saved_monthly" as const, label: "Monthly Hours Recaptured", suffix: "+" },
    { key: "performance_gain_pct" as const, label: "Execution Speed Gain", suffix: "x" },
    { key: "active_systems" as const, label: "Active Systems", suffix: "" },
  ],
};

export default function SystemHero({ stats }: { stats: ResumeSystemStats | null }) {
  const { perspective } = usePerspective();
  const kpis = PERSPECTIVE_KPIS[perspective];

  return (
    <div className="relative overflow-hidden rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 md:rounded-2xl md:p-6">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.05),transparent_50%)]" />

      <div className="relative">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 md:gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">PAUL MALMQUIST</h1>
            <p className="mt-0.5 text-xs tracking-wide text-bm-muted2 md:mt-1 md:text-sm">
              AI Data Platform Architect — Investment Systems
            </p>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3">
            <PerspectiveToggle />
            <a
              href="https://calendly.com/paulmalmquist/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-xs font-medium text-bm-accent transition-colors hover:bg-bm-accent/20 md:inline-flex"
            >
              Schedule a Call
            </a>
            <a
              href="mailto:paul@novendor.ai"
              className="hidden rounded-lg border border-bm-border/50 bg-white/5 px-3 py-1.5 text-xs font-medium text-bm-muted transition-colors hover:bg-white/10 hover:text-bm-text md:inline-flex"
            >
              Get in Touch
            </a>
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 md:gap-2 md:px-3 md:py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="hidden text-xs font-medium text-emerald-400 md:inline">SYSTEM ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Mobile CTA row */}
        <div className="mt-2.5 flex gap-2 md:hidden">
          <a
            href="https://calendly.com/paulmalmquist/30min"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-center text-xs font-medium text-bm-accent"
          >
            Schedule a Call
          </a>
          <a
            href="mailto:paul@novendor.ai"
            className="flex-1 rounded-lg border border-bm-border/50 bg-white/5 px-3 py-1.5 text-center text-xs font-medium text-bm-muted"
          >
            Get in Touch
          </a>
        </div>

        {/* KPI tiles */}
        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-2 md:mt-6 md:gap-3 sm:grid-cols-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.key}
                className="flex min-h-[52px] flex-col justify-center rounded-xl border border-bm-border/50 bg-bm-surface/30 px-3 py-2 md:px-4 md:py-3"
              >
                <p className="text-[10px] uppercase tracking-[0.08em] text-bm-muted2 md:tracking-[0.12em]">
                  {kpi.label}
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums md:mt-1 md:text-2xl">
                  <AnimatedNumber
                    value={stats[kpi.key] as number}
                    suffix={kpi.suffix}
                  />
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import RichardResumeChat from "./RichardResumeChat";
import { richardOperatorProfile } from "@/data/visualResumeRichardSeed";

const layerColors: Record<string, string> = {
  "Credit Risk Strategy": "#bf4d36",
  "Underwriting Systems": "#4b87a1",
  "Portfolio Analytics": "#b68a3a",
  "Data / BI Infrastructure": "#5d7387",
};

export default function RichardPage() {
  const [selectedSystemId, setSelectedSystemId] = useState(richardOperatorProfile.systems[0]?.id ?? null);
  const selectedSystem = useMemo(
    () => richardOperatorProfile.systems.find((system) => system.id === selectedSystemId) ?? richardOperatorProfile.systems[0],
    [selectedSystemId],
  );
  const primaryOutcomes = richardOperatorProfile.heroMetrics.map((metric) => `${metric.value} ${metric.label.toLowerCase()}`);
  const groupedSystems = useMemo(() => groupSystems(richardOperatorProfile.systems), []);
  const impactSummary = useMemo(() => buildImpactSummary(selectedSystem), [selectedSystem]);

  return (
    <div
      className="resume-os relative overflow-hidden px-4 pb-24 pt-8 md:px-8 md:pt-10 lg:px-12"
      style={
        {
          "--ros-accent-warm": "#a83d29",
          "--ros-accent-cool": "#2f6f85",
          "--ros-accent-gold": "#9d7a31",
          "--ros-border": "rgba(132, 102, 46, 0.28)",
          "--ros-border-light": "rgba(61, 106, 126, 0.18)",
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[4%] top-0 h-[360px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(47,111,133,0.16) 0%, transparent 68%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[8%] top-[14%] h-[420px] w-[540px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(168,61,41,0.10) 0%, transparent 72%)" }}
      />

      <div className="relative z-10 mx-auto max-w-[104rem] space-y-10 md:space-y-14">
        <header className="space-y-5 border-b pb-8 md:space-y-7 md:pb-10" style={{ borderColor: "var(--ros-border)" }}>
          <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.24em]" style={{ borderColor: "var(--ros-border-light)", color: "var(--ros-text-dim)" }}>
            Operator Profile
          </div>

          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {richardOperatorProfile.heroMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[1.45rem] border p-4 shadow-[0_18px_48px_-30px_rgba(10,8,6,0.55)] xl:p-5"
                style={{ borderColor: "var(--ros-border-light)", background: "var(--ros-card-bg)" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                  {metric.label}
                </p>
                <p className="mt-2 text-[clamp(2rem,5vw,3.3rem)] leading-none" style={{ color: "var(--ros-text-bright)" }}>
                  {metric.value}
                </p>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                  {metric.proof}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-12 xl:items-end">
            <div className="space-y-3 xl:col-span-8 2xl:col-span-7">
              <h1
                className="resume-editorial text-[clamp(3rem,8vw,6.5rem)] uppercase leading-[0.98]"
                style={{ color: "var(--ros-text-bright)", letterSpacing: "0.08em", fontWeight: 500 }}
              >
                {richardOperatorProfile.name}
              </h1>
              <p className="text-[clamp(14px,1.8vw,21px)] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--ros-accent-cool)" }}>
                {richardOperatorProfile.title}
              </p>
              <p className="max-w-4xl text-[15px] leading-7 md:text-[17px]" style={{ color: "var(--ros-text-muted)" }}>
                {richardOperatorProfile.subtext}
              </p>
              <p className="max-w-4xl text-[15px] leading-7 md:text-[17px]" style={{ color: "var(--ros-text)" }}>
                {richardOperatorProfile.thesis}
              </p>
            </div>

            <aside
              className="rounded-[1.55rem] border p-5 xl:col-span-4 2xl:col-span-5"
              style={{ borderColor: "var(--ros-border-light)", background: "linear-gradient(180deg, rgba(47,111,133,0.08), rgba(255,255,255,0.02))" }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                Operating Mandate
              </p>
              <p className="mt-3 text-sm leading-7 md:text-[15px]" style={{ color: "var(--ros-text)" }}>
                Control the lending decision layer, instrument the downstream portfolio consequences, and push growth only where the risk-adjusted return stays defensible.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                {primaryOutcomes.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em]"
                    style={{ borderColor: "var(--ros-border-light)", background: "var(--ros-pill-bg)", color: "var(--ros-text)" }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </header>

        <section className="space-y-6 pb-6 md:space-y-7 md:pb-10">
          <div className="grid gap-3 xl:grid-cols-12 xl:items-end">
            <div className="xl:col-span-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
                Systems First
              </p>
              <h2 className="resume-editorial text-[2rem] md:text-[2.6rem]" style={{ color: "var(--ros-text-bright)" }}>
                What He Built
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 xl:col-span-7 xl:justify-self-end xl:text-right" style={{ color: "var(--ros-text-muted)" }}>
              Every card below answers the same two questions: what did Richard build, and what improved because it ran.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-12 xl:items-start">
            <div className="space-y-6 xl:col-span-5 xl:self-start">
              {groupedSystems.map((group) => (
                <div key={group.id} className="space-y-3.5">
                  <div className="flex items-center justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--ros-border-light)" }}>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
                        {group.label}
                      </p>
                      <p className="mt-1 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                        {group.description}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                      {group.systems.length} systems
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {group.systems.map((system, index) => {
                      const isActive = system.id === selectedSystem.id;
                      const sizeClassName = isActive
                        ? "min-h-[16rem] xl:min-h-[18rem]"
                        : index === 0
                          ? "min-h-[12rem]"
                          : index === group.systems.length - 1
                            ? "min-h-[9.5rem]"
                            : "min-h-[10.75rem]";

                      return (
                        <button
                          key={system.id}
                          type="button"
                          onClick={() => setSelectedSystemId(system.id)}
                          className={`text-left transition-all ${sizeClassName}`}
                          style={{
                            background: isActive ? "rgba(47,111,133,0.08)" : "transparent",
                          }}
                        >
                          <div
                            className="h-full rounded-[1.4rem] px-0 py-1"
                            style={{
                              borderLeft: isActive ? "2px solid var(--ros-accent-cool)" : "2px solid transparent",
                            }}
                          >
                            <div className="flex h-full flex-col justify-between gap-3 rounded-r-[1.35rem] pl-4 pr-2 xl:pl-5">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                                    {system.company} · {system.period}
                                  </p>
                                  <h3 className={`mt-1 leading-tight ${isActive ? "text-[1.7rem] xl:text-[1.95rem]" : "text-[1.2rem] xl:text-[1.4rem]"}`} style={{ color: "var(--ros-text-bright)" }}>
                                    {system.name}
                                  </h3>
                                </div>
                                <span className="rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em]" style={{ borderColor: "var(--ros-border-light)", color: "var(--ros-text-dim)" }}>
                                  {isActive ? "Primary System" : "Execution Layer"}
                                </span>
                              </div>

                              <p className="max-w-xl text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                                {system.strapline}
                              </p>

                              <div className="flex flex-wrap gap-2">
                                {system.outcomes.slice(0, isActive ? system.outcomes.length : 2).map((outcome) => (
                                  <span
                                    key={outcome}
                                    className="rounded-full border px-3 py-1 text-[11px]"
                                    style={{ borderColor: "var(--ros-border-light)", background: "var(--ros-pill-bg)", color: "var(--ros-text)" }}
                                  >
                                    {outcome}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="xl:col-span-7 xl:min-h-[48rem]"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))" }}
            >
              <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))]">
                <div className="border-b px-5 py-5 md:px-6 xl:px-7 xl:py-6" style={{ borderColor: "var(--ros-border-light)" }}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
                        Selected System
                      </p>
                      <h3 className="mt-2 max-w-4xl text-[2.1rem] leading-tight md:text-[2.65rem]" style={{ color: "var(--ros-text-bright)" }}>
                        {selectedSystem.name}
                      </h3>
                      <p className="mt-2 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                        {selectedSystem.company} · {selectedSystem.period}
                      </p>
                    </div>
                    <div className="max-w-sm xl:text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                        Operating Context
                      </p>
                      <p className="mt-2 text-sm leading-6" style={{ color: "var(--ros-text)" }}>
                        {selectedSystem.strapline}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 px-5 py-5 md:px-6 xl:px-7 xl:py-7">
                  <div className="grid gap-6 xl:grid-cols-3 xl:gap-8">
                    <WorkspaceBlock title="Inputs" items={selectedSystem.inputs} />
                    <WorkspaceBlock title="Logic" items={selectedSystem.logic} accent />
                    <WorkspaceBlock title="Outputs" items={selectedSystem.outputs} />
                  </div>
                  <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--ros-border-light)" }}>
                    <WorkspaceBlock title="What Improved" items={selectedSystem.outcomes} columns={2} />
                  </div>
                </div>

                <div className="mt-auto border-t px-5 py-5 md:px-6 xl:px-7 xl:py-6" style={{ borderColor: "var(--ros-border-light)", background: "linear-gradient(90deg, rgba(47,111,133,0.08), rgba(168,61,41,0.04))" }}>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_0.9fr] xl:items-end">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
                        Impact Summary
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        {impactSummary.metrics.map((metric) => (
                          <div key={metric.value} className="space-y-1">
                            <p className="text-[clamp(1.7rem,3vw,2.5rem)] leading-none" style={{ color: "var(--ros-text-bright)" }}>
                              {metric.value}
                            </p>
                            <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                              {metric.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="max-w-md text-sm leading-7 xl:justify-self-end xl:text-right" style={{ color: "var(--ros-text)" }}>
                      {impactSummary.summary}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 pt-8 xl:grid-cols-[minmax(0,1.15fr)_0.85fr] xl:pt-14">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
                Supporting Timeline
              </p>
              <h2 className="resume-editorial text-[2rem] md:text-[2.5rem]" style={{ color: "var(--ros-text-bright)" }}>
                How the Operator Was Built
              </h2>
            </div>

            <div className="space-y-4">
              {richardOperatorProfile.timeline.map((role) => (
                <div
                  key={role.id}
                  className="rounded-[1.4rem] border p-4 md:p-5"
                  style={{ borderColor: "var(--ros-border-light)", background: "var(--ros-card-bg)" }}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                        {role.company}
                      </p>
                      <h3 className="text-[1.25rem] leading-tight md:text-[1.45rem]" style={{ color: "var(--ros-text-bright)" }}>
                        {role.title}
                      </h3>
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--ros-text-dim)" }}>
                      {role.period}
                    </p>
                  </div>

                  <p className="mt-3 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                    {role.summary}
                  </p>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--ros-text)" }}>
                    {role.inflection}
                  </p>

                  <div className="mt-4 grid gap-3">
                    {role.layers.map((layer) => (
                      <div key={layer.label} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--ros-text-dim)" }}>
                          <span>{layer.label}</span>
                          <span>{layer.value}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${layer.value}%`, background: layerColors[layer.label] ?? "var(--ros-accent-cool)" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
                Capability Map
              </p>
              <h2 className="resume-editorial text-[2rem] md:text-[2.5rem]" style={{ color: "var(--ros-text-bright)" }}>
                Only Capabilities Tied To Systems
              </h2>
            </div>

            <div className="space-y-4">
              {richardOperatorProfile.capabilityClusters.map((cluster) => (
                <div
                  key={cluster.name}
                  className="rounded-[1.4rem] border p-4 md:p-5"
                  style={{ borderColor: "var(--ros-border-light)", background: "var(--ros-card-bg)" }}
                >
                  <h3 className="text-[1.1rem] uppercase tracking-[0.12em]" style={{ color: "var(--ros-text-bright)" }}>
                    {cluster.name}
                  </h3>
                  <div className="mt-4 grid gap-3">
                    {cluster.nodes.map((node) => {
                      const active = node.systemIds.includes(selectedSystem.id);
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setSelectedSystemId(node.systemIds[0])}
                          className="rounded-[1rem] border p-3 text-left transition-all"
                          style={{
                            borderColor: active ? "var(--ros-accent-cool)" : "var(--ros-border-light)",
                            background: active ? "rgba(47,111,133,0.08)" : "transparent",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--ros-text)" }}>
                              {node.label}
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--ros-text-dim)" }}>
                              {node.systemIds.length} system{node.systemIds.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                            {node.outcome}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
          <div className="rounded-[1.5rem] border p-5 md:p-6" style={{ borderColor: "var(--ros-border-light)", background: "var(--ros-card-bg)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
              Simulated Live Activity
            </p>
            <h2 className="mt-2 resume-editorial text-[2rem]" style={{ color: "var(--ros-text-bright)" }}>
              Current Operating Rhythm
            </h2>
            <div className="mt-5 space-y-3">
              {richardOperatorProfile.activityFeed.map((item) => (
                <div key={`${item.timestamp}-${item.title}`} className="rounded-[1rem] border p-4" style={{ borderColor: "var(--ros-border-light)" }}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--ros-text)" }}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                        {item.detail}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--ros-accent-cool)" }}>
                        {item.status}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--ros-text-dim)" }}>
                        {item.timestamp}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border p-5 md:p-6" style={{ borderColor: "var(--ros-border-light)", background: "var(--ros-card-bg)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--ros-text-dim)" }}>
              Why He&apos;s Dangerous
            </p>
            <h2 className="mt-2 resume-editorial text-[2rem]" style={{ color: "var(--ros-text-bright)" }}>
              Risk Control That Improves Returns
            </h2>
            <div className="mt-5 space-y-4 text-sm leading-7" style={{ color: "var(--ros-text-muted)" }}>
              <p>
                Richard is not being positioned here as a generic credit-risk manager. He is an operator who translates policy, analytics, scorecards, and reporting into lending systems that run.
              </p>
              <p>
                The proof is operational: larger automation envelopes, lower expected losses, better credit quality, faster decision cycles, and clearer control over portfolio performance.
              </p>
              <p style={{ color: "var(--ros-text)" }}>
                That is the through-line across this page: he controls decisioning, monitors the consequences, and improves the return profile without losing underwriting discipline.
              </p>
            </div>

            <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--ros-border-light)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
                Contact
              </p>
              <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
                <div>{richardOperatorProfile.contact.email}</div>
                <div>{richardOperatorProfile.contact.phone}</div>
                <div>{richardOperatorProfile.contact.location}</div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t pt-8 text-center" style={{ borderColor: "var(--ros-border)" }}>
          <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--ros-text-dim)" }}>
            Richard de Oliveira · Credit Risk + Analytics Platform Operator
          </p>
        </footer>
      </div>

      <RichardResumeChat />
    </div>
  );
}

function WorkspaceBlock({
  title,
  items,
  accent = false,
  columns = 1,
}: {
  title: string;
  items: string[];
  accent?: boolean;
  columns?: 1 | 2;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: accent ? "var(--ros-accent-cool)" : "var(--ros-text-dim)" }}>
        {title}
      </p>
      <ul className={`mt-3 grid gap-2.5 ${columns === 2 ? "xl:grid-cols-2" : ""}`}>
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6" style={{ color: "var(--ros-text-muted)" }}>
            <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent ? "var(--ros-accent-cool)" : "var(--ros-accent-gold)" }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupSystems(systems: typeof richardOperatorProfile.systems) {
  return [
    {
      id: "southeast-toyota",
      label: "Southeast Toyota Finance",
      description: "Primary production systems where Richard controlled origination scale, policy movement, and portfolio consequences.",
      systems: systems.filter((system) => system.company === "Southeast Toyota Finance"),
    },
    {
      id: "wells-fargo",
      label: "Wells Fargo Foundation",
      description: "Operational underwriting infrastructure that turned credit judgment into deployable decision logic.",
      systems: systems.filter((system) => system.company === "Wells Fargo Consumer Lending"),
    },
    {
      id: "experian",
      label: "Experian Advisory / Scale",
      description: "Cross-lender monitoring, pricing, and deployment systems used to improve growth and loss performance at scale.",
      systems: systems.filter((system) => system.company === "Experian / Client Advisory"),
    },
  ].filter((group) => group.systems.length > 0);
}

function buildImpactSummary(system: (typeof richardOperatorProfile.systems)[number]) {
  const metrics = system.outcomes.slice(0, 3).map((outcome) => {
    const [value, ...rest] = outcome.split(" ");
    return {
      value,
      label: rest.join(" "),
    };
  });

  return {
    metrics,
    summary: system.strapline.endsWith(".") ? system.strapline : `${system.strapline}.`,
  };
}

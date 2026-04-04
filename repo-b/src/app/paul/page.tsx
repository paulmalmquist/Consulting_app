"use client";

import { TimelineEngine } from "@/components/resume/timeline";
import SkillsCapabilityMap from "@/components/resume/SkillsCapabilityMap";
import SystemsBuiltSection from "@/components/resume/SystemsBuiltSection";
import ResumeModuleBoundary from "@/components/resume/ResumeModuleBoundary";

const HERO_METRICS = [
  { label: "Years Experience", value: "11+" },
  { label: "Assets Automated", value: "500+" },
  { label: "Hrs/Mo Saved", value: "160+" },
  { label: "Faster Reporting", value: "50%" },
  { label: "AUM Governed", value: "$4B+" },
];

export default function PaulPage() {
  return (
    <div className="resume-os relative overflow-hidden px-4 pt-6 md:px-8 md:pt-10 lg:px-12">
      {/* Atmospheric glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[5%] top-0 h-[360px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(200,74,42,0.09) 0%, transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[10%] top-[20%] h-[480px] w-[560px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(10,7,4,0.5) 0%, transparent 70%)" }}
      />
      {/* Grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      <div className="relative z-10 space-y-8 pb-20 md:space-y-12">

        {/* HERO */}
        <header className="text-center">
          <h1
            className="resume-editorial text-[clamp(3rem,8vw,6rem)] uppercase leading-[1.05]"
            style={{
              color: "var(--ros-text-bright)",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textShadow: "0 0 50px rgba(200,100,40,0.18)",
            }}
          >
            Paul Malmquist
          </h1>
          <p
            className="resume-label mt-3 text-[clamp(12px,1.8vw,18px)] tracking-[0.2em]"
            style={{ color: "var(--ros-text-muted)" }}
          >
            AI Data Platform Architect
            <span className="mx-2 hidden sm:inline" style={{ color: "var(--ros-text-dim)" }}>—</span>
            <br className="sm:hidden" />
            <span style={{ color: "var(--ros-accent-gold)" }}>Investment Systems</span>
          </p>
          <p
            className="mx-auto mt-3 max-w-xl text-[12px] leading-relaxed tracking-[0.08em] md:text-[14px]"
            style={{ color: "var(--ros-text-muted)" }}
          >
            Built governed data + AI systems powering investment decisions across $4B+ AUM
          </p>
        </header>

        {/* TIMELINE — stacked capability chart */}
        <ResumeModuleBoundary
          boundaryId="paul-timeline"
          eyebrow="Timeline"
          title="Timeline temporarily unavailable"
          message="The career arc could not render."
          resetKey="paul-timeline-v1"
        >
          <TimelineEngine />
        </ResumeModuleBoundary>

        {/* KPI STRIP */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 border-y py-5 text-center sm:gap-x-10 md:gap-x-14"
          style={{ borderColor: "var(--ros-border)" }}
        >
          {HERO_METRICS.map((m, i) => (
            <div key={m.label}>
              {i > 0 && (
                <span
                  className="mr-6 hidden select-none sm:mr-10 sm:inline md:mr-14"
                  style={{ color: "var(--ros-text-dim)" }}
                >
                  |
                </span>
              )}
              <span
                className="resume-editorial text-[clamp(2rem,4vw,3.2rem)] leading-none"
                style={{ color: "var(--ros-text)" }}
              >
                {m.value}
              </span>
              <span
                className="resume-label ml-2 text-[10px] tracking-[0.28em]"
                style={{ color: "var(--ros-text-dim)" }}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>

        {/* SKILLS */}
        <SkillsCapabilityMap />

        {/* SYSTEMS IN PRODUCTION */}
        <SystemsBuiltSection />

        {/* CONTACT / CTA */}
        <footer className="border-t pt-8 pb-4 text-center" style={{ borderColor: "var(--ros-border)" }}>
          <p
            className="resume-label text-[10px] tracking-[0.3em]"
            style={{ color: "var(--ros-text-dim)" }}
          >
            Currently at{" "}
            <span style={{ color: "var(--ros-accent-warm)" }}>JLL</span>
            {" "}·{" "}
            <span style={{ color: "var(--ros-text)" }}>Director, AI Data Platform & Analytics</span>
          </p>
          <p
            className="mt-3 text-[11px] leading-relaxed"
            style={{ color: "var(--ros-text-dim)" }}
          >
            <a
              href="mailto:paul.malmquist@jll.com"
              className="transition-colors hover:underline"
              style={{ color: "var(--ros-accent-gold)" }}
            >
              paul.malmquist@jll.com
            </a>
          </p>
        </footer>

      </div>
    </div>
  );
}

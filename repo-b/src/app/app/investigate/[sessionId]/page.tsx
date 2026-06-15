"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";

import { useEnv } from "@/components/EnvProvider";
import {
  useSessionStream, pauseSession, resumeSession, forkSession,
  type LiveSection, type SectionClaim,
} from "@/lib/investigation/sessionStream";
import { SteeringChatRail } from "@/components/investigation/SteeringChatRail";

// Investigation Workspace (plan PR 7 + steering rail PR 8). Full-bleed standalone.
// Renders ONLY events the backend streams; missing sections show their null_reason.
// No fabricated content. The steering rail directs FUTURE sections only.

const STATUS_TONE: Record<string, string> = {
  idle: "148,163,184", streaming: "92,213,204", paused: "209,161,91",
  completed: "107,174,127", error: "212,122,114",
};

export default function InvestigatePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { selectedEnv, environments, loading } = useEnv();
  const env = selectedEnv?.env_id ?? environments[0]?.env_id ?? null;
  const biz = selectedEnv?.business_id ?? environments[0]?.business_id ?? undefined;

  const stream = useSessionStream(env, sessionId, biz ?? undefined);
  const tone = STATUS_TONE[stream.status] ?? STATUS_TONE.idle;
  const [showSql, setShowSql] = useState(false);

  const progress = useMemo(() => {
    const planned = stream.planSections.length || stream.sections.length;
    const done = stream.sections.filter((s) => s.status !== "running").length;
    return { planned, done };
  }, [stream.planSections, stream.sections]);

  if (!loading && !env) {
    return (
      <Shell>
        <div className="rounded-md border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-white/70">
          No environment selected. Open a workspace first, then launch an investigation.
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/app" className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 hover:text-white/70">
            ← Back
          </Link>
          <h1 className="mt-1 text-[clamp(1.4rem,2.6vw,2rem)] font-semibold tracking-tight text-white">
            {stream.title}
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            session {sessionId.slice(0, 8)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: `rgba(${tone},0.95)`, background: `rgba(${tone},0.10)`, border: `1px solid rgba(${tone},0.3)` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgba(${tone},0.95)` }} />
            {stream.status}
          </span>
          {stream.status === "streaming" && env && (
            <ControlButton label="Pause" onClick={() => void pauseSession(env, sessionId, biz ?? undefined)} />
          )}
          {stream.status === "paused" && env && (
            <ControlButton label="Resume" onClick={() => { void resumeSession(env, sessionId, biz ?? undefined).then(() => stream.start()); }} />
          )}
          {env && (
            <ControlButton
              label="Fork"
              onClick={() => void forkSession(env, sessionId, `Fork of ${stream.title}`, biz ?? undefined)
                .then((r) => { if (r?.child_session_id) window.location.href = `/app/investigate/${r.child_session_id}`; })}
            />
          )}
        </div>
      </header>

      {stream.error ? (
        <div className="mb-5 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-100">
          {stream.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_minmax(0,1fr)_320px]">
        {/* Progress tracker */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            Progress {progress.done}/{progress.planned || "—"}
          </p>
          <ol className="mt-3 space-y-1.5">
            {(stream.planSections.length ? stream.planSections : stream.sections).map((p) => {
              const sec = stream.sections.find((s) => s.key === p.key);
              const state = !sec ? "pending" : sec.status === "running" ? "running" : "done";
              return (
                <li key={p.key} className="flex items-center gap-2 text-[13px]">
                  <StepDot state={state} />
                  <span className={state === "pending" ? "text-white/40" : "text-white/80"}>
                    {("title" in p && p.title) || p.key}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Streamed sections */}
        <main className="min-w-0 space-y-4">
          {stream.sections.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-white/55">
              {stream.status === "streaming" ? "Investigating…" : "No sections yet."}
            </div>
          ) : (
            stream.sections.map((s) => <SectionCard key={s.key} section={s} showSql={showSql} />)
          )}

          {stream.status === "completed" && stream.deliverableCardId ? (
            <div className="rounded-md border px-4 py-3 text-[13px]"
              style={{ borderColor: "rgba(107,174,127,0.3)", background: "rgba(107,174,127,0.08)", color: "rgba(140,200,158,0.95)" }}>
              Investigation complete. A card was added to your intelligence feed.
            </div>
          ) : null}
        </main>

        {/* Steering rail (PR 8) */}
        <SteeringChatRail
          env={env}
          sessionId={sessionId}
          businessId={biz ?? undefined}
          title={stream.title}
          steers={stream.steers}
          onShowSql={() => setShowSql((v) => !v)}
        />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#03070e] text-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
    </div>
  );
}

function ControlButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80 transition-colors hover:border-white/30 hover:text-white"
    >
      {label}
    </button>
  );
}

function StepDot({ state }: { state: "pending" | "running" | "done" }) {
  if (state === "done") return <span className="text-[12px] text-[rgba(107,174,127,0.95)]">✓</span>;
  if (state === "running") return <span className="text-[12px] text-[rgba(92,213,204,0.95)]">→</span>;
  return <span className="text-[12px] text-white/30">○</span>;
}

function SectionCard({ section, showSql }: { section: LiveSection; showSql: boolean }) {
  const unavailable = section.status === "not_available";
  return (
    <section
      className="rounded-md border bg-[rgba(8,11,18,0.6)] p-5"
      style={{ borderColor: unavailable ? "rgba(209,161,91,0.28)" : "rgba(232,236,242,0.10)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-white">{section.title}</h2>
        <div className="flex items-center gap-2">
          {section.steeredByVersion ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[rgba(167,139,250,0.9)]"
              title="This section was produced after a steering instruction">
              steered v{section.steeredByVersion}
            </span>
          ) : null}
          {section.status === "running" ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgba(92,213,204,0.9)]">running…</span>
          ) : null}
        </div>
      </div>

      {unavailable ? (
        <p className="mt-2 font-mono text-[12px] text-[rgba(209,161,91,0.95)]">
          Not available — {section.null_reason}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {section.claims
            .filter((c) => c.value !== null && c.value !== undefined)
            .map((c, i) => <ClaimRow key={i} claim={c} showSql={showSql} />)}
        </ul>
      )}
    </section>
  );
}

function ClaimRow({ claim, showSql }: { claim: SectionClaim; showSql: boolean }) {
  return (
    <li className="flex flex-col gap-1 text-[13px] text-white/80">
      <span className="flex items-start gap-2.5">
        <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full" style={{ background: "rgba(92,213,204,0.85)" }} />
        <span className="min-w-0">
          <span className="text-white">{String(claim.value)}</span>
          {claim.is_estimate ? <span className="ml-1 text-white/40">(est.)</span> : null}
          {claim.source_kind ? (
            <span className="ml-2 font-mono text-[10px] text-white/35" title={JSON.stringify(claim.source_ref ?? {})}>
              ◆ {claim.source_kind}
            </span>
          ) : null}
        </span>
      </span>
      {/* Show SQL reveals only the EXISTING provenance already attached — never generated SQL. */}
      {showSql && claim.source_ref ? (
        <pre className="ml-5 overflow-x-auto rounded border border-white/10 bg-[rgba(3,7,14,0.6)] px-2 py-1 font-mono text-[10px] text-white/50">
          {JSON.stringify(claim.source_ref, null, 2)}
        </pre>
      ) : null}
    </li>
  );
}

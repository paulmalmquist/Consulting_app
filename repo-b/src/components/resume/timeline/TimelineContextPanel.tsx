"use client";

import { useMemo } from "react";
import {
  COMPANY_COLORS,
  CAPABILITY_MAP,
  EVENT_MAP,
  SYSTEM_MAP,
  getSystemsForEvent,
  getSystemsForCapability,
  getEventForSystem,
  getEventsForCapability,
  type TimelineEvent,
  type System,
  type Capability,
  type CompanyId,
  type TimelineMetric,
} from "./timelineData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectionMode = "event" | "system" | "capability" | null;

interface TimelineContextPanelProps {
  selectedEventId: string | null;
  selectedSystemId: string | null;
  selectedCapabilityId: string | null;
  onSelectSystem: (systemId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onSelectCapability: (capabilityId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TimelineContextPanel({
  selectedEventId,
  selectedSystemId,
  selectedCapabilityId,
  onSelectSystem,
  onSelectEvent,
  onSelectCapability,
}: TimelineContextPanelProps) {
  const mode: SelectionMode = selectedSystemId
    ? "system"
    : selectedCapabilityId
      ? "capability"
      : selectedEventId
        ? "event"
        : null;

  if (!mode) {
    return <DefaultPanel onSelectEvent={onSelectEvent} />;
  }

  if (mode === "system") {
    return (
      <SystemPanel
        systemId={selectedSystemId!}
        onSelectEvent={onSelectEvent}
        onSelectCapability={onSelectCapability}
      />
    );
  }

  if (mode === "capability") {
    return (
      <CapabilityPanel
        capabilityId={selectedCapabilityId!}
        onSelectSystem={onSelectSystem}
        onSelectEvent={onSelectEvent}
      />
    );
  }

  return (
    <EventPanel
      eventId={selectedEventId!}
      onSelectSystem={onSelectSystem}
    />
  );
}

// ---------------------------------------------------------------------------
// Default state — shows current JLL phase
// ---------------------------------------------------------------------------

function DefaultPanel({ onSelectEvent }: { onSelectEvent: (id: string) => void }) {
  return (
    <div className="rounded-[20px] border border-bm-border/40 bg-bm-surface/30 p-4 md:rounded-[28px] md:p-6">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
        Interactive Timeline
      </p>
      <h3 className="mt-2 text-lg font-semibold text-white md:text-xl">
        Compounding Capability Over Time
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">
        Click a <strong className="text-white/80">company region</strong> to see what was built there.
        Click a <strong className="text-white/80">milestone dot</strong> on the curve to drill into a specific system.
        Click a <strong className="text-white/80">skill icon</strong> above to filter by capability.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectEvent("phase-jll-2025-present")}
          className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
        >
          Current: JLL Director Role
        </button>
        <button
          type="button"
          onClick={() => onSelectEvent("phase-kayne-2018-2025")}
          className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition hover:bg-blue-500/20"
        >
          Kayne Anderson (2018-2025)
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event panel — company/phase detail
// ---------------------------------------------------------------------------

function EventPanel({
  eventId,
  onSelectSystem,
}: {
  eventId: string;
  onSelectSystem: (id: string) => void;
}) {
  const event = EVENT_MAP.get(eventId);
  if (!event) return null;

  const systems = getSystemsForEvent(eventId);
  const company = COMPANY_COLORS[event.company];

  return (
    <div className="rounded-[20px] border border-bm-border/40 bg-bm-surface/30 p-4 md:rounded-[28px] md:p-6">
      {/* Header with company badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] uppercase tracking-[0.16em]"
            style={{ color: `${company.primary}99` }}
          >
            {event.company_label} — Phase {event.phase}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white md:text-xl">
            {event.title}
          </h3>
          <p className="mt-0.5 text-xs text-white/40">{event.role}</p>
        </div>
        <CompanyBadge company={event.company} />
      </div>

      {/* Problem → Outcome */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-rose-400/15 bg-rose-500/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-rose-300/70">Problem</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">{event.problem}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300/70">Outcome</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">{event.outcome}</p>
        </div>
      </div>

      {/* Metrics */}
      <MetricsRow metrics={event.metrics} accentColor={company.primary} />

      {/* Systems built */}
      {systems.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Systems Built</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {systems.map((system) => (
              <button
                key={system.id}
                type="button"
                onClick={() => onSelectSystem(system.id)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-white/20 hover:bg-white/8"
              >
                <span className="text-sm font-medium text-white">{system.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities used */}
      <CapabilityTags capabilityIds={event.capabilities_used} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// System panel — drill-through detail
// ---------------------------------------------------------------------------

function SystemPanel({
  systemId,
  onSelectEvent,
  onSelectCapability,
}: {
  systemId: string;
  onSelectEvent: (id: string) => void;
  onSelectCapability: (id: string | null) => void;
}) {
  const system = SYSTEM_MAP.get(systemId);
  if (!system) return null;

  const parentEvent = getEventForSystem(systemId);
  const company = COMPANY_COLORS[system.company];

  return (
    <div className="rounded-[20px] border border-bm-border/40 bg-bm-surface/30 p-4 md:rounded-[28px] md:p-6">
      {/* Header with company badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] uppercase tracking-[0.16em]"
            style={{ color: `${company.primary}99` }}
          >
            System
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white md:text-xl">
            {system.name}
          </h3>
          <p className="mt-0.5 text-xs text-white/40">
            {system.company_label} — {formatDate(system.date)}
          </p>
        </div>
        <CompanyBadge company={system.company} />
      </div>

      {/* Description */}
      <p className="mt-3 text-sm leading-relaxed text-white/70">
        {system.description}
      </p>

      {/* How it works / Why it matters */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-sky-400/15 bg-sky-500/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-sky-300/70">How It Works</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">{system.how_it_works}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/15 bg-amber-500/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-amber-300/70">Why It Matters</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">{system.why_it_matters}</p>
        </div>
      </div>

      {/* Metrics */}
      <MetricsRow metrics={system.metrics} accentColor={company.primary} />

      {/* Navigation */}
      <div className="mt-4 flex flex-wrap gap-2">
        {parentEvent && (
          <button
            type="button"
            onClick={() => onSelectEvent(parentEvent.id)}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            ← Back to {parentEvent.company_label} phase
          </button>
        )}
      </div>

      {/* Capabilities used */}
      <CapabilityTagsClickable
        capabilityIds={system.capabilities_used}
        onSelect={onSelectCapability}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capability panel — filter view
// ---------------------------------------------------------------------------

function CapabilityPanel({
  capabilityId,
  onSelectSystem,
  onSelectEvent,
}: {
  capabilityId: string;
  onSelectSystem: (id: string) => void;
  onSelectEvent: (id: string) => void;
}) {
  const capability = CAPABILITY_MAP.get(capabilityId);
  if (!capability) return null;

  const systems = getSystemsForCapability(capabilityId);
  const events = getEventsForCapability(capabilityId);

  return (
    <div className="rounded-[20px] border border-bm-border/40 bg-bm-surface/30 p-4 md:rounded-[28px] md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${capability.color}20`,
            border: `1px solid ${capability.color}40`,
          }}
        >
          <span className="text-sm font-bold" style={{ color: capability.color }}>
            {capability.name.slice(0, 2)}
          </span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{capability.name}</h3>
          <p className="text-xs text-white/40">
            Used across {events.length} phase{events.length !== 1 ? "s" : ""} —{" "}
            {systems.length} system{systems.length !== 1 ? "s" : ""} built
          </p>
        </div>
      </div>

      {/* Timeline of usage */}
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Active In</p>
        <div className="mt-2 space-y-2">
          {capability.active_ranges.map((range, i) => {
            const company = COMPANY_COLORS[range.company];
            const event = events.find((e) => e.company === range.company);
            return (
              <button
                key={i}
                type="button"
                onClick={() => event && onSelectEvent(event.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-left transition hover:border-white/15 hover:bg-white/6"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: company.primary }}
                />
                <span className="text-sm font-medium text-white/80">
                  {company.label}
                </span>
                <span className="ml-auto text-xs text-white/40">
                  {formatDate(range.start)} – {formatDate(range.end)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Systems using this capability */}
      {systems.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Systems Built With {capability.name}</p>
          <div className="mt-2 space-y-2">
            {systems.map((system) => {
              const company = COMPANY_COLORS[system.company];
              return (
                <button
                  key={system.id}
                  type="button"
                  onClick={() => onSelectSystem(system.id)}
                  className="flex w-full items-start gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-left transition hover:border-white/15 hover:bg-white/6"
                >
                  <div
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: company.primary }}
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-white/80">{system.name}</span>
                    {system.metrics.length > 0 && (
                      <p className="mt-0.5 text-xs text-white/40">
                        {system.metrics.map((m) => `${m.label}: ${m.value}`).join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function MetricsRow({
  metrics,
  accentColor,
}: {
  metrics: TimelineMetric[];
  accentColor: string;
}) {
  if (metrics.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {metrics.map((metric, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/8 bg-white/3 px-3 py-2"
        >
          <p className="text-[10px] uppercase tracking-wide text-white/40">
            {metric.label}
          </p>
          <p
            className="mt-0.5 text-sm font-semibold"
            style={{ color: accentColor }}
          >
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function CapabilityTags({ capabilityIds }: { capabilityIds: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Capabilities</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {capabilityIds.map((id) => {
          const cap = CAPABILITY_MAP.get(id);
          if (!cap) return null;
          return (
            <span
              key={id}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: `${cap.color}15`,
                color: `${cap.color}CC`,
                border: `1px solid ${cap.color}25`,
              }}
            >
              {cap.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CapabilityTagsClickable({
  capabilityIds,
  onSelect,
}: {
  capabilityIds: string[];
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Capabilities</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {capabilityIds.map((id) => {
          const cap = CAPABILITY_MAP.get(id);
          if (!cap) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:brightness-125"
              style={{
                backgroundColor: `${cap.color}15`,
                color: `${cap.color}CC`,
                border: `1px solid ${cap.color}25`,
              }}
            >
              {cap.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompanyBadge({ company }: { company: CompanyId }) {
  const c = COMPANY_COLORS[company];
  return (
    <span
      className="shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: `${c.primary}18`,
        color: `${c.primary}CC`,
        border: `1px solid ${c.primary}25`,
      }}
    >
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

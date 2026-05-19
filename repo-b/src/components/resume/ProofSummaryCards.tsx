"use client";

import { Capability, GapItem, ProofArtifact, STATUS_LABELS, ROLE_TARGET_LABELS, RoleTarget } from "./evidenceGraphData";

type SummaryCardProps = {
  eyebrow: string;
  title: string;
  count?: string;
  items: Array<{ id: string; label: string; status?: string }>;
  onItemClick?: (id: string) => void;
};

function SummaryCard({ eyebrow, title, count, items, onItemClick }: SummaryCardProps) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--ros-border)" }}
    >
      <p
        className="text-[10px] font-semibold tracking-[0.12em] uppercase"
        style={{ color: "var(--ros-text-dim)" }}
      >
        {eyebrow}
      </p>
      <div className="mt-2 flex items-baseline justify-between">
        <h3
          className="text-[16px] font-semibold leading-tight"
          style={{ color: "var(--ros-text-bright)" }}
        >
          {title}
        </h3>
        {count && (
          <span
            className="resume-editorial text-[22px] leading-none"
            style={{ color: "var(--ros-accent-gold)" }}
          >
            {count}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onItemClick?.(item.id)}
              className="block w-full text-left transition-opacity hover:opacity-80"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="text-[12px] leading-snug"
                  style={{ color: "var(--ros-text-muted)" }}
                >
                  {item.label}
                </span>
                {item.status && (
                  <span
                    className="text-[9px] font-semibold tracking-[0.08em] uppercase whitespace-nowrap"
                    style={{ color: "var(--ros-text-dim)" }}
                  >
                    {item.status}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProofSummaryCards({
  capabilities,
  gaps,
  artifacts,
  onCapabilityClick,
  onGapClick,
}: {
  capabilities: Capability[];
  gaps: GapItem[];
  artifacts: ProofArtifact[];
  onCapabilityClick?: (id: string) => void;
  onGapClick?: (id: string) => void;
}) {
  // Production evidence: capabilities with status=Production
  const productionCapabilities = capabilities.filter((c) => c.status === "Production");
  const productionSystems = Array.from(
    new Set(productionCapabilities.map((c) => c.relatedExperience).filter(Boolean))
  );

  // Demoable systems: proof artifacts + demoable capabilities
  const demoableCount = artifacts.length +
    capabilities.filter((c) => c.demoable && c.status !== "Gap").length;

  // Known gaps with plans
  const gapsWithPlans = gaps.filter((g) => g.plannedWinstonImpl && g.proofArtifactNeeded);

  // Best-fit roles: aggregate all role targets from capabilities, dedupe, and count
  const allRoles = new Set<RoleTarget>();
  capabilities.forEach((c) => {
    c.roleTargets.forEach((role) => allRoles.add(role));
  });
  const rolesList = Array.from(allRoles);

  // Winston evidence (internal platform work)
  const winstonCapabilities = capabilities.filter((c) => c.status === "Winston");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Production evidence */}
      <SummaryCard
        eyebrow="Shipped at scale"
        title="Production Systems"
        count={productionCapabilities.length.toString()}
        items={productionSystems.map((sys) => ({
          id: `prod-${sys}`,
          label: sys,
        }))}
        onItemClick={(id) => {
          const sys = id.replace("prod-", "");
          onCapabilityClick?.(`prod:${sys}`);
        }}
      />

      {/* Winston evidence */}
      <SummaryCard
        eyebrow="Platform work"
        title="Winston Development"
        count={winstonCapabilities.length.toString()}
        items={winstonCapabilities.slice(0, 3).map((c) => ({
          id: c.id,
          label: c.capability,
          status: "Winston",
        }))}
        onItemClick={(id) => onCapabilityClick?.(id)}
      />

      {/* Demoable artifacts */}
      <SummaryCard
        eyebrow="Recruiter-safe walkthroughs"
        title="Demoable Artifacts"
        count={demoableCount.toString()}
        items={artifacts.slice(0, 3).map((a) => ({
          id: a.id,
          label: a.title,
          status: STATUS_LABELS[a.status],
        }))}
        onItemClick={(id) => {
          onCapabilityClick?.(id);
        }}
      />

      {/* Known gaps with plans */}
      <SummaryCard
        eyebrow="Tracked & planned"
        title="Known Gaps"
        count={gapsWithPlans.length.toString()}
        items={gapsWithPlans.slice(0, 3).map((g) => ({
          id: g.id,
          label: g.capability,
          status: g.status,
        }))}
        onItemClick={(id) => onGapClick?.(id)}
      />
    </div>
  );
}

"use client";

import { Fragment } from "react";
import { EvidenceStatusBadge } from "./EvidenceStatusBadge";
import type { Capability, Confidence } from "./evidenceGraphData";

function ConfidenceDots({ value }: { value: Confidence }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Confidence ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="block h-1.5 w-1.5 rounded-full"
          style={{
            background: i <= value ? "var(--ros-accent-warm)" : "transparent",
            border: "1px solid var(--ros-border)",
          }}
        />
      ))}
    </span>
  );
}

function ProofPanel({ row }: { row: Capability }) {
  return (
    <div
      className="space-y-4 border-t pt-5"
      style={{ borderColor: "var(--ros-border)" }}
    >
      <div className="grid gap-5 md:grid-cols-2 md:gap-7">
        <div className="space-y-3">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
            Related experience
          </p>
          <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
            {row.relatedExperience}
          </p>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
            Winston surface / demo
          </p>
          <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
            {row.winstonSurface ?? "—"}
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
            Interview talking point
          </p>
          <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
            {row.interviewTalkingPoint}
          </p>
          {row.gapNextAction && (
            <>
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
                Gap / next action
              </p>
              <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-accent-warm)" }}>
                {row.gapNextAction}
              </p>
            </>
          )}
        </div>
      </div>

      {(row.whatWasBuilt || row.stackInvolved || row.proofExists || row.demoEnvironment || row.doNotClaim) && (
        <div className="grid gap-5 md:grid-cols-2 md:gap-7 pt-4 border-t" style={{ borderColor: "var(--ros-border)" }}>
          {row.whatWasBuilt && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
                What was built
              </p>
              <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
                {row.whatWasBuilt}
              </p>
            </div>
          )}
          {row.stackInvolved && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
                Stack involved
              </p>
              <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
                {row.stackInvolved}
              </p>
            </div>
          )}
          {row.proofExists && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
                Proof exists
              </p>
              <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
                {row.proofExists}
              </p>
            </div>
          )}
          {row.demoEnvironment && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
                Demo environment
              </p>
              <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
                {row.demoEnvironment}
              </p>
            </div>
          )}
          {row.doNotClaim && (
            <div className="space-y-2 md:col-span-2">
              <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--ros-text-dim)" }}>
                Do not claim
              </p>
              <p className="text-[13px] leading-[1.7]" style={{ color: "var(--ros-text-muted)" }}>
                {row.doNotClaim}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EvidenceCapabilityTable({
  rows,
  expandedId,
  onToggle,
}: {
  rows: Capability[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p
        className="border-y py-12 text-center text-[13px] tracking-[0.04em]"
        style={{ borderColor: "var(--ros-border)", color: "var(--ros-text-muted)" }}
      >
        No capabilities match the current filters. Clear a filter axis to see more.
      </p>
    );
  }

  return (
    <div className="overflow-hidden">
      {/* Desktop column headers */}
      <div
        className="hidden md:grid border-y py-3 text-[10px] font-semibold tracking-[0.18em] uppercase"
        style={{
          borderColor: "var(--ros-border)",
          color: "var(--ros-text-dim)",
          gridTemplateColumns: "minmax(0,2.4fr) minmax(0,2.6fr) minmax(0,2fr) 110px 90px",
          columnGap: "1.5rem",
        }}
      >
        <div>Capability</div>
        <div>Why it matters</div>
        <div>Evidence source</div>
        <div>Status</div>
        <div>Confidence</div>
      </div>

      <ul className="divide-y" style={{ borderColor: "var(--ros-border)" }}>
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <li key={row.id} style={{ borderColor: "var(--ros-border)" }} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => onToggle(row.id)}
                aria-expanded={expanded}
                className="w-full px-0 py-4 text-left transition-colors md:py-3"
              >
                {/* Desktop row */}
                <div
                  className="hidden md:grid items-center"
                  style={{
                    gridTemplateColumns: "minmax(0,2.4fr) minmax(0,2.6fr) minmax(0,2fr) 110px 90px",
                    columnGap: "1.5rem",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="text-[10px] leading-none"
                      style={{ color: "var(--ros-text-dim)" }}
                    >
                      {expanded ? "−" : "+"}
                    </span>
                    <span
                      className="text-[13px] font-semibold leading-snug"
                      style={{ color: "var(--ros-text-bright)" }}
                    >
                      {row.capability}
                    </span>
                  </div>
                  <p className="text-[12px] leading-[1.55]" style={{ color: "var(--ros-text-muted)" }}>
                    {row.whyItMatters}
                  </p>
                  <p className="text-[12px] leading-[1.55]" style={{ color: "var(--ros-text-muted)" }}>
                    {row.evidenceSource}
                  </p>
                  <div>
                    <EvidenceStatusBadge status={row.status} />
                  </div>
                  <div>
                    <ConfidenceDots value={row.confidence} />
                  </div>
                </div>

                {/* Mobile row */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="text-[14px] font-semibold leading-snug"
                      style={{ color: "var(--ros-text-bright)" }}
                    >
                      {row.capability}
                    </span>
                    <EvidenceStatusBadge status={row.status} size="xs" />
                  </div>
                  <p className="text-[12px] leading-[1.6]" style={{ color: "var(--ros-text-muted)" }}>
                    {row.whyItMatters}
                  </p>
                  <p className="text-[12px] leading-[1.6]" style={{ color: "var(--ros-text-dim)" }}>
                    {row.evidenceSource}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <ConfidenceDots value={row.confidence} />
                    <span
                      className="text-[10px] font-semibold tracking-[0.16em] uppercase"
                      style={{ color: "var(--ros-text-dim)" }}
                    >
                      {expanded ? "− collapse" : "+ proof"}
                    </span>
                  </div>
                </div>
              </button>

              {expanded && (
                <div className="px-0 pb-5">
                  <ProofPanel row={row} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

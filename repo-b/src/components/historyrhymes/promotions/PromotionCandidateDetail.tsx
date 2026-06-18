"use client";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

import { EvidenceGatePanel } from "./EvidenceGatePanel";
import { NoLookaheadAuditPanel } from "./NoLookaheadAuditPanel";
import { NonEventCoveragePanel } from "./NonEventCoveragePanel";
import { PromotedEpisodeLinkPanel } from "./PromotedEpisodeLinkPanel";
import { ReceiptHistoryPanel } from "./ReceiptHistoryPanel";

const REQUIRED_EPISODE_FIELDS: (keyof PromotionCandidate)[] = [
  "proposed_episode_name", "proposed_asset_class", "narrative_summary",
];

function Drawer({ label, value, testid }: { label: string; value: unknown; testid?: string }) {
  const empty = value == null || (typeof value === "object" && Object.keys(value as object).length === 0);
  return (
    <details className="rounded border border-neutral-800 bg-neutral-950/60" data-testid={testid}>
      <summary className="text-xs text-neutral-400 cursor-pointer px-2 py-1.5">{label}{empty ? " (empty)" : ""}</summary>
      <pre className="text-[10px] text-neutral-400 overflow-auto max-h-56 px-2 pb-2">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </details>
  );
}

export function PromotionCandidateDetail({ candidate }: { candidate: PromotionCandidate }) {
  const missingEpisodeFields = REQUIRED_EPISODE_FIELDS.filter((f) => {
    const v = candidate[f];
    return v == null || (typeof v === "string" && !v.trim());
  });

  return (
    <div data-testid="hr-candidate-detail" className="space-y-3">
      {/* identity */}
      <section className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
        <h3 className="text-xs font-semibold text-neutral-200 mb-2">Review packet — {candidate.candidate_id}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-neutral-500">Status</dt><dd className="text-neutral-200">{candidate.approval_status}</dd>
          <dt className="text-neutral-500">Observation</dt><dd className="text-neutral-200">{candidate.observation_id ?? "—"}</dd>
          <dt className="text-neutral-500">model_obs_version</dt><dd className="text-neutral-200">{candidate.model_obs_version ?? "—"}</dd>
          <dt className="text-neutral-500">embedding_model_version</dt><dd className="text-neutral-200">{candidate.embedding_model_version ?? "—"}</dd>
          <dt className="text-neutral-500">Proposed episode</dt><dd className="text-neutral-200">{candidate.proposed_episode_name ?? "—"}</dd>
          <dt className="text-neutral-500">Asset class</dt><dd className="text-neutral-200">{candidate.proposed_asset_class ?? "—"}</dd>
          <dt className="text-neutral-500">Approval actor</dt><dd className="text-neutral-200">{candidate.approval_actor ?? "—"}</dd>
          <dt className="text-neutral-500">Approved at</dt><dd className="text-neutral-200">{candidate.approval_timestamp ?? "—"}</dd>
        </dl>
        <p className="text-xs text-neutral-300 mt-2">{candidate.narrative_summary || <span className="text-neutral-600">No narrative summary.</span>}</p>
        {missingEpisodeFields.length > 0 && (
          <p data-testid="missing-episode-fields" className="mt-2 text-[11px] text-amber-200 border border-amber-500/40 bg-amber-500/10 rounded p-2">
            Needs evidence: required episode fields are missing ({missingEpisodeFields.join(", ")}). Do not use placeholders.
          </p>
        )}
      </section>

      <EvidenceGatePanel candidate={candidate} />
      <NonEventCoveragePanel candidate={candidate} />
      <NoLookaheadAuditPanel candidate={candidate} />
      <ReceiptHistoryPanel candidate={candidate} />
      <PromotedEpisodeLinkPanel candidate={candidate} />

      {/* raw evidence drawers (not the primary UI) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Drawer label="Features snapshot" value={candidate.features_snapshot} testid="drawer-features" />
        <Drawer label="Top feature drivers" value={candidate.top_feature_drivers} />
        <Drawer label="Lineage" value={candidate.lineage_json} />
        <Drawer label="External links" value={candidate.external_links_json} />
        <Drawer label="Calibration evidence" value={candidate.calibration_evidence_json} />
        <Drawer label="Readiness degrade reasons" value={candidate.readiness_degrade_reasons} />
      </div>
    </div>
  );
}

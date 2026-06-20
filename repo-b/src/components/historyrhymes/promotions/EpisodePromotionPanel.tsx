"use client";

import { useState } from "react";

import {
  createEpisode, createEpisodeEmbedding, sealPromotedEpisode, validateEpisode,
  type EpisodeFields, type PromotionActionResult, type PromotionCandidate,
} from "@/lib/historyrhymes/promotions";

/**
 * C14 — the episode promotion workflow (after approval): author episode fields →
 * create episode (reviewed historical memory) → create embedding (makes it
 * searchable) → seal (records the promotion). Each step is explicit and confirmed;
 * nothing is automatic, no placeholders, no AI-generated narrative. Only enabled
 * for an `approved` candidate.
 */

const REQUIRED: { key: keyof EpisodeFields; label: string }[] = [
  { key: "name", label: "Episode name" },
  { key: "asset_class", label: "Asset class" },
  { key: "macro_conditions_entering", label: "Macro conditions entering" },
  { key: "catalyst_trigger", label: "Catalyst trigger" },
  { key: "timeline_narrative", label: "Timeline narrative" },
  { key: "start_date", label: "Start date (YYYY-MM-DD)" },
];

function reasonsOf(r: PromotionActionResult): string[] {
  return r.kind === "blocked" ? r.data.blocked_reasons : r.kind === "error" ? [`error_${r.httpStatus}`] : [];
}

export function EpisodePromotionPanel({
  candidate, onChanged,
}: {
  candidate: PromotionCandidate;
  onChanged?: () => void;
}) {
  const approved = candidate.approval_status === "approved";
  const promoted = candidate.approval_status === "promoted";
  const [fields, setFields] = useState<EpisodeFields>({
    name: candidate.proposed_episode_name ?? "",
    asset_class: candidate.proposed_asset_class ?? "",
    start_date: candidate.proposed_start_date ?? "",
    macro_conditions_entering: "",
    catalyst_trigger: "",
    timeline_narrative: "",
  });
  const [episodeId, setEpisodeId] = useState<string>(candidate.created_episode_id ?? "");
  const [searchable, setSearchable] = useState(false);
  const [sealed, setSealed] = useState(promoted);
  const [reasons, setReasons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof EpisodeFields, v: string) => setFields((f) => ({ ...f, [k]: v }));

  async function run(fn: () => Promise<PromotionActionResult>, after: (r: PromotionActionResult) => void) {
    setBusy(true); setReasons([]);
    try {
      const r = await fn();
      if (r.kind === "ok") { after(r); onChanged?.(); }
      else setReasons(reasonsOf(r));
    } finally { setBusy(false); }
  }

  const input = "w-full text-xs bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-200";
  const btn = "text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <section data-testid="hr-episode-promotion" className="rounded border border-neutral-800 bg-neutral-900/60 p-3 space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-neutral-200">Promote to historical episode</h3>
        <p className="text-[11px] text-neutral-500">
          Creating an episode adds reviewed historical memory. Creating an embedding makes that episode searchable.
          Sealing records that the approved candidate has been promoted. None of this is automatic; no placeholders, no AI-generated narrative.
        </p>
      </div>

      {/* searchability badge */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-neutral-500">Searchability:</span>
        <span data-testid="searchability-badge" className={
          sealed ? "text-violet-300" : searchable ? "text-emerald-300" : episodeId ? "text-amber-300" : "text-neutral-400"}>
          {sealed ? "promoted · searchable" : searchable ? "searchable" : episodeId ? "episode created · not searchable" : "no episode yet"}
        </span>
      </div>

      {!approved && !promoted && (
        <p className="text-[11px] text-neutral-500">Candidate must be <code>approved</code> before an episode can be created.</p>
      )}

      {/* Step 1 — episode draft / required fields */}
      {(approved || promoted) && !episodeId && (
        <div className="space-y-2" data-testid="episode-draft-panel">
          {REQUIRED.map(({ key, label }) => (
            (key === "macro_conditions_entering" || key === "catalyst_trigger" || key === "timeline_narrative") ? (
              <textarea key={key} aria-label={label} placeholder={label} rows={2} className={input}
                value={(fields[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
            ) : (
              <input key={key} aria-label={label} placeholder={label} className={input}
                value={(fields[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
            )
          ))}
          <div className="flex gap-2">
            <button data-testid="action-validate-episode" className={`${btn} bg-neutral-900 text-neutral-300 border-neutral-700`}
              disabled={busy} onClick={() => run(() => validateEpisode(candidate.candidate_id, fields), () => setReasons(["__eligible__"]))}>
              Validate fields
            </button>
            <button data-testid="action-create-episode" className={`${btn} bg-emerald-500/15 text-emerald-200 border-emerald-500/40`}
              disabled={busy}
              onClick={() => run(() => createEpisode(candidate.candidate_id, fields),
                (r) => { if (r.kind === "ok") { setEpisodeId((r.data as { episode_id?: string }).episode_id ?? ""); setSearchable(false); } })}>
              Create episode (confirm)
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — embedding */}
      {episodeId && !searchable && !sealed && (
        <div className="space-y-1" data-testid="embedding-panel">
          <p className="text-[11px] text-neutral-400">Episode <code>{episodeId}</code> created. It is not searchable until an embedding exists.</p>
          <button data-testid="action-create-embedding" className={`${btn} bg-sky-500/15 text-sky-200 border-sky-500/40`}
            disabled={busy}
            onClick={() => run(() => createEpisodeEmbedding(candidate.candidate_id, { episode_id: episodeId }),
              () => setSearchable(true))}>
            Create embedding (confirm) — makes it searchable
          </button>
        </div>
      )}

      {/* Step 3 — seal */}
      {episodeId && (
        <div className="space-y-1" data-testid="seal-panel">
          <button data-testid="action-seal" className={`${btn} bg-violet-500/15 text-violet-200 border-violet-500/40`}
            disabled={busy || !searchable || sealed}
            title={!searchable ? "Create the embedding first" : undefined}
            onClick={() => run(() => sealPromotedEpisode(candidate.candidate_id, { episode_id: episodeId }),
              () => setSealed(true))}>
            Seal promoted episode (confirm)
          </button>
          {!searchable && !sealed && (
            <p className="text-[11px] text-neutral-500">Sealing is disabled until the embedding exists.</p>
          )}
        </div>
      )}

      {reasons.length > 0 && reasons[0] !== "__eligible__" && (
        <div data-testid="episode-blocked-reasons" className="rounded border border-rose-500/40 bg-rose-500/10 p-2">
          <p className="text-[11px] text-rose-200 mb-1">Blocked:</p>
          <ul className="space-y-0.5">{reasons.map((r) => <li key={r}><code className="text-xs text-rose-200">{r}</code></li>)}</ul>
        </div>
      )}
      {reasons[0] === "__eligible__" && (
        <p data-testid="episode-eligible" className="text-[11px] text-emerald-300">Fields valid — eligible to create.</p>
      )}
    </section>
  );
}

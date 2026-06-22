"use client";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

export function PromotedEpisodeLinkPanel({ candidate }: { candidate: PromotionCandidate }) {
  const episodeId = candidate.created_episode_id;
  return (
    <section data-testid="hr-promoted-episode" className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
      <h3 className="text-xs font-semibold text-neutral-300 mb-2">Promoted episode</h3>
      {!episodeId ? (
        <p className="text-xs text-neutral-500">Not promoted. An episode is created elsewhere, then linked here.</p>
      ) : (
        <>
          <p className="text-xs text-neutral-200">Episode id: <code data-testid="promoted-episode-id">{episodeId}</code></p>
          <p className="text-[11px] text-neutral-500 mt-1">Episode detail route is not configured in this surface.</p>
        </>
      )}
    </section>
  );
}

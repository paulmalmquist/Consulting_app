"use client";

import React, { useCallback, useEffect, useState } from "react";
import { fetchRhymesEpisodes, type Episode } from "@/lib/historyrhymes/rhymesClient";
import { C, Panel, CockpitEmptyState, Loading } from "./cockpit/primitives";

const ASSET_CLASS_OPTIONS = ["", "equity", "fixed_income", "credit", "real_estate", "commodity", "crypto"];

interface EpisodeDrawer {
  episode: Episode;
}

function EpisodeRow({ episode, onOpen }: { episode: Episode; onOpen: (e: Episode) => void }) {
  return (
    <div
      role="row"
      data-testid={`hr-episode-row-${episode.episode_id}`}
      onClick={() => onOpen(episode)}
      style={{
        display: "grid", gridTemplateColumns: "1fr 90px 80px auto",
        padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
        cursor: "pointer", fontFamily: C.mono, fontSize: 12, color: C.text,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = C.panelHi; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {episode.episode_name}
      </span>
      <span style={{ color: C.dim }}>
        {episode.episode_start_year}
        {episode.episode_end_year != null ? `–${episode.episode_end_year}` : "–present"}
      </span>
      <span style={{ color: C.faint, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {episode.asset_class ?? "—"}
      </span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {episode.is_non_event && (
          <span style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.08em",
            color: C.amber, background: C.amber + "16", border: `1px solid ${C.amber}38`,
            borderRadius: 4, padding: "1px 5px", textTransform: "uppercase" }}>
            non-event
          </span>
        )}
        {episode.tags.slice(0, 2).map((t) => (
          <span key={t} style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.06em",
            color: C.cyan, background: C.cyan + "12", border: `1px solid ${C.cyan}30`,
            borderRadius: 4, padding: "1px 5px" }}>
            {t}
          </span>
        ))}
        {episode.tags.length > 2 && (
          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.faint }}>+{episode.tags.length - 2}</span>
        )}
      </div>
    </div>
  );
}

function EpisodeDetailDrawer({ episode, onClose }: { episode: Episode; onClose: () => void }) {
  return (
    <div data-testid="hr-episode-drawer"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex" }}>
      <div onClick={onClose} style={{ flex: 1, background: "rgba(0,0,0,0.55)" }} />
      <div style={{ width: 420, background: C.rail, borderLeft: `1px solid ${C.border}`,
        padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span data-testid="hr-episode-drawer-name"
            style={{ fontFamily: C.sans, fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>
            {episode.episode_name}
          </span>
          <button type="button" data-testid="hr-episode-drawer-close" onClick={onClose}
            style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, background: "transparent",
              border: "none", cursor: "pointer", padding: 0 }}>
            close
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Period", `${episode.episode_start_year}–${episode.episode_end_year ?? "present"}`],
            ["Asset class", episode.asset_class ?? "—"],
            ["Non-event", episode.is_non_event ? "yes" : "no"],
            ["Tags", episode.tags.length > 0 ? episode.tags.join(", ") : "none"],
          ].map(([label, value]) => (
            <div key={label} style={{ background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em",
                color: C.faint, textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>

        {episode.description && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em",
              color: C.faint, textTransform: "uppercase", marginBottom: 8 }}>Description</div>
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
              {episode.description}
            </div>
          </div>
        )}

        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: "auto",
          borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          id: {episode.episode_id}
        </div>
      </div>
    </div>
  );
}

export function EpisodesExplorer() {
  const [data, setData] = useState<{ episodes: Episode[]; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [drawer, setDrawer] = useState<EpisodeDrawer | null>(null);

  // Filters
  const [assetClass, setAssetClass] = useState("");
  const [nonEventOnly, setNonEventOnly] = useState(false);
  const [hoytOnly, setHoytOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    const res = await fetchRhymesEpisodes({
      asset_class: assetClass || undefined,
      is_non_event: nonEventOnly || undefined,
      has_hoyt_peak_tag: hoytOnly || undefined,
      limit: 200,
    });
    if (res === null) {
      setFetchError(true);
      setData(null);
    } else {
      setData(res);
    }
    setLoading(false);
  }, [assetClass, nonEventOnly, hoytOnly]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div data-testid="hr-episodes-explorer">
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <select
          data-testid="hr-episodes-filter-asset-class"
          value={assetClass}
          onChange={(e) => setAssetClass(e.target.value)}
          style={{ fontFamily: C.mono, fontSize: 11, background: C.panel, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 8px" }}>
          {ASSET_CLASS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt || "all asset classes"}</option>
          ))}
        </select>

        <label style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            data-testid="hr-episodes-filter-non-event"
            checked={nonEventOnly}
            onChange={(e) => setNonEventOnly(e.target.checked)}
          />
          non-events only
        </label>

        <label style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            data-testid="hr-episodes-filter-hoyt"
            checked={hoytOnly}
            onChange={(e) => setHoytOnly(e.target.checked)}
          />
          Hoyt peak tag
        </label>

        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginLeft: "auto" }}>
          {data != null ? `${data.count} episodes` : ""}
        </span>
      </div>

      {loading && <Loading label="Loading episodes…" />}

      {!loading && fetchError && (
        <CockpitEmptyState
          zone="episodes"
          reason="episode index unavailable — backend returned null"
          hint="GET /api/v1/rhymes/episodes returned a non-OK response or timed out. Check backend health."
        />
      )}

      {!loading && !fetchError && data !== null && data.episodes.length === 0 && (
        <CockpitEmptyState
          zone="episodes"
          reason="no episodes match the current filters"
          hint="Remove filters or check that the episode_embeddings table is populated."
        />
      )}

      {!loading && !fetchError && data !== null && data.episodes.length > 0 && (
        <Panel style={{ padding: 0, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px auto",
            padding: "8px 14px", borderBottom: `1px solid ${C.border}`,
            fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>
            <span>Name</span><span>Period</span><span>Asset class</span><span style={{ textAlign: "right" }}>Tags</span>
          </div>
          {data.episodes.map((ep) => (
            <EpisodeRow key={ep.episode_id} episode={ep} onOpen={(e) => setDrawer({ episode: e })} />
          ))}
        </Panel>
      )}

      {drawer && (
        <EpisodeDetailDrawer episode={drawer.episode} onClose={() => setDrawer(null)} />
      )}
    </div>
  );
}

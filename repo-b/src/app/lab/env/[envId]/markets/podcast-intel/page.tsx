"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Overview = {
  episodes: number;
  macro_views: number;
  trade_ideas: number;
  narratives: number;
  analogs: number;
  uncertainty_markers: number;
  named_speakers: number;
  cross_episode_narratives: number;
  open_predictions: number;
  promoted_signals: number;
};

type Episode = {
  episode_id: string;
  source_id: string;
  title: string;
  published_at: string | null;
  duration_seconds: number | null;
  transcription_status: string;
  extraction_status: string;
  transcription_model: string | null;
  created_at: string;
};

type NarrativeVelocity = {
  velocity_id: string;
  narrative_label: string;
  mention_count: number;
  unique_speakers: number;
  conviction_avg: string | number;
  crowding_risk: string;
  metadata: { cluster_members?: string[]; episode_ids?: string[] } | null;
};

type Speaker = {
  speaker_id: string;
  name: string;
  credibility_score: string | number;
  bias_profile: string | null;
  organization: string | null;
  macro_views: number;
  trade_ideas: number;
  analogs: number;
  predictions_open: number;
  episode_count: number;
};

type Prediction = {
  prediction_id: string;
  prediction_text: string;
  predicted_direction: string;
  target_asset: string | null;
  target_date: string | null;
  resolution_status: string;
  brier_score: string | number | null;
  speaker_name: string | null;
  episode_title: string | null;
  episode_id: string | null;
};

type PromotedSignal = {
  signal_id: string;
  name: string;
  category: string;
  direction: string;
  strength: string | number;
  tickers: string[];
  asset_class: string | null;
  evidence: Record<string, any>;
};

type EpisodeDetail = {
  episode: any;
  transcript_preview: string;
  synthesis: any;
  speakers: any[];
  macro_views: any[];
  trade_ideas: any[];
  narratives: any[];
  analogs: any[];
  uncertainty_markers: any[];
  adversarial: any;
};

function fmtNum(v: any): string {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n.toFixed(0) : "—";
}

function crowdingColor(risk: string): string {
  return {
    low: "bg-slate-700 text-slate-200",
    moderate: "bg-amber-700/40 text-amber-200",
    elevated: "bg-orange-700/60 text-orange-100",
    high: "bg-red-700/60 text-red-100",
    extreme: "bg-fuchsia-700/70 text-fuchsia-100",
  }[risk] || "bg-slate-700 text-slate-200";
}

function directionColor(d: string): string {
  return {
    bullish: "text-emerald-300",
    bearish: "text-red-300",
    neutral: "text-slate-300",
    up: "text-emerald-300",
    down: "text-red-300",
    flat: "text-slate-300",
    range: "text-amber-300",
    long: "text-emerald-300",
    short: "text-red-300",
  }[d] || "text-slate-300";
}

export default function PodcastIntelPage() {
  const params = useParams<{ envId: string }>();
  const envId = params?.envId ?? "";

  const [overview, setOverview] = useState<Overview | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [velocity, setVelocity] = useState<NarrativeVelocity[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [signals, setSignals] = useState<PromotedSignal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEp, setSelectedEp] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EpisodeDetail | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovR, epR, veR, spR, prR, sgR] = await Promise.all([
        fetch("/api/v1/podcast/overview"),
        fetch("/api/v1/podcast/episodes?limit=50"),
        fetch("/api/v1/podcast/narrative-velocity?cross_episode_only=true"),
        fetch("/api/v1/podcast/speakers?limit=30"),
        fetch("/api/v1/podcast/predictions?limit=50"),
        fetch("/api/v1/podcast/promoted-signals?limit=100"),
      ]);
      if (!ovR.ok) throw new Error(`overview ${ovR.status}`);
      setOverview(await ovR.json());
      setEpisodes((await epR.json()).episodes || []);
      setVelocity((await veR.json()).narratives || []);
      setSpeakers((await spR.json()).speakers || []);
      setPredictions((await prR.json()).predictions || []);
      setSignals((await sgR.json()).signals || []);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadDetail = useCallback(async (episodeId: string) => {
    setSelectedEp(episodeId);
    setDrillLoading(true);
    try {
      const r = await fetch(`/api/v1/podcast/episodes/${episodeId}/signals`);
      if (!r.ok) throw new Error(`detail ${r.status}`);
      setSelectedDetail(await r.json());
    } catch (e: any) {
      setError(e.message || "detail failed");
      setSelectedDetail(null);
    } finally {
      setDrillLoading(false);
    }
  }, []);

  const crowdingSorted = useMemo(
    () => [...velocity].sort((a, b) => b.mention_count - a.mention_count),
    [velocity]
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-[0.32em] text-sky-200/80">
            Trading Platform · Podcast Intelligence
          </div>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-white">
            Narrative surveillance across long-form finance conversations
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
            Signals extracted from ingested podcast episodes: macro views, trade ideas,
            narratives, historical analogs, uncertainty markers, cross-episode crowding
            detection, speaker predictions pending market resolution, and the subset
            already promoted into the trading lab as tradeable signals.
          </p>
          <div className="mt-4 flex gap-3 text-sm">
            <Link href={`/lab/env/${envId}/markets`} className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-slate-200 hover:bg-white/10">
              ← Markets Home
            </Link>
            <button
              onClick={loadAll}
              className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-1.5 text-sky-100 hover:bg-sky-500/20"
            >
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            Error: {error}
          </div>
        )}

        {/* ── Overview stat tiles ─────────────────────────────────────────── */}
        {overview && (
          <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Episodes", overview.episodes],
              ["Macro views", overview.macro_views],
              ["Trade ideas", overview.trade_ideas],
              ["Narratives", overview.narratives],
              ["Analogs", overview.analogs],
              ["Uncertainty markers", overview.uncertainty_markers],
              ["Named speakers", overview.named_speakers],
              ["Cross-episode crowding", overview.cross_episode_narratives],
              ["Open predictions", overview.open_predictions],
              ["Promoted signals", overview.promoted_signals],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 backdrop-blur"
              >
                <div className="text-[10px] uppercase tracking-widest text-slate-400">
                  {label}
                </div>
                <div className="mt-1 font-mono text-2xl font-light text-white">
                  {value}
                </div>
              </div>
            ))}
          </section>
        )}

        {loading && <div className="text-center text-slate-400">Loading…</div>}

        {/* ── Cross-episode crowding ──────────────────────────────────────── */}
        {!loading && (
          <Section title="⚠️ Cross-episode narrative crowding" subtitle="Narrative labels clustered by cosine ≥ 0.65. Appearance across multiple episodes = convergent thesis = crowding candidate.">
            <table className="min-w-full divide-y divide-white/5 text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Canonical narrative</th>
                  <th className="py-2 pr-4 text-right">Eps</th>
                  <th className="py-2 pr-4 text-right">Mentions</th>
                  <th className="py-2 pr-4 text-right">Speakers</th>
                  <th className="py-2 pr-4 text-right">Conv</th>
                  <th className="py-2 pr-4">Risk</th>
                  <th className="py-2">Cluster members</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {crowdingSorted.map((n) => (
                  <tr key={n.velocity_id} className="hover:bg-white/5">
                    <td className="py-2 pr-4 font-medium text-white">{n.narrative_label}</td>
                    <td className="py-2 pr-4 text-right text-slate-300">{n.metadata?.episode_ids?.length || 0}</td>
                    <td className="py-2 pr-4 text-right font-mono text-slate-200">{n.mention_count}</td>
                    <td className="py-2 pr-4 text-right text-slate-300">{n.unique_speakers}</td>
                    <td className="py-2 pr-4 text-right font-mono text-slate-200">{fmtNum(n.conviction_avg)}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wider ${crowdingColor(n.crowding_risk)}`}>
                        {n.crowding_risk}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-slate-400">
                      {(n.metadata?.cluster_members || []).slice(0, 3).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Episodes ────────────────────────────────────────────────────── */}
        {!loading && (
          <Section title="📻 Episodes" subtitle="Click an episode to drill into every extracted signal.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => (
                <button
                  key={ep.episode_id}
                  onClick={() => loadDetail(ep.episode_id)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    selectedEp === ep.episode_id
                      ? "border-sky-400/50 bg-sky-500/10"
                      : "border-white/10 bg-slate-900/60 hover:border-sky-400/30"
                  }`}
                >
                  <div className="text-sm font-medium text-white line-clamp-2">{ep.title}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono">
                      {ep.extraction_status}
                    </span>
                    {ep.duration_seconds && (
                      <span>{Math.round(ep.duration_seconds / 60)} min</span>
                    )}
                    <span className="truncate">{ep.transcription_model}</span>
                  </div>
                </button>
              ))}
            </div>

            {selectedDetail && (
              <EpisodeDrilldown detail={selectedDetail} loading={drillLoading} />
            )}
          </Section>
        )}

        {/* ── Speakers ────────────────────────────────────────────────────── */}
        {!loading && (
          <Section title="🎙️ Speakers" subtitle="All named speakers ranked by signal volume. credibility_score = 50 for unscored (Phase 5 will populate from prediction track records).">
            <table className="min-w-full divide-y divide-white/5 text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Speaker</th>
                  <th className="py-2 pr-4">Org</th>
                  <th className="py-2 pr-4 text-right">Episodes</th>
                  <th className="py-2 pr-4 text-right">Macro</th>
                  <th className="py-2 pr-4 text-right">Trades</th>
                  <th className="py-2 pr-4 text-right">Analogs</th>
                  <th className="py-2 pr-4 text-right">Predictions</th>
                  <th className="py-2 pr-4 text-right">Credibility</th>
                  <th className="py-2">Bias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {speakers.map((s) => (
                  <tr key={s.speaker_id} className="hover:bg-white/5">
                    <td className="py-2 pr-4 font-medium text-white">{s.name}</td>
                    <td className="py-2 pr-4 text-xs text-slate-400">{s.organization || "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.episode_count}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.macro_views}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.trade_ideas}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.analogs}</td>
                    <td className="py-2 pr-4 text-right font-mono">{s.predictions_open}</td>
                    <td className="py-2 pr-4 text-right font-mono text-slate-300">{fmtNum(s.credibility_score)}</td>
                    <td className="py-2 text-xs text-slate-400">{s.bias_profile || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Open predictions ────────────────────────────────────────────── */}
        {!loading && (
          <Section title="🔮 Open predictions" subtitle="Resolvable directional calls awaiting market resolution. Phase 5 resolver will score Brier + update speaker track records.">
            <table className="min-w-full divide-y divide-white/5 text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Dir</th>
                  <th className="py-2 pr-4">Asset</th>
                  <th className="py-2 pr-4">Target date</th>
                  <th className="py-2 pr-4">Speaker</th>
                  <th className="py-2">Prediction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {predictions.map((p) => (
                  <tr key={p.prediction_id} className="hover:bg-white/5">
                    <td className={`py-2 pr-4 font-bold uppercase ${directionColor(p.predicted_direction)}`}>
                      {p.predicted_direction}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-200">{p.target_asset || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                      {p.target_date?.slice(0, 10) || "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{p.speaker_name || "Unattributed"}</td>
                    <td className="py-2 text-slate-300 text-xs line-clamp-2">{p.prediction_text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Promoted trading signals ────────────────────────────────────── */}
        {!loading && (
          <Section title="📡 Promoted to trading_signals" subtitle="Podcast signals that passed the promoter gates (confidence ≥ 70, high-conviction trades). source='podcast' in trading_signals.">
            <div className="space-y-2">
              {signals.map((s) => (
                <details key={s.signal_id} className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`font-bold uppercase ${directionColor(s.direction)}`}>{s.direction}</span>
                      <span className="font-mono text-xs text-slate-400">str={fmtNum(s.strength)}</span>
                      <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs">{s.category}</span>
                      {s.tickers?.length > 0 && (
                        <span className="font-mono text-xs text-sky-300">{s.tickers.join(",")}</span>
                      )}
                      <span className="flex-1 truncate text-slate-200">{s.name.replace(/^Podcast (macro view|trade idea): /i, "")}</span>
                    </div>
                  </summary>
                  <div className="mt-2 space-y-1 border-t border-white/5 pt-2 text-xs text-slate-400">
                    <div><span className="text-slate-500">Speaker:</span> {s.evidence.speaker_name || "Unattributed"}</div>
                    <div><span className="text-slate-500">Episode:</span> {s.evidence.episode_title}</div>
                    <div><span className="text-slate-500">Statement:</span> {s.evidence.statement || s.evidence.description}</div>
                    {s.evidence.reasoning && <div><span className="text-slate-500">Reasoning:</span> {s.evidence.reasoning}</div>}
                    <div className="font-mono text-[10px] text-slate-600">
                      model={s.evidence.extraction_model} conf={s.evidence.confidence_implied} cred={s.evidence.speaker_credibility}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold text-white">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-slate-400">{subtitle}</p>}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur">{children}</div>
    </section>
  );
}

function EpisodeDrilldown({ detail, loading }: { detail: EpisodeDetail; loading: boolean }) {
  if (loading) return <div className="mt-6 text-slate-400">Loading episode detail…</div>;
  const s = detail.synthesis;
  const adv = detail.adversarial;
  return (
    <div className="mt-6 space-y-4 rounded-xl border border-sky-400/30 bg-sky-950/20 p-4">
      <h3 className="text-lg font-semibold text-sky-200">{detail.episode.title}</h3>
      {adv && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-300">
          <span>Authenticity: <span className="font-mono text-white">{fmtNum(adv.authenticity_score)}</span></span>
          <span>Originality: <span className="font-mono text-white">{fmtNum(adv.originality_score)}</span></span>
          <span>Manipulation risk: <span className="font-mono text-white">{fmtNum(adv.manipulation_risk)}</span></span>
        </div>
      )}
      {s && (
        <DrillBlock title="Pass 3 synthesis">
          {s.executive_summary && <p className="mb-2 text-sm leading-6 text-slate-200">{s.executive_summary}</p>}
          {s.dominant_narrative && (
            <p className="text-xs text-slate-400">
              <span className="text-slate-500">Dominant:</span> {s.dominant_narrative}
            </p>
          )}
          {s.single_most_actionable?.thesis && (
            <div className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm">
              <div className="text-xs uppercase tracking-wider text-emerald-300">Most actionable</div>
              <div className="mt-1 font-mono text-xs text-emerald-200">
                <span className={directionColor(s.single_most_actionable.direction)}>
                  {s.single_most_actionable.direction}
                </span>
                {" "}{s.single_most_actionable.asset_or_ticker} · conv={s.single_most_actionable.conviction}
                {" "}· horizon={s.single_most_actionable.time_horizon}
              </div>
              <div className="mt-1 text-xs text-slate-300">{s.single_most_actionable.thesis}</div>
              {s.single_most_actionable.risk_to_thesis && (
                <div className="mt-1 text-xs text-slate-500">Risk: {s.single_most_actionable.risk_to_thesis}</div>
              )}
            </div>
          )}
          {(["agreements", "disagreements", "novel_insights", "crowded_takes", "adversarial_red_flags"] as const).map((k) => {
            const items = s[k] as string[] | undefined;
            if (!items?.length) return null;
            return (
              <div key={k} className="mt-2 text-xs">
                <div className="text-slate-500 uppercase tracking-wider">{k.replace(/_/g, " ")}</div>
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-slate-300">
                  {items.slice(0, 5).map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            );
          })}
        </DrillBlock>
      )}
      <DrillBlock title={`Macro views (${detail.macro_views.length})`}>
        <SignalTable rows={detail.macro_views} cols={["direction", "confidence_implied", "time_horizon", "speaker_name", "statement", "tickers"]} />
      </DrillBlock>
      <DrillBlock title={`Trade ideas (${detail.trade_ideas.length})`}>
        <SignalTable rows={detail.trade_ideas} cols={["direction", "conviction", "crowding_tag", "speaker_name", "description", "tickers"]} />
      </DrillBlock>
      <DrillBlock title={`Narratives (${detail.narratives.length})`}>
        <SignalTable rows={detail.narratives} cols={["narrative_type", "sentiment", "conviction", "novelty_score", "narrative_label"]} />
      </DrillBlock>
      <DrillBlock title={`Historical analogs (${detail.analogs.length})`}>
        <SignalTable rows={detail.analogs} cols={["rhyme_type", "referenced_year", "referenced_period", "speaker_name", "reasoning"]} />
      </DrillBlock>
      <DrillBlock title={`Uncertainty markers (${detail.uncertainty_markers.length})`}>
        <SignalTable rows={detail.uncertainty_markers} cols={["marker_type", "inferred_confidence", "speaker_name", "raw_text", "context_statement"]} />
      </DrillBlock>
      <DrillBlock title="Transcript preview (first 5K chars)">
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
          {detail.transcript_preview}
        </pre>
      </DrillBlock>
    </div>
  );
}

function DrillBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-white/10 bg-slate-950/40 p-3" open={title.startsWith("Pass 3")}>
      <summary className="cursor-pointer text-sm font-medium text-slate-200">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function SignalTable({ rows, cols }: { rows: any[]; cols: string[] }) {
  if (!rows.length) return <div className="text-xs text-slate-500">No rows.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            {cols.map((c) => <th key={c} className="py-1 pr-3">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {cols.map((c) => {
                const v = r[c];
                if (v == null) return <td key={c} className="py-1 pr-3 text-slate-600">—</td>;
                if (Array.isArray(v)) return <td key={c} className="py-1 pr-3 font-mono text-sky-300">{v.join(",")}</td>;
                if (c === "direction" || c === "sentiment") {
                  return <td key={c} className={`py-1 pr-3 font-bold uppercase ${directionColor(String(v))}`}>{v}</td>;
                }
                if (typeof v === "number" || (typeof v === "string" && /^\d+(\.\d+)?$/.test(v))) {
                  return <td key={c} className="py-1 pr-3 font-mono text-slate-200">{fmtNum(v)}</td>;
                }
                return <td key={c} className="py-1 pr-3 text-slate-300 max-w-[380px]">{String(v).slice(0, 300)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

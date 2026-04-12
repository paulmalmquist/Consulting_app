"use client";

function pct(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "N/A";
  return Number(value).toFixed(digits);
}

export function ShockClassificationBadge({
  shockType,
  dominance,
}: {
  shockType?: string | null;
  dominance?: number | null;
}) {
  const tone =
    shockType === "exogenous"
      ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
      : shockType === "mixed"
        ? "border-sky-300/30 bg-sky-500/10 text-sky-100"
        : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.16em] ${tone}`}>
      <span>{shockType ?? "unknown shock"}</span>
      <span className="text-[10px] opacity-80">dominance {pct(dominance)}</span>
    </div>
  );
}

export function SignalFreshnessCard({
  freshness,
  staleness,
}: {
  freshness?: number | null;
  staleness?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Signal Freshness</div>
      <div className="mt-2 text-2xl font-semibold text-white">{pct(freshness)}</div>
      <div className="mt-2 text-sm text-slate-300">Research state is currently {staleness ?? "unknown"}.</div>
    </div>
  );
}

export function CoherenceMeter({ coherence }: { coherence?: number | null }) {
  const width = `${Math.max(0, Math.min(100, Number(coherence ?? 0) * 100))}%`;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Coherence Meter</div>
      <div className="mt-2 text-2xl font-semibold text-white">{pct(coherence)}</div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-300" style={{ width }} />
      </div>
    </div>
  );
}

export function CreditBreakdownPanel({
  credit,
}: {
  credit?: { cre_stress?: number; corporate_stress?: number; consumer_stress?: number } | null;
}) {
  const items = [
    { label: "CRE", value: credit?.cre_stress },
    { label: "Corporate", value: credit?.corporate_stress },
    { label: "Consumer", value: credit?.consumer_stress },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Credit Breakdown</div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{pct(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VolatilityDivergencePanel({
  volatility,
}: {
  volatility?: { vix_level?: number | null; move_level?: number | null; vol_divergence_score?: number | null } | null;
}) {
  const hiddenStress =
    volatility?.move_level != null &&
    volatility?.vix_level != null &&
    Number(volatility.move_level) > 120 &&
    Number(volatility.vix_level) < 22;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Volatility Divergence</div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-500">VIX</div>
          <div className="mt-2 text-lg font-semibold text-white">{num(volatility?.vix_level)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-500">MOVE</div>
          <div className="mt-2 text-lg font-semibold text-white">{num(volatility?.move_level)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Divergence</div>
          <div className="mt-2 text-lg font-semibold text-white">{pct(volatility?.vol_divergence_score)}</div>
        </div>
      </div>
      <div className="mt-4 text-sm leading-6 text-slate-300">
        {hiddenStress
          ? "High MOVE with lower VIX suggests hidden stress. Explicit branches: equities catch up to rates stress, or the bond market is over-warning."
          : "Cross-asset volatility is not currently flashing the strongest hidden-stress signal."}
      </div>
    </div>
  );
}

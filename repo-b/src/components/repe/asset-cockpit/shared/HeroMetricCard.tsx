interface Props {
  label: string;
  value: string;
  accent: string;
  testId?: string;
  /** QoQ delta string, e.g. "+2.3%" or "-$12K" */
  delta?: string | null;
  /** Tone drives color: positive = green, negative = red, neutral = muted */
  deltaTone?: "positive" | "negative" | "neutral";
}

export default function HeroMetricCard({ label, value, accent, testId, delta, deltaTone }: Props) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.92))]"
      data-testid={testId}
      style={{ boxShadow: `0 18px 44px -30px ${accent}22` }}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{label}</p>
      <div className="mt-4 flex items-baseline gap-2">
        <p className="text-3xl font-semibold tracking-tight text-bm-text tabular-nums">{value}</p>
        {delta && (
          <span className={`text-xs font-medium tabular-nums ${
            deltaTone === "positive" ? "text-green-400" :
            deltaTone === "negative" ? "text-red-400" :
            "text-bm-muted2"
          }`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

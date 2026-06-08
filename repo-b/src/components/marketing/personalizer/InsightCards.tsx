/**
 * InsightCards — the research-derived observations + Novendor angle for a firm.
 */
export type InsightCardData = {
  title: string;
  observation: string;
  novendor_angle: string;
  confidence: string;
};

type InsightCardsProps = {
  insights: InsightCardData[];
  accentHsl?: string | null;
};

export function InsightCards({ insights, accentHsl }: InsightCardsProps) {
  const accent = accentHsl ? `hsl(${accentHsl})` : "rgb(125 211 252)";
  if (!insights || insights.length === 0) return null;
  return (
    <section className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
      {insights.map((i, idx) => (
        <article
          key={idx}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-white">{i.title}</h3>
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
              style={{ borderColor: accent }}
            >
              {i.confidence}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            {i.observation}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            {i.novendor_angle}
          </p>
        </article>
      ))}
    </section>
  );
}

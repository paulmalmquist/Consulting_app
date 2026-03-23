interface Props {
  label: string;
  value: string;
  accent: string;
  testId?: string;
}

export default function HeroMetricCard({ label, value, accent, testId }: Props) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.92))]"
      data-testid={testId}
      style={{ boxShadow: `0 18px 44px -30px ${accent}22` }}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-bm-text tabular-nums">{value}</p>
    </div>
  );
}

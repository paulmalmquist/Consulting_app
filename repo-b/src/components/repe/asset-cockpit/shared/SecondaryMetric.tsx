interface Props {
  label: string;
  value: string;
  className?: string;
}

export default function SecondaryMetric({ label, value, className }: Props) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/8 dark:bg-white/[0.02] ${className ?? ""}`}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-sm font-medium text-bm-text tabular-nums">{value}</p>
    </div>
  );
}

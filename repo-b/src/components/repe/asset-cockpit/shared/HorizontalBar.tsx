interface Props {
  label: string;
  value: string;
  pct: number;
  color: string;
}

export default function HorizontalBar({ label, value, pct, color }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-bm-text">{label}</span>
        <span className="text-bm-muted2">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

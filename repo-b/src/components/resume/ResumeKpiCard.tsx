"use client";

export default function ResumeKpiCard({
  label,
  value,
  detail,
  delta,
  deltaDirection,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-2xl border border-bm-border/35 bg-black/10 px-4 py-4 text-left ${onClick ? "transition hover:border-white/20 hover:bg-black/20" : ""}`}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-xl font-semibold">{value}</p>
        {delta && deltaDirection && deltaDirection !== "flat" ? (
          <span className={`text-xs ${deltaDirection === "up" ? "text-emerald-400" : "text-red-400"}`}>
            {delta}
          </span>
        ) : null}
      </div>
      {detail ? <p className="mt-2 text-xs text-bm-muted">{detail}</p> : null}
    </Tag>
  );
}

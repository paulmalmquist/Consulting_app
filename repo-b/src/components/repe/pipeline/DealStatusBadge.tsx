"use client";

const STATUS_STYLES: Record<string, string> = {
  sourced:   "bg-bm-border/[0.08] text-bm-muted border-bm-border/30",
  screening: "bg-bm-accent/[0.08] text-bm-accent border-bm-accent/20",
  loi:       "bg-bm-warning/[0.10] text-bm-warning border-bm-warning/25",
  dd:        "bg-bm-warning/[0.14] text-bm-warning border-bm-warning/30",
  ic:        "bg-bm-accent/[0.12] text-bm-accent border-bm-accent/25",
  closing:   "bg-bm-success/[0.10] text-bm-success border-bm-success/25",
  closed:    "bg-bm-success/[0.14] text-bm-success border-bm-success/30",
  dead:      "bg-bm-danger/[0.08] text-bm-danger border-bm-danger/20",
};

const STATUS_LABELS: Record<string, string> = {
  sourced: "Sourced",
  screening: "Screening",
  loi: "LOI",
  dd: "Due Diligence",
  ic: "IC",
  closing: "Closing",
  closed: "Closed",
  dead: "Dead",
};

export default function DealStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-bm-surface text-bm-muted border-bm-border";
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}

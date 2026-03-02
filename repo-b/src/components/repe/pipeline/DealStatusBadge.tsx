"use client";

const STATUS_STYLES: Record<string, string> = {
  sourced: "bg-gray-500/20 text-gray-300 border-gray-500/40",
  screening: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  loi: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  dd: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  ic: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  closing: "bg-teal-500/20 text-teal-300 border-teal-500/40",
  closed: "bg-green-500/20 text-green-300 border-green-500/40",
  dead: "bg-red-500/20 text-red-300 border-red-500/40",
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

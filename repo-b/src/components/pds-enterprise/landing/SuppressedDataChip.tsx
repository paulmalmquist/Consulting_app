import type { PdsMetricResult } from "@/types/pds";

export function SuppressedDataChip({
  metric,
  onClick,
}: {
  metric: Pick<PdsMetricResult, "suppressed_count" | "suppression_reasons"> | null;
  onClick?: () => void;
}) {
  if (!metric || !metric.suppressed_count) return null;
  const reason = metric.suppression_reasons.join("; ") || "see Data Health";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-pds-signalRed/40 bg-pds-signalRed/10 px-2 py-0.5 text-[11px] font-medium text-pds-signalRed"
      aria-label={`${metric.suppressed_count} records excluded`}
    >
      ⚠ {metric.suppressed_count} excluded — {reason}
    </button>
  );
}

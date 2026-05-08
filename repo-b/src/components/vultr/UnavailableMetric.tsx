/**
 * Renders the absence of a metric value with a machine-readable reason.
 * Use this anywhere a value is `null` so the UI never silently shows zero.
 */
import { AlertCircle } from "lucide-react";

export function UnavailableMetric({
  reason,
  className = "",
}: {
  reason: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-bm-muted2 ${className}`}
      title={reason || "value unavailable"}
    >
      <AlertCircle className="h-3.5 w-3.5 opacity-70" aria-hidden />
      <span className="font-mono text-xs uppercase tracking-[0.12em]">
        {reason || "unavailable"}
      </span>
    </span>
  );
}

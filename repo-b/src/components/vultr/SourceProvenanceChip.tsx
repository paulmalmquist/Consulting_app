/**
 * Tiny chip describing where a metric value came from.
 *
 * Shown next to KPIs and table cells so an operator can trace a number back
 * to its source without opening the audit drawer.
 */
import { Database } from "lucide-react";
import type { Provenance } from "@/lib/vultr-contracts";

export function SourceProvenanceChip({
  provenance,
  className = "",
}: {
  provenance: Provenance;
  className?: string;
}) {
  const detail =
    provenance.source_record_count !== null && provenance.source_record_count !== undefined
      ? `${provenance.source} · ${provenance.source_record_count.toLocaleString()} rows`
      : provenance.source;
  const title = [
    `Source: ${provenance.source}`,
    provenance.source_system ? `System: ${provenance.source_system}` : null,
    provenance.source_record_count !== null && provenance.source_record_count !== undefined
      ? `Records: ${provenance.source_record_count.toLocaleString()}`
      : null,
    provenance.joined_with && provenance.joined_with.length > 0
      ? `Joined with: ${provenance.joined_with.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-bm-divider/30 bg-bm-bg-2/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.10em] text-bm-muted2 ${className}`}
      title={title}
    >
      <Database className="h-3 w-3 opacity-70" aria-hidden />
      <span className="font-mono">{detail}</span>
    </span>
  );
}

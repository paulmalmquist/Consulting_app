"use client";

import type { CopilotAttachment } from "@/components/copilot/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(attachment: CopilotAttachment): string {
  const fname = (attachment.name || "").toLowerCase();
  if (fname.endsWith(".pdf")) return "PDF";
  if (fname.endsWith(".xlsx") || fname.endsWith(".xls")) return "XLSX";
  if (fname.endsWith(".docx") || fname.endsWith(".doc")) return "DOCX";
  if (fname.endsWith(".csv")) return "CSV";
  if (fname.endsWith(".png")) return "PNG";
  if (fname.endsWith(".jpg") || fname.endsWith(".jpeg")) return "JPG";
  if (fname.endsWith(".webp")) return "WEBP";
  const mime = attachment.mime_type || "";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return mime.split("/").pop()?.toUpperCase() || "FILE";
}

function processingReceipt(attachment: CopilotAttachment): string | null {
  if (attachment.status !== "ready") return null;
  const stats = attachment.classification?.parse_stats || {};
  const type = typeLabel(attachment);

  if (attachment.processing_mode === "vision_only") {
    const w = stats.width as number | undefined;
    const h = stats.height as number | undefined;
    const dims = w && h ? ` · ${w}×${h}` : "";
    return `${type}${dims} · vision-ready`;
  }

  const fname = (attachment.name || "").toLowerCase();
  if (fname.endsWith(".xlsx") || fname.endsWith(".xls")) {
    const sheets = stats.sheet_count as number | undefined;
    const rows = stats.row_count_total as number | undefined;
    const domain = attachment.classification?.detected_domain;
    const parts = [type];
    if (sheets) parts.push(`${sheets} sheet${sheets !== 1 ? "s" : ""}`);
    if (rows) parts.push(`${rows.toLocaleString()} rows`);
    if (domain && domain !== "general") parts.push(domain.replace(/_/g, " "));
    return parts.join(" · ");
  }

  if (fname.endsWith(".pdf")) {
    const pages = stats.page_count as number | undefined;
    const tables = stats.possible_tables as boolean | undefined;
    const parts = [type];
    if (pages) parts.push(`${pages} page${pages !== 1 ? "s" : ""}`);
    if (tables) parts.push("table-like text detected");
    return parts.join(" · ");
  }

  if (fname.endsWith(".docx") || fname.endsWith(".doc")) {
    const headings = stats.heading_count as number | undefined;
    const chars = stats.char_count as number | undefined;
    const parts = [type];
    if (headings) parts.push(`${headings} heading${headings !== 1 ? "s" : ""}`);
    if (chars) parts.push(`${chars.toLocaleString()} chars`);
    return parts.join(" · ");
  }

  if (fname.endsWith(".csv")) {
    const rows = stats.row_count as number | undefined;
    const parts = [type];
    if (rows) parts.push(`${rows.toLocaleString()} rows`);
    return parts.join(" · ");
  }

  return type;
}

function StatusBadge({ status }: { status: CopilotAttachment["status"] }) {
  const map: Record<CopilotAttachment["status"], { label: string; cls: string }> = {
    uploading: { label: "uploading", cls: "text-white/40" },
    indexing: { label: "indexing", cls: "text-white/40" },
    classifying: { label: "reading", cls: "text-white/40" },
    ready: { label: "ready", cls: "text-emerald-400/70" },
    failed: { label: "failed", cls: "text-red-400/80" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "text-white/30" };
  return <span className={`text-[10px] uppercase tracking-wide ${cls}`}>{label}</span>;
}

type AttachmentCardProps = {
  attachment: CopilotAttachment;
  onRemove: () => void;
};

export function AttachmentCard({ attachment, onRemove }: AttachmentCardProps) {
  const receipt = processingReceipt(attachment);
  const summary = attachment.classification?.summary;
  const isProcessing = attachment.status === "uploading" || attachment.status === "indexing" || attachment.status === "classifying";

  return (
    <div className="flex items-start gap-2 rounded bg-white/5 border border-white/8 px-2 py-1.5 text-xs">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-white/80 font-medium">{attachment.name}</span>
          <span className="shrink-0 text-white/30">
            {formatBytes(attachment.size_bytes)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          <StatusBadge status={attachment.status} />
          {isProcessing && (
            <span className="text-white/20 text-[10px]">·</span>
          )}
        </div>

        {receipt && (
          <div className="mt-0.5 text-white/40 text-[10px]">{receipt}</div>
        )}
        {summary && (
          <div className="mt-0.5 text-white/50 text-[10px] leading-tight">{summary}</div>
        )}
        {attachment.status === "failed" && attachment.error && (
          <div className="mt-0.5 text-red-400/70 text-[10px] leading-tight">{attachment.error}</div>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 mt-0.5 text-white/20 hover:text-white/60 transition-colors leading-none"
        aria-label={`Remove ${attachment.name}`}
      >
        ×
      </button>
    </div>
  );
}

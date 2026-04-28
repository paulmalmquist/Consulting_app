import Link from "next/link";
import { FileCode, ArrowRight } from "lucide-react";
import { getNotebooksForPage } from "@/lib/supply-chain/notebooks";

interface Props {
  pageSlug: string; // supply-chain route slug, e.g. "medallion"
  envId: string;
}

export default function NotebookCallout({ pageSlug, envId }: Props) {
  const notebooks = getNotebooksForPage(pageSlug);
  if (!notebooks.length) return null;

  const base = `/lab/env/${envId}/supply-chain/notebooks`;

  return (
    <div className="mt-8 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-bm-muted2 px-1">
        Source notebooks
      </p>
      {notebooks.map((nb) => (
        <Link
          key={nb.id}
          href={`${base}?tab=${nb.id}`}
          className="flex items-center gap-3 rounded-lg border border-[--bm-border] bg-[--bm-surface] px-4 py-3 hover:border-bm-accent/40 hover:bg-[--bm-surface-2] transition-colors group"
        >
          {/* Icon */}
          <FileCode
            size={18}
            className="shrink-0 text-bm-muted2 group-hover:text-bm-accent transition-colors"
          />

          {/* Notebook info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${nb.layerColor}`}
              >
                {nb.layer}
              </span>
              <code className="text-xs font-mono text-bm-muted">{nb.filename}</code>
            </div>
            <p className="text-sm text-bm-muted truncate">{nb.description}</p>
          </div>

          {/* CTA */}
          <span className="shrink-0 flex items-center gap-1 text-xs text-bm-muted group-hover:text-bm-accent transition-colors">
            View
            <ArrowRight size={13} />
          </span>
        </Link>
      ))}
    </div>
  );
}

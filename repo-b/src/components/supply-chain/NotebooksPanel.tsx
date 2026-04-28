"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { NOTEBOOKS } from "@/lib/supply-chain/notebooks";
import NotebookViewer from "./NotebookViewer";

interface Props {
  envId: string;
}

export default function NotebooksPanel({ envId }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get("tab") ?? NOTEBOOKS[0].id;
  const sectionParam = searchParams.get("section") ?? undefined;

  const [activeId, setActiveId] = useState(tabParam);

  // Sync tab when URL changes (e.g. from NotebookCallout deep-link)
  useEffect(() => {
    setActiveId(tabParam);
  }, [tabParam]);

  const activeNotebook = NOTEBOOKS.find((n) => n.id === activeId) ?? NOTEBOOKS[0];

  const selectTab = (id: string) => {
    setActiveId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    params.delete("section");
    router.replace(`/lab/env/${envId}/supply-chain/notebooks?${params.toString()}`, {
      scroll: false,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {NOTEBOOKS.map((nb) => {
          const active = nb.id === activeId;
          return (
            <button
              key={nb.id}
              onClick={() => selectTab(nb.id)}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border",
                active
                  ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                  : "border-[--bm-border] text-bm-muted hover:text-bm-text hover:bg-[--bm-surface-2]",
              ].join(" ")}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${nb.layerColor}`}
                aria-hidden
              />
              <code className="font-mono">{nb.filename}</code>
            </button>
          );
        })}
      </div>

      {/* Active notebook info */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-bm-text">{activeNotebook.title}</h2>
          <p className="text-sm text-bm-muted mt-0.5">{activeNotebook.description}</p>
        </div>
        {/* Section jump list */}
        {activeNotebook.highlights.length > 0 && (
          <div className="shrink-0 hidden lg:flex flex-col gap-1 text-xs text-right">
            <span className="text-bm-muted2 uppercase tracking-wide text-[10px] font-semibold">
              Jump to
            </span>
            {activeNotebook.highlights.map((h) => (
              <a
                key={h.label}
                href={`#section-${h.label.replace(/\s+/g, "-").toLowerCase()}`}
                className="text-bm-muted hover:text-bm-accent transition-colors"
              >
                {h.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Viewer */}
      <NotebookViewer
        key={activeId} // remount on tab change to reset scroll / fetch
        notebook={activeNotebook}
        defaultExpanded
        jumpToSection={sectionParam}
      />
    </div>
  );
}

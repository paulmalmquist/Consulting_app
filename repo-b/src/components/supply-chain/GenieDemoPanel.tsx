"use client";

import { useState } from "react";
import { MessageSquareText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, Pill, Section } from "./primitives";
import { GENIE_QA } from "@/lib/supply-chain/seed";

const CONFIDENCE_TONE: Record<string, string> = {
  High: "border-emerald-500/50 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  Medium: "border-amber-500/50 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
  Low: "border-rose-500/50 text-rose-700 dark:border-rose-400/40 dark:text-rose-300",
};

export default function GenieDemoPanel() {
  const [activeId, setActiveId] = useState<string>(GENIE_QA[0]?.id ?? "");
  const active = GENIE_QA.find((q) => q.id === activeId) ?? GENIE_QA[0];

  return (
    <>
      <Section
        title="Genie · Natural-language BI"
        caption="Grounded on certified Gold tables · static demo answers"
      >
        <div className="grid gap-3 lg:grid-cols-[280px,1fr]">
          <div className="space-y-1.5">
            {GENIE_QA.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setActiveId(q.id)}
                className={cn(
                  "block w-full rounded-md border px-3 py-2 text-left text-xs transition-[transform,box-shadow] duration-[120ms]",
                  q.id === active.id
                    ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                    : "border-bm-border/70 bg-bm-surface/30 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
                )}
              >
                <div className="flex items-start gap-2">
                  <MessageSquareText
                    size={13}
                    className={
                      q.id === active.id ? "mt-0.5 text-bm-accent" : "mt-0.5 text-bm-muted2"
                    }
                  />
                  <span>{q.question}</span>
                </div>
              </button>
            ))}
          </div>

          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                  Question
                </p>
                <p className="mt-1 text-sm font-medium text-bm-text">{active.question}</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border bg-transparent px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${CONFIDENCE_TONE[active.confidence]}`}
              >
                {active.confidence} confidence
              </span>
            </div>

            <div className="mt-4 rounded-md border border-bm-border/70 bg-bm-bg/40 p-3">
              <p className="text-xs text-bm-text">{active.narrative}</p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {active.metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-md border border-bm-border/70 bg-bm-surface/40 p-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                    {m.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-bm-text">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                  Source tables
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {active.sourceTables.map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                  Freshness
                </p>
                <p className="mt-1.5 text-xs text-bm-text">{active.freshness}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Suggested follow-ups
              </p>
              <ul className="mt-1.5 space-y-1">
                {active.followUps.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-xs text-bm-muted hover:text-bm-text"
                  >
                    <ChevronRight size={12} className="text-bm-accent" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </Section>
    </>
  );
}

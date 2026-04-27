import { Card, Pill, Section } from "./primitives";
import { ARCHITECTURE_CAPABILITIES, ARCHITECTURE_FLOW } from "@/lib/supply-chain/seed";

const COLUMN_TITLES = [
  { key: "sources", title: "Source Systems", caption: "ERP · WMS · TMS · MES · Procurement" },
  { key: "bronze", title: "Bronze · Raw", caption: "Append-only, schema-on-read" },
  { key: "silver", title: "Silver · Conformed", caption: "Cleansed, joined, modeled" },
  { key: "gold", title: "Gold · Data Products", caption: "Certified, business-owned" },
  { key: "consumers", title: "Consumers", caption: "Genie · ML · BI · APIs" },
] as const;

const COLUMN_TONE: Record<string, string> = {
  sources: "border-bm-border/70 bg-bm-surface/40",
  bronze: "border-amber-500/40 bg-amber-500/10 dark:border-amber-400/30 dark:bg-amber-400/5",
  silver: "border-slate-500/40 bg-slate-500/10 dark:border-slate-400/30 dark:bg-slate-400/5",
  gold: "border-yellow-500/40 bg-yellow-500/10 dark:border-yellow-400/30 dark:bg-yellow-400/5",
  consumers: "border-sky-500/40 bg-sky-500/10 dark:border-sky-400/30 dark:bg-sky-400/5",
};

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  in_flight: "In flight",
  planned: "Planned",
};

const STATUS_TONE: Record<string, string> = {
  live: "border-emerald-500/50 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  in_flight: "border-sky-500/50 text-sky-700 dark:border-sky-400/40 dark:text-sky-300",
  planned: "border-bm-border/70 text-bm-muted",
};

export default function ArchitectureFlow() {
  return (
    <>
      <Section title="Reference architecture" caption="Source → Bronze → Silver → Gold → Consumers">
        <div className="grid gap-3 lg:grid-cols-5">
          {COLUMN_TITLES.map((col) => {
            const items = ARCHITECTURE_FLOW[col.key as keyof typeof ARCHITECTURE_FLOW];
            return (
              <div
                key={col.key}
                className={`rounded-lg border p-3 ${COLUMN_TONE[col.key]}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
                  {col.title}
                </p>
                <p className="mt-1 text-[11px] text-bm-muted">{col.caption}</p>
                <ul className="mt-3 space-y-1.5">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="rounded border border-bm-border/70 bg-bm-bg/50 px-2 py-1.5 text-xs text-bm-text"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-bm-muted">
          Flow: append-only Bronze captures everything raw; Silver enforces conformed keys, SCD,
          and DQ expectations; Gold ships only certified, business-owned products.
        </p>
      </Section>

      <Section title="Platform capabilities" caption="Databricks-native">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ARCHITECTURE_CAPABILITIES.map((cap) => (
            <Card key={cap.key}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-bm-text">{cap.title}</p>
                <span
                  className={`inline-flex items-center rounded-full border bg-transparent px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${STATUS_TONE[cap.status]}`}
                >
                  {STATUS_LABEL[cap.status]}
                </span>
              </div>
              <p className="mt-2 text-xs text-bm-muted">{cap.blurb}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Decision record · Why these choices">
        <Card>
          <ul className="space-y-2 text-xs text-bm-muted">
            <li>
              <span className="text-bm-text">Delta Lake everywhere.</span> Single storage format
              for batch and streaming so the same reads back BI, ML, and APIs.
            </li>
            <li>
              <span className="text-bm-text">Unity Catalog as the access boundary.</span> Row
              filters and column masks are defined once and enforced for every consumer, including
              Genie.
            </li>
            <li>
              <span className="text-bm-text">Asset Bundles for CI/CD.</span> Source-controlled
              deploys per environment; no drift between dev and prod.
            </li>
            <li>
              <span className="text-bm-text">Genie grounded only on Gold.</span> Natural-language
              queries cannot resolve against uncertified tables; the metric registry is the source
              of truth.
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill>ADR-001 Delta + DLT</Pill>
            <Pill>ADR-002 UC governance</Pill>
            <Pill>ADR-003 Bundles for promotion</Pill>
            <Pill>ADR-004 Genie on Gold-only</Pill>
          </div>
        </Card>
      </Section>
    </>
  );
}

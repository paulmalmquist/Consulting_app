import { Card, HealthChip, MetaRow, Pill, Section } from "./primitives";
import { SOURCE_SYSTEMS } from "@/lib/supply-chain/seed";

export default function SourceSystemsPanel() {
  return (
    <Section title="Source systems" caption={`${SOURCE_SYSTEMS.length} connected`}>
      <div className="grid gap-3 lg:grid-cols-2">
        {SOURCE_SYSTEMS.map((sys) => (
          <Card key={sys.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-bm-text">{sys.name}</p>
                <p className="text-xs text-bm-muted2">
                  {sys.vendor} · {sys.domain}
                </p>
              </div>
              <HealthChip status={sys.health} />
            </div>

            <div className="mt-3 grid gap-1.5">
              <MetaRow label="Ingestion pattern" value={`${sys.ingestionPattern} · ${sys.cadence}`} />
              <MetaRow label="Freshness target" value={sys.freshness} />
              <MetaRow label="Owner" value={sys.owner} />
            </div>

            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">Critical entities</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sys.entities.map((e) => (
                  <Pill key={e}>{e}</Pill>
                ))}
              </div>
            </div>

            {sys.qualityIssues.length ? (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                  Quality issues
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-bm-muted">
                  {sys.qualityIssues.map((q) => (
                    <li key={q} className="flex gap-2">
                      <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-amber-500/70" />
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 rounded-md border border-bm-accent/25 bg-bm-accent/5 p-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-accent">
                AI profiling output
              </p>
              <p className="mt-1 text-xs text-bm-text">{sys.aiProfile}</p>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

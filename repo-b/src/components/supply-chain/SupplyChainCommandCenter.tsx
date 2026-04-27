import { Card, HealthChip, MetaRow, PageHeader, Section } from "./primitives";
import {
  COMMAND_CENTER_KPIS,
  NEXT_MOVES,
  OPEN_RISKS,
} from "@/lib/supply-chain/seed";

function deltaTone(tone?: "up" | "down" | "flat"): string {
  if (tone === "up") return "text-emerald-600 dark:text-emerald-300";
  if (tone === "down") return "text-rose-600 dark:text-rose-300";
  return "text-bm-muted";
}

export default function SupplyChainCommandCenter() {
  return (
    <>
      <PageHeader
        eyebrow="Command Center"
        title="Supply Chain Data Platform"
        blurb="The lakehouse build status across source coverage, pipeline health, governance, and AI-accelerated SDLC. Live demo data; replace with API in next pass."
      />

      <Section title="Platform signals" caption="Updated 12 min ago">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {COMMAND_CENTER_KPIS.map((kpi) => (
            <Card key={kpi.key}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">
                {kpi.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-bm-text">{kpi.value}</p>
              {kpi.delta ? (
                <p className={`mt-1 text-xs ${deltaTone(kpi.deltaTone)}`}>{kpi.delta}</p>
              ) : null}
              <p className="mt-2 text-xs text-bm-muted">{kpi.caption}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Open risks" caption={`${OPEN_RISKS.length} active`}>
        <div className="grid gap-3 lg:grid-cols-2">
          {OPEN_RISKS.map((risk) => (
            <Card key={risk.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-bm-text">{risk.title}</p>
                <HealthChip status={risk.severity} />
              </div>
              <p className="mt-2 text-xs text-bm-muted">{risk.detail}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                {risk.owner}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Next build moves" caption="Sequenced, not aspirational">
        <div className="grid gap-3 lg:grid-cols-3">
          {NEXT_MOVES.map((move) => (
            <Card key={move.id}>
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center rounded-full border border-bm-border/70 bg-bm-surface/40 px-2 py-0.5 text-[11px] text-bm-muted">
                  Size {move.size}
                </span>
                <span className="text-[11px] text-bm-muted2">{move.eta}</span>
              </div>
              <p className="text-sm font-medium text-bm-text">{move.title}</p>
              <p className="mt-2 text-xs text-bm-muted">{move.detail}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Quick reads">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-medium text-bm-text">Source-system coverage</p>
            <div className="mt-3 space-y-2">
              <MetaRow label="Wired (live ingest)" value="6 systems" />
              <MetaRow label="In flight" value="2 systems" />
              <MetaRow label="Backlog" value="1 system (supplier portal)" />
            </div>
          </Card>
          <Card>
            <p className="text-sm font-medium text-bm-text">AI acceleration this sprint</p>
            <div className="mt-3 space-y-2">
              <MetaRow label="Avg story cycle (was)" value="11 days" />
              <MetaRow label="Avg story cycle (now)" value="3.2 days" />
              <MetaRow label="Generated artifacts reviewed" value="84 of 91 accepted" />
            </div>
          </Card>
        </div>
      </Section>
    </>
  );
}

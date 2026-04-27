import { Card, Section } from "./primitives";
import { ROADMAP_PHASES } from "@/lib/supply-chain/seed";

export default function RoadmapTimeline() {
  return (
    <Section title="90-day delivery roadmap" caption="5 phases · sequenced, not overlapping">
      <div className="grid gap-3 lg:grid-cols-5">
        {ROADMAP_PHASES.map((phase, idx) => (
          <Card key={phase.id} className="relative">
            <span className="absolute -top-2 left-3 inline-flex items-center rounded-full border border-bm-accent/35 bg-bm-bg px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-bm-accent">
              Phase {idx + 1}
            </span>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
              {phase.weeks}
            </p>
            <p className="mt-1 text-sm font-semibold text-bm-text">{phase.title}</p>

            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Goals</p>
              <ul className="mt-1.5 space-y-1 text-xs text-bm-muted">
                {phase.goals.map((g) => (
                  <li key={g} className="flex gap-2">
                    <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-bm-accent" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Deliverables
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-bm-text">
                {phase.deliverables.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </div>

            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 dark:border-amber-400/25 dark:bg-amber-400/5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                Risks &amp; mitigation
              </p>
              <ul className="mt-1 space-y-1.5 text-xs text-bm-text">
                {phase.risks.map((r) => (
                  <li key={r.risk}>
                    <span className="block">{r.risk}</span>
                    <span className="block text-bm-muted">→ {r.mitigation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

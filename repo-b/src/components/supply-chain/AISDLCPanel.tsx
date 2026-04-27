import { Card, Section } from "./primitives";
import { AI_SDLC_PHASES } from "@/lib/supply-chain/seed";

export default function AISDLCPanel() {
  return (
    <Section title="Six-phase AI SDLC" caption="Human controls the gate; AI does the lift">
      <div className="grid gap-3 lg:grid-cols-2">
        {AI_SDLC_PHASES.map((phase) => (
          <Card key={phase.id}>
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-bm-accent/35 bg-bm-accent/10 font-mono text-sm font-semibold text-bm-accent">
                {phase.number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-bm-text">{phase.title}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                  Human owns
                </p>
                <p className="mt-1 text-xs text-bm-muted">{phase.human}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-accent">
                  AI accelerates
                </p>
                <ul className="mt-1 space-y-1 text-xs text-bm-text">
                  {phase.aiAccelerates.map((a) => (
                    <li key={a} className="flex gap-2">
                      <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-bm-accent" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-bm-border/70 bg-bm-bg/40 p-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                  Sample artifact
                </p>
                <p className="mt-1 font-mono text-[11px] text-bm-text">{phase.artifact}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                  Promotion gate
                </p>
                <p className="mt-1 text-xs text-bm-muted">{phase.gate}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

import { Card, MetaRow, Pill, Section } from "./primitives";
import { ML_MODELS } from "@/lib/supply-chain/seed";

export default function ForecastingPanel() {
  return (
    <Section title="Forecasting & ML use cases" caption={`${ML_MODELS.length} models · Mosaic AI registry`}>
      <div className="grid gap-3 lg:grid-cols-2">
        {ML_MODELS.map((m) => (
          <Card key={m.id}>
            <p className="text-sm font-semibold text-bm-text">{m.name}</p>
            <p className="mt-1 text-xs text-bm-muted2">Target · {m.target}</p>

            <div className="mt-3 grid gap-1.5">
              <MetaRow label="Retraining" value={m.retrain} />
              <MetaRow label="Confidence" value={m.confidence} />
            </div>

            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Feature set
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.features.map((f) => (
                  <Pill key={f}>{f}</Pill>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Top drivers
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-bm-muted">
                {m.drivers.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </div>

            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 dark:border-amber-400/25 dark:bg-amber-400/5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                Caveats
              </p>
              <p className="mt-1 text-xs text-bm-text">{m.caveats}</p>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

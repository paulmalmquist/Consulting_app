import { Card, HealthChip, Section } from "./primitives";
import { PIPELINE_TABLES, type PipelineTable } from "@/lib/supply-chain/seed";

const LAYER_TONE: Record<PipelineTable["layer"], string> = {
  Bronze: "border-amber-500/40 text-amber-700 bg-amber-500/10 dark:border-amber-400/40 dark:text-amber-300 dark:bg-amber-400/10",
  Silver: "border-slate-500/40 text-slate-700 bg-slate-500/10 dark:border-slate-400/40 dark:text-slate-300 dark:bg-slate-400/10",
  Gold: "border-yellow-500/40 text-yellow-700 bg-yellow-500/10 dark:border-yellow-400/40 dark:text-yellow-300 dark:bg-yellow-400/10",
};

function LayerBadge({ layer }: { layer: PipelineTable["layer"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${LAYER_TONE[layer]}`}
    >
      {layer}
    </span>
  );
}

export default function PipelineInventory() {
  const grouped: Record<PipelineTable["layer"], PipelineTable[]> = {
    Bronze: [],
    Silver: [],
    Gold: [],
  };
  for (const t of PIPELINE_TABLES) grouped[t.layer].push(t);

  return (
    <>
      {(["Bronze", "Silver", "Gold"] as const).map((layer) => (
        <Section
          key={layer}
          title={`${layer} layer`}
          caption={`${grouped[layer].length} tables · DLT-managed`}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {grouped[layer].map((t) => (
              <Card key={t.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <LayerBadge layer={t.layer} />
                      <p className="truncate text-sm font-mono font-semibold text-bm-text">
                        {t.name}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-bm-muted2">{t.source}</p>
                  </div>
                  <HealthChip status={t.lastRunStatus} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Rows</p>
                    <p className="mt-0.5 text-sm text-bm-text">{t.rowCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Last run</p>
                    <p className="mt-0.5 text-sm text-bm-text">{t.lastRun}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Owner</p>
                    <p className="mt-0.5 text-sm text-bm-text">{t.owner}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-bm-border/70 bg-bm-bg/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                    DLT expectations
                  </p>
                  <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-bm-text">
                    {t.expectations.map((e) => (
                      <li key={e}>· {e}</li>
                    ))}
                  </ul>
                </div>

                {t.notes ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t.notes}</p>
                ) : null}
              </Card>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

import { Card, Pill, Section, TrustBadge } from "./primitives";
import {
  GOVERNANCE_ACCESS_GROUPS,
  GOVERNANCE_TABLES,
  LINEAGE_EXAMPLE,
} from "@/lib/supply-chain/seed";

const CLASS_TONE: Record<string, string> = {
  Public: "border-bm-border/70 text-bm-muted",
  Internal: "border-sky-500/40 text-sky-700 dark:border-sky-400/40 dark:text-sky-300",
  Confidential:
    "border-amber-500/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
  Restricted:
    "border-rose-500/40 text-rose-700 dark:border-rose-400/40 dark:text-rose-300",
};

export default function GovernanceMatrix() {
  return (
    <>
      <Section title="Catalog hierarchy" caption="Unity Catalog · supply_chain_prod">
        <div className="grid gap-3 lg:grid-cols-2">
          {GOVERNANCE_TABLES.map((t) => (
            <Card key={`${t.schema}.${t.table}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-bm-muted2">
                    {t.catalog}.{t.schema}
                  </p>
                  <p className="font-mono text-sm font-semibold text-bm-text">{t.table}</p>
                </div>
                <TrustBadge trust={t.certified} />
              </div>

              {t.rowFilter ? (
                <div className="mt-3 rounded-md border border-bm-border/70 bg-bm-bg/40 p-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                    Row filter
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-bm-text">{t.rowFilter}</p>
                </div>
              ) : null}
              {t.columnRule ? (
                <div className="mt-2 rounded-md border border-bm-border/70 bg-bm-bg/40 p-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                    Column rule
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-bm-text">{t.columnRule}</p>
                </div>
              ) : null}

              <div className="mt-3 overflow-hidden rounded-md border border-bm-border/70">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bm-surface/40 text-bm-muted2">
                      <th className="px-2 py-1.5 text-left font-medium">Field</th>
                      <th className="px-2 py-1.5 text-left font-medium">Class</th>
                      <th className="px-2 py-1.5 text-left font-medium">PII</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.fields.map((f) => (
                      <tr
                        key={f.field}
                        className="border-t border-bm-border/70 align-top"
                      >
                        <td className="px-2 py-1.5 font-mono text-bm-text">{f.field}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] ${CLASS_TONE[f.classification]}`}
                          >
                            {f.classification}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-bm-muted">
                          {f.pii ? "Yes" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Access groups" caption={`${GOVERNANCE_ACCESS_GROUPS.length} groups`}>
        <div className="grid gap-3 lg:grid-cols-2">
          {GOVERNANCE_ACCESS_GROUPS.map((g) => (
            <Card key={g.group}>
              <p className="font-mono text-sm font-semibold text-bm-text">{g.group}</p>
              <p className="mt-1 text-xs text-bm-muted">{g.description}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                {g.tableCount} tables in scope
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Lineage example" caption={LINEAGE_EXAMPLE.target}>
        <Card>
          <div className="grid gap-3 lg:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Bronze sources
              </p>
              <ul className="mt-2 space-y-1.5">
                {LINEAGE_EXAMPLE.upstreamSources.map((u) => (
                  <li key={u} className="font-mono text-xs text-bm-text">{u}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Silver upstream
              </p>
              <ul className="mt-2 space-y-1.5">
                {LINEAGE_EXAMPLE.upstream.map((u) => (
                  <li key={u} className="font-mono text-xs text-bm-text">{u}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Downstream consumers
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LINEAGE_EXAMPLE.downstream.map((d) => (
                  <Pill key={d}>{d}</Pill>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </Section>
    </>
  );
}

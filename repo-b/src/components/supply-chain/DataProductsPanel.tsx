import { Card, MetaRow, Pill, Section, TrustBadge } from "./primitives";
import { DATA_PRODUCTS } from "@/lib/supply-chain/seed";

export default function DataProductsPanel() {
  return (
    <Section title="Certified data products" caption={`${DATA_PRODUCTS.length} products · business-owned`}>
      <div className="grid gap-3 lg:grid-cols-2">
        {DATA_PRODUCTS.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-bm-text">{p.name}</p>
                <p className="text-xs text-bm-muted2">{p.domain} domain · {p.refreshCadence}</p>
              </div>
              <TrustBadge trust={p.trust} />
            </div>

            <div className="mt-3 grid gap-1.5">
              <MetaRow label="Business owner" value={p.businessOwner} />
              <MetaRow label="Data owner" value={p.dataOwner} />
              <MetaRow label="SLA" value={p.sla} />
            </div>

            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Certified metrics
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {p.certifiedMetrics.map((m) => (
                  <Pill key={m}>{m}</Pill>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Downstream consumers
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-bm-muted">
                {p.consumers.map((c) => (
                  <li key={c}>· {c}</li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

import Link from "next/link";

const CARDS = [
  {
    href: "/app/finance/repe",
    title: "REPE Waterfalls",
    description: "Fund setup, commitments, capital calls, and deterministic waterfall runs.",
  },
  {
    href: "/app/finance/underwriting",
    title: "Underwriting",
    description: "Cited market/comps ingest, scenario levers, and reproducible IC/appraisal artifacts.",
  },
  {
    href: "/app/finance/legal",
    title: "Legal Economics",
    description: "Matter-level economics, trust ledger segregation, and contingency runs.",
  },
  {
    href: "/app/finance/healthcare",
    title: "Healthcare / MSO",
    description: "MSO-clinic-provider economics, provider comp, and claims reconciliation.",
  },
  {
    href: "/app/finance/construction",
    title: "Construction",
    description: "CSI budget versions, commitments, and forecast-at-completion runs.",
  },
  {
    href: "/app/finance/scenarios",
    title: "Scenario Lab",
    description: "Snapshot live baselines, spin simulations, and diff against production.",
  },
  {
    href: "/app/finance/security",
    title: "Security & ACL",
    description: "Entity access controls and field segregation policy surfaces.",
  },
];

export default function FinanceIndexPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Finance v1</p>
        <h1 className="text-2xl font-bold">Deterministic Financial Engine</h1>
        <p className="text-sm text-bm-muted max-w-3xl">
          Unified accounting core for REPE, Legal, Healthcare/MSO, and Construction. All
          calculations execute server-side and persist as structured ledgers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bm-glass-interactive rounded-xl p-4 space-y-2"
          >
            <h2 className="text-lg font-semibold">{card.title}</h2>
            <p className="text-sm text-bm-muted2">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

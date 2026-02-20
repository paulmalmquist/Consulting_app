import Link from "next/link";

export default function RepeDealsPage() {
  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2">
      <h2 className="text-lg font-semibold">Deals Workspace</h2>
      <p className="text-sm text-bm-muted2">Underwriting is deal-scoped in REPE.</p>
      <Link href="/app/finance/underwriting" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
        Open Underwriting
      </Link>
    </section>
  );
}

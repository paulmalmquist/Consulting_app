import Link from "next/link";

export default function RepeDocumentsPage() {
  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2">
      <h2 className="text-lg font-semibold">Documents</h2>
      <p className="text-sm text-bm-muted2">Link diligence and legal docs to funds, deals, and assets.</p>
      <Link href="/documents" className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
        Open Documents
      </Link>
    </section>
  );
}

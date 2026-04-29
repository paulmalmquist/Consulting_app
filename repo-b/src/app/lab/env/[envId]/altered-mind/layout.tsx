import Link from "next/link";

export default async function AlteredMindLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ envId: string }>;
}) {
  const { envId } = await params;
  const base = `/lab/env/${envId}/altered-mind`;
  return (
    <div className="flex min-h-screen bg-[rgb(var(--nv-bg))] text-[rgb(var(--nv-text-primary))]">
      <aside className="w-56 shrink-0 border-r border-white/5 px-4 py-6">
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">Altered Mind</p>
          <p className="mt-1 text-sm text-white/80">Practice tracker</p>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href={base} className="rounded px-2 py-1.5 text-white/80 hover:bg-white/5">
            Dashboard
          </Link>
          <Link href={`${base}/trends`} className="rounded px-2 py-1.5 text-white/80 hover:bg-white/5">
            Trends
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

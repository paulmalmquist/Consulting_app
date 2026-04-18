"use client";

export default function RevenueWatchPanel() {
  return (
    <section className="rounded border border-slate-800 bg-slate-900/60" data-testid="rail-revenue-watch">
      <header className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">
          Revenue Watch
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">phase 2</span>
      </header>
      <div className="px-3 py-3 text-xs text-slate-400">
        AR aging + overdue invoice monitoring ships after the invoicing module.
      </div>
    </section>
  );
}

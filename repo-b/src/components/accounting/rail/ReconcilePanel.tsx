"use client";

export default function ReconcilePanel() {
  return (
    <section className="rounded border border-slate-800 bg-slate-900/60" data-testid="rail-reconcile">
      <header className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-amber-500/15 via-transparent to-transparent px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-amber-200">
          Reconciliation
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">phase 2</span>
      </header>
      <div className="px-3 py-3 text-xs text-slate-400">
        Bank + CC transaction matching goes live when the import pipeline lands.
        Receipts currently queue as <span className="text-amber-300">unmatched</span> until then.
      </div>
    </section>
  );
}

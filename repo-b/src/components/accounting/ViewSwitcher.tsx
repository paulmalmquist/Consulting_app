"use client";

export type AccountingView = "needs" | "txns" | "recs" | "subs" | "invs";

export type ViewSwitcherProps = {
  value: AccountingView;
  onChange: (v: AccountingView) => void;
  counts: Record<AccountingView, number>;
};

const TABS: Array<{ id: AccountingView; label: string; accent: string }> = [
  { id: "needs", label: "Needs Attention", accent: "border-cyan-400 text-cyan-300" },
  { id: "subs",  label: "Subscriptions",   accent: "border-violet-400 text-violet-300" },
  { id: "recs",  label: "Receipts",        accent: "border-emerald-400 text-emerald-300" },
  { id: "txns",  label: "Transactions",    accent: "border-amber-400 text-amber-200" },
  { id: "invs",  label: "Invoices",        accent: "border-rose-400 text-rose-300" },
];

export default function ViewSwitcher({ value, onChange, counts }: ViewSwitcherProps) {
  return (
    <div
      className="flex flex-none items-center gap-1 border-b border-slate-800 bg-slate-950 px-3"
      role="tablist"
      data-testid="accounting-view-switcher"
    >
      {TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-medium transition ${
              active
                ? tab.accent + " bg-slate-900/60"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            data-testid={`view-tab-${tab.id}`}
          >
            {tab.label}
            <span className="rounded-full border border-slate-700 bg-slate-900 px-1.5 py-0 font-mono text-[10px] tabular-nums text-slate-400">
              {counts[tab.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

"use client";

export default function EmptyStateTable({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{title}</div>
        <div className="mt-2 text-sm text-slate-400">{subtitle}</div>
      </div>
    </div>
  );
}

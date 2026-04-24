export function SloganBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border border-nv-teal/25 bg-nv-teal/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-nv-teal ${className}`.trim()}
    >
      Own Your Operating Logic
    </span>
  );
}

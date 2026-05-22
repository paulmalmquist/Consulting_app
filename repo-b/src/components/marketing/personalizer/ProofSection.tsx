/**
 * ProofSection — operator-supplied proof bullets for a microsite.
 *
 * Phase 4. These are NOT AI-generated — they are short operator-written
 * claims (capped to 5 server-side). Renders nothing when the operator
 * provided none, so a microsite without proof points simply omits the block.
 */
type ProofSectionProps = {
  points: string[];
  accentHsl?: string | null;
};

export function ProofSection({ points, accentHsl }: ProofSectionProps) {
  const accent = accentHsl ? `hsl(${accentHsl})` : "rgb(125 211 252)";
  if (!points || points.length === 0) return null;
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-7">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
        Why this is credible
      </p>
      <ul className="mt-4 space-y-3">
        {points.map((point, idx) => (
          <li key={idx} className="flex gap-3 text-sm leading-relaxed text-white/75">
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

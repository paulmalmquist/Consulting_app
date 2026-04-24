import Link from 'next/link';

export function Hero({
  headline,
  subheadline,
  pillars
}: {
  headline: string;
  subheadline: string;
  pillars: string[];
}) {
  return (
    <section className="grid gap-8 rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-8 md:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.4em] text-nv-teal/80">Intent-first internal support</p>
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-6xl">{headline}</h1>
        <p className="max-w-prose text-base leading-relaxed text-nv-muted md:text-lg">{subheadline}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-[4px] border border-nv-teal/18 bg-nv-surface/70 px-5 py-2 text-sm font-semibold text-nv-teal transition hover:border-nv-teal/18 hover:bg-nv-teal/10"
          >
            See how this works safely
          </Link>
          <Link
            href="/contact"
            className="rounded-full border border-nv-text/16 px-5 py-2 text-sm font-semibold text-nv-text hover:border-nv-text/20"
          >
            Start with a Proof-of-Concept
          </Link>
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-nv-text/10 bg-gradient-to-b from-slate-800/60 to-slate-900/90 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-nv-dim">Proof points</p>
        <ul className="space-y-3 text-xs tracking-wide text-nv-muted">
          {pillars.map((pillar) => (
            <li key={pillar}>{pillar}</li>
          ))}
        </ul>
        <div className="rounded-xl border border-nv-text/10 bg-nv-surface/70 p-4 text-xs text-nv-muted">
          <p className="font-semibold text-white">Operator stance</p>
          <p className="mt-2">
            Systems of record stay. Systems of work get redesigned with governance, auditability, and explicit human
            oversight.
          </p>
        </div>
      </div>
    </section>
  );
}

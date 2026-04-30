type CredibilitySectionProps = {
  className?: string;
  headline?: string;
  intro?: string;
  pillars?: Array<{ title: string; description: string }>;
  showTrustAmplifiers?: boolean;
};

const AUTHORITY_BLOCKS = [
  {
    title: 'Operator-Led Approach',
    description: 'Grounded in risk, operations, and data strategy.'
  },
  {
    title: 'Industry Focused',
    description: 'Deep experience across credit, real estate, and financial services.'
  },
  {
    title: 'Outcome Driven',
    description: 'Every engagement tied to measurable impact.'
  },
  {
    title: 'Enterprise Mindset',
    description: 'Built to support complex organizations and leadership teams.'
  }
];

const TRUST_AMPLIFIERS = [
  'Selected by leadership teams to evaluate operational infrastructure',
  'Supporting organizations navigating AI adoption',
  'Helping firms modernize internal systems'
];

export function CredibilitySection({
  className = '',
  headline = 'Built for Operators Who Value Performance',
  intro,
  pillars = AUTHORITY_BLOCKS,
  showTrustAmplifiers = true
}: CredibilitySectionProps) {
  return (
    <section className={`rounded-3xl border border-nv-text/10 bg-nv-surface/55 p-6 sm:p-8 ${className}`.trim()}>
      <p className="text-sm uppercase tracking-[0.2em] text-nv-teal">Credibility</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-nv-text md:text-3xl">{headline}</h2>
      {intro ? <p className="mt-3 max-w-4xl text-sm leading-relaxed text-nv-muted sm:text-base">{intro}</p> : null}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {pillars.map((block) => (
          <article key={block.title} className="rounded-2xl border border-nv-text/8 bg-nv-bg/80 p-4">
            <h3 className="text-base font-semibold text-nv-text">{block.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-nv-muted">{block.description}</p>
          </article>
        ))}
      </div>
      {showTrustAmplifiers ? (
        <div className="mt-5 rounded-2xl border border-nv-text/8 bg-nv-bg/80 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-nv-dim">Trust Amplifiers</p>
          <ul className="mt-3 space-y-2 text-sm text-nv-text">
            {TRUST_AMPLIFIERS.map((item) => (
              <li key={item} className="rounded-xl border border-nv-text/10 bg-nv-surface/60 p-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

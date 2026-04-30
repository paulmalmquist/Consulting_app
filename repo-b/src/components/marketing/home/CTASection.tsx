import Link from 'next/link';

type CTASectionProps = {
  headline: string;
  body: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
};

export function CTASection({ headline, body, primaryCta, secondaryCta }: CTASectionProps) {
  return (
    <section className="flex flex-col gap-6 rounded-3xl border border-nv-text/16 bg-nv-surface/70 p-8 md:flex-row md:items-center md:justify-between">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-nv-text md:text-3xl">{headline}</h2>
        <p className="text-base leading-relaxed text-nv-text">{body}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={primaryCta.href}
          className="rounded-full border border-nv-text/20 bg-nv-text/[0.05] px-6 py-3 text-sm font-semibold text-nv-text transition hover:border-nv-text/35 hover:bg-nv-text/[0.09]"
        >
          {primaryCta.label}
        </Link>
        <Link
          href={secondaryCta.href}
          className="rounded-full border border-nv-text/20 px-6 py-3 text-sm font-semibold text-nv-text transition hover:border-nv-text/40 hover:bg-nv-text/10"
        >
          {secondaryCta.label}
        </Link>
      </div>
    </section>
  );
}

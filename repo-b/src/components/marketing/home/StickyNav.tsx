import Link from 'next/link';

export type NavLink = {
  label: string;
  href: string;
};

type StickyNavProps = {
  logo: { label: string; href: string };
  links: NavLink[];
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
};

export function StickyNav({ logo, links, primaryCta, secondaryCta }: StickyNavProps) {
  return (
    <nav className="sticky top-0 z-40 hidden border-b border-nv-text/8 bg-nv-bg/90 backdrop-blur md:block">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-6 px-4 py-4 md:px-6">
        <div className="flex items-center gap-4 text-sm font-medium text-nv-muted">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-nv-text">
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={secondaryCta.href}
            className="rounded-full border border-nv-text/12 px-4 py-2 text-xs font-semibold text-nv-text transition hover:border-nv-text/20 hover:bg-nv-text/5"
          >
            {secondaryCta.label}
          </Link>
          <Link
            href={primaryCta.href}
            className="rounded-full border border-nv-text/20 bg-nv-text/[0.05] px-4 py-2 text-xs font-semibold text-nv-text transition hover:border-nv-text/35 hover:bg-nv-text/[0.09]"
          >
            {primaryCta.label}
          </Link>
        </div>
      </div>
    </nav>
  );
}

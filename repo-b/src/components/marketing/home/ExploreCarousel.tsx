import Link from 'next/link';

type ExploreTile = {
  title: string;
  description: string;
  href: string;
};

type ExploreCarouselProps = {
  title: string;
  subtitle: string;
  tiles: ExploreTile[];
};

export function ExploreCarousel({ title, subtitle, tiles }: ExploreCarouselProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{title}</h2>
          <p className="text-base leading-relaxed text-nv-muted">{subtitle}</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
        {tiles.map((tile) => (
          <Link
            key={tile.title}
            href={tile.href}
            className="group min-w-[240px] snap-start rounded-2xl border border-white/8 bg-nv-bg/40 p-4 transition hover:border-white/18 hover:bg-nv-surface/70 md:min-w-0"
            aria-label={tile.title}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] text-sm font-semibold text-white/80">
                {tile.title.slice(0, 1)}
              </div>
              <span className="text-lg text-nv-faint transition group-hover:text-white/70">›</span>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-white">{tile.title}</p>
              <p className="text-sm leading-relaxed text-nv-muted">{tile.description}</p>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/70 transition group-hover:border-white/22 group-hover:bg-white/[0.07]">
                Explore
                <span aria-hidden="true">›</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

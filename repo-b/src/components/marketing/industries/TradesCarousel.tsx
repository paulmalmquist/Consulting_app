'use client';

import useEmblaCarousel from 'embla-carousel-react';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { IconChevronLeft, IconChevronRight } from '@/components/marketing/ui/icons';

type TradesCarouselItem = {
  title: string;
  description: string;
};

type TradesCarouselProps = {
  title: string;
  items: TradesCarouselItem[];
};

export function TradesCarousel({ title, items }: TradesCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start', dragFree: true });

  return (
    <div>
      <div className="nv-section-head">
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Built for the field
        </p>
      </div>
      <h2 className="nv-h2" style={{ marginBottom: 16 }}>
        {title}
      </h2>

      <div className="relative" style={{ marginTop: 36 }}>
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-4">
            {items.map((item) => (
              <div
                key={item.title}
                className="min-w-[260px] flex-[0_0_85%] md:flex-[0_0_46%] lg:flex-[0_0_31%]"
              >
                <NvCard>
                  <h3 className="nv-h3" style={{ marginBottom: 12 }}>
                    {item.title}
                  </h3>
                  <p className="nv-body" style={{ margin: 0 }}>
                    {item.description}
                  </p>
                </NvCard>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute -top-12 right-0 hidden items-center gap-2 md:flex">
          <button
            type="button"
            className="pointer-events-auto rounded-full border border-nv-text/20 bg-nv-surface/80 p-2 text-nv-text transition hover:border-nv-text/35"
            onClick={() => emblaApi?.scrollPrev()}
            aria-label="Previous"
          >
            <IconChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="pointer-events-auto rounded-full border border-nv-text/20 bg-nv-surface/80 p-2 text-nv-text transition hover:border-nv-text/35"
            onClick={() => emblaApi?.scrollNext()}
            aria-label="Next"
          >
            <IconChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

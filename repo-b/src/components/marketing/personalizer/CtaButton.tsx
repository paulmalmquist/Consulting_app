"use client";

/**
 * CtaButton — primary call to action. Fires a microsite_cta track event
 * (fire-and-forget) before following the link (mailto or scheduling URL).
 */
type CtaButtonProps = {
  label: string;
  href: string;
  accentHsl?: string | null;
  onTrack: () => void;
};

export function CtaButton({ label, href, accentHsl, onTrack }: CtaButtonProps) {
  const accent = accentHsl ? `hsl(${accentHsl})` : "rgb(125 211 252)";
  return (
    <section className="flex flex-col items-center gap-3 py-4 text-center">
      <a
        href={href}
        onClick={() => onTrack()}
        className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
        style={{ backgroundColor: accent }}
      >
        {label}
      </a>
      <p className="text-xs text-white/40">
        No deck and no pitch. Just the working system.
      </p>
    </section>
  );
}

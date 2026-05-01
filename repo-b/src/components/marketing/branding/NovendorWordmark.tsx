/**
 * <NovendorWordmark />
 *
 * Vector wordmark for the literal text "NOVENDOR". Designed to read at
 * small sizes (sidebar, topbar) and scale up cleanly for hero treatments.
 *
 * NOTE — placeholder geometry: the paths below are a stand-in until the
 * production wordmark SVG (from the typography brief) lands. When the
 * real artwork arrives, replace the <path> elements only — the component
 * API (color via currentColor, sizing via height prop) stays.
 *
 * Use the .novendor-wordmark utility class to wrap this component when
 * you need to apply branding-only styling (drop shadow, glow, etc.) so
 * the rules don't bleed into UI text.
 */

type NovendorWordmarkProps = {
  /** Rendered height in pixels. Width auto-scales from the viewBox. */
  height?: number;
  className?: string;
  /** Accessible label. Defaults to "Novendor". */
  title?: string;
};

export function NovendorWordmark({
  height = 18,
  className,
  title = 'Novendor',
}: NovendorWordmarkProps) {
  return (
    <svg
      role="img"
      aria-label={title}
      height={height}
      viewBox="0 0 360 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block' }}
    >
      <title>{title}</title>
      {/* TODO: replace with the production traced wordmark.
          Until then, render the literal text in the existing display
          font so the chrome stays readable. */}
      <text
        x="0"
        y="36"
        fill="currentColor"
        fontFamily='"Abadi", "Abadi MT", "Gill Sans", "Gill Sans MT", Verdana, ui-sans-serif, sans-serif'
        fontSize="32"
        fontWeight={500}
        letterSpacing="0.14em"
      >
        NOVENDOR
      </text>
    </svg>
  );
}

/**
 * <NovendorLockup />
 *
 * Compact lockup: NV mark + "novendor" wordmark side-by-side, used
 * wherever you need both glyphs (about-page hero, social card).
 *
 * Same placeholder rules apply — replace inner geometry when the real
 * artwork lands.
 */
type NovendorLockupProps = {
  height?: number;
  className?: string;
};

export function NovendorLockup({ height = 36, className }: NovendorLockupProps) {
  return (
    <svg
      role="img"
      aria-label="Novendor"
      height={height}
      viewBox="0 0 360 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block' }}
    >
      <title>Novendor</title>
      {/* TODO: replace with the production NV mark + wordmark lockup. */}
      <rect
        x="2"
        y="8"
        width="64"
        height="64"
        rx="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <text
        x="34"
        y="54"
        textAnchor="middle"
        fill="currentColor"
        fontFamily='"Abadi", "Abadi MT", "Gill Sans", "Gill Sans MT", Verdana, ui-sans-serif, sans-serif'
        fontSize="36"
        fontWeight={500}
      >
        NV
      </text>
      <text
        x="86"
        y="52"
        fill="currentColor"
        fontFamily='"Abadi", "Abadi MT", "Gill Sans", "Gill Sans MT", Verdana, ui-sans-serif, sans-serif'
        fontSize="32"
        fontWeight={500}
        letterSpacing="0.06em"
      >
        novendor
      </text>
    </svg>
  );
}

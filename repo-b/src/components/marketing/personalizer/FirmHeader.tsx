/**
 * FirmHeader — personalized microsite header for one targeted firm.
 * Renders the firm logo when supplied, otherwise a tasteful text-based mark.
 */
type FirmHeaderProps = {
  name: string;
  logoUrl?: string | null;
  accentHsl?: string | null;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function FirmHeader({ name, logoUrl, accentHsl }: FirmHeaderProps) {
  const accent = accentHsl ? `hsl(${accentHsl})` : "rgb(125 211 252)";
  return (
    <header className="flex flex-col items-center gap-5 py-12 text-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-14 w-auto object-contain"
        />
      ) : (
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl border text-lg font-semibold tracking-tight"
          style={{ borderColor: accent, color: accent }}
        >
          {initials(name)}
        </div>
      )}
      <div className="space-y-2">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.22em]"
          style={{ color: accent }}
        >
          Prepared by Novendor for
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {name}
        </h1>
        <p className="mx-auto max-w-xl text-sm text-white/55">
          A focused look at where controlled internal systems would change how your
          team operates — built and shown as working software, not slideware.
        </p>
      </div>
    </header>
  );
}

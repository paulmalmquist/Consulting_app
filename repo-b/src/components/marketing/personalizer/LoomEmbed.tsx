/**
 * LoomEmbed — renders a personal video when a Loom URL exists, otherwise a
 * tasteful "Personal video pending" state. Never renders a broken embed.
 */
type LoomEmbedProps = {
  url?: string | null;
  state: "ready" | "pending";
};

function toEmbedUrl(url: string): string | null {
  // Accept https://www.loom.com/share/<id> (with optional query) → /embed/<id>
  const m = url.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/);
  if (!m) return null;
  return `https://www.loom.com/embed/${m[1]}`;
}

export function LoomEmbed({ url, state }: LoomEmbedProps) {
  const embed = state === "ready" && url ? toEmbedUrl(url) : null;

  if (!embed) {
    return (
      <section className="mx-auto max-w-3xl">
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
          <p className="text-sm font-medium text-white/75">Personal video pending</p>
          <p className="max-w-md text-xs text-white/45">
            A short walkthrough recorded specifically for your team is on its way.
            Everything below stands on its own in the meantime.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 pb-[56.25%]">
        <iframe
          src={embed}
          title="Personal walkthrough"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </section>
  );
}

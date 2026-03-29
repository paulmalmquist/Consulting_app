import Link from "next/link";
import { environmentCatalog, type EnvironmentSlug } from "@/lib/environmentAuth";

const ENVIRONMENT_ORDER: EnvironmentSlug[] = ["novendor", "trading", "floyorker", "resume"];
const ENVIRONMENT_STATUS: Record<EnvironmentSlug, string> = {
  novendor: "Primary operating environment",
  trading: "Higher-sensitivity market workspace",
  floyorker: "Editorial and publishing environment",
  resume: "Public portfolio with private owner tools",
};
const ENVIRONMENT_HREF: Record<EnvironmentSlug, string> = {
  novendor: "/novendor",
  trading: "/trading",
  floyorker: "/floyorker",
  resume: "/resume",
};

export default function HomePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#05070b] px-6 py-10 text-white">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 15% 18%, rgba(91, 108, 138, 0.22), transparent 26%)",
            "radial-gradient(circle at 82% 16%, rgba(24, 185, 129, 0.14), transparent 24%)",
            "radial-gradient(circle at 78% 76%, rgba(244, 114, 22, 0.14), transparent 26%)",
            "linear-gradient(180deg, #07090d 0%, #0b1017 42%, #06080d 100%)",
          ].join(", "),
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.1] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <div className="grid w-full gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <section className="max-w-2xl space-y-8">
            <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/58">
              Winston system access
            </div>
            <div className="space-y-5">
              <h1 className="font-command text-[clamp(4rem,11vw,7rem)] uppercase leading-[0.9] tracking-[0.05em] text-white">
                Winston
              </h1>
              <p className="max-w-xl text-base leading-7 text-white/72 sm:text-lg">
                Novendor&rsquo;s intelligence engine for real estate private equity, project delivery, and institutional operations.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-white/62 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                Shared platform identity
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                Explicit environment scope
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                Deterministic redirects
              </div>
            </div>
            <div className="border-t border-white/10 pt-6 text-sm leading-7 text-white/58">
              Control Tower remains available for platform administration. Environment routes are the preferred path when you already know where you are operating.
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,16,24,0.92),rgba(7,10,16,0.94))] p-6 shadow-[0_28px_90px_-42px_rgba(0,0,0,0.92)] backdrop-blur-sm sm:p-7">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Environment console</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Available operating contexts</h2>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center rounded-full border border-white/12 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/66 transition hover:border-white/22 hover:text-white"
              >
                Control Tower
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {ENVIRONMENT_ORDER.map((slug) => {
                const environment = environmentCatalog[slug];
                return (
                  <Link
                    key={slug}
                    href={ENVIRONMENT_HREF[slug]}
                    className="group flex items-start justify-between gap-5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-5 transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">
                        Environment
                      </p>
                      <h3 className="font-command text-[1.65rem] uppercase tracking-[0.06em] text-white">
                        {environment.label}
                      </h3>
                      <p className="max-w-sm text-sm leading-6 text-white/60">
                        {ENVIRONMENT_STATUS[slug]}
                      </p>
                    </div>
                    <div className="pt-1 text-right">
                      <div
                        className="inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
                        style={{
                          backgroundColor: `hsl(${environment.accent} / 0.14)`,
                          color: `hsl(${environment.accent} / 0.96)`,
                        }}
                      >
                        Resolve
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-5 border-t border-white/10 pt-5 text-sm leading-7 text-white/56">
              External access request:
              {" "}
              <a
                href="https://novendor.ai/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/82 transition hover:text-white"
              >
                request a walkthrough
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

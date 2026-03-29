import Link from "next/link";
import { Hexagon } from "lucide-react";
import { environmentCatalog, type EnvironmentSlug } from "@/lib/environmentAuth";

const SUBHEADLINE_LINES = [
  "AI EXECUTION ENVIRONMENT FOR REAL ESTATE PRIVATE EQUITY,",
  "PROJECT DELIVERY, AND INSTITUTIONAL OPERATIONS",
] as const;

const ENVIRONMENT_LOGIN_ORDER: EnvironmentSlug[] = ["novendor", "trading", "floyorker", "resume"];

function withReturnTo(href: string, returnTo?: string | null) {
  if (!returnTo) return href;
  const params = new URLSearchParams({ returnTo });
  return `${href}?${params.toString()}`;
}

function portalButtonClassName() {
  return [
    "inline-flex h-14 w-full items-center justify-center rounded-md border px-5",
    "bg-[rgba(12,16,24,0.44)] text-[rgba(243,246,250,0.96)]",
    "border-[rgba(173,181,196,0.18)] shadow-[0_12px_28px_-24px_rgba(0,0,0,0.82)]",
    "transition-[background-color,border-color,transform] duration-150",
    "hover:-translate-y-[1px] hover:bg-[rgba(18,24,34,0.56)] hover:border-[rgba(193,201,214,0.26)]",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
  ].join(" ");
}

export function WinstonLoginPortal({ returnTo }: { returnTo?: string | null }) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#05070b] px-6 py-10 text-white">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.14), transparent 0, transparent 22%)",
            "radial-gradient(circle at 50% 18%, rgba(151,160,176,0.18), transparent 34%)",
            "radial-gradient(circle at 16% 18%, rgba(82,92,110,0.18), transparent 24%)",
            "radial-gradient(circle at 84% 24%, rgba(74,83,99,0.16), transparent 24%)",
            "linear-gradient(180deg, #06070b 0%, #090c12 48%, #05060a 100%)",
          ].join(", "),
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 12% 22%, rgba(255,255,255,0.26) 0 1px, transparent 1.6px)",
            "radial-gradient(circle at 21% 41%, rgba(255,255,255,0.18) 0 1px, transparent 1.5px)",
            "radial-gradient(circle at 33% 17%, rgba(255,255,255,0.2) 0 1.2px, transparent 1.8px)",
            "radial-gradient(circle at 48% 9%, rgba(255,255,255,0.18) 0 1.1px, transparent 1.7px)",
            "radial-gradient(circle at 61% 28%, rgba(255,255,255,0.2) 0 1px, transparent 1.6px)",
            "radial-gradient(circle at 77% 15%, rgba(255,255,255,0.22) 0 1.1px, transparent 1.7px)",
            "radial-gradient(circle at 86% 38%, rgba(255,255,255,0.16) 0 1.2px, transparent 1.8px)",
            "radial-gradient(circle at 72% 63%, rgba(255,255,255,0.12) 0 1px, transparent 1.7px)",
            "radial-gradient(circle at 18% 74%, rgba(255,255,255,0.16) 0 1.1px, transparent 1.7px)",
            "radial-gradient(circle at 44% 81%, rgba(255,255,255,0.12) 0 1px, transparent 1.6px)",
          ].join(", "),
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12] mix-blend-screen"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-[15%] h-px bg-gradient-to-r from-transparent via-white/22 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-[12%] bottom-[14.5%] h-16 bg-[radial-gradient(circle_at_center,rgba(207,218,232,0.22),transparent_58%)] blur-2xl"
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center justify-center pb-28 pt-8">
        <div className="w-full max-w-[52rem] text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.75)] backdrop-blur-sm">
            <Hexagon className="h-6 w-6 text-white/90" strokeWidth={1.7} />
          </div>

          <h1
            className="font-command mt-7 text-[clamp(4.2rem,11vw,6.6rem)] font-bold uppercase leading-[0.95] tracking-[0.05em] text-white"
            style={{ textShadow: "0 0 18px rgba(255,255,255,0.06)" }}
          >
            WINSTON
          </h1>

          <p
            className="mx-auto mt-10 max-w-[48rem] text-[clamp(0.98rem,1.95vw,1.42rem)] uppercase leading-[1.34] tracking-[0.1em]"
            style={{
              color: "rgba(255,255,255,0.88)",
              fontWeight: 400,
            }}
          >
            {SUBHEADLINE_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>

          <div className="mx-auto mt-12 max-w-[44rem] rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5 text-left backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Access resolver</p>
                <h2 className="mt-2 text-[1.25rem] text-white/90">Choose the operating context you need</h2>
              </div>
              <Link
                href={withReturnTo("/login/admin", returnTo)}
                className="inline-flex items-center rounded-full border border-white/12 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/64 transition hover:border-white/24 hover:text-white"
              >
                Control Tower
              </Link>
            </div>

            <div className="mt-4 grid gap-3">
              {ENVIRONMENT_LOGIN_ORDER.map((slug) => {
                const environment = environmentCatalog[slug];
                return (
                  <Link
                    key={slug}
                    href={withReturnTo(`/${slug}/login`, returnTo)}
                    className={`${portalButtonClassName()} !h-auto !justify-between rounded-[1.35rem] !px-5 !py-4 text-left`}
                  >
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Environment</p>
                      <div className="font-command mt-2 text-[1.45rem] uppercase tracking-[0.06em] text-white">
                        {environment.label}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/58">{environment.loginSubtitle}</p>
                    </div>
                    <span
                      className="inline-flex rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
                      style={{
                        backgroundColor: `hsl(${environment.accent} / 0.14)`,
                        color: `hsl(${environment.accent} / 0.95)`,
                      }}
                    >
                      Resolve
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mx-auto mt-9 max-w-[37rem] border-t border-white/10 pt-7">
            <p className="text-[1.05rem] text-white/66">Not yet on Winston?</p>
            <a
              href="https://novendor.ai/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center text-[clamp(1.02rem,2vw,1.3rem)] transition-colors duration-150 hover:text-white"
              style={{
                letterSpacing: "0.05em",
                color: "rgba(206,220,236,0.88)",
                fontWeight: 400,
              }}
            >
              Request a walkthrough &rarr;
            </a>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-10 text-center text-sm tracking-[0.08em] text-white/58">
        2026 Novendor Systems
      </div>
    </main>
  );
}

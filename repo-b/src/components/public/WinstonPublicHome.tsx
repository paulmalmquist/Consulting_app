/**
 * WinstonPublicHome — public-facing marketing homepage.
 *
 * Legibility pass: a first-time visitor should understand in <30 seconds
 *   1. what Winston is ("one system to run multiple companies")
 *   2. that environments == real, distinct companies (not features)
 *   3. three concrete use cases they can map to their own world
 *   4. how to enter the system
 *
 * Data source: `environmentCatalog` from `@/lib/environmentAuth` — no backend
 * call, no new API. The catalog already describes every environment; we just
 * surface it publicly.
 */

import Link from "next/link";

import {
  environmentCatalog,
  environmentDisplayHomePath,
  type EnvironmentSlug,
  type EnvironmentBranding,
} from "@/lib/environmentAuth";

const ENVIRONMENT_ORDER: EnvironmentSlug[] = [
  "meridian",
  "stone-pds",
  "novendor",
  "trading",
  "ncf",
  "floyorker",
];

type UseCase = {
  title: string;
  persona: string;
  summary: string;
  envSlug: EnvironmentSlug;
  capabilities: string[];
};

const USE_CASES: UseCase[] = [
  {
    title: "Real Estate PE",
    persona: "For fund managers, asset managers, and CFOs running institutional real estate",
    summary:
      "Fund rollups, waterfall logic, capital activity, and quarter-close in one operating surface. Audited snapshots replace stitched-together spreadsheets.",
    envSlug: "meridian",
    capabilities: [
      "Fund & asset performance",
      "Waterfall engine with clawback tracking",
      "Quarter close & LP reporting",
      "Authoritative-state snapshots",
    ],
  },
  {
    title: "Consulting CRM",
    persona: "For consulting firms running multiple clients, pipelines, and delivery engagements",
    summary:
      "Pipeline, deal coverage, delivery rhythm, and client knowledge unified. One place to run the business of consulting, not ten.",
    envSlug: "novendor",
    capabilities: [
      "Deal pipeline & contact coverage",
      "Engagement delivery & execution rhythm",
      "Revenue OS (Authority, Content, Lead attribution)",
      "AI copilot with pipeline context",
    ],
  },
  {
    title: "Trading Research",
    persona: "For investment teams building quantitative and narrative research into a single decision surface",
    summary:
      "Market research, strategy backtests, and historical-rhyme analogs in one workspace. Explicit session and tenant boundaries on every read.",
    envSlug: "trading",
    capabilities: [
      "Research state cards & signal pipeline",
      "Backtests with clear decision engines",
      "History Rhymes analog matching",
      "Trade + portfolio performance",
    ],
  },
];

function envAccentStyle(branding: EnvironmentBranding): React.CSSProperties {
  return {
    borderColor: `rgba(${branding.glow}, 0.40)`,
    boxShadow: `0 0 0 1px rgba(${branding.glow}, 0.08) inset, 0 8px 40px -18px rgba(${branding.glow}, 0.55)`,
  };
}

function EnvCard({ slug }: { slug: EnvironmentSlug }) {
  const branding = environmentCatalog[slug];
  return (
    <Link
      href={`${environmentDisplayHomePath(slug)}/about`}
      data-testid={`public-env-card-${slug}`}
      className="group relative flex flex-col gap-3 rounded-2xl border bg-[#0b0f13]/60 p-5 transition-all hover:-translate-y-0.5 hover:bg-[#0d1218]/70"
      style={envAccentStyle(branding)}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: `rgb(${branding.glow})` }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400">
          {branding.familyLabel}
        </span>
      </div>
      <div className="text-lg font-semibold tracking-tight text-slate-100">
        {branding.label}
      </div>
      <p className="text-sm leading-6 text-slate-400 flex-1">
        {branding.loginSubtitle}
      </p>
      <div className="mt-auto flex items-center justify-between text-xs">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
          /{slug}
        </span>
        <span
          className="opacity-70 transition-opacity group-hover:opacity-100"
          style={{ color: `rgb(${branding.glow})` }}
        >
          Enter →
        </span>
      </div>
    </Link>
  );
}

function UseCaseCard({ useCase }: { useCase: UseCase }) {
  const branding = environmentCatalog[useCase.envSlug];
  return (
    <article
      data-testid={`public-usecase-${useCase.envSlug}`}
      className="rounded-2xl border border-slate-800/80 bg-[#0a0e12]/80 p-6"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-8 rounded-full"
          style={{ backgroundColor: `rgb(${branding.glow})` }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
          Use case
        </span>
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-100">
        {useCase.title}
      </h3>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
        {useCase.persona}
      </p>
      <p className="mt-4 text-sm leading-7 text-slate-300">{useCase.summary}</p>
      <ul className="mt-4 space-y-1.5 text-sm text-slate-400">
        {useCase.capabilities.map((cap) => (
          <li key={cap} className="flex items-start gap-2">
            <span
              className="mt-2 h-1 w-1 flex-none rounded-full"
              style={{ backgroundColor: `rgb(${branding.glow})` }}
              aria-hidden="true"
            />
            <span>{cap}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`${environmentDisplayHomePath(useCase.envSlug)}/about`}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-900/60"
      >
        See in {branding.label}
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export default function WinstonPublicHome() {
  return (
    <main
      data-testid="winston-public-home"
      className="min-h-screen bg-[#05080c] text-slate-100"
    >
      {/* ── Top bar ───────────────────────────────────────── */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-lg tracking-tight"
        >
          <span className="h-2 w-2 rounded-full bg-slate-200" aria-hidden="true" />
          Winston
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/login"
            className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-900/60"
            data-testid="nav-login"
          >
            Sign in
          </Link>
        </nav>
      </header>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 md:pt-20">
        <p className="text-[11px] font-mono uppercase tracking-[0.26em] text-slate-500">
          AI execution environment · institutional operations
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-slate-50 md:text-6xl">
          One system to run multiple companies.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
          Winston is one control plane for several businesses. Each environment is
          a real company — real data, real workflows, real AI scoped to that
          tenant. Fund managers, consulting operators, and research teams share
          the spine and keep their worlds separate.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            data-testid="cta-enter-system"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5"
          >
            Enter system
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/meridian/about"
            data-testid="cta-view-demo"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-900/60"
          >
            View demo
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      {/* ── Environments-as-companies ─────────────────────── */}
      <section
        id="environments"
        className="mx-auto w-full max-w-6xl px-6 pb-16"
      >
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.26em] text-slate-500">
              Environments
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              Each environment is a company.
            </h2>
          </div>
          <span className="hidden text-xs text-slate-500 md:inline">
            {ENVIRONMENT_ORDER.length} live
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ENVIRONMENT_ORDER.map((slug) => (
            <EnvCard key={slug} slug={slug} />
          ))}
        </div>
      </section>

      {/* ── Three use cases ───────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-[0.26em] text-slate-500">
            Concrete use cases
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            What operators actually do inside Winston.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {USE_CASES.map((uc) => (
            <UseCaseCard key={uc.envSlug} useCase={uc} />
          ))}
        </div>
      </section>

      {/* ── Secondary CTA ─────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900/60 to-slate-950/80 p-8 md:p-10">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Ready to see your own data inside?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Winston is designed to host additional environments alongside the
            ones above. If you want to evaluate it with your fund, firm, or
            research team&rsquo;s actual data, start with sign-in.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5"
            >
              Sign in
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="#environments"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-900/60"
            >
              Browse environments
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="mx-auto w-full max-w-6xl px-6 pb-10 text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-900 pt-6">
          <span>© {new Date().getFullYear()} Winston</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
            One control plane · {ENVIRONMENT_ORDER.length} environments
          </span>
        </div>
      </footer>
    </main>
  );
}

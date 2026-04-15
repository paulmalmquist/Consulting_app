/**
 * EnvironmentIntro — public-facing "what is this environment" screen.
 *
 * Answers for the visitor, in order:
 *   1. Name — which company/environment is this
 *   2. What it does — one-paragraph explanation
 *   3. Who it's for — the operator persona
 *   4. Key capabilities — bullet list, bounded (3–6 items)
 *   5. Enter environment — CTA (goes to env home via the existing
 *      `/{slug}` route; middleware handles login gating)
 *
 * Data source: `environmentCatalog` for identity + branding, plus a small
 * slug-keyed `ENV_PROFILE` table for the operator-facing copy. No backend
 * call; the profile table is colocated here so it can evolve alongside
 * other public copy without crossing module boundaries.
 */

import Link from "next/link";

import {
  environmentCatalog,
  environmentDisplayHomePath,
  type EnvironmentSlug,
} from "@/lib/environmentAuth";

export type EnvironmentProfile = {
  whatItDoes: string;
  whoItsFor: string;
  keyCapabilities: string[];
};

export const ENV_PROFILE: Record<EnvironmentSlug, EnvironmentProfile> = {
  meridian: {
    whatItDoes:
      "Institutional real estate private equity environment. Runs fund performance, asset-level underwriting, capital activity, waterfall computation, and quarter-close in a single authoritative surface. Released periods flow through snapshot contracts so a cap-rate or NOI number can always be traced to its source.",
    whoItsFor:
      "Fund managers, asset managers, CFOs, and controllers at real estate private equity firms who currently stitch together Excel, Yardi, and LP reporting templates by hand.",
    keyCapabilities: [
      "Fund rollups, TVPI, DPI, and IRR contribution timelines",
      "American & European waterfall engines with clawback exposure tracking",
      "Quarter close, authoritative state snapshots, LP reporting",
      "Asset-level underwriting, NOI variance, debt surveillance",
      "Monte Carlo and sensitivity matrices for scenario work",
    ],
  },
  "stone-pds": {
    whatItDoes:
      "Project and development delivery command environment. Tracks engagement health, account coverage, blocker surfacing, and operational intervention across client programs. Designed to replace status-meeting slide decks with a live signal.",
    whoItsFor:
      "Delivery leaders, program managers, and partner-level operators running multi-client project portfolios.",
    keyCapabilities: [
      "Engagement delivery & account coverage",
      "Executive dashboard with drill lineage",
      "Blocker surfacing & operational intervention",
      "Reporting lens model (financial, operational, impact)",
      "AI copilot scoped to current project",
    ],
  },
  novendor: {
    whatItDoes:
      "Consulting revenue operating system. One place to run pipeline, deal coverage, delivery rhythm, content repurposing, and the business-of-consulting loop. Replaces a mix of CRMs, PM tools, and spreadsheets for a consulting practice.",
    whoItsFor:
      "Independent consultants and consulting firm owners running real pipelines and delivery engagements — not just tracking them.",
    keyCapabilities: [
      "Deal pipeline with coverage and execution rhythm",
      "Engagement delivery & client knowledge surfacing",
      "Authority engine (case studies, LinkedIn, lead magnets)",
      "Mobile-first consulting ops surface",
      "AI copilot with pipeline + engagement context",
    ],
  },
  trading: {
    whatItDoes:
      "Market research and trading workspace. Combines quantitative research, strategy backtests, and historical-analog (History Rhymes) signals in one decision environment. Heavier tenant isolation posture than other environments because the data is more sensitive.",
    whoItsFor:
      "Investment teams, quant researchers, and discretionary PMs who want one surface that combines research state, strategy signals, and execution without switching context.",
    keyCapabilities: [
      "Research state cards & signal pipeline",
      "Strategy backtests with clear decision engines",
      "History Rhymes analog matching (Rhyme Score + Divergence)",
      "Trade & portfolio performance attribution",
      "Explicit session + tenant boundaries on every read",
    ],
  },
  ncf: {
    whatItDoes:
      "Governed reporting environment for a national giving organization. Tracks giving flows, grant activity, complex gifts, and leadership trust indicators under a named reporting-lens model.",
    whoItsFor:
      "Finance and program leadership at the National Christian Foundation, plus downstream stewardship teams who need consistent numbers across audited, operational, and impact views.",
    keyCapabilities: [
      "Executive reporting with drill + lineage",
      "Reporting-lens model (financial, operational, impact)",
      "Grant & complex-gift flow visibility",
      "Env-scoped authoritative metrics",
      '"Not available in current context" as a first-class state',
    ],
  },
  floyorker: {
    whatItDoes:
      "Editorial workspace for local content and rankings. Tracks publishing workflow, editorial revenue, and content performance with a media-house posture rather than a SaaS-publisher posture.",
    whoItsFor:
      "Editors, publishers, and content operators running local or vertical media properties — people who need an editorial CMS plus a business dashboard in one place.",
    keyCapabilities: [
      "Editorial publishing workflow",
      "Content performance & revenue attribution",
      "Local rankings & distribution",
      "Lightweight CMS with a business surface",
      "AI-assisted editorial drafting",
    ],
  },
};

export default function EnvironmentIntro({ slug }: { slug: EnvironmentSlug }) {
  const branding = environmentCatalog[slug];
  const profile = ENV_PROFILE[slug];
  const enterHref = environmentDisplayHomePath(slug);

  return (
    <main
      data-testid={`env-intro-${slug}`}
      className="min-h-screen bg-[#05080c] text-slate-100"
    >
      {/* ── Top bar with back link ───────────────────────── */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
          data-testid="env-intro-back"
        >
          <span aria-hidden="true">←</span> Winston
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-900/60"
        >
          Sign in
        </Link>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-8 md:pt-14">
        {/* ── Identity strip ──────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: `rgb(${branding.glow})` }}
            aria-hidden="true"
          />
          <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500">
            {branding.familyLabel}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-600">
            /{slug}
          </span>
        </div>

        {/* ── Name + one-liner ────────────────────────────── */}
        <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-slate-50 md:text-5xl">
          {branding.label}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
          {profile.whatItDoes}
        </p>

        {/* ── CTA row ─────────────────────────────────────── */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={enterHref}
            data-testid={`enter-environment-${slug}`}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: `rgb(${branding.glow})` }}
          >
            Enter environment
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-900/60"
          >
            Sign in first
          </Link>
        </div>

        {/* ── Who it's for + Capabilities ─────────────────── */}
        <div className="mt-14 grid gap-8 md:grid-cols-[1fr_1.2fr]">
          <section>
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500">
              Who it&rsquo;s for
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              The operator
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {profile.whoItsFor}
            </p>
          </section>
          <section>
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500">
              Key capabilities
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              What&rsquo;s inside
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {profile.keyCapabilities.map((cap) => (
                <li key={cap} className="flex items-start gap-3">
                  <span
                    className="mt-2 h-1.5 w-1.5 flex-none rounded-full"
                    style={{ backgroundColor: `rgb(${branding.glow})` }}
                    aria-hidden="true"
                  />
                  <span className="leading-6">{cap}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ── Footer CTA ──────────────────────────────────── */}
        <section className="mt-16 rounded-2xl border border-slate-800/70 bg-[#0a0e12]/80 p-6 md:p-8">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            Ready to enter {branding.label}?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            If you have a membership, clicking below signs you straight in. If
            you don&rsquo;t, you&rsquo;ll see the access-required screen for
            this environment.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={enterHref}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900"
              style={{ backgroundColor: `rgb(${branding.glow})` }}
            >
              Enter environment →
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:border-slate-500 hover:bg-slate-900/60"
            >
              ← Back to all environments
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

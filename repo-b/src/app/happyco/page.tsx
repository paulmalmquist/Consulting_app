import Link from "next/link";
import { cookies } from "next/headers";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Layers,
  LockKeyhole,
  Mail,
  Network,
  Presentation,
  ShieldCheck,
} from "lucide-react";
import { HAPPYCO_AUTOMATION_ROWS, HAPPYCO_DATABRICKS_RECEIPT } from "@/lib/happyco/proof";

const COOKIE_NAME = "happyco_demo_access";

type PageProps = {
  searchParams?: {
    error?: string;
  };
};

function StatusPill({ children, tone = "ready" }: { children: React.ReactNode; tone?: "ready" | "planned" | "locked" }) {
  const cls =
    tone === "ready"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : tone === "planned"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-violet-200 bg-violet-50 text-violet-900";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-[28px] border border-[#DDD8EA] bg-white shadow-sm ${className}`}>{children}</section>;
}

function PublicGate({ invalid }: { invalid: boolean }) {
  return (
    <main className="min-h-screen bg-[#FBFAF7] text-[#241437]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-12">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#DDD8EA] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#35146B]">
          <LockKeyhole className="h-4 w-4" />
          Gated proof package
        </div>
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <h1 className="max-w-3xl text-5xl font-black tracking-tight text-[#35146B] sm:text-6xl">
              Property Ops Intelligence for a modern data platform.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4D426A]">
              A private proof-of-work package showing how my AI/data operating stack maps onto a
              HappyCo-style Head of Data challenge: canonical data, graph architecture, benchmarking,
              ML risk modeling, AI recommendations, and controlled artifact automation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StatusPill tone="locked">HappyCo-specific content locked</StatusPill>
              <StatusPill tone="ready">Synthetic demo only</StatusPill>
              <StatusPill tone="planned">No public downloads</StatusPill>
            </div>
          </div>
          <Card className="p-6">
            <div className="rounded-2xl bg-[#C6F4DF] p-4">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#35146B]">Invite access</div>
              <p className="mt-2 text-sm leading-6 text-[#241437]">
                Enter the HappyCo demo invite code to view tailored content, artifact statuses, and the environment demo route.
              </p>
            </div>
            <form action="/happyco/access" method="post" className="mt-5 space-y-3">
              <label className="block text-sm font-bold text-[#35146B]" htmlFor="inviteCode">
                Invite code
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                type="password"
                required
                className="w-full rounded-2xl border border-[#DDD8EA] bg-white px-4 py-3 text-[#241437] outline-none ring-[#5430C0] focus:ring-2"
                placeholder="Enter code"
              />
              {invalid ? <p className="text-sm font-semibold text-rose-700">Invalid invite code.</p> : null}
              <button className="w-full rounded-2xl bg-[#35146B] px-4 py-3 text-sm font-black text-white transition hover:bg-[#5430C0]">
                Unlock HappyCo package
              </button>
            </form>
            <p className="mt-4 text-xs leading-5 text-[#6F6590]">
              Development fallback only: when `HAPPYCO_DEMO_INVITE_CODE` is unset outside production, the local code is documented
              as `happyco-local-demo`. Production requires the environment variable.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}

// Six cards describing the underlying operating stack. The HappyCo-specific
// proof package is the applied case, not the stack itself.
const STACK_OVERLAP = [
  {
    icon: ClipboardList,
    title: "ADO intake + sequenced PRs",
    body: "Azure DevOps work-item intake, Epic → Feature → Story → Task, and scoped session briefs feed every change.",
  },
  {
    icon: Bot,
    title: "Codex + Claude execution",
    body: "Multi-PR planning with plan-review gates; AI agents execute scoped tickets and leave receipts, not free-form output.",
  },
  {
    icon: Network,
    title: "FastAPI operator APIs",
    body: "Canonical entity, graph, benchmark, recommendation, and ML-risk endpoints with caveat metadata on every response.",
  },
  {
    icon: BrainCircuit,
    title: "Databricks weather-risk ML",
    body: "Modular weather-risk package, MLflow metrics, run receipts; live runs replace local-fallback bundles when auth permits.",
  },
  {
    icon: Layers,
    title: "Next.js proof surfaces",
    body: "Invite-gated /happyco package: demo client, weather-risk intelligence page, artifact hub — all behind the same cookie.",
  },
  {
    icon: FileSpreadsheet,
    title: "Excel + PowerPoint + Outlook automation",
    body: "Same canonical data becomes a workbook, a deck, and a draft-only follow-up workflow template through generators.",
  },
];

// Three columns: my stack on the left, the translation lens in the middle,
// HappyCo's applied relevance on the right. Six rows that mirror STACK_OVERLAP.
const RELEVANCE_MAP: Array<[string, string, string]> = [
  [
    "ADO intake + sequenced PRs",
    "Multi-stakeholder delivery discipline with a paper trail",
    "Data-team backlog, sequenced ML/data work against HappyCo property goals",
  ],
  [
    "Codex + Claude multi-PR planning",
    "Plan-then-execute with human gates and AI execution",
    "Head of Data scoping AI-assisted analytics + data-product work without losing the plot",
  ],
  [
    "FastAPI canonical APIs",
    "Source-of-truth product surfaces for entities and analytics",
    "Property / unit / inspection / work-order canonical layer behind HappyCo product features",
  ],
  [
    "Databricks weather-risk ML",
    "Public + synthetic data joined into operational signals",
    "Maintenance-risk, make-ready, vendor-performance ML on real HappyCo property ops data",
  ],
  [
    "Next.js gated proof surfaces",
    "Stakeholder-ready evidence dashboards behind invite cookies",
    "Internal HappyCo operator dashboards and customer-facing analytics views",
  ],
  [
    "Excel / PowerPoint / Outlook automation",
    "Same data turns into operator-ready artifacts on demand",
    "Customer reports, executive decks, and owner/operator follow-up from one source",
  ],
];

function GatedPackage() {
  const databricksReceipt = HAPPYCO_DATABRICKS_RECEIPT;
  const automationRows = HAPPYCO_AUTOMATION_ROWS;

  const artifacts = [
    {
      icon: FileSpreadsheet,
      title: "Excel workbook",
      status: "Available in local proof package",
      body: "HappyCo_Property_Ops_Model.xlsx with canonical entities, benchmarks, work-order aging, vendor performance, AI recommendations, ML features, predictions, and model metrics.",
    },
    {
      icon: Presentation,
      title: "PowerPoint deck",
      status: "Available in local proof package",
      body: "HappyCo_90_Day_Data_Strategy.pptx with the 90-day strategy, architecture diagram, ML proof, risks, controls, and artifact package story.",
    },
    {
      icon: Mail,
      title: "Outlook workflow",
      status: "Available in local proof package",
      body: "Parameter-driven WinCOM draft-flow templates. Draft-only by default. No sensitive private content is stored in the repository.",
    },
    {
      icon: Network,
      title: "Microsite / package",
      status: "Gated page ready",
      body: "This route is invite-code gated. The artifact hub lists local/private outputs and streams only server-available files through an allowlisted gated API.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#FBFAF7] text-[#241437]">
      <section className="mx-auto max-w-[1600px] px-5 pb-12 pt-8 xl:px-8">
        {/* 1. Hero */}
        <div className="rounded-[34px] border border-[#DDD8EA] bg-[#C6F4DF] p-7 lg:p-9">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#35146B]">HappyCo gated proof package</div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-[#35146B] sm:text-6xl">
                Property Ops Intelligence Kit
              </h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-[#241437]">
                A private proof-of-work package showing how my current AI/data operating stack maps onto a
                HappyCo-style Head of Data challenge. The stack — ADO intake, AI-assisted multi-PR delivery,
                a modular Databricks ML pipeline, FastAPI / Next.js product surfaces, artifact generation,
                gated deployment, and receipts — is the durable thing; HappyCo is the applied case.
              </p>
              <p className="mt-3 max-w-4xl rounded-2xl border border-[#35146B]/15 bg-white/60 p-4 text-sm font-semibold leading-6 text-[#35146B]">
                This is not HappyCo production data. The property-ops layer is synthetic, but the workflow
                is real: ADO intake, AI-assisted delivery, a modular Databricks ML pipeline, FastAPI / Next.js
                product surfaces, generated artifacts, gated deployment, and receipts.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/happyco/demo"
                className="rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white transition hover:bg-[#5430C0]"
              >
                Open HappyCo demo
              </Link>
              <Link
                href="/happyco/artifacts"
                className="rounded-2xl border border-[#35146B]/20 bg-white px-5 py-3 text-sm font-black text-[#35146B] transition hover:bg-[#F5F1FF]"
              >
                View artifacts
              </Link>
              <Link
                href="/happyco/weather-risk"
                className="rounded-2xl border border-[#35146B]/20 bg-white px-5 py-3 text-sm font-black text-[#35146B] transition hover:bg-[#F5F1FF]"
              >
                Weather-risk intelligence
              </Link>
              <Link
                href="#automation-control-room"
                className="rounded-2xl border border-[#35146B]/20 bg-[#FBFAF7] px-5 py-3 text-sm font-black text-[#35146B] transition hover:bg-white"
              >
                View automation receipts
              </Link>
            </div>
          </div>
        </div>

        {/* 2. Stack overlap — 6 cards */}
        <Card className="mt-6 p-6">
          <div className="mb-5 flex items-center gap-3">
            <Layers className="h-6 w-6 text-[#35146B]" />
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#5430C0]/70">My operating stack</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#35146B]">Stack overlap</h2>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {STACK_OVERLAP.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
                <Icon className="h-5 w-5 text-[#5430C0]" />
                <div className="mt-3 text-lg font-black text-[#35146B]">{title}</div>
                <p className="mt-2 text-sm leading-6 text-[#4D426A]">{body}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* 3. HappyCo relevance map */}
        <Card className="mt-6 p-6">
          <div className="mb-5 flex items-center gap-3">
            <Network className="h-6 w-6 text-[#35146B]" />
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#5430C0]/70">Applied to HappyCo</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#35146B]">HappyCo relevance map</h2>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[#DDD8EA]">
            <div className="hidden grid-cols-3 bg-[#35146B] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white lg:grid">
              <div>Winston / Novendor stack</div>
              <div>Translation layer</div>
              <div>HappyCo relevance</div>
            </div>
            {RELEVANCE_MAP.map(([stack, translation, relevance]) => (
              <div
                key={stack}
                className="grid gap-3 border-t border-[#DDD8EA] bg-[#FBFAF7] px-4 py-4 text-sm text-[#4D426A] lg:grid-cols-3 lg:items-start"
              >
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590] lg:hidden">Stack</div>
                  <div className="font-bold text-[#35146B]">{stack}</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590] lg:hidden">Translation</div>
                  {translation}
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590] lg:hidden">HappyCo relevance</div>
                  {relevance}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 4. Automation Control Room (anchor target for the hero CTA) */}
        <Card id="automation-control-room" className="mt-6 p-6">
          <h2 className="text-2xl font-black text-[#35146B]">Automation Control Room</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#4D426A]">
            The package is itself an automation proof: planning, synthetic data, Databricks ML, API surfaces, artifacts,
            deployment gates, and human-review controls are visible as receipts rather than hidden behind a slide.
          </p>
          <div className="mt-5 overflow-hidden rounded-3xl border border-[#DDD8EA]">
            <div className="hidden grid-cols-[1fr_1fr_1.35fr_1.35fr] bg-[#35146B] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white lg:grid">
              <div>Trigger</div>
              <div>Tool / skill</div>
              <div>Output</div>
              <div>Safety / control</div>
            </div>
            {automationRows.map((row) => (
              <div key={row.trigger} className="grid gap-3 border-t border-[#DDD8EA] bg-[#FBFAF7] px-4 py-4 text-sm text-[#4D426A] lg:grid-cols-[1fr_1fr_1.35fr_1.35fr] lg:items-start">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590] lg:hidden">Trigger</div>
                  <div className="font-bold text-[#35146B]">{row.trigger}</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590] lg:hidden">Tool / skill</div>
                  {row.tool}
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590] lg:hidden">Output</div>
                  {row.output}
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590] lg:hidden">Safety / control</div>
                  {row.control}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 5. Prior receipt-backed Databricks run */}
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusPill>Completed</StatusPill>
              <h2 className="mt-3 text-2xl font-black text-[#35146B]">Prior receipt-backed Databricks run</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#4D426A]">
                The historical Databricks ML training run on public weather and synthetic property-operations
                data. The current site bundle is a separate local-fallback export — see the weather-risk page
                for the split between this prior run and the current bundle.
              </p>
            </div>
            <BrainCircuit className="h-8 w-8 text-[#5430C0]" />
          </div>
          <dl className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">Job ID</dt>
              <dd className="mt-2 font-mono text-sm font-bold text-[#35146B]">{databricksReceipt.jobId}</dd>
            </div>
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">Run ID</dt>
              <dd className="mt-2 font-mono text-sm font-bold text-[#35146B]">{databricksReceipt.runId}</dd>
            </div>
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">Data</dt>
              <dd className="mt-2 text-sm font-bold text-[#35146B]">{databricksReceipt.data}</dd>
            </div>
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4 lg:col-span-3">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">Output</dt>
              <dd className="mt-2 text-sm font-bold text-[#35146B]">{databricksReceipt.output}</dd>
            </div>
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4 lg:col-span-2">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">Claim</dt>
              <dd className="mt-2 text-sm font-bold text-[#35146B]">{databricksReceipt.claim}</dd>
            </div>
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">Caveat</dt>
              <dd className="mt-2 text-sm font-bold text-[#35146B]">{databricksReceipt.caveat}</dd>
            </div>
          </dl>
        </Card>

        {/* 6. Artifact factory */}
        <Card className="mt-6 p-6">
          <h2 className="text-2xl font-black text-[#35146B]">Artifact factory</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#4D426A]">
            Same canonical data, four artifact surfaces. Status copy distinguishes what is available in the
            local proof package from what is gated behind the API.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {artifacts.map((artifact) => {
              const Icon = artifact.icon;
              const planned = artifact.status.toLowerCase().includes("pending");
              return (
                <div key={artifact.title} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Icon className="h-6 w-6 text-[#5430C0]" />
                    <StatusPill tone={planned ? "planned" : "ready"}>{artifact.status}</StatusPill>
                  </div>
                  <div className="mt-4 text-xl font-black text-[#35146B]">{artifact.title}</div>
                  <p className="mt-2 text-sm leading-6 text-[#4D426A]">{artifact.body}</p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 7. Claims and caveats */}
        <Card className="mt-6 p-6">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-[#35146B]" />
            <h2 className="text-2xl font-black text-[#35146B]">Claims and caveats</h2>
          </div>
          <ul className="space-y-3 text-sm leading-6 text-[#4D426A]">
            <li><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" />Synthetic property operations data only; no HappyCo production data.</li>
            <li><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" />Public weather signals are used only for proof-of-work feature engineering.</li>
            <li><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" />Model metrics are demo-pipeline evidence, not expected real-world performance.</li>
            <li><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" />Databricks execution claims are limited to completed, receipt-backed runs.</li>
            <li><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" />No production deployment or HappyCo model claim.</li>
            <li><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" />Local artifacts are not public downloads from this route.</li>
            <li><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-700" />Outlook send remains disabled unless explicitly requested locally.</li>
          </ul>
        </Card>
      </section>
    </main>
  );
}

export default function HappyCoPage({ searchParams }: PageProps) {
  const unlocked = cookies().get(COOKIE_NAME)?.value === "granted";
  if (!unlocked) {
    return <PublicGate invalid={searchParams?.error === "invalid"} />;
  }
  return <GatedPackage />;
}

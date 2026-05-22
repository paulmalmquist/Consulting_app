import Link from "next/link";
import { cookies } from "next/headers";
import {
  BarChart3,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  FileSpreadsheet,
  GitBranch,
  LockKeyhole,
  Mail,
  Network,
  Presentation,
  ShieldCheck,
} from "lucide-react";

const COOKIE_NAME = "happyco_demo_access";

type PageProps = {
  searchParams?: {
    error?: string;
  };
};

const demoEnvId = process.env.NEXT_PUBLIC_HAPPYCO_DEMO_ENV_ID || "happyco-demo";
const operatorDemoHref = `/lab/env/${demoEnvId}/operator/property-ops-intelligence`;

function StatusPill({ children, tone = "ready" }: { children: React.ReactNode; tone?: "ready" | "planned" | "locked" }) {
  const cls =
    tone === "ready"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : tone === "planned"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-violet-200 bg-violet-50 text-violet-900";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-[#DDD8EA] bg-white shadow-sm ${className}`}>{children}</section>;
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
              A role-specific Head of Data proof package showing canonical property data, graph architecture,
              benchmarking, ML risk modeling, AI recommendations, and controlled artifact automation.
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

function GatedPackage() {
  const databricksReceipt = {
    title: "Weather-aware maintenance risk Databricks run",
    jobId: "172758362681895",
    runId: "924781458483845",
    data: "public weather + synthetic property operations",
    output: "predictions, metrics, MLflow run metadata, validated receipt",
    claim: "Databricks ML training run executed on public weather and synthetic property operations data.",
    caveat: "Not HappyCo production data; not a production model; no serving endpoint.",
  };

  const automationRows = [
    {
      trigger: "recruiter/job context",
      tool: "HappyCo prompt stack + Codex planning",
      output: "role-specific proof scope and active implementation plan",
      control: "human-approved scope; no private recruiter content committed",
    },
    {
      trigger: "deterministic data fixture",
      tool: "canonical fixture generator + operator service",
      output: "property, unit, inspection, work-order, vendor, benchmark, and recommendation spine",
      control: "synthetic data only; API payloads carry demo metadata and caveats",
    },
    {
      trigger: "weather/property risk feature pipeline",
      tool: "Databricks bundle/job",
      output: "maintenance-risk predictions + MLflow metrics + run receipt",
      control: "public weather + synthetic ops only; receipt-backed claim; no production serving endpoint",
    },
    {
      trigger: "operator APIs",
      tool: "FastAPI operator routes",
      output: "entities, graph, benchmarks, recommendations, and ML-risk JSON",
      control: "demo_mode/data_source/caveat fields on product-facing responses",
    },
    {
      trigger: "artifact package",
      tool: "Excel, PowerPoint, and architecture generators",
      output: "workbook, strategy deck, and architecture diagram",
      control: "local artifacts only; no public downloads from this route",
    },
    {
      trigger: "Outlook follow-up workflow",
      tool: "WinCOM params templates",
      output: "draft-only recruiter follow-up workflow template",
      control: "no send without explicit local confirmation",
    },
    {
      trigger: "gated deployment",
      tool: "Next.js invite-code route + deployment env vars",
      output: "private proof package at /happyco",
      control: "invite-gated access; invite code remains server-side",
    },
  ];

  const artifacts = [
    {
      icon: FileSpreadsheet,
      title: "Excel workbook",
      status: "Generated local artifact",
      body: "HappyCo_Property_Ops_Model.xlsx with canonical entities, benchmarks, work-order aging, vendor performance, AI recommendations, ML features, predictions, and model metrics.",
    },
    {
      icon: Presentation,
      title: "PowerPoint deck",
      status: "Generated local artifact",
      body: "HappyCo_90_Day_Data_Strategy.pptx with the 90-day strategy, architecture diagram, ML proof, risks, controls, and artifact package story.",
    },
    {
      icon: Mail,
      title: "Outlook workflow",
      status: "Draft templates ready",
      body: "Parameter-driven WinCOM draft flow templates. Draft-only by default. No private recruiter content is stored in the repository.",
    },
    {
      icon: Network,
      title: "Microsite/package",
      status: "Gated page ready",
      body: "This route is invite-code gated. The artifact hub lists local/private outputs and streams only server-available files through an allowlisted gated API.",
    },
  ];

  const proof = [
    {
      icon: Boxes,
      title: "Canonical model",
      body: "Operator, property, building, unit, inspection, finding, work order, vendor, resolution, resident-impact, and messy source records.",
    },
    {
      icon: GitBranch,
      title: "Property graph",
      body: "Relationships connect properties to units, findings, work orders, vendors, resolution events, and resident-impact signals.",
    },
    {
      icon: BarChart3,
      title: "Benchmarks",
      body: "Parkline Commons is intentionally above peer median for repeat HVAC work orders with reopen and vendor evidence.",
    },
    {
      icon: BrainCircuit,
      title: "ML proof",
      body: "Receipt-backed Databricks run on public weather and synthetic property operations data, plus local logistic model fallback, feature table, predictions, feature importance, model card, and registry record.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#FBFAF7] text-[#241437]">
      <section className="mx-auto max-w-[1600px] px-5 pb-12 pt-8 xl:px-8">
        <div className="rounded-[34px] border border-[#DDD8EA] bg-[#C6F4DF] p-7 lg:p-9">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#35146B]">HappyCo gated proof package</div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-[#35146B] sm:text-6xl">
                Property Ops Intelligence Kit
              </h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-[#241437]">
                A private proof-of-work, synthetic-data proof package, and receipt-backed automation package for a Head of Data role spanning strategy, hands-on architecture prototype, canonical modeling, graph APIs, benchmark analytics, Databricks ML workflows, AI recommendations, Excel, PowerPoint, and Outlook automation.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={operatorDemoHref}
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
                href="/happyco/demo"
                className="rounded-2xl border border-[#35146B]/20 bg-[#FBFAF7] px-5 py-3 text-sm font-black text-[#35146B] transition hover:bg-white"
              >
                Open gated demo copy
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Card className="p-5">
            <StatusPill>Ready</StatusPill>
            <div className="mt-3 text-2xl font-black text-[#35146B]">Fixture spine</div>
            <p className="mt-2 text-sm leading-6 text-[#6F6590]">Deterministic synthetic property operations data.</p>
          </Card>
          <Card className="p-5">
            <StatusPill>Ready</StatusPill>
            <div className="mt-3 text-2xl font-black text-[#35146B]">ML artifacts</div>
            <p className="mt-2 text-sm leading-6 text-[#6F6590]">
              Local fallback trained; Databricks runs completed with receipt-backed caveats, including the weather-aware
              maintenance risk proof.
            </p>
          </Card>
          <Card className="p-5">
            <StatusPill>Ready</StatusPill>
            <div className="mt-3 text-2xl font-black text-[#35146B]">Operator APIs</div>
            <p className="mt-2 text-sm leading-6 text-[#6F6590]">Entities, graph, benchmarks, recommendations, ML risk.</p>
          </Card>
          <Card className="p-5">
            <StatusPill tone="planned">Template ready</StatusPill>
            <div className="mt-3 text-2xl font-black text-[#35146B]">Outlook</div>
            <p className="mt-2 text-sm leading-6 text-[#6F6590]">Safe WinCOM params are draft-only by default.</p>
          </Card>
        </div>

        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusPill>Completed</StatusPill>
              <h2 className="mt-3 text-2xl font-black text-[#35146B]">{databricksReceipt.title}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#4D426A]">
                Receipt-backed Databricks ML proof showing how public weather signals can be joined with synthetic property
                operations patterns to create maintenance-risk predictions and model evidence.
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.82fr]">
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-[#35146B]" />
              <h2 className="text-2xl font-black text-[#35146B]">Architecture proof</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {proof.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
                    <Icon className="h-5 w-5 text-[#5430C0]" />
                    <div className="mt-3 text-lg font-black text-[#35146B]">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-[#4D426A]">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <Bot className="h-6 w-6 text-[#35146B]" />
              <h2 className="text-2xl font-black text-[#35146B]">Controls and caveats</h2>
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
        </div>

        <Card className="mt-6 p-6">
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

        <Card className="mt-6 p-6">
          <h2 className="text-2xl font-black text-[#35146B]">Artifact factory</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {artifacts.map((artifact) => {
              const Icon = artifact.icon;
              const planned = artifact.status.toLowerCase().includes("planned");
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

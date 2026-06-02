import Link from "next/link";
import { cookies } from "next/headers";
import fs from "node:fs";
import path from "node:path";
import { AlertTriangle, BarChart3, Boxes, Database, LockKeyhole, Network, ShieldCheck } from "lucide-react";
import { HAPPYCO_COOKIE_NAME } from "@/lib/happyco/proof";

const BUNDLE_DIR = "public/happyco/weather-risk/latest";
const PUBLIC_BASE = "/happyco/weather-risk/latest";

const CAVEAT =
  "Synthetic property-operations layer modeled after multifamily inspection/work-order " +
  "workflows, enriched with real NOAA/FEMA public hazard data. Not HappyCo production data.";

type Kpis = {
  properties_analyzed?: number;
  units_analyzed?: number;
  markets_analyzed?: number;
  high_risk_properties?: number;
  high_risk_threshold?: number;
  predicted_maintenance_surge_rate?: number | null;
  best_model?: string;
  model_metric_name?: string;
  model_metric_value?: number;
  model_metric_honesty_warning?: string;
};
type RiskRow = {
  property_id?: string;
  market?: string;
  state?: string;
  county_fips?: string;
  risk_rank?: number;
  risk_score?: number;
  work_order_surge_probability?: number;
  inspection_failure_probability?: number;
  make_ready_delay_prediction_days?: number;
  resident_impact_probability?: number;
  recommended_action?: string;
};
type MarketRow = {
  market?: string;
  property_count?: number;
  avg_risk_score?: number;
  high_risk_properties?: number;
  avg_make_ready_delay_days?: number;
  avg_work_order_surge_probability?: number;
};
type ModelMetric = {
  model_name?: string;
  metric_name?: string;
  metric_value?: number;
  task_type?: string;
  train_count?: number;
  test_count?: number;
  mlflow_run_id?: string | null;
  is_best?: boolean;
  metric_honesty_warning?: string;
};
type RunReceipt = {
  mode?: string;
  status?: string;
  generated_at?: string;
  job_id?: string | null;
  run_id?: string | null;
  run_url?: string | null;
  claim_allowed?: string;
  row_counts?: { feature_rows?: number; prediction_rows?: number };
};
type ChartEntry = { artifact_name?: string; source_table?: string; caveat?: string };

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), BUNDLE_DIR, name), "utf-8")) as T;
  } catch {
    return null;
  }
}

function chartExists(name: string): boolean {
  try {
    const file = path.join(process.cwd(), BUNDLE_DIR, "charts", name);
    return fs.existsSync(file) && fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

function num(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Not available";
}
function pct(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "Not available";
}
function dec(value: unknown, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "Not available";
}

const CHART_TITLES: Record<string, string> = {
  "weather_ops_risk_by_market.png": "Weather-ops risk by market",
  "property_maintenance_surge_top_50.png": "Property maintenance surge — top 50",
  "inspection_failure_risk_by_asset_age.png": "Inspection failure risk by asset age",
  "make_ready_delay_risk_by_market.png": "Make-ready delay risk by market",
  "feature_importance.png": "Feature importance",
  "actual_vs_predicted_damage.png": "Actual vs predicted damage",
};

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-[#DDD8EA] bg-white p-6 shadow-sm ${className}`}>{children}</section>;
}
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-[#5430C0]/70">{eyebrow}</div>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-[#35146B]">{title}</h2>
    </div>
  );
}
function NotAvailable({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
      {what} is not available in this bundle. Run the weather-risk export to populate it.
    </div>
  );
}

function LockedWeatherRisk() {
  return (
    <main className="min-h-screen bg-[#FBFAF7] px-5 py-12 text-[#241437]">
      <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col justify-center">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#DDD8EA] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#35146B]">
          <LockKeyhole className="h-4 w-4" /> Gated weather-risk intelligence
        </div>
        <div className="rounded-[34px] border border-[#DDD8EA] bg-white p-8 shadow-sm">
          <h1 className="text-4xl font-black tracking-tight text-[#35146B]">HappyCo access required.</h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#4D426A]">
            Unlock the HappyCo package first to view the weather-risk intelligence page.
          </p>
          <Link href="/happyco" className="mt-6 inline-flex rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white hover:bg-[#5430C0]">
            Unlock HappyCo package
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function HappyCoWeatherRiskPage() {
  const unlocked = cookies().get(HAPPYCO_COOKIE_NAME)?.value === "granted";
  if (!unlocked) return <LockedWeatherRisk />;

  const kpis = readJson<Kpis>("kpis.json");
  const topRisks = readJson<{ count?: number; rows?: RiskRow[] }>("top_property_risks.json");
  const marketSummary = readJson<{ markets?: MarketRow[] }>("market_summary.json");
  const modelMetrics = readJson<{ models?: ModelMetric[] }>("model_metrics.json");
  const runReceipt = readJson<RunReceipt>("run_receipt.json");
  const manifest = readJson<{ charts?: ChartEntry[] }>("artifact_manifest.json");

  const riskRows = (topRisks?.rows ?? []).slice(0, 20);
  const markets = marketSummary?.markets ?? [];
  const models = modelMetrics?.models ?? [];
  const bestModel = models.find((m) => m.is_best) ?? models[0];
  const charts = manifest?.charts ?? [];

  const kpiCards: Array<[string, string]> = kpis
    ? [
        ["Properties analyzed", num(kpis.properties_analyzed)],
        ["Units analyzed", num(kpis.units_analyzed)],
        ["Markets", num(kpis.markets_analyzed)],
        [`High-risk properties (>= ${kpis.high_risk_threshold ?? 0.7})`, num(kpis.high_risk_properties)],
        ["Predicted maintenance surge rate", pct(kpis.predicted_maintenance_surge_rate)],
        [
          kpis.model_metric_name ? `Model metric — ${kpis.model_metric_name}` : "Model metric",
          dec(kpis.model_metric_value),
        ],
      ]
    : [];

  return (
    <main className="min-h-screen bg-[#FBFAF7] text-[#241437]">
      <section className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 xl:px-8">
        {/* 1. Hero / caveat */}
        <div className="rounded-[34px] border border-[#DDD8EA] bg-[#C6F4DF] p-7 lg:p-9">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-[#35146B]">HappyCo proof package</div>
          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-[#35146B] sm:text-6xl">
            Weather-Aware Maintenance Intelligence
          </h1>
          <p className="mt-4 max-w-4xl text-base font-semibold leading-7 text-[#241437]">
            Public weather and hazard signals joined to a synthetic property-operations layer to demonstrate
            proactive maintenance-risk planning.
          </p>
          <div className="mt-4 rounded-2xl border border-[#35146B]/15 bg-white/70 p-4 text-sm font-semibold leading-6 text-[#35146B]">
            {CAVEAT}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/happyco" className="rounded-2xl border border-[#35146B]/20 bg-white px-5 py-3 text-sm font-black text-[#35146B] hover:bg-[#F5F1FF]">
              Back to package
            </Link>
            <Link href="/happyco/artifacts" className="rounded-2xl border border-[#35146B]/20 bg-white px-5 py-3 text-sm font-black text-[#35146B] hover:bg-[#F5F1FF]">
              Artifact hub
            </Link>
          </div>
        </div>

        {/* 2. KPI strip */}
        <Panel>
          <SectionTitle eyebrow="Executive summary" title="Weather-risk KPIs" />
          {kpiCards.length ? (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {kpiCards.map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#6F6590]">{label}</div>
                  <div className="mt-2 text-2xl font-black text-[#35146B]">{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <NotAvailable what="The KPI summary (kpis.json)" />
          )}
          {kpis?.model_metric_honesty_warning ? (
            <p className="mt-4 text-xs font-semibold text-[#6F6590]">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
              {kpis.model_metric_honesty_warning}
            </p>
          ) : null}
        </Panel>

        {/* 3. Risk ranked table */}
        <Panel>
          <SectionTitle eyebrow="Property operations" title="Top property maintenance risks" />
          {riskRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-black uppercase tracking-[0.12em] text-[#6F6590]">
                    <th className="py-2 pr-3">Property</th>
                    <th className="py-2 pr-3">Market</th>
                    <th className="py-2 pr-3">County</th>
                    <th className="py-2 pr-3">Risk score</th>
                    <th className="py-2 pr-3">Surge prob.</th>
                    <th className="py-2 pr-3">Inspection-fail prob.</th>
                    <th className="py-2 pr-3">Make-ready delay</th>
                    <th className="py-2 pr-3">Recommended action</th>
                  </tr>
                </thead>
                <tbody>
                  {riskRows.map((row, idx) => (
                    <tr key={row.property_id ?? idx} className="border-t border-[#DDD8EA] align-top">
                      <td className="py-2 pr-3 font-black text-[#35146B]">{row.property_id ?? "Not available"}</td>
                      <td className="py-2 pr-3">{row.market ?? "Not available"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.county_fips ?? "Not available"}</td>
                      <td className="py-2 pr-3 font-bold">{dec(row.risk_score)}</td>
                      <td className="py-2 pr-3">{pct(row.work_order_surge_probability)}</td>
                      <td className="py-2 pr-3">{pct(row.inspection_failure_probability)}</td>
                      <td className="py-2 pr-3">
                        {typeof row.make_ready_delay_prediction_days === "number"
                          ? `${dec(row.make_ready_delay_prediction_days, 1)} d`
                          : "Not available"}
                      </td>
                      <td className="py-2 pr-3 font-medium text-[#4D426A]">{row.recommended_action ?? "Not available"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <NotAvailable what="The risk-ranked table (top_property_risks.json)" />
          )}
        </Panel>

        {/* 4. Market summary */}
        <Panel>
          <SectionTitle eyebrow="Portfolio" title="Risk by market" />
          {markets.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {markets.map((market) => (
                <div key={market.market} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
                  <div className="text-lg font-black text-[#35146B]">{market.market ?? "Not available"}</div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Properties</dt><dd className="font-bold">{num(market.property_count)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Avg risk score</dt><dd className="font-bold">{dec(market.avg_risk_score)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">High-risk</dt><dd className="font-bold">{num(market.high_risk_properties)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Avg make-ready delay</dt><dd className="font-bold">{dec(market.avg_make_ready_delay_days, 1)} d</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Avg surge prob.</dt><dd className="font-bold">{pct(market.avg_work_order_surge_probability)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <NotAvailable what="The market summary (market_summary.json)" />
          )}
        </Panel>

        {/* 5. Model evidence panel */}
        <Panel>
          <SectionTitle eyebrow="Evidence" title="Model and run receipt" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Database className="h-5 w-5 text-[#5430C0]" />
                <h3 className="text-lg font-black text-[#35146B]">Run receipt</h3>
              </div>
              {runReceipt ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Mode</dt><dd className="font-bold">{runReceipt.mode ?? "Not available"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Job ID</dt><dd className="font-mono text-xs font-bold">{runReceipt.job_id ?? "Not available"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Run ID</dt><dd className="font-mono text-xs font-bold">{runReceipt.run_id ?? "Not available"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Prediction rows</dt><dd className="font-bold">{num(runReceipt.row_counts?.prediction_rows)}</dd></div>
                  <div className="mt-2 rounded-2xl border border-[#DDD8EA] bg-white p-3 text-xs font-semibold leading-5 text-[#4D426A]">
                    {runReceipt.claim_allowed ?? "Not available"}
                  </div>
                  {runReceipt.mode === "local_fallback" ? (
                    <p className="text-xs font-semibold text-[#6F6590]">
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                      Exported from the modular pipeline&apos;s local fallback outputs. This bundle is not a fresh live
                      Databricks run.
                    </p>
                  ) : null}
                </dl>
              ) : (
                <NotAvailable what="The run receipt (run_receipt.json)" />
              )}
            </div>
            <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-5">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#5430C0]" />
                <h3 className="text-lg font-black text-[#35146B]">Model metrics</h3>
              </div>
              {bestModel ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Model</dt><dd className="font-bold">{bestModel.model_name ?? "Not available"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Task</dt><dd className="font-bold">{bestModel.task_type ?? "Not available"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">{bestModel.metric_name ?? "Metric"}</dt><dd className="font-bold">{dec(bestModel.metric_value)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">Train / test rows</dt><dd className="font-bold">{num(bestModel.train_count)} / {num(bestModel.test_count)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#6F6590]">MLflow run ID</dt><dd className="font-mono text-xs font-bold">{bestModel.mlflow_run_id ?? "Not available"}</dd></div>
                  {bestModel.metric_honesty_warning ? (
                    <p className="text-xs font-semibold text-[#6F6590]">
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                      {bestModel.metric_honesty_warning}
                    </p>
                  ) : null}
                </dl>
              ) : (
                <NotAvailable what="Model metrics (model_metrics.json)" />
              )}
            </div>
          </div>
        </Panel>

        {/* 6. Chart gallery */}
        <Panel>
          <SectionTitle eyebrow="Visual evidence" title="Weather-risk chart gallery" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(charts.length
              ? charts
              : Object.keys(CHART_TITLES).map((name) => ({ artifact_name: name } as ChartEntry))
            ).map((chart) => {
              const name = chart.artifact_name ?? "";
              const present = name ? chartExists(name) : false;
              return (
                <div key={name} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#5430C0]" />
                    <div className="text-sm font-black text-[#35146B]">{CHART_TITLES[name] ?? name}</div>
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6F6590]">
                    Source: {chart.source_table ?? "gold_property_weather_ops_features"}
                  </div>
                  {present ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`${PUBLIC_BASE}/charts/${name}`}
                      alt={CHART_TITLES[name] ?? name}
                      className="mt-3 w-full rounded-2xl border border-[#DDD8EA] bg-white"
                    />
                  ) : (
                    <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-900">
                      Chart not available in this bundle.
                    </div>
                  )}
                  <div className="mt-3 text-[11px] font-semibold leading-4 text-[#6F6590]">{chart.caveat ?? CAVEAT}</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="rounded-3xl border border-[#DDD8EA] bg-white p-5 text-sm font-semibold leading-6 text-[#4D426A]">
          <Boxes className="mr-2 inline h-4 w-4 text-[#5430C0]" />
          Public NOAA/FEMA hazard concepts plus a synthetic property-operations layer. Not HappyCo production data;
          not a production model; no serving endpoint.
          <span className="ml-1 inline-flex items-center gap-1 text-[#35146B]">
            <Network className="h-4 w-4" />
          </span>
        </div>
      </section>
    </main>
  );
}

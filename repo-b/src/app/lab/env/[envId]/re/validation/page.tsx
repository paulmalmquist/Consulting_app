"use client";

import { useEffect, useState } from "react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

const GOLDEN_ASSET_ID = "f0000000-9001-0003-0001-000000000001";
const GOLDEN_FUND_ID  = "a1b2c3d4-0003-0030-0001-000000000001";

interface BridgeRow {
  quarter: string; revenue: number; opex: number; noi: number;
  capex: number; ti_lc: number; reserves: number;
  debt_service: number; net_cash_flow: number;
  asset_value: number; debt_balance: number; nav: number;
}
interface SaleEvent {
  sale_date: string; gross_sale_price: number; sale_costs: number;
  debt_payoff: number; net_sale_proceeds: number; ownership_percent: number;
}
interface WaterfallTier {
  tier: number; name: string; lp: number; gp: number;
  pool_before: number; pool_after: number; description: string;
}
interface Assertion { name: string; passed: boolean; detail: string; }
interface ValidationData {
  validation_status: "PASS" | "FAIL";
  assertions: Assertion[];
  asset: { name: string; deal_name: string; jv_name: string; cost_basis: number; jv_fund_pct: number; equity_invested: number; };
  cf_bridge: BridgeRow[];
  sale_event: SaleEvent | null;
  jv_rollup: { fund_ownership_pct: number; ltd_asset_ncf: number; ltd_fund_operating_ncf: number; fund_sale_share: number; total_fund_distributions_gross: number; };
  gross_to_net_bridge: { gross_distributions: number; management_fees: number; total_fees: number; net_distributions: number; fee_drag_bps: number; };
  waterfall: { net_distributable: number; tiers: WaterfallTier[]; summary: { total_lp: number; total_gp: number; lp_moic: number }; };
  return_metrics: { gross_irr: number; net_irr: number; tvpi: number; dpi: number; rvpi: number; equity_invested: number; total_fund_distributions_gross: number; };
}

const fm = (v?: number | null) => v == null ? "—" : "$" + Math.round(v).toLocaleString();
const fp = (v?: number | null) => v == null ? "—" : (v * 100).toFixed(1) + "%";
const fx = (v?: number | null) => v == null ? "—" : v.toFixed(2) + "x";
const fi = (v?: number | null) => v == null ? "—" : (v * 100).toFixed(1) + "%";

const th = "px-3 py-2 text-left text-xs font-medium text-bm-muted2 uppercase tracking-wide whitespace-nowrap";
const td = "px-3 py-2 text-right text-xs tabular-nums text-bm-text whitespace-nowrap";
const tdL = "px-3 py-2 text-left text-xs text-bm-text";
const trC = "border-b border-bm-border/30 hover:bg-bm-surface/30";
const trH = "border-b border-bm-border/50 bg-bm-surface/20";
const card = "rounded-lg border border-bm-border/40 bg-bm-surface/10 overflow-hidden";
const cardH = "px-4 py-3 border-b border-bm-border/30 bg-bm-surface/20 flex items-center justify-between";

function LtdRow({ bridge }: { bridge: BridgeRow[] }) {
  return (
    <tr className="border-t-2 border-bm-border/50 bg-bm-surface/30">
      <td className={`${tdL} font-semibold text-bm-muted2`}>LTD</td>
      <td className={`${td} font-medium`}>{fm(bridge.reduce((s,r)=>s+r.revenue,0))}</td>
      <td className={`${td} text-red-400/80`}>({fm(bridge.reduce((s,r)=>s+r.opex,0))})</td>
      <td className={`${td} font-medium`}>{fm(bridge.reduce((s,r)=>s+r.noi,0))}</td>
      <td className={`${td} text-red-400/80`}>({fm(bridge.reduce((s,r)=>s+r.capex,0))})</td>
      <td />
      <td className={`${td} text-red-400/80`}>({fm(bridge.reduce((s,r)=>s+r.reserves,0))})</td>
      <td className={`${td} text-red-400/80`}>({fm(bridge.reduce((s,r)=>s+r.debt_service,0))})</td>
      <td className={`${td} text-green-400 font-bold`}>{fm(bridge.reduce((s,r)=>s+r.net_cash_flow,0))}</td>
      <td colSpan={3} />
    </tr>
  );
}

export default function ValidationPage() {
  const { envId } = useReEnv();
  const [data, setData] = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundId, setFundId] = useState(GOLDEN_FUND_ID);
  const [assetId, setAssetId] = useState(GOLDEN_ASSET_ID);

  async function run() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/re/v2/funds/${fundId}/chain-validation?asset_id=${assetId}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (envId) run(); }, [envId]); // eslint-disable-line react-hooks/exhaustive-deps

  const passCount = data?.assertions.filter((a) => a.passed).length ?? 0;
  const total = data?.assertions.length ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-bm-text">End-to-End Validation Harness</h1>
          <p className="text-sm text-bm-muted2 mt-0.5">
            Asset → JV → Investment → Fund → LP/GP Waterfall · Gateway Industrial Center
          </p>
        </div>
        {data && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium
            ${data.validation_status === "PASS"
              ? "bg-green-500/10 text-green-400 border border-green-500/30"
              : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
            {data.validation_status === "PASS" ? "✓" : "✗"} {passCount}/{total} {data.validation_status}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className={card}>
        <div className={cardH}>
          <span className="text-sm font-medium text-bm-text">Golden-Path Entity Chain</span>
          <button onClick={run} disabled={loading}
            className="px-3 py-1.5 rounded text-xs font-medium bg-bm-accent/10 border border-bm-accent/30 text-bm-accent hover:bg-bm-accent/20 disabled:opacity-50">
            {loading ? "Running…" : "Re-run validation"}
          </button>
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-3 text-xs">
          {([["Asset ID", assetId, setAssetId], ["Fund ID", fundId, setFundId]] as const).map(([label, val, set]) => (
            <label key={label}>
              <span className="text-bm-muted2 block mb-1">{label}</span>
              <input value={val} onChange={(e) => set(e.target.value)}
                className="w-full bg-bm-surface/20 border border-bm-border/40 rounded px-2 py-1 text-bm-text font-mono text-xs" />
            </label>
          ))}
        </div>
        {data && (
          <div className="px-4 pb-3 pt-2 grid grid-cols-4 gap-2 text-xs border-t border-bm-border/20">
            {([["Asset", data.asset.name], ["Deal", data.asset.deal_name],
               ["JV", data.asset.jv_name || "—"], ["Fund ownership", fp(data.asset.jv_fund_pct)]] as const).map(([l, v]) => (
              <div key={l}><span className="text-bm-muted2 block">{l}</span><span className="text-bm-text font-medium">{v}</span></div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</div>}
      {loading && <div className="text-center py-12 text-bm-muted2 text-sm animate-pulse">Running validation chain…</div>}

      {data && <>
        {/* Assertions */}
        <div className={card}>
          <div className={cardH}><span className="text-sm font-medium text-bm-text">Reconciliation Assertions</span></div>
          <table className="w-full">
            <thead><tr className={trH}>
              <th className={th}>Check</th>
              <th className={`${th} text-center`}>Status</th>
              <th className={th}>Detail</th>
            </tr></thead>
            <tbody>{data.assertions.map((a) => (
              <tr key={a.name} className={trC}>
                <td className={`${tdL} font-mono text-[11px]`}>{a.name}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium
                    ${a.passed ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                    {a.passed ? "PASS" : "FAIL"}
                  </span>
                </td>
                <td className={`${tdL} text-bm-muted2`}>{a.detail}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        {/* CF Bridge */}
        <div className={card}>
          <div className={cardH}>
            <span className="text-sm font-medium text-bm-text">Asset Cash Flow Bridge</span>
            <span className="text-xs text-bm-muted2">8 locked quarters · NNN industrial · IO debt</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead><tr className={trH}>
                {["Quarter","Revenue","OpEx","NOI","CapEx","TI/LC","Reserves","Debt Svc","NCF","Debt Bal","Asset Val","NAV"].map((h) =>
                  <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.cf_bridge.map((r) => (
                  <tr key={r.quarter} className={trC}>
                    <td className={`${tdL} font-medium`}>{r.quarter}</td>
                    <td className={td}>{fm(r.revenue)}</td>
                    <td className={`${td} text-red-400/80`}>({fm(r.opex)})</td>
                    <td className={`${td} font-medium`}>{fm(r.noi)}</td>
                    <td className={`${td} text-red-400/80`}>{r.capex ? `(${fm(r.capex)})` : "—"}</td>
                    <td className={td}>{r.ti_lc ? fm(r.ti_lc) : "—"}</td>
                    <td className={`${td} text-red-400/80`}>{r.reserves ? `(${fm(r.reserves)})` : "—"}</td>
                    <td className={`${td} text-red-400/80`}>({fm(r.debt_service)})</td>
                    <td className={`${td} text-green-400 font-semibold`}>{fm(r.net_cash_flow)}</td>
                    <td className={td}>{fm(r.debt_balance)}</td>
                    <td className={td}>{fm(r.asset_value)}</td>
                    <td className={td}>{fm(r.nav)}</td>
                  </tr>
                ))}
                <LtdRow bridge={data.cf_bridge} />
              </tbody>
            </table>
          </div>
          {data.sale_event && (
            <div className="border-t border-bm-border/30 px-4 py-3 bg-bm-surface/10">
              <p className="text-xs font-medium text-bm-muted2 mb-2">Terminal Sale — {data.sale_event.sale_date}</p>
              <div className="grid grid-cols-5 gap-3 text-xs">
                {([
                  ["Gross Price", fm(data.sale_event.gross_sale_price)],
                  ["Sale Costs", `(${fm(data.sale_event.sale_costs)})`],
                  ["Debt Payoff", `(${fm(data.sale_event.debt_payoff)})`],
                  ["Net Equity", fm(data.sale_event.net_sale_proceeds)],
                  [`Fund Share (${fp(data.sale_event.ownership_percent)})`, fm(data.jv_rollup.fund_sale_share)],
                ] as const).map(([l, v]) => (
                  <div key={l}>
                    <span className="text-bm-muted2 block">{l}</span>
                    <span className={`font-medium ${l.includes("Net") || l.includes("Fund") ? "text-green-400" : "text-bm-text"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* JV Rollup + G2N */}
        <div className="grid grid-cols-2 gap-4">
          <div className={card}>
            <div className={cardH}><span className="text-sm font-medium text-bm-text">JV → Fund Roll-up</span></div>
            <div className="px-4 py-3 space-y-2">
              {([
                ["Asset LTD operating NCF", fm(data.jv_rollup.ltd_asset_ncf)],
                ["× JV fund ownership", fp(data.jv_rollup.fund_ownership_pct)],
                ["= Fund operating NCF", fm(data.jv_rollup.ltd_fund_operating_ncf)],
                ["+ Fund sale share", fm(data.jv_rollup.fund_sale_share)],
                ["= Total gross distributions", fm(data.jv_rollup.total_fund_distributions_gross)],
              ] as const).map(([l, v]) => (
                <div key={l} className="flex justify-between text-xs">
                  <span className="text-bm-muted2">{l}</span>
                  <span className={`font-medium tabular-nums ${l.includes("Total") ? "text-green-400" : "text-bm-text"}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <div className={cardH}><span className="text-sm font-medium text-bm-text">Gross-to-Net Bridge</span></div>
            <div className="px-4 py-3 space-y-2">
              {([
                ["Gross distributions", fm(data.gross_to_net_bridge.gross_distributions)],
                ["Management fees (1.5%/yr)", `(${fm(data.gross_to_net_bridge.management_fees)})`],
                ["Other fund expenses", "—"],
                ["Net distributable", fm(data.gross_to_net_bridge.net_distributions)],
                ["Fee drag", `${data.gross_to_net_bridge.fee_drag_bps} bps`],
              ] as const).map(([l, v]) => (
                <div key={l} className="flex justify-between text-xs">
                  <span className="text-bm-muted2">{l}</span>
                  <span className={`font-medium tabular-nums ${l.includes("Net") ? "text-green-400" : "text-bm-text"}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Waterfall */}
        <div className={card}>
          <div className={cardH}>
            <span className="text-sm font-medium text-bm-text">Waterfall Tier Audit</span>
            <span className="text-xs text-bm-muted2">European-style · 8% pref · 20% carry</span>
          </div>
          <table className="w-full">
            <thead><tr className={trH}>
              {["Tier","Name","Pool Before","LP","GP","Pool After","Description"].map((h) =>
                <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.waterfall.tiers.map((t) => (
                <tr key={t.tier} className={trC}>
                  <td className={`${tdL} font-medium text-bm-muted2`}>{t.tier}</td>
                  <td className={`${tdL} font-mono text-[11px]`}>{t.name}</td>
                  <td className={td}>{fm(t.pool_before)}</td>
                  <td className={`${td} text-blue-400`}>{t.lp > 0 ? fm(t.lp) : "—"}</td>
                  <td className={`${td} text-amber-400`}>{t.gp > 0 ? fm(t.gp) : "—"}</td>
                  <td className={td}>{fm(t.pool_after)}</td>
                  <td className={`${tdL} text-bm-muted2 text-[11px] max-w-xs truncate`}>{t.description}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-bm-border/50 bg-bm-surface/30">
                <td colSpan={3} className={`${tdL} font-semibold text-bm-muted2`}>Total</td>
                <td className={`${td} text-blue-400 font-bold`}>{fm(data.waterfall.summary.total_lp)}</td>
                <td className={`${td} text-amber-400 font-bold`}>{fm(data.waterfall.summary.total_gp)}</td>
                <td className={td}>{fm(0)}</td>
                <td className={`${tdL} text-bm-muted2 text-xs`}>LP MOIC: {fx(data.waterfall.summary.lp_moic)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Return Metrics */}
        <div className={card}>
          <div className={cardH}><span className="text-sm font-medium text-bm-text">Return Metrics</span></div>
          <div className="px-4 py-3 grid grid-cols-7 gap-3">
            {([
              ["Gross IRR", fi(data.return_metrics.gross_irr), false],
              ["Net IRR", fi(data.return_metrics.net_irr), true],
              ["TVPI", fx(data.return_metrics.tvpi), true],
              ["DPI", fx(data.return_metrics.dpi), false],
              ["RVPI", fx(data.return_metrics.rvpi), false],
              ["Equity In", fm(data.return_metrics.equity_invested), false],
              ["Gross Dist.", fm(data.return_metrics.total_fund_distributions_gross), false],
            ] as const).map(([l, v, accent]) => (
              <div key={l} className="text-center">
                <div className={`text-lg font-bold ${accent ? "text-bm-accent" : "text-bm-text"}`}>{v}</div>
                <div className="text-[11px] text-bm-muted2 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Assumptions */}
        <div className={card}>
          <div className={cardH}><span className="text-sm font-medium text-bm-text">Modeling Assumptions & Data Gaps</span></div>
          <div className="px-4 py-3 space-y-1.5 text-xs text-bm-muted2">
            <p>✓ <strong className="text-bm-text">IO debt</strong> — no principal amortization. Repayment at sale only.</p>
            <p>✓ <strong className="text-bm-text">Single NNN tenant</strong> — occupancy 100%, no lease rollover risk or downtime.</p>
            <p>✓ <strong className="text-bm-text">Management fee</strong> — 1.5%/yr on invested equity. Fund-wide allocation not prorated across all deals.</p>
            <p>✓ <strong className="text-bm-text">Waterfall is deal-isolated</strong> — validates math for this chain; full IGF-VII waterfall runs via /waterfall/run.</p>
            <p>✓ <strong className="text-bm-text">IRR approximated</strong> — Newton-Raphson on quarterly CFs. Diverges ±50bps from XIRR on irregular dates.</p>
            <p>⚠ <strong className="text-bm-text">TI/LC = $0</strong> — NNN lease; non-NNN assets require tenant-level modeling.</p>
            <p>⚠ <strong className="text-bm-text">Reserves not tracked as escrow</strong> — accrued but not held in a reserve balance account.</p>
          </div>
        </div>
      </>}
    </div>
  );
}

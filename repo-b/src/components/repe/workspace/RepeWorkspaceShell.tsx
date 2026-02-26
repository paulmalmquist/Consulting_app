"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Landmark, PlusCircle } from "lucide-react";
import {
  listReV1Funds,
  listRepeAssets,
  listRepeDeals,
  listReV2Jvs,
  listReV2Scenarios,
  RepeAsset,
  RepeDeal,
  RepeFund,
  ReV2Jv,
  ReV2Scenario,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

function isActive(pathname: string, href: string, isBase: boolean): boolean {
  if (isBase) {
    // Base "Funds" item: only highlight on exact match or /funds/ sub-paths
    return pathname === href || pathname.startsWith(`${href}/funds/`) || pathname.startsWith(`${href}/funds`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function parsePathId(pathname: string, segment: string): string | null {
  const match = pathname.match(
    new RegExp(`/re/${segment}/([0-9a-fA-F-]{36})(?:/|$)`)
  );
  return match?.[1] || null;
}

export default function RepeWorkspaceShell({ children, envId }: { children: React.ReactNode; envId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { environment, businessId, loading, error, errorCode, requestId, retry } = useReEnv();

  const base = envId ? `/lab/env/${envId}/re` : "/app/repe";
  const navItems = useMemo(
    () => [
      { href: `${base}`, label: "Funds", isBase: true },
      { href: `${base}/deals`, label: "Investments", isBase: false },
      { href: `${base}/assets`, label: "Assets", isBase: false },
      { href: `${base}/scenarios`, label: "Scenarios", isBase: false },
      { href: `${base}/runs/quarter-close`, label: "Run Center", isBase: false },
    ],
    [base]
  );

  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [assets, setAssets] = useState<RepeAsset[]>([]);
  const [jvs, setJvs] = useState<ReV2Jv[]>([]);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [selectorFundId, setSelectorFundId] = useState("");
  const [selectorDealId, setSelectorDealId] = useState("");
  const [selectorJvId, setSelectorJvId] = useState("");
  const [selectorAssetId, setSelectorAssetId] = useState("");

  const pathFundId = parsePathId(pathname, "funds");
  const pathDealId = parsePathId(pathname, "deals") || parsePathId(pathname, "investments");
  const pathJvId = parsePathId(pathname, "jv");
  const pathAssetId = parsePathId(pathname, "assets");

  const activeFundId = pathFundId || selectorFundId;
  const activeDealId = pathDealId || selectorDealId;
  const activeJvId = pathJvId || selectorJvId;
  const activeAssetId = pathAssetId || selectorAssetId;

  // Load funds
  useEffect(() => {
    if (!businessId && !envId) return;
    let cancelled = false;
    listReV1Funds({ env_id: envId || undefined, business_id: businessId || undefined })
      .then((rows) => {
        if (cancelled) return;
        setFunds(rows);
        if (!pathFundId && rows[0]?.fund_id) setSelectorFundId(rows[0].fund_id);
      })
      .catch(() => { if (!cancelled) setFunds([]); });
    return () => { cancelled = true; };
  }, [businessId, envId, pathFundId]);

  // Load deals for selected fund
  useEffect(() => {
    if (!activeFundId) { setDeals([]); return; }
    let cancelled = false;
    listRepeDeals(activeFundId)
      .then((rows) => {
        if (cancelled) return;
        setDeals(rows);
        if (!pathDealId && rows[0]?.deal_id) setSelectorDealId(rows[0].deal_id);
      })
      .catch(() => { if (!cancelled) setDeals([]); });
    return () => { cancelled = true; };
  }, [activeFundId, pathDealId]);

  // Load JVs for selected deal
  useEffect(() => {
    if (!activeDealId) { setJvs([]); return; }
    let cancelled = false;
    listReV2Jvs(activeDealId)
      .then((rows) => {
        if (cancelled) return;
        setJvs(rows);
        if (!pathJvId && rows[0]?.jv_id) setSelectorJvId(rows[0].jv_id);
      })
      .catch(() => { if (!cancelled) setJvs([]); });
    return () => { cancelled = true; };
  }, [activeDealId, pathJvId]);

  // Load assets for selected deal
  useEffect(() => {
    if (!activeDealId) { setAssets([]); return; }
    let cancelled = false;
    listRepeAssets(activeDealId)
      .then((rows) => {
        if (cancelled) return;
        setAssets(rows);
        if (!pathAssetId && rows[0]?.asset_id) setSelectorAssetId(rows[0].asset_id);
      })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, [activeDealId, pathAssetId]);

  // Load scenarios for selected fund
  useEffect(() => {
    if (!activeFundId) { setScenarios([]); return; }
    let cancelled = false;
    listReV2Scenarios(activeFundId)
      .then((rows) => { if (!cancelled) setScenarios(rows); })
      .catch(() => { if (!cancelled) setScenarios([]); });
    return () => { cancelled = true; };
  }, [activeFundId]);

  const envLabel = environment?.client_name || envId || "Real Estate";
  const envSchema = environment?.schema_name || envId || "n/a";

  if (loading) {
    return <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">Resolving environment context...</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 space-y-4" data-testid="re-context-error">
        <h2 className="text-lg font-semibold">Unable to load Real Estate workspace</h2>
        <p className="text-sm text-red-300">{error}</p>
        {errorCode ? (
          <p className="text-xs text-bm-muted2 font-mono">Error: {errorCode}</p>
        ) : null}
        {requestId ? (
          <p className="text-xs text-bm-muted2">Request ID: {requestId}</p>
        ) : null}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void retry()}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
          >
            Retry
          </button>
          <a
            href={`/lab/env/${envId}`}
            className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
          >
            Back to Environment
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Environment Header */}
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-bm-muted2" />
              <h1 className="text-xl font-semibold">{envLabel}</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
                <Landmark size={12} /> Real Estate
              </span>
            </div>
            <p className="text-xs text-bm-muted2">
              {envSchema}{businessId ? ` · ${businessId.slice(0, 8)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${base}/funds/new`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"><PlusCircle size={14} /> Fund</Link>
            <Link href={`${base}/deals`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"><PlusCircle size={14} /> Investment</Link>
            <Link href={`${base}/assets`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"><PlusCircle size={14} /> Asset</Link>
          </div>
        </div>

        {/* Selectors: Fund → Investment → JV → Asset + Scenario */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Fund
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={activeFundId || ""} onChange={(e) => { setSelectorFundId(e.target.value); if (e.target.value) router.push(`${base}/funds/${e.target.value}`); }}>
              <option value="">Select fund</option>
              {funds.map((f) => <option key={f.fund_id} value={f.fund_id}>{f.name}</option>)}
            </select>
          </label>

          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Investment
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={activeDealId || ""} onChange={(e) => { setSelectorDealId(e.target.value); if (e.target.value) router.push(`${base}/investments/${e.target.value}`); }}>
              <option value="">Select investment</option>
              {deals.map((d) => <option key={d.deal_id} value={d.deal_id}>{d.name}</option>)}
            </select>
          </label>

          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            JV Entity
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={activeJvId || ""} onChange={(e) => { setSelectorJvId(e.target.value); if (e.target.value) router.push(`${base}/jv/${e.target.value}`); }}>
              <option value="">Select JV</option>
              {jvs.map((j) => <option key={j.jv_id} value={j.jv_id}>{j.legal_name}</option>)}
            </select>
          </label>

          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Asset
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={activeAssetId || ""} onChange={(e) => { setSelectorAssetId(e.target.value); if (e.target.value) router.push(`${base}/assets/${e.target.value}`); }}>
              <option value="">Select asset</option>
              {assets.map((a) => <option key={a.asset_id} value={a.asset_id}>{a.name}</option>)}
            </select>
          </label>

          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Scenario
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm" defaultValue="">
              <option value="">Base</option>
              {scenarios.filter((s) => !s.is_base).map((s) => (
                <option key={s.scenario_id} value={s.scenario_id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[200px,1fr]">
        <aside className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 h-fit" data-testid="repe-sidebar">
          <nav className="space-y-1" data-testid="repe-left-nav">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}
                className={`block rounded-lg border px-3 py-2 text-sm transition ${isActive(pathname, item.href, item.isBase) ? "border-bm-accent/60 bg-bm-accent/10" : "border-bm-border/70 hover:bg-bm-surface/40"}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}

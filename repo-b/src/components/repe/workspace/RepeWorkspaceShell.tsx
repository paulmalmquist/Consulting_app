"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Landmark, PlusCircle } from "lucide-react";
import { listReV1Funds, listRepeAssets, listRepeDeals, RepeAsset, RepeDeal, RepeFund } from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function parsePathId(pathname: string, segment: "funds" | "deals" | "assets"): string | null {
  const match = pathname.match(
    new RegExp(`/re/${segment}/([0-9a-fA-F-]{36})(?:/|$)`)
  );
  return match?.[1] || null;
}

export default function RepeWorkspaceShell({ children, envId }: { children: React.ReactNode; envId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { environment, businessId, loading, error, requestId, retry } = useReEnv();

  const base = envId ? `/lab/env/${envId}/re` : "/app/repe";
  const navItems = useMemo(
    () => [
      { href: `${base}`, label: "Home" },
      { href: `${base}/funds`, label: "Funds" },
      { href: `${base}/deals`, label: "Investments" },
      { href: `${base}/assets`, label: "Assets" },
    ],
    [base]
  );

  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [deals, setDeals] = useState<RepeDeal[]>([]);
  const [assets, setAssets] = useState<RepeAsset[]>([]);
  const [selectorFundId, setSelectorFundId] = useState("");
  const [selectorDealId, setSelectorDealId] = useState("");
  const [selectorAssetId, setSelectorAssetId] = useState("");

  const pathFundId = parsePathId(pathname, "funds");
  const pathDealId = parsePathId(pathname, "deals");
  const pathAssetId = parsePathId(pathname, "assets");

  const activeFundId = pathFundId || selectorFundId;
  const activeDealId = pathDealId || selectorDealId;
  const activeAssetId = pathAssetId || selectorAssetId;

  useEffect(() => {
    if (!businessId && !envId) return;
    let cancelled = false;
    listReV1Funds({
      env_id: envId || undefined,
      business_id: businessId || undefined,
    })
      .then((rows) => {
        if (cancelled) return;
        setFunds(rows);
        if (!pathFundId && rows[0]?.fund_id) {
          setSelectorFundId(rows[0].fund_id);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFunds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, envId, pathFundId]);

  useEffect(() => {
    if (!activeFundId) {
      setDeals([]);
      return;
    }
    let cancelled = false;
    listRepeDeals(activeFundId)
      .then((rows) => {
        if (cancelled) return;
        setDeals(rows);
        if (!pathDealId && rows[0]?.deal_id) {
          setSelectorDealId(rows[0].deal_id);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDeals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFundId, pathDealId]);

  useEffect(() => {
    if (!activeDealId) {
      setAssets([]);
      return;
    }
    let cancelled = false;
    listRepeAssets(activeDealId)
      .then((rows) => {
        if (cancelled) return;
        setAssets(rows);
        if (!pathAssetId && rows[0]?.asset_id) {
          setSelectorAssetId(rows[0].asset_id);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDealId, pathAssetId]);

  const envLabel = environment?.client_name || envId || "Real Estate";
  const envSchema = environment?.schema_name || envId || "n/a";

  if (loading) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">
        Resolving environment context...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid="re-context-error">
        <h2 className="text-lg font-semibold">Unable to load Real Estate context</h2>
        <p className="text-sm text-red-300">{error}</p>
        {requestId ? <p className="text-xs text-bm-muted2">Request ID: {requestId}</p> : null}
        <button
          type="button"
          onClick={() => void retry()}
          className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-bm-muted2" />
              <h1 className="text-xl font-semibold">{envLabel}</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
                <Landmark size={12} /> Real Estate
              </span>
            </div>
            <p className="text-xs text-bm-muted2">
              Environment: {envSchema}
              {businessId ? ` · Business: ${businessId.slice(0, 8)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${base}/funds/new`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              <PlusCircle size={14} /> New Fund
            </Link>
            <Link href={`${base}/deals`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              <PlusCircle size={14} /> New Investment
            </Link>
            <Link href={`${base}/assets`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              <PlusCircle size={14} /> New Asset
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Fund
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={activeFundId || ""}
              onChange={(e) => {
                const next = e.target.value;
                setSelectorFundId(next);
                if (next) router.push(`${base}/funds/${next}`);
              }}
            >
              <option value="">Select fund</option>
              {funds.map((fund) => (
                <option key={fund.fund_id} value={fund.fund_id}>{fund.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Investment
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={activeDealId || ""}
              onChange={(e) => {
                const next = e.target.value;
                setSelectorDealId(next);
                if (next) router.push(`${base}/deals/${next}`);
              }}
            >
              <option value="">Select investment</option>
              {deals.map((deal) => (
                <option key={deal.deal_id} value={deal.deal_id}>{deal.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Asset
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={activeAssetId || ""}
              onChange={(e) => {
                const next = e.target.value;
                setSelectorAssetId(next);
                if (next) router.push(`${base}/assets/${next}`);
              }}
            >
              <option value="">Select asset</option>
              {assets.map((asset) => (
                <option key={asset.asset_id} value={asset.asset_id}>{asset.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">
            Scenario
            <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm" defaultValue="base">
              <option value="base">Base</option>
            </select>
          </label>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
        <aside className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 h-fit" data-testid="repe-sidebar">
          <p className="mb-2 px-1 text-xs uppercase tracking-[0.12em] text-bm-muted2">Navigation</p>
          <nav className="space-y-1" data-testid="repe-left-nav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg border px-3 py-2 text-sm transition ${
                  isActive(pathname, item.href)
                    ? "border-bm-accent/60 bg-bm-accent/10"
                    : "border-bm-border/70 hover:bg-bm-surface/40"
                }`}
              >
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

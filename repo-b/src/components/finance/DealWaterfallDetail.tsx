"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  createFinanceScenario,
  getFinanceDeal,
  type DealDetails,
} from "@/lib/finance-api";

export default function DealWaterfallDetail({ dealId }: { dealId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<DealDetails | null>(null);
  const [newScenarioName, setNewScenarioName] = useState("Base What-If");
  const [creatingScenario, setCreatingScenario] = useState(false);

  useEffect(() => {
    getFinanceDeal(dealId)
      .then((payload) => {
        setDeal(payload);
        setError(null);
      })
      .catch((err) => {
        setDeal(null);
        setError(err instanceof Error ? err.message : "Failed to load deal");
      })
      .finally(() => setLoading(false));
  }, [dealId]);

  const primaryWaterfall = useMemo(() => deal?.waterfalls?.[0] || null, [deal]);

  async function handleCreateScenario() {
    if (!deal) return;
    setCreatingScenario(true);
    setError(null);

    try {
      const created = await createFinanceScenario(dealId, {
        name: newScenarioName,
        description: "User-generated scenario",
        as_of_date: deal.deal.start_date,
        assumptions: [
          { key: "sale_price", value_num: 18_000_000 },
          { key: "exit_date", value_text: "2028-12-31" },
          { key: "exit_cap_rate", value_num: 0.0525 },
          { key: "noi_growth", value_num: 0.025 },
          { key: "asset_mgmt_fee", value_num: 60_000 },
        ],
      });

      window.location.href = `/app/finance/deals/${dealId}/scenario/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario creation failed");
    } finally {
      setCreatingScenario(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-bm-muted">Loading deal...</p>;
  }

  if (!deal) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-bm-danger">Deal not found.</p>
        {error && <p className="text-xs text-bm-muted">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bm-text">{deal.deal.name}</h1>
          <p className="text-sm text-bm-muted mt-1">
            {deal.deal.fund_name} · {deal.deal.strategy || "No strategy"}
          </p>
        </div>
        <Link href="/app/finance/deals" className="text-sm text-bm-accent hover:text-bm-accent2">
          Back to deals
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Partners
          </CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {deal.partners.map((p) => (
              <div key={p.id} className="rounded-lg border border-bm-border/70 p-3 bg-bm-surface/30">
                <p className="font-medium text-sm text-bm-text">{p.name}</p>
                <p className="text-xs text-bm-muted">
                  {p.role} · {(Number(p.ownership_pct) * 100).toFixed(1)}% ownership · ${Number(p.commitment_amount).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Waterfall Tiers
          </CardTitle>

          {!primaryWaterfall ? (
            <p className="text-sm text-bm-muted">No waterfall found on this deal.</p>
          ) : (
            <div className="rounded-xl border border-bm-border/70 overflow-x-auto">
              <table className="w-full text-sm" data-testid="waterfall-tier-table">
                <thead className="bg-bm-surface/40 text-bm-muted2 text-xs uppercase tracking-[0.12em]">
                  <tr>
                    <th className="text-left px-3 py-2">Order</th>
                    <th className="text-left px-3 py-2">Tier</th>
                    <th className="text-left px-3 py-2">Hurdle IRR</th>
                    <th className="text-left px-3 py-2">Pref</th>
                    <th className="text-left px-3 py-2">Catch-Up</th>
                    <th className="text-left px-3 py-2">LP / GP Split</th>
                    <th className="text-left px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {primaryWaterfall.tiers.map((tier) => (
                    <tr key={`${tier.tier_order}-${tier.id || "tier"}`} className="border-t border-bm-border/50">
                      <td className="px-3 py-2">{tier.tier_order}</td>
                      <td className="px-3 py-2">{tier.tier_type}</td>
                      <td className="px-3 py-2">{tier.hurdle_irr ?? "-"}</td>
                      <td className="px-3 py-2">{tier.pref_rate ?? "-"}</td>
                      <td className="px-3 py-2">{tier.catch_up_pct ?? "-"}</td>
                      <td className="px-3 py-2">
                        {tier.split_lp ?? "-"} / {tier.split_gp ?? "-"}
                      </td>
                      <td className="px-3 py-2">{tier.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Scenarios
          </CardTitle>

          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={newScenarioName} onChange={(e) => setNewScenarioName(e.target.value)} />
            <Button disabled={creatingScenario || !newScenarioName} onClick={handleCreateScenario}>
              {creatingScenario ? "Creating..." : "Create Scenario"}
            </Button>
          </div>

          <div className="space-y-2">
            {deal.scenarios.length === 0 ? (
              <p className="text-sm text-bm-muted">No scenarios yet.</p>
            ) : (
              deal.scenarios.map((scenario) => (
                <Link
                  key={scenario.id}
                  href={`/app/finance/deals/${dealId}/scenario/${scenario.id}`}
                  className="block rounded-lg border border-bm-border/70 px-3 py-2 hover:bg-bm-surface/40"
                >
                  <p className="font-medium text-sm text-bm-text">{scenario.name}</p>
                  <p className="text-xs text-bm-muted">
                    as of {scenario.as_of_date} · {scenario.assumptions.length} assumptions
                  </p>
                </Link>
              ))
            )}
          </div>

          {error && <p className="text-sm text-bm-danger">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

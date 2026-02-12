"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  createFinanceDeal,
  listFinanceDeals,
  type WaterfallTier,
} from "@/lib/finance-api";

function defaultTiers(): WaterfallTier[] {
  return [
    {
      tier_order: 1,
      tier_type: "return_of_capital",
      split_lp: 0.9,
      split_gp: 0.1,
      notes: "Return of capital pro-rata",
    },
    {
      tier_order: 2,
      tier_type: "preferred_return",
      pref_rate: 0.08,
      split_lp: 1,
      split_gp: 0,
      notes: "8% LP preferred return",
    },
    {
      tier_order: 3,
      tier_type: "catch_up",
      catch_up_pct: 0.5,
      split_lp: 0.5,
      split_gp: 0.5,
      notes: "50/50 catch-up",
    },
    {
      tier_order: 4,
      tier_type: "split",
      hurdle_irr: 0.14,
      split_lp: 0.8,
      split_gp: 0.2,
      notes: "80/20 until LP 14% IRR",
    },
    {
      tier_order: 5,
      tier_type: "split",
      split_lp: 0.7,
      split_gp: 0.3,
      notes: "70/30 above hurdle",
    },
  ];
}

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function DealWaterfallLanding() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deals, setDeals] = useState<Array<Record<string, unknown>>>([]);

  const [fundName, setFundName] = useState("Sunset Growth Fund I");
  const [dealName, setDealName] = useState("Sunset Commons JV");
  const [strategy, setStrategy] = useState("Value-Add Multifamily");
  const [startDate, setStartDate] = useState("2024-01-15");
  const [distributionFrequency, setDistributionFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [tiers, setTiers] = useState<WaterfallTier[]>(defaultTiers());

  useEffect(() => {
    listFinanceDeals()
      .then((rows) => {
        setDeals(rows);
        setError(null);
      })
      .catch((err) => {
        setDeals([]);
        setError(err instanceof Error ? err.message : "Failed to load deals");
      })
      .finally(() => setLoading(false));
  }, []);

  const totalSplitCheck = useMemo(
    () =>
      tiers.every((t) => {
        if (t.split_lp == null || t.split_gp == null) return true;
        const total = Number(t.split_lp) + Number(t.split_gp);
        return Math.abs(total - 1) < 0.0001;
      }),
    [tiers]
  );

  async function handleCreateDeal() {
    setSaving(true);
    setError(null);

    try {
      const created = await createFinanceDeal({
        fund_name: fundName,
        deal_name: dealName,
        strategy,
        start_date: startDate,
        currency: "USD",
        seed_default_scenario: true,
        property: {
          name: "Sunset Commons",
          city: "Austin",
          state: "TX",
          postal_code: "78701",
          country: "US",
          property_type: "multifamily",
        },
        partners: [
          {
            name: "Blue Oak Capital",
            role: "LP",
            commitment_amount: 9_000_000,
            ownership_pct: 0.9,
            has_promote: false,
          },
          {
            name: "Winston Sponsor",
            role: "GP",
            commitment_amount: 1_000_000,
            ownership_pct: 0.1,
            has_promote: true,
          },
        ],
        waterfall: {
          name: "Sunset Standard Waterfall",
          distribution_frequency: distributionFrequency,
          promote_structure_type: "american",
          tiers,
        },
      });

      router.push(`/app/finance/deals/${created.deal_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create deal failed");
    } finally {
      setSaving(false);
    }
  }

  function updateTier(index: number, patch: Partial<WaterfallTier>) {
    setTiers((prev) =>
      prev.map((tier, idx) => (idx === index ? { ...tier, ...patch } : tier))
    );
  }

  function moveTier(index: number, direction: -1 | 1) {
    setTiers((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((tier, idx) => ({ ...tier, tier_order: idx + 1 }));
    });
  }

  function removeTier(index: number) {
    setTiers((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((tier, idx) => ({ ...tier, tier_order: idx + 1 }))
    );
  }

  function addTier() {
    setTiers((prev) => [
      ...prev,
      {
        tier_order: prev.length + 1,
        tier_type: "split",
        split_lp: 0.7,
        split_gp: 0.3,
      },
    ]);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-bm-text">Deal Waterfall Model</h1>
        <p className="text-sm text-bm-muted mt-1">
          Create JV deals, define promote tiers, and run deterministic scenario analyses.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Deal Setup Wizard
          </CardTitle>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-bm-muted mb-1">Fund Name</label>
              <Input value={fundName} onChange={(e) => setFundName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Deal Name</label>
              <Input value={dealName} onChange={(e) => setDealName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Strategy</label>
              <Input value={strategy} onChange={(e) => setStrategy(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Distribution Frequency</label>
              <Select
                value={distributionFrequency}
                onChange={(e) => setDistributionFrequency(e.target.value as "monthly" | "quarterly")}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-bm-border/70 overflow-x-auto">
            <table className="w-full text-sm" data-testid="waterfall-tier-table">
              <thead className="bg-bm-surface/50 text-bm-muted2 text-xs uppercase tracking-[0.12em]">
                <tr>
                  <th className="text-left px-3 py-2">Order</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Pref</th>
                  <th className="text-left px-3 py-2">Hurdle IRR</th>
                  <th className="text-left px-3 py-2">Catch-Up %</th>
                  <th className="text-left px-3 py-2">LP Split</th>
                  <th className="text-left px-3 py-2">GP Split</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, idx) => (
                  <tr key={`${tier.tier_order}-${idx}`} className="border-t border-bm-border/50">
                    <td className="px-3 py-2">{tier.tier_order}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={tier.tier_type}
                        onChange={(e) =>
                          updateTier(idx, {
                            tier_type: e.target.value as WaterfallTier["tier_type"],
                          })
                        }
                      >
                        <option value="return_of_capital">return_of_capital</option>
                        <option value="preferred_return">preferred_return</option>
                        <option value="catch_up">catch_up</option>
                        <option value="split">split</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={tier.pref_rate ?? ""}
                        onChange={(e) => updateTier(idx, { pref_rate: toNumber(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={tier.hurdle_irr ?? ""}
                        onChange={(e) => updateTier(idx, { hurdle_irr: toNumber(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={tier.catch_up_pct ?? ""}
                        onChange={(e) => updateTier(idx, { catch_up_pct: toNumber(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={tier.split_lp ?? ""}
                        onChange={(e) => updateTier(idx, { split_lp: toNumber(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={tier.split_gp ?? ""}
                        onChange={(e) => updateTier(idx, { split_gp: toNumber(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => moveTier(idx, -1)}>
                          ↑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => moveTier(idx, 1)}>
                          ↓
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeTier(idx)}>
                          ✕
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={addTier}>
              Add Tier
            </Button>
            {!totalSplitCheck && (
              <p className="text-xs text-bm-warning">Each tier split should sum to 1.0.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 px-3 py-2 text-sm text-bm-text">
              {error}
            </div>
          )}

          <Button
            onClick={handleCreateDeal}
            disabled={saving || !dealName || !fundName || !startDate || !totalSplitCheck}
            data-testid="deal-create"
          >
            {saving ? "Creating..." : "Create Deal"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Existing Deals
          </CardTitle>
          {loading ? (
            <p className="text-sm text-bm-muted">Loading deals...</p>
          ) : deals.length === 0 ? (
            <p className="text-sm text-bm-muted">No deals found.</p>
          ) : (
            <div className="space-y-2">
              {deals.map((deal) => (
                <Link
                  key={String(deal.id)}
                  href={`/app/finance/deals/${String(deal.id)}`}
                  className="block rounded-lg border border-bm-border/70 px-3 py-2 hover:bg-bm-surface/40"
                >
                  <p className="font-medium text-sm text-bm-text">{String(deal.name)}</p>
                  <p className="text-xs text-bm-muted">
                    {String(deal.fund_name)} · {String(deal.strategy || "-")}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

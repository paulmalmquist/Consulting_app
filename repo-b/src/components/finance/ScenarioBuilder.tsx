"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  getFinanceDeal,
  runFinanceModel,
  updateFinanceScenario,
  type DealDetails,
  type ScenarioAssumption,
} from "@/lib/finance-api";

function extractAssumption(
  assumptions: ScenarioAssumption[],
  key: string
): string {
  const found = assumptions.find((a) => a.key === key);
  if (!found) return "";
  if (found.value_num != null) return String(found.value_num);
  if (found.value_text != null) return String(found.value_text);
  if (found.value_json != null) return JSON.stringify(found.value_json);
  return "";
}

export default function ScenarioBuilder({
  dealId,
  scenarioId,
}: {
  dealId: string;
  scenarioId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deal, setDeal] = useState<DealDetails | null>(null);
  const [scenarioName, setScenarioName] = useState("Base");
  const [asOfDate, setAsOfDate] = useState("2024-01-15");
  const [exitDate, setExitDate] = useState("2028-12-31");
  const [salePrice, setSalePrice] = useState("18000000");
  const [exitCapRate, setExitCapRate] = useState("0.0525");
  const [noiGrowth, setNoiGrowth] = useState("0.025");
  const [capexBudget, setCapexBudget] = useState("1250000");
  const [debtRate, setDebtRate] = useState("0.0600");
  const [debtIo, setDebtIo] = useState("24");
  const [refinanceDate, setRefinanceDate] = useState("2026-06-30");
  const [refinanceProceeds, setRefinanceProceeds] = useState("3000000");
  const [assetMgmtFee, setAssetMgmtFee] = useState("60000");
  const [dispositionFee, setDispositionFee] = useState("0.01");

  useEffect(() => {
    getFinanceDeal(dealId)
      .then((payload) => {
        setDeal(payload);
        const current = payload.scenarios.find((s) => s.id === scenarioId) || payload.scenarios[0];
        if (!current) {
          setError("Scenario not found");
          return;
        }
        setScenarioName(current.name);
        setAsOfDate(current.as_of_date);
        setExitDate(extractAssumption(current.assumptions, "exit_date") || "2028-12-31");
        setSalePrice(extractAssumption(current.assumptions, "sale_price") || "18000000");
        setExitCapRate(extractAssumption(current.assumptions, "exit_cap_rate") || "0.0525");
        setNoiGrowth(extractAssumption(current.assumptions, "noi_growth") || "0.025");
        setCapexBudget(extractAssumption(current.assumptions, "capex_budget") || "1250000");
        setDebtRate(extractAssumption(current.assumptions, "debt_rate") || "0.06");
        setDebtIo(extractAssumption(current.assumptions, "debt_io") || "24");
        setRefinanceDate(extractAssumption(current.assumptions, "refinance_date") || "2026-06-30");
        setRefinanceProceeds(
          extractAssumption(current.assumptions, "refinance_proceeds") || "3000000"
        );
        setAssetMgmtFee(extractAssumption(current.assumptions, "asset_mgmt_fee") || "60000");
        setDispositionFee(extractAssumption(current.assumptions, "disposition_fee") || "0.01");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load scenario"))
      .finally(() => setLoading(false));
  }, [dealId, scenarioId]);

  const waterfallId = useMemo(() => deal?.waterfalls?.[0]?.id, [deal]);

  const assumptions: ScenarioAssumption[] = useMemo(
    () => [
      { key: "exit_date", value_text: exitDate },
      { key: "sale_price", value_num: Number(salePrice) },
      { key: "exit_cap_rate", value_num: Number(exitCapRate) },
      { key: "noi_growth", value_num: Number(noiGrowth) },
      { key: "capex_budget", value_num: Number(capexBudget) },
      { key: "debt_rate", value_num: Number(debtRate) },
      { key: "debt_io", value_num: Number(debtIo) },
      { key: "refinance_date", value_text: refinanceDate },
      { key: "refinance_proceeds", value_num: Number(refinanceProceeds) },
      { key: "asset_mgmt_fee", value_num: Number(assetMgmtFee) },
      { key: "disposition_fee", value_num: Number(dispositionFee) },
    ],
    [
      exitDate,
      salePrice,
      exitCapRate,
      noiGrowth,
      capexBudget,
      debtRate,
      debtIo,
      refinanceDate,
      refinanceProceeds,
      assetMgmtFee,
      dispositionFee,
    ]
  );

  async function handleSaveScenario() {
    setSaving(true);
    setError(null);

    try {
      await updateFinanceScenario(scenarioId, {
        name: scenarioName,
        as_of_date: asOfDate,
        assumptions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scenario");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunModel() {
    if (!waterfallId) {
      setError("No waterfall configured for this deal");
      return;
    }

    setRunning(true);
    setError(null);

    try {
      await updateFinanceScenario(scenarioId, {
        name: scenarioName,
        as_of_date: asOfDate,
        assumptions,
      });

      const run = await runFinanceModel(dealId, {
        scenario_id: scenarioId,
        waterfall_id: waterfallId,
      });
      window.location.href = `/app/finance/runs/${run.model_run_id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-bm-muted">Loading scenario...</p>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bm-text">Scenario Builder</h1>
          <p className="text-sm text-bm-muted mt-1">Deal ID: {dealId}</p>
        </div>
        <Link href={`/app/finance/deals/${dealId}`} className="text-sm text-bm-accent hover:text-bm-accent2">
          Back to deal
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Base / Downside / Upside What-If Inputs
          </CardTitle>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-bm-muted mb-1">Scenario Name</label>
              <Input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">As Of Date</label>
              <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Exit Date</label>
              <Input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                data-testid="scenario-input-exit-date"
              />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Sale Price</label>
              <Input
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                data-testid="scenario-input-sale-price"
              />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Exit Cap Rate</label>
              <Input value={exitCapRate} onChange={(e) => setExitCapRate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">NOI Growth (annual)</label>
              <Input value={noiGrowth} onChange={(e) => setNoiGrowth(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Capex Budget</label>
              <Input value={capexBudget} onChange={(e) => setCapexBudget(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Debt Rate</label>
              <Input value={debtRate} onChange={(e) => setDebtRate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Debt IO (months)</label>
              <Input value={debtIo} onChange={(e) => setDebtIo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Refinance Date</label>
              <Input type="date" value={refinanceDate} onChange={(e) => setRefinanceDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Refinance Proceeds</label>
              <Input value={refinanceProceeds} onChange={(e) => setRefinanceProceeds(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Asset Mgmt Fee</label>
              <Input value={assetMgmtFee} onChange={(e) => setAssetMgmtFee(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Disposition Fee</label>
              <Input value={dispositionFee} onChange={(e) => setDispositionFee(e.target.value)} />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 px-3 py-2 text-sm text-bm-text">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleSaveScenario} disabled={saving || running}>
              {saving ? "Saving..." : "Save Scenario"}
            </Button>
            <Button onClick={handleRunModel} disabled={running || saving} data-testid="run-model">
              {running ? "Running..." : "Run Model"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

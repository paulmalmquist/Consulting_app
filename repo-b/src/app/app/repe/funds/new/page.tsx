"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BosApiError, createReV1Fund } from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { useToast } from "@/components/ui/Toast";

function parseRequestId(error: unknown): string | null {
  const req = (error as BosApiError | undefined)?.requestId;
  if (req) return req;
  const msg = error instanceof Error ? error.message : String(error || "");
  return msg.match(/req:\s*([a-zA-Z0-9_-]+)/i)?.[1] || null;
}

const STEP_TITLES = ["Basic Info", "Investment Policy", "Ownership Setup"];

export default function ReFundCreateWizardPage() {
  const router = useRouter();
  const basePath = useRepeBasePath();
  const { push } = useToast();
  const { environmentId, businessId } = useRepeContext();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    strategy: "equity" as "equity" | "debt",
    fund_type: "closed_end" as "closed_end" | "open_end" | "sma" | "co_invest",
    base_currency: "USD",
    inception_date: "",
    quarter_cadence: "quarterly" as "monthly" | "quarterly" | "semi_annual" | "annual",
    sub_strategy: "",
    vintage_year: new Date().getUTCFullYear(),
    target_size: "",
    target_sectors: "",
    target_geographies: "",
    target_leverage_min: "",
    target_leverage_max: "",
    target_hold_period_min_years: "",
    target_hold_period_max_years: "",
    gp_entity_name: "",
    lp_name: "",
    lp_ownership_percent: "",
    preferred_return_rate: "0.08",
    carry_rate: "0.20",
    initial_waterfall_template: "european" as "european" | "american",
  });

  const canContinue = useMemo(() => {
    if (step === 0) {
      return Boolean(
        form.name.trim() &&
          form.strategy &&
          form.base_currency.trim() &&
          form.inception_date &&
          form.quarter_cadence
      );
    }
    if (step === 1) return true;
    return true;
  }, [form, step]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!environmentId && !businessId) {
      setError("Missing environment context for fund creation.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setRequestId(null);
    try {
      const created = await createReV1Fund({
        env_id: environmentId || undefined,
        business_id: businessId || undefined,
        name: form.name,
        strategy: form.strategy,
        fund_type: form.fund_type,
        vintage_year: form.vintage_year,
        sub_strategy: form.sub_strategy || undefined,
        target_size: form.target_size || undefined,
        base_currency: form.base_currency,
        inception_date: form.inception_date,
        quarter_cadence: form.quarter_cadence,
        target_sectors: form.target_sectors
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        target_geographies: form.target_geographies
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        target_leverage_min: form.target_leverage_min || undefined,
        target_leverage_max: form.target_leverage_max || undefined,
        target_hold_period_min_years: form.target_hold_period_min_years
          ? Number(form.target_hold_period_min_years)
          : undefined,
        target_hold_period_max_years: form.target_hold_period_max_years
          ? Number(form.target_hold_period_max_years)
          : undefined,
        gp_entity_name: form.gp_entity_name || undefined,
        lp_entities: form.lp_name
          ? [
              {
                name: form.lp_name,
                ownership_percent: form.lp_ownership_percent || undefined,
              },
            ]
          : undefined,
        preferred_return_rate: form.preferred_return_rate || undefined,
        carry_rate: form.carry_rate || undefined,
        waterfall_style: form.initial_waterfall_template,
        initial_waterfall_template: form.initial_waterfall_template,
      });

      push({
        title: "Fund created",
        description: `${created.name} is ready`,
        variant: "success",
      });
      router.push(`${basePath}/funds/${created.fund_id}`);
    } catch (err) {
      const reqId = parseRequestId(err);
      setRequestId(reqId);
      setError(err instanceof Error ? err.message : "Failed to create fund");
      push({
        title: "Fund creation failed",
        description: reqId ? `Request ID: ${reqId}` : "Check details and retry.",
        variant: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-5 space-y-4" data-testid="re-fund-create-wizard">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Create Fund</p>
        <h2 className="text-2xl font-semibold mt-1">Fund Creation Wizard</h2>
        <p className="text-sm text-bm-muted2 mt-1">Step {step + 1} of 3 · {STEP_TITLES[step]}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {step === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              Fund Name
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
            </label>
            <label className="text-sm">
              Strategy
              <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.strategy} onChange={(e) => setForm((v) => ({ ...v, strategy: e.target.value as "equity" | "debt" }))}>
                <option value="equity">Equity</option>
                <option value="debt">Debt</option>
              </select>
            </label>
            <label className="text-sm">
              Base Currency
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.base_currency} onChange={(e) => setForm((v) => ({ ...v, base_currency: e.target.value.toUpperCase() }))} required />
            </label>
            <label className="text-sm">
              Inception Date
              <input type="date" className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.inception_date} onChange={(e) => setForm((v) => ({ ...v, inception_date: e.target.value }))} required />
            </label>
            <label className="text-sm">
              Quarter Cadence
              <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.quarter_cadence} onChange={(e) => setForm((v) => ({ ...v, quarter_cadence: e.target.value as typeof v.quarter_cadence }))}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </label>
            <label className="text-sm">
              Vintage Year
              <input type="number" className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.vintage_year} onChange={(e) => setForm((v) => ({ ...v, vintage_year: Number(e.target.value) || new Date().getUTCFullYear() }))} />
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm md:col-span-2">
              Target Sectors (comma separated)
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.target_sectors} onChange={(e) => setForm((v) => ({ ...v, target_sectors: e.target.value }))} />
            </label>
            <label className="text-sm md:col-span-2">
              Target Geographies (comma separated)
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.target_geographies} onChange={(e) => setForm((v) => ({ ...v, target_geographies: e.target.value }))} />
            </label>
            <label className="text-sm">
              Target Leverage Min
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" placeholder="0.45" value={form.target_leverage_min} onChange={(e) => setForm((v) => ({ ...v, target_leverage_min: e.target.value }))} />
            </label>
            <label className="text-sm">
              Target Leverage Max
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" placeholder="0.70" value={form.target_leverage_max} onChange={(e) => setForm((v) => ({ ...v, target_leverage_max: e.target.value }))} />
            </label>
            <label className="text-sm">
              Hold Period Min (years)
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.target_hold_period_min_years} onChange={(e) => setForm((v) => ({ ...v, target_hold_period_min_years: e.target.value }))} />
            </label>
            <label className="text-sm">
              Hold Period Max (years)
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.target_hold_period_max_years} onChange={(e) => setForm((v) => ({ ...v, target_hold_period_max_years: e.target.value }))} />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              GP Entity Name
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.gp_entity_name} onChange={(e) => setForm((v) => ({ ...v, gp_entity_name: e.target.value }))} placeholder="Acme GP LLC" />
            </label>
            <label className="text-sm">
              Initial Waterfall Template
              <select className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.initial_waterfall_template} onChange={(e) => setForm((v) => ({ ...v, initial_waterfall_template: e.target.value as "european" | "american" }))}>
                <option value="european">European</option>
                <option value="american">American</option>
              </select>
            </label>
            <label className="text-sm">
              LP Entity Name (optional)
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.lp_name} onChange={(e) => setForm((v) => ({ ...v, lp_name: e.target.value }))} />
            </label>
            <label className="text-sm">
              LP Ownership % (decimal)
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" placeholder="0.80" value={form.lp_ownership_percent} onChange={(e) => setForm((v) => ({ ...v, lp_ownership_percent: e.target.value }))} />
            </label>
            <label className="text-sm">
              Preferred Return
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.preferred_return_rate} onChange={(e) => setForm((v) => ({ ...v, preferred_return_rate: e.target.value }))} />
            </label>
            <label className="text-sm">
              Carry Rate
              <input className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2" value={form.carry_rate} onChange={(e) => setForm((v) => ({ ...v, carry_rate: e.target.value }))} />
            </label>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" data-testid="re-fund-create-error">
            <p>{error}</p>
            {requestId ? <p className="text-xs mt-1">Request ID: {requestId}</p> : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-40"
            disabled={step === 0 || submitting}
          >
            Back
          </button>

          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => Math.min(2, prev + 1))}
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={!canContinue || submitting}
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={submitting}
            >
              {submitting ? "Creating Fund..." : "Create Fund"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

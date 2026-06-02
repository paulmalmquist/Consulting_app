"use client";

import React, { FormEvent, useMemo, useState } from "react";
import {
  AUDIENCE_MULTIPLIERS,
  OUTPUT_MULTIPLIERS,
  ROLE_MULTIPLIERS,
  computeRoiReframe,
  type OutputType,
  type RoleType,
  type ServedAudience,
} from "@/lib/marketing/aiRoi/calculator";

const ROLE_LABELS: Record<RoleType, string> = {
  individual: "Individual contributor",
  analyst: "Analyst or specialist",
  manager: "Manager",
  executive: "Executive",
  revenue_or_client: "Revenue or client-facing role",
};

const AUDIENCE_LABELS: Record<ServedAudience, string> = {
  self: "Self",
  team: "Team",
  function: "Function",
  executive_board: "Executives or board",
  customer_investor: "Customers or investors",
};

const OUTPUT_LABELS: Record<OutputType, string> = {
  task: "Task completion",
  recurring_report: "Recurring report",
  decision_packet: "Decision packet",
  customer_asset: "Customer or investor asset",
};

type SubmitState = "idle" | "posting" | "created" | "error";

function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function RoiCalculator() {
  const [annualCompensation, setAnnualCompensation] = useState(120000);
  const [freedHoursPerWeek, setFreedHoursPerWeek] = useState(3);
  const [roleType, setRoleType] = useState<RoleType>("analyst");
  const [servedAudience, setServedAudience] = useState<ServedAudience>("executive_board");
  const [outputType, setOutputType] = useState<OutputType>("decision_packet");
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitReason, setSubmitReason] = useState("");

  const inputs = useMemo(
    () => ({ annualCompensation, freedHoursPerWeek, roleType, servedAudience, outputType }),
    [annualCompensation, freedHoursPerWeek, roleType, servedAudience, outputType],
  );
  const result = useMemo(() => computeRoiReframe(inputs), [inputs]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (result.nullReason) {
      setSubmitState("error");
      setSubmitReason(result.nullReason);
      return;
    }

    setSubmitState("posting");
    setSubmitReason("");
    const response = await fetch("/api/public/ai-roi-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        company_name: companyName || undefined,
        source: "ai_roi_calculator",
        payload_json: { inputs, result },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitState("error");
      setSubmitReason(String(payload.reason || payload.error || "Submission failed."));
      return;
    }
    setSubmitState("created");
  };

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="nv-card nv-card-pad min-w-0 space-y-5">
        <div>
          <p className="nv-eyebrow">Inputs</p>
          <h2 className="nv-h3" style={{ marginTop: 8 }}>Same pay, different value path</h2>
          <p className="nv-small" style={{ marginTop: 8, color: "rgb(var(--nv-text-tertiary))" }}>
            Illustrative model. Not a quote.
          </p>
        </div>

        <label className="block">
          <span className="nv-small">Annual compensation</span>
          <input
            type="number"
            min="1"
            value={annualCompensation}
            onChange={(event) => setAnnualCompensation(Number(event.target.value))}
            className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
          />
        </label>

        <label className="block">
          <span className="nv-small">Freed hours per week</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={freedHoursPerWeek}
            onChange={(event) => setFreedHoursPerWeek(Number(event.target.value))}
            className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
          />
        </label>

        <label className="block">
          <span className="nv-small">Role type</span>
          <select
            value={roleType}
            onChange={(event) => setRoleType(event.target.value as RoleType)}
            className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
          >
            {(Object.keys(ROLE_MULTIPLIERS) as RoleType[]).map((key) => (
              <option key={key} value={key}>{ROLE_LABELS[key]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="nv-small">Who consumes the output?</span>
          <select
            value={servedAudience}
            onChange={(event) => setServedAudience(event.target.value as ServedAudience)}
            className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
          >
            {(Object.keys(AUDIENCE_MULTIPLIERS) as ServedAudience[]).map((key) => (
              <option key={key} value={key}>{AUDIENCE_LABELS[key]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="nv-small">What does the work produce?</span>
          <select
            value={outputType}
            onChange={(event) => setOutputType(event.target.value as OutputType)}
            className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
          >
            {(Object.keys(OUTPUT_MULTIPLIERS) as OutputType[]).map((key) => (
              <option key={key} value={key}>{OUTPUT_LABELS[key]}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="nv-card nv-card-pad min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="nv-eyebrow">Result</p>
            <h2 className="nv-h3" style={{ marginTop: 8 }}>Value multiplier: {result.selectedCombinedMultiplier ?? "-"}x</h2>
          </div>
          <span className="nv-pill nv-pill-copper">Illustrative model</span>
        </div>

        {result.nullReason ? (
          <div className="rounded-nv-md border border-nv-risk/25 bg-nv-risk/10 p-4 text-sm text-nv-muted">
            {result.nullReason}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="nv-kpi">
                <div className="nv-klabel"><span className="nv-small">Hours/year</span></div>
                <div className="nv-kvalue">{formatNumber(result.recoverableHoursPerYear)}</div>
              </div>
              <div className="nv-kpi">
                <div className="nv-klabel"><span className="nv-small">Salary slice</span></div>
                <div className="nv-kvalue">{formatCurrency(result.baseSalaryEquivalentAnnual)}</div>
              </div>
              <div className="nv-kpi">
                <div className="nv-klabel"><span className="nv-small">Annual range</span></div>
                <div className="text-2xl font-medium text-nv-text">
                  {formatCurrency(result.annualIllustrativeRangeLow)}-{formatCurrency(result.annualIllustrativeRangeHigh)}
                </div>
              </div>
            </div>

            <p className="nv-body" style={{ margin: 0 }}>{result.insight}</p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-nv-dim">
                  <tr>
                    <th className="border-b border-nv-text/10 py-2 font-medium">Role</th>
                    <th className="border-b border-nv-text/10 py-2 font-medium">Multiplier</th>
                    <th className="border-b border-nv-text/10 py-2 font-medium">Illustrative annual value</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparisons.map((item) => (
                    <tr key={item.roleType} className={item.roleType === roleType ? "text-nv-teal" : "text-nv-muted"}>
                      <td className="border-b border-nv-text/5 py-2">{ROLE_LABELS[item.roleType]}</td>
                      <td className="border-b border-nv-text/5 py-2">{item.combinedMultiplier}x</td>
                      <td className="border-b border-nv-text/5 py-2">
                        {formatCurrency(item.annualIllustrativeRangeLow)}-{formatCurrency(item.annualIllustrativeRangeHigh)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-nv-md border border-nv-text/10 bg-nv-bg/40 p-4">
              <p className="nv-small" style={{ margin: 0 }}>
                The monthly illustrative range for the selected role is{" "}
                <strong className="text-nv-text">
                  {formatCurrency(result.monthlyIllustrativeRangeLow)}-{formatCurrency(result.monthlyIllustrativeRangeHigh)}
                </strong>
                . The point is not the dollar claim. The point is where AI time savings matter most.
              </p>
            </div>

            {!emailOpen ? (
              <button type="button" className="nv-btn nv-btn-primary" onClick={() => setEmailOpen(true)}>
                Email me this result
              </button>
            ) : (
              <form className="grid gap-3 rounded-nv-md border border-nv-text/10 bg-nv-bg/40 p-4" onSubmit={handleSubmit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="nv-small">Work email</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
                    />
                  </label>
                  <label>
                    <span className="nv-small">Company</span>
                    <input
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
                    />
                  </label>
                </div>
                <button type="submit" className="nv-btn nv-btn-primary w-fit" disabled={submitState === "posting"}>
                  {submitState === "posting" ? "Sending" : "Send result"}
                </button>
                {submitState === "created" && <p className="nv-small text-nv-teal">Result captured.</p>}
                {submitState === "error" && <p className="nv-small text-nv-risk">{submitReason}</p>}
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}

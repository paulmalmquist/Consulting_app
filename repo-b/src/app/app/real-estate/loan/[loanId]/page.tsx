"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ReEvent,
  ReLoanDetail,
  ReSurveillance,
  ReUnderwriteRun,
  ReWorkoutCase,
  createReEvent,
  createReSurveillance,
  createReUnderwriteRun,
  createReWorkoutAction,
  createReWorkoutCase,
  getReLoan,
  listReEvents,
  listReSurveillance,
  listReUnderwriteRuns,
  listReWorkoutCases,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

function money(cents?: number | null) {
  if (typeof cents !== "number") return "n/a";
  return `$${(cents / 100).toLocaleString()}`;
}

export default function RealEstateLoanCommandCenterPage({ params }: { params: { loanId: string } }) {
  const loanId = params.loanId;
  const { businessId } = useBusinessContext();
  const [loanDetail, setLoanDetail] = useState<ReLoanDetail | null>(null);
  const [surveillance, setSurveillance] = useState<ReSurveillance[]>([]);
  const [runs, setRuns] = useState<ReUnderwriteRun[]>([]);
  const [cases, setCases] = useState<ReWorkoutCase[]>([]);
  const [events, setEvents] = useState<ReEvent[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [noi, setNoi] = useState("180000000");
  const [occupancy, setOccupancy] = useState("0.9");
  const [dscr, setDscr] = useState("1.2");

  const [capRate, setCapRate] = useState("0.0625");
  const [stabilizedNoi, setStabilizedNoi] = useState("");
  const [amortizationYears, setAmortizationYears] = useState("");

  const [workoutSummary, setWorkoutSummary] = useState("Initial workout case");
  const [workoutActionSummary, setWorkoutActionSummary] = useState("Collect updated rent roll");
  const [eventDesc, setEventDesc] = useState("Borrower requested covenant waiver.");
  const [eventDocId, setEventDocId] = useState("doc_mock_1");

  async function refresh() {
    const [d, s, r, w, e] = await Promise.all([
      getReLoan(loanId),
      listReSurveillance(loanId),
      listReUnderwriteRuns(loanId),
      listReWorkoutCases(loanId),
      listReEvents(loanId),
    ]);
    setLoanDetail(d);
    setSurveillance(s);
    setRuns(r);
    setCases(w);
    setEvents(e);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load loan command center"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId]);

  const latestRun = runs[0];
  const latestOutputs = (latestRun?.outputs_json || {}) as Record<string, unknown>;
  const riskFlags = Array.isArray(latestOutputs.risk_flags) ? latestOutputs.risk_flags : [];

  const trendPoints = useMemo(
    () =>
      surveillance
        .slice()
        .reverse()
        .map((row) => ({
          label: row.period_end_date,
          dscr: row.dscr ?? null,
          occupancy: row.occupancy ?? null,
        })),
    [surveillance]
  );

  async function onAddSurveillance(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Saving surveillance...");
    try {
      await createReSurveillance(loanId, {
        business_id: businessId,
        period_end_date: periodEnd,
        noi_cents: Number(noi),
        occupancy: Number(occupancy),
        dscr: Number(dscr),
        metrics_json: {},
      });
      setStatus("Surveillance saved.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save surveillance");
      setStatus("");
    }
  }

  async function onRunUnderwrite(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Running re-underwrite...");
    try {
      await createReUnderwriteRun(loanId, {
        business_id: businessId,
        cap_rate: Number(capRate),
        stabilized_noi_cents: stabilizedNoi ? Number(stabilizedNoi) : undefined,
        amortization_years: amortizationYears ? Number(amortizationYears) : undefined,
      });
      setStatus("Re-underwrite completed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Underwrite run failed");
      setStatus("");
    }
  }

  async function onCreateWorkoutCase() {
    if (!businessId) return;
    setError(null);
    setStatus("Creating workout case...");
    try {
      const created = await createReWorkoutCase(loanId, {
        business_id: businessId,
        summary: workoutSummary,
      });
      await createReWorkoutAction(created.case_id, {
        business_id: businessId,
        action_type: "collect_docs",
        summary: workoutActionSummary,
      });
      setStatus("Workout case and action created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workout case");
      setStatus("");
    }
  }

  async function onCreateEvent() {
    if (!businessId) return;
    setError(null);
    setStatus("Creating event...");
    try {
      await createReEvent(loanId, {
        business_id: businessId,
        event_type: "servicing_note",
        event_date: new Date().toISOString().slice(0, 10),
        severity: "medium",
        description: eventDesc,
        document_ids: eventDocId ? [eventDocId] : [],
      });
      setStatus("Event created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
      setStatus("");
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <section className="bm-glass rounded-xl p-4 space-y-2" data-testid="re-loan-header">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Loan Command Center</p>
        <h1 className="text-2xl font-bold">{loanDetail?.loan.loan_identifier || loanId}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-bm-muted2">
          <span>Status: {loanDetail?.loan.servicer_status || "n/a"}</span>
          <span>Balance: {money(loanDetail?.loan.current_balance_cents)}</span>
          <span>Maturity: {loanDetail?.loan.maturity_date || "n/a"}</span>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bm-glass rounded-xl p-3"><p className="text-xs text-bm-muted2">DSCR</p><p className="text-lg font-semibold">{latestOutputs.dscr_est ? Number(latestOutputs.dscr_est).toFixed(2) : "n/a"}</p></div>
        <div className="bm-glass rounded-xl p-3"><p className="text-xs text-bm-muted2">LTV</p><p className="text-lg font-semibold">{latestOutputs.ltv ? `${(Number(latestOutputs.ltv) * 100).toFixed(1)}%` : "n/a"}</p></div>
        <div className="bm-glass rounded-xl p-3"><p className="text-xs text-bm-muted2">Value</p><p className="text-lg font-semibold">{latestOutputs.value ? `$${Math.round(Number(latestOutputs.value)).toLocaleString()}` : "n/a"}</p></div>
        <div className="bm-glass rounded-xl p-3"><p className="text-xs text-bm-muted2">Occupancy</p><p className="text-lg font-semibold">{loanDetail?.latest_surveillance?.occupancy ? `${(Number(loanDetail.latest_surveillance.occupancy) * 100).toFixed(1)}%` : "n/a"}</p></div>
        <div className="bm-glass rounded-xl p-3"><p className="text-xs text-bm-muted2">NOI</p><p className="text-lg font-semibold">{money((loanDetail?.latest_surveillance?.noi_cents as number | undefined) ?? null)}</p></div>
      </section>

      <section className="bm-glass rounded-xl p-4">
        <h2 className="font-semibold mb-2">Risk Flags</h2>
        <div className="flex flex-wrap gap-2">
          {riskFlags.length === 0 && <span className="text-sm text-bm-muted2">No flags on latest run.</span>}
          {riskFlags.map((flag) => (
            <span key={String(flag)} className="rounded-full bg-orange-500/20 text-orange-200 px-2 py-1 text-xs">
              {String(flag)}
            </span>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={onAddSurveillance} className="bm-glass rounded-xl p-4 space-y-2">
          <h2 className="font-semibold">Surveillance</h2>
          <input data-testid="re-surveillance-period" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <input data-testid="re-surveillance-noi" value={noi} onChange={(e) => setNoi(e.target.value)} placeholder="NOI cents" className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <input data-testid="re-surveillance-occupancy" value={occupancy} onChange={(e) => setOccupancy(e.target.value)} placeholder="Occupancy decimal" className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <input data-testid="re-surveillance-dscr" value={dscr} onChange={(e) => setDscr(e.target.value)} placeholder="DSCR" className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <button data-testid="re-add-surveillance" className="bm-btn bm-btn-primary" type="submit">Add Surveillance</button>
          <div className="space-y-1 text-xs text-bm-muted2">
            {trendPoints.map((point) => (
              <div key={point.label}>{point.label}: dscr {point.dscr ?? "n/a"} / occ {point.occupancy ?? "n/a"}</div>
            ))}
          </div>
        </form>

        <form onSubmit={onRunUnderwrite} className="bm-glass rounded-xl p-4 space-y-2">
          <h2 className="font-semibold">Underwrite Runs</h2>
          <button type="button" className="bm-btn" data-testid="re-run-underwrite">Run Re-Underwrite</button>
          <input data-testid="re-underwrite-cap-rate" value={capRate} onChange={(e) => setCapRate(e.target.value)} placeholder="Cap rate" className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <input data-testid="re-underwrite-noi" value={stabilizedNoi} onChange={(e) => setStabilizedNoi(e.target.value)} placeholder="Stabilized NOI cents (optional)" className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <input data-testid="re-underwrite-amort" value={amortizationYears} onChange={(e) => setAmortizationYears(e.target.value)} placeholder="Amortization years (optional)" className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" />
          <button data-testid="re-underwrite-submit" className="bm-btn bm-btn-primary" type="submit">Submit Run</button>
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.underwrite_run_id} className="rounded-lg border border-bm-border/60 bg-bm-surface/30 p-2" data-testid={`re-underwrite-run-${run.underwrite_run_id}`}>
                <p className="text-sm font-medium">Version {run.version}</p>
                <p className="text-xs text-bm-muted2">Value: {run.outputs_json.value ? `$${Math.round(Number(run.outputs_json.value)).toLocaleString()}` : "n/a"}</p>
              </div>
            ))}
          </div>
          {latestOutputs.diff !== undefined && latestOutputs.diff !== null && (
            <pre className="rounded-lg border border-bm-border/60 bg-black/20 p-2 text-xs overflow-x-auto" data-testid="re-underwrite-diff">
              {JSON.stringify(latestOutputs.diff, null, 2)}
            </pre>
          )}
        </form>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bm-glass rounded-xl p-4 space-y-2">
          <h2 className="font-semibold">Workout Cases</h2>
          <input value={workoutSummary} onChange={(e) => setWorkoutSummary(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" placeholder="Case summary" />
          <input value={workoutActionSummary} onChange={(e) => setWorkoutActionSummary(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" placeholder="Initial action summary" />
          <button className="bm-btn bm-btn-primary" onClick={onCreateWorkoutCase}>Create Case + Action</button>
          <div className="space-y-2">
            {cases.map((c) => (
              <div key={c.case_id} className="rounded-lg border border-bm-border/60 bg-bm-surface/30 p-2">
                <p className="text-sm font-medium">{c.case_status}</p>
                <p className="text-xs text-bm-muted2">{c.summary || "No summary"}</p>
                <p className="text-xs text-bm-muted2">Actions: {c.actions?.length || 0}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bm-glass rounded-xl p-4 space-y-2">
          <h2 className="font-semibold">Events</h2>
          <textarea value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" rows={3} />
          <input value={eventDocId} onChange={(e) => setEventDocId(e.target.value)} className="w-full rounded-lg border border-bm-border/60 bg-bm-surface/40 px-3 py-2" placeholder="Document ID (optional)" />
          <button className="bm-btn bm-btn-primary" onClick={onCreateEvent}>Create Event</button>
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.event_id} className="rounded-lg border border-bm-border/60 bg-bm-surface/30 p-2">
                <p className="text-sm font-medium">{ev.event_type}</p>
                <p className="text-xs text-bm-muted2">{ev.description}</p>
                <p className="text-xs text-bm-muted2">Attachments: {ev.document_ids.length}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {status && <p className="text-xs text-bm-muted2">{status}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  getAmortizationSchedule,
  generateAmortizationSchedule,
  type AmortizationRow,
  type FiLoan,
} from "@/lib/bos-api";
import { Button } from "@/components/ui/Button";

type Props = {
  loan: FiLoan;
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AmortizationViewer({ loan }: Props) {
  const [schedule, setSchedule] = useState<AmortizationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const canGenerate =
    loan.amort_type !== "interest_only" &&
    loan.amortization_period_years != null &&
    loan.term_years != null;

  async function loadSchedule() {
    setLoading(true);
    setError(null);
    try {
      const rows = await getAmortizationSchedule(loan.id);
      setSchedule(rows);
      setGenerated(true);
    } catch {
      setError("No schedule stored. Generate one first.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const rows = await generateAmortizationSchedule(loan.id);
      setSchedule(rows);
      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate schedule");
    } finally {
      setLoading(false);
    }
  }

  if (!canGenerate) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        Interest-only loan — no amortization schedule applicable.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold">{loan.loan_name} — Amortization</h4>
        <span className="text-xs text-muted-foreground">
          {loan.amortization_period_years}yr amort / {loan.term_years}yr term
          {loan.io_period_months ? ` / ${loan.io_period_months}mo IO` : ""}
          {loan.balloon_flag ? " / balloon" : ""}
        </span>
      </div>

      <div className="flex gap-2">
        {!generated && (
          <Button size="sm" variant="secondary" onClick={loadSchedule} disabled={loading}>
            Load Schedule
          </Button>
        )}
        <Button size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating…" : "Generate Schedule"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {schedule.length > 0 && (
        <div className="max-h-96 overflow-auto border rounded">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-right">Beg. Balance</th>
                <th className="px-2 py-1 text-right">Principal</th>
                <th className="px-2 py-1 text-right">Interest</th>
                <th className="px-2 py-1 text-right">Payment</th>
                <th className="px-2 py-1 text-right">End Balance</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr key={row.period_number} className="border-t">
                  <td className="px-2 py-1">{row.period_number}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(row.beginning_balance)}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(row.scheduled_principal)}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(row.interest_payment)}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(row.total_payment)}</td>
                  <td className="px-2 py-1 text-right">{fmtMoney(row.ending_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

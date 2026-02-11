"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { useBusinessContext } from "@/lib/business-context";
import { formatCurrency, formatDate, useAccountingStore } from "@/lib/accounting/store";

export default function GeneralLedgerView() {
  const { businessId } = useBusinessContext();
  const { ready, journalEntries } = useAccountingStore(businessId);

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">General Ledger Stub</h1>
        <Badge variant="accent">{journalEntries.length} journal entries</Badge>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-bm-muted">
            Journal entries are generated when AP bills move through approval and payment.
          </p>

          {!ready ? (
            <p className="text-sm text-bm-muted">Loading entries...</p>
          ) : journalEntries.length === 0 ? (
            <p className="text-sm text-bm-muted">No entries posted yet.</p>
          ) : (
            <div className="space-y-3" data-testid="journal-entry-list">
              {journalEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-bm-border/70 bg-bm-surface/25 p-3" data-testid={`journal-entry-${entry.id}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{entry.description}</p>
                    <Badge variant={entry.posted ? "success" : "warning"}>{entry.posted ? "posted" : "draft"}</Badge>
                  </div>
                  <p className="text-xs text-bm-muted2 mb-2">{formatDate(entry.date)}</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-bm-muted2 uppercase tracking-[0.12em]">
                        <th className="text-left py-1">Account</th>
                        <th className="text-right py-1">Debit</th>
                        <th className="text-right py-1">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines.map((line, index) => (
                        <tr key={`${entry.id}-${index}`} className="border-t border-bm-border/40">
                          <td className="py-1">{line.account}</td>
                          <td className="py-1 text-right">{line.debit ? formatCurrency(line.debit) : "-"}</td>
                          <td className="py-1 text-right">{line.credit ? formatCurrency(line.credit) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

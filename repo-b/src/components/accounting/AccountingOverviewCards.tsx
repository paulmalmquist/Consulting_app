"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { useBusinessContext } from "@/lib/business-context";
import { formatCurrency, useAccountingStore } from "@/lib/accounting/store";

export default function AccountingOverviewCards() {
  const { businessId } = useBusinessContext();
  const { ready, summary } = useAccountingStore(businessId);

  if (!ready) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="accounting-overview-cards">
        <div className="h-24 rounded-xl border border-bm-border/60 bg-bm-surface/25 animate-pulse" />
        <div className="h-24 rounded-xl border border-bm-border/60 bg-bm-surface/25 animate-pulse" />
        <div className="h-24 rounded-xl border border-bm-border/60 bg-bm-surface/25 animate-pulse" />
        <div className="h-24 rounded-xl border border-bm-border/60 bg-bm-surface/25 animate-pulse" />
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="accounting-overview-cards">
      <Card>
        <CardContent>
          <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">Total AP Outstanding</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.totalApOutstanding)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">Bills Due in 7 Days</p>
          <p className="mt-2 text-2xl font-semibold">{summary.billsDueNext7Days}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">Total Paid This Month</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.totalPaidThisMonth)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">Vendor Count</p>
          <p className="mt-2 text-2xl font-semibold">{summary.vendorCount}</p>
        </CardContent>
      </Card>
    </section>
  );
}

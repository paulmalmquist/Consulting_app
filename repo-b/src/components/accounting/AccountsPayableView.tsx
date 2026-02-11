"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useBusinessContext } from "@/lib/business-context";
import { formatCurrency, formatDate, useAccountingStore, type BillInput } from "@/lib/accounting/store";
import type { BillStatus } from "@/types/accounting";

type BillFormState = {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  expenseAccount: string;
  description: string;
};

const EMPTY_BILL: BillFormState = {
  vendorId: "",
  invoiceNumber: "",
  invoiceDate: "",
  dueDate: "",
  amount: "",
  expenseAccount: "6000 - Expense",
  description: "",
};

function badgeVariant(status: BillStatus): "default" | "warning" | "success" {
  if (status === "paid") return "success";
  if (status === "approved") return "accent";
  return "default";
}

function toInput(form: BillFormState): BillInput | null {
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const invoiceDate = new Date(`${form.invoiceDate}T00:00:00.000Z`);
  const dueDate = new Date(`${form.dueDate}T00:00:00.000Z`);
  if (Number.isNaN(invoiceDate.getTime()) || Number.isNaN(dueDate.getTime())) return null;
  return {
    vendorId: form.vendorId,
    invoiceNumber: form.invoiceNumber.trim(),
    invoiceDate,
    dueDate,
    amount,
    expenseAccount: form.expenseAccount.trim(),
    description: form.description.trim(),
  };
}

export default function AccountsPayableView() {
  const { businessId } = useBusinessContext();
  const { ready, vendors, bills, addBill, setBillStatus } = useAccountingStore(businessId);
  const [statusFilter, setStatusFilter] = useState<"all" | BillStatus>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BillFormState>(EMPTY_BILL);

  const vendorMap = useMemo(() => {
    return new Map(vendors.map((vendor) => [vendor.id, vendor]));
  }, [vendors]);

  const rows = useMemo(() => {
    const ordered = [...bills].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (statusFilter === "all") return ordered;
    return ordered.filter((bill) => bill.status === statusFilter);
  }, [bills, statusFilter]);

  const submitBill = () => {
    const payload = toInput(form);
    if (!payload || !payload.vendorId || !payload.invoiceNumber || !payload.expenseAccount) return;
    addBill(payload);
    setOpen(false);
    setForm(EMPTY_BILL);
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Accounts Payable</h1>
        <Button data-testid="add-bill-button" onClick={() => setOpen(true)}>Add Bill</Button>
      </div>

      <div className="flex items-center gap-3">
        <Select
          aria-label="Filter bills by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | BillStatus)}
          className="max-w-[220px]"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
        </Select>
        <Badge variant="accent">{rows.length} bills</Badge>
      </div>

      {!ready ? (
        <Card>
          <CardContent>
            <p className="text-sm text-bm-muted">Loading AP bills...</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm" data-testid="bill-table">
              <thead>
                <tr className="border-b border-bm-border/70 text-left text-xs uppercase tracking-[0.12em] text-bm-muted2">
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Invoice Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((bill) => {
                  const vendor = vendorMap.get(bill.vendorId);
                  return (
                    <tr key={bill.id} data-testid={`bill-row-${bill.id}`} className="border-b border-bm-border/40">
                      <td className="px-4 py-3">{vendor?.name || "Unknown Vendor"}</td>
                      <td className="px-4 py-3 font-medium">{bill.invoiceNumber}</td>
                      <td className="px-4 py-3">{formatDate(bill.invoiceDate)}</td>
                      <td className="px-4 py-3">{formatDate(bill.dueDate)}</td>
                      <td className="px-4 py-3">{formatCurrency(bill.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={badgeVariant(bill.status)} data-testid={`bill-status-${bill.id}`}>
                          {bill.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {bill.status === "draft" ? (
                            <Button size="sm" variant="secondary" onClick={() => setBillStatus(bill.id, "approved")}>
                              Approve
                            </Button>
                          ) : null}
                          {bill.status === "approved" ? (
                            <Button size="sm" onClick={() => setBillStatus(bill.id, "paid")}>
                              Mark Paid
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add Bill"
        description="Create AP bill"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="bill-modal">
          <Select value={form.vendorId} onChange={(e) => setForm((prev) => ({ ...prev, vendorId: e.target.value }))}>
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </Select>
          <Input placeholder="Invoice #" value={form.invoiceNumber} onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} />
          <Input type="date" placeholder="Invoice Date" value={form.invoiceDate} onChange={(e) => setForm((prev) => ({ ...prev, invoiceDate: e.target.value }))} />
          <Input type="date" placeholder="Due Date" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
          <Input placeholder="Amount" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
          <Input placeholder="Expense account" value={form.expenseAccount} onChange={(e) => setForm((prev) => ({ ...prev, expenseAccount: e.target.value }))} />
          <Input className="sm:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submitBill}>Add Bill</Button>
        </div>
      </Dialog>
    </div>
  );
}

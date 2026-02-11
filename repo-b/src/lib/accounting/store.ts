"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MOCK_BILLS, MOCK_VENDORS } from "@/data/accounting/mockVendors";
import type {
  Bill,
  BillStatus,
  JournalEntry,
  PaymentTerms,
  Vendor,
  VendorStatus,
} from "@/types/accounting";

const STORAGE_PREFIX = "bos_accounting_data_v1";
const AP_ACCOUNT = "2000 - Accounts Payable";
const CASH_ACCOUNT = "1000 - Cash";

type SerializedVendor = Omit<Vendor, "createdAt"> & { createdAt: string };
type SerializedBill = Omit<Bill, "invoiceDate" | "dueDate" | "createdAt"> & {
  invoiceDate: string;
  dueDate: string;
  createdAt: string;
};
type SerializedJournalEntry = Omit<JournalEntry, "date"> & { date: string };

type AccountingState = {
  vendors: Vendor[];
  bills: Bill[];
  journalEntries: JournalEntry[];
};

type SerializedState = {
  vendors: SerializedVendor[];
  bills: SerializedBill[];
  journalEntries: SerializedJournalEntry[];
};

export type VendorInput = {
  name: string;
  legalName: string;
  taxId: string;
  address: Vendor["address"];
  email: string;
  phone: string;
  paymentTerms: PaymentTerms;
  defaultExpenseAccount: string;
  is1099Eligible: boolean;
};

export type BillInput = {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  amount: number;
  expenseAccount: string;
  description: string;
};

export type AccountingSummary = {
  totalApOutstanding: number;
  billsDueNext7Days: number;
  totalPaidThisMonth: number;
  vendorCount: number;
};

function uid(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

function copyVendor(vendor: Vendor): Vendor {
  return {
    ...vendor,
    address: { ...vendor.address },
    createdAt: cloneDate(vendor.createdAt),
  };
}

function copyBill(bill: Bill): Bill {
  return {
    ...bill,
    invoiceDate: cloneDate(bill.invoiceDate),
    dueDate: cloneDate(bill.dueDate),
    createdAt: cloneDate(bill.createdAt),
  };
}

function copyJournalEntry(entry: JournalEntry): JournalEntry {
  return {
    ...entry,
    date: cloneDate(entry.date),
    lines: entry.lines.map((line) => ({ ...line })),
  };
}

function createSeedState(): AccountingState {
  return {
    vendors: MOCK_VENDORS.map(copyVendor),
    bills: MOCK_BILLS.map(copyBill),
    journalEntries: [],
  };
}

function serializeState(state: AccountingState): SerializedState {
  return {
    vendors: state.vendors.map((vendor) => ({ ...vendor, createdAt: vendor.createdAt.toISOString() })),
    bills: state.bills.map((bill) => ({
      ...bill,
      invoiceDate: bill.invoiceDate.toISOString(),
      dueDate: bill.dueDate.toISOString(),
      createdAt: bill.createdAt.toISOString(),
    })),
    journalEntries: state.journalEntries.map((entry) => ({
      ...entry,
      date: entry.date.toISOString(),
      lines: entry.lines.map((line) => ({ ...line })),
    })),
  };
}

function deserializeState(raw: SerializedState): AccountingState {
  return {
    vendors: raw.vendors.map((vendor) => ({
      ...vendor,
      address: { ...vendor.address },
      createdAt: new Date(vendor.createdAt),
    })),
    bills: raw.bills.map((bill) => ({
      ...bill,
      invoiceDate: new Date(bill.invoiceDate),
      dueDate: new Date(bill.dueDate),
      createdAt: new Date(bill.createdAt),
    })),
    journalEntries: raw.journalEntries.map((entry) => ({
      ...entry,
      date: new Date(entry.date),
      lines: entry.lines.map((line) => ({ ...line })),
    })),
  };
}

function storageKeyForBusiness(businessId?: string | null): string {
  return `${STORAGE_PREFIX}:${businessId || "default"}`;
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function coerceState(value: unknown): AccountingState | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<SerializedState>;
  if (!Array.isArray(maybe.vendors) || !Array.isArray(maybe.bills) || !Array.isArray(maybe.journalEntries)) {
    return null;
  }
  const vendorsValid = maybe.vendors.every((vendor) => {
    const row = vendor as Partial<SerializedVendor>;
    return (
      typeof row.id === "string" &&
      typeof row.name === "string" &&
      typeof row.legalName === "string" &&
      typeof row.taxId === "string" &&
      typeof row.email === "string" &&
      typeof row.phone === "string" &&
      (row.paymentTerms === "Net 15" || row.paymentTerms === "Net 30" || row.paymentTerms === "Net 45") &&
      typeof row.defaultExpenseAccount === "string" &&
      typeof row.is1099Eligible === "boolean" &&
      (row.status === "active" || row.status === "inactive") &&
      !!row.address &&
      typeof row.address.street === "string" &&
      typeof row.address.city === "string" &&
      typeof row.address.state === "string" &&
      typeof row.address.zip === "string" &&
      typeof row.address.country === "string" &&
      isValidDate(row.createdAt)
    );
  });

  const billsValid = maybe.bills.every((bill) => {
    const row = bill as Partial<SerializedBill>;
    return (
      typeof row.id === "string" &&
      typeof row.vendorId === "string" &&
      typeof row.invoiceNumber === "string" &&
      isValidDate(row.invoiceDate) &&
      isValidDate(row.dueDate) &&
      typeof row.amount === "number" &&
      (row.status === "draft" || row.status === "approved" || row.status === "paid") &&
      typeof row.expenseAccount === "string" &&
      typeof row.description === "string" &&
      isValidDate(row.createdAt)
    );
  });

  const entriesValid = maybe.journalEntries.every((entry) => {
    const row = entry as Partial<SerializedJournalEntry>;
    return (
      typeof row.id === "string" &&
      isValidDate(row.date) &&
      typeof row.description === "string" &&
      typeof row.posted === "boolean" &&
      Array.isArray(row.lines) &&
      row.lines.every(
        (line) =>
          typeof line.account === "string" &&
          typeof line.debit === "number" &&
          typeof line.credit === "number"
      )
    );
  });

  if (!vendorsValid || !billsValid || !entriesValid) return null;
  return deserializeState(maybe as SerializedState);
}

function buildApprovalEntry(bill: Bill): JournalEntry {
  return {
    id: uid("je"),
    date: new Date(),
    description: `AP approval for ${bill.invoiceNumber}`,
    lines: [
      { account: bill.expenseAccount, debit: bill.amount, credit: 0 },
      { account: AP_ACCOUNT, debit: 0, credit: bill.amount },
    ],
    posted: true,
  };
}

function buildPaymentEntry(bill: Bill): JournalEntry {
  return {
    id: uid("je"),
    date: new Date(),
    description: `AP payment for ${bill.invoiceNumber}`,
    lines: [
      { account: AP_ACCOUNT, debit: bill.amount, credit: 0 },
      { account: CASH_ACCOUNT, debit: 0, credit: bill.amount },
    ],
    posted: true,
  };
}

export function computeAccountingSummary(state: AccountingState): AccountingSummary {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endNext7 = new Date(startToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const month = now.getMonth();
  const year = now.getFullYear();

  const totalApOutstanding = state.bills
    .filter((bill) => bill.status !== "paid")
    .reduce((sum, bill) => sum + bill.amount, 0);

  const billsDueNext7Days = state.bills.filter(
    (bill) => bill.status !== "paid" && bill.dueDate >= startToday && bill.dueDate <= endNext7
  ).length;

  const totalPaidThisMonth = state.bills
    .filter(
      (bill) =>
        bill.status === "paid" &&
        bill.invoiceDate.getFullYear() === year &&
        bill.invoiceDate.getMonth() === month
    )
    .reduce((sum, bill) => sum + bill.amount, 0);

  return {
    totalApOutstanding,
    billsDueNext7Days,
    totalPaidThisMonth,
    vendorCount: state.vendors.length,
  };
}

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function useAccountingStore(businessId?: string | null) {
  const [state, setState] = useState<AccountingState | null>(null);
  const storageKey = useMemo(() => storageKeyForBusiness(businessId), [businessId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      const seeded = createSeedState();
      setState(seeded);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const restored = coerceState(parsed);
      setState(restored || createSeedState());
    } catch {
      setState(createSeedState());
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !state) return;
    window.localStorage.setItem(storageKey, JSON.stringify(serializeState(state)));
  }, [state, storageKey]);

  const addVendor = useCallback((input: VendorInput) => {
    setState((prev) => {
      const current = prev || createSeedState();
      const next: Vendor = {
        id: uid("vnd"),
        status: "active",
        createdAt: new Date(),
        ...input,
        address: { ...input.address },
      };
      return {
        ...current,
        vendors: [next, ...current.vendors],
      };
    });
  }, []);

  const updateVendor = useCallback((vendorId: string, input: VendorInput) => {
    setState((prev) => {
      const current = prev || createSeedState();
      return {
        ...current,
        vendors: current.vendors.map((vendor) =>
          vendor.id === vendorId
            ? {
                ...vendor,
                ...input,
                address: { ...input.address },
              }
            : vendor
        ),
      };
    });
  }, []);

  const setVendorStatus = useCallback((vendorId: string, status: VendorStatus) => {
    setState((prev) => {
      const current = prev || createSeedState();
      return {
        ...current,
        vendors: current.vendors.map((vendor) =>
          vendor.id === vendorId ? { ...vendor, status } : vendor
        ),
      };
    });
  }, []);

  const addBill = useCallback((input: BillInput) => {
    setState((prev) => {
      const current = prev || createSeedState();
      const next: Bill = {
        id: uid("bill"),
        status: "draft",
        createdAt: new Date(),
        ...input,
      };
      return {
        ...current,
        bills: [next, ...current.bills],
      };
    });
  }, []);

  const setBillStatus = useCallback((billId: string, nextStatus: BillStatus) => {
    setState((prev) => {
      const current = prev || createSeedState();
      const bill = current.bills.find((row) => row.id === billId);
      if (!bill || bill.status === nextStatus) return current;

      const allowDraftToApproved = bill.status === "draft" && nextStatus === "approved";
      const allowApprovedToPaid = bill.status === "approved" && nextStatus === "paid";
      if (!allowDraftToApproved && !allowApprovedToPaid) return current;

      let entry: JournalEntry | null = null;
      if (allowDraftToApproved) {
        entry = buildApprovalEntry(bill);
      } else if (allowApprovedToPaid) {
        entry = buildPaymentEntry(bill);
      }

      const updated = {
        ...current,
        bills: current.bills.map((row) =>
          row.id === billId ? { ...row, status: nextStatus } : row
        ),
        journalEntries: entry ? [entry, ...current.journalEntries] : current.journalEntries,
      };

      if (entry) {
        // Keep an explicit audit hook while we build a dedicated GL UI.
        // eslint-disable-next-line no-console
        console.info("[Accounting] Journal entry generated", entry);
      }

      return updated;
    });
  }, []);

  const hydratedState = state || createSeedState();

  return {
    ready: state !== null,
    vendors: hydratedState.vendors,
    bills: hydratedState.bills,
    journalEntries: hydratedState.journalEntries,
    summary: computeAccountingSummary(hydratedState),
    addVendor,
    updateVendor,
    setVendorStatus,
    addBill,
    setBillStatus,
  };
}

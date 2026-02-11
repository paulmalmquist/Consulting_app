export type PaymentTerms = "Net 15" | "Net 30" | "Net 45";

export type VendorStatus = "active" | "inactive";

export type BillStatus = "draft" | "approved" | "paid";

export interface VendorAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Vendor {
  id: string;
  name: string;
  legalName: string;
  taxId: string;
  address: VendorAddress;
  email: string;
  phone: string;
  paymentTerms: PaymentTerms;
  defaultExpenseAccount: string;
  is1099Eligible: boolean;
  status: VendorStatus;
  createdAt: Date;
}

export interface Bill {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  amount: number;
  status: BillStatus;
  expenseAccount: string;
  description: string;
  createdAt: Date;
}

export interface JournalEntryLine {
  account: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: Date;
  description: string;
  lines: JournalEntryLine[];
  posted: boolean;
}

"use client";

import { Search, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import AccountMenu from "@/components/AccountMenu";
import { Button } from "@/components/operator/command-desk";

type Props = {
  envId: string;
  query: string;
  onQuery: (q: string) => void;
  onImportTxns: () => void;
  onAddInvoice: () => void;
  onAddExpense: () => void;
  onUploadReceipt: () => void;
  uploadInputRef?: RefObject<HTMLInputElement | null>;
  onUploadChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  matchCountsByTab?: Record<string, number>;
  rightTrailing?: ReactNode;
};

export function AccountingTopBar({
  envId,
  query,
  onQuery,
  onImportTxns,
  onAddInvoice,
  onAddExpense,
  onUploadReceipt,
  uploadInputRef,
  onUploadChange,
  searchInputRef,
  rightTrailing,
}: Props) {
  return (
    <div
      style={{
        height: 52,
        padding: "0 16px",
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--sidebar-border, var(--line-2))",
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 0,
      }}
    >
      {/* Title block */}
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "var(--font-display, var(--font-sans))",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--fg-1)",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          Accounting Command Desk
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            color: "var(--fg-3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Cash, invoices, receipts, reimbursements, and subscription spend.
        </span>
      </div>

      {/* Contextual search */}
      <div
        style={{
          flex: 1,
          minWidth: 160,
          height: 30,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
          background: "var(--bg-panel)",
          border: "1px solid var(--line-2)",
          borderRadius: 4,
        }}
      >
        <Search size={13} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search vendors, transactions, receipts, invoices, subscriptions…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg-1)",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            minWidth: 0,
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onQuery("");
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-3)",
              display: "flex",
              alignItems: "center",
              padding: 0,
            }}
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Primary actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <Button kind="secondary" size="sm" onClick={onImportTxns}>
          Import txns
        </Button>
        <Button kind="secondary" size="sm" onClick={onAddInvoice}>
          + Invoice
        </Button>
        <Button kind="secondary" size="sm" onClick={onAddExpense}>
          + Expense
        </Button>
        <Button kind="primary" size="sm" onClick={onUploadReceipt}>
          ↑ Upload receipt
        </Button>
        {uploadInputRef && (
          <input
            ref={uploadInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={onUploadChange}
          />
        )}
      </div>

      {rightTrailing}

      {/* Account dropdown — theme toggle lives inside */}
      <AccountMenu homePath={`/lab/env/${envId}/consulting/pipeline`} />
    </div>
  );
}

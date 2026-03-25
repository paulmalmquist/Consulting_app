"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */
interface UploadRow {
  row_num: number;
  raw_account_code: string | null;
  raw_account_name: string | null;
  raw_debit: number | null;
  raw_credit: number | null;
  raw_balance: number | null;
  mapped_gl_account: string | null;
  mapping_confidence: number;
}

interface UploadResult {
  batch_id: string;
  status: string;
  duplicate?: boolean;
  message?: string;
  row_count: number;
  mapped_count: number;
  unmapped_count: number;
  balanced: boolean;
  total_debit: number;
  total_credit: number;
  rows: UploadRow[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: Record<string, unknown>;
}

interface CommitResult {
  status: string;
  rows_committed: number;
  rows_loaded: number;
  rows_normalized: number;
  quarter_refreshed: string;
}

interface CoaEntry {
  gl_account: string;
  name: string;
  category: string;
}

type Step = "upload" | "preview" | "map" | "validate" | "commit" | "done";

interface Props {
  assetId: string;
  envId: string;
  businessId: string;
  open: boolean;
  onClose: () => void;
  onCommitted?: () => void;
}

/* --------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------- */
export default function TBUploadDrawer({
  assetId,
  envId,
  businessId,
  open,
  onClose,
  onCommitted,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodMonth, setPeriodMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });

  // Upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Mapping state
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [coa, setCoa] = useState<CoaEntry[]>([]);

  // Validation
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Commit
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);

  // Load chart of accounts for mapping dropdown
  useEffect(() => {
    if (!open) return;
    fetch(`/api/re/v2/assets/${assetId}/accounting/trial-balance?quarter=2026Q1`)
      .then(() => {
        // Load COA separately
        // The TB endpoint doesn't give us the COA list, so we use a simple approach
      })
      .catch(() => {});
  }, [open, assetId]);

  const reset = useCallback(() => {
    setStep("upload");
    setError(null);
    setUploadResult(null);
    setRows([]);
    setValidation(null);
    setCommitResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  /* ---- Step 1: Upload ---- */
  const handleUpload = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("period_month", periodMonth);
        formData.append("env_id", envId);
        formData.append("business_id", businessId);

        const res = await fetch(
          `/api/re/v2/assets/${assetId}/accounting/upload`,
          { method: "POST", body: formData },
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Upload failed");
          return;
        }

        if (data.duplicate) {
          setError(data.message || "Duplicate file detected");
          return;
        }

        setUploadResult(data);
        setRows(data.rows || []);
        setStep("preview");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [assetId, envId, businessId, periodMonth],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  /* ---- Step 2: Mapping ---- */
  const updateMapping = useCallback(
    (rowNum: number, glAccount: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.row_num === rowNum
            ? { ...r, mapped_gl_account: glAccount, mapping_confidence: 1.0 }
            : r,
        ),
      );
    },
    [],
  );

  const handleSaveMappings = useCallback(async () => {
    if (!uploadResult) return;
    setLoading(true);
    setError(null);
    try {
      const mappings = rows
        .filter((r) => r.mapped_gl_account)
        .map((r) => ({ row_num: r.row_num, mapped_gl_account: r.mapped_gl_account }));

      const res = await fetch(
        `/api/re/v2/assets/${assetId}/accounting/upload/${uploadResult.batch_id}/map`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings, env_id: envId, business_id: businessId }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Mapping save failed");
        return;
      }
      setStep("validate");
      // Auto-run validation
      handleValidate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [uploadResult, rows, assetId, envId, businessId]);

  /* ---- Step 3: Validate ---- */
  const handleValidate = useCallback(async () => {
    if (!uploadResult) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/re/v2/assets/${assetId}/accounting/upload/${uploadResult.batch_id}/validate`,
      );
      const data = await res.json();
      setValidation(data);
      setStep("validate");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [uploadResult, assetId]);

  /* ---- Step 4: Commit ---- */
  const handleCommit = useCallback(async () => {
    if (!uploadResult) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/re/v2/assets/${assetId}/accounting/upload/${uploadResult.batch_id}/commit`,
        { method: "POST" },
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Commit failed");
        return;
      }

      setCommitResult(data);
      setStep("done");
      onCommitted?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [uploadResult, assetId, onCommitted]);

  if (!open) return null;

  const fmtMoney = (v: number | null) => {
    if (v == null) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
  };

  const mappedCount = rows.filter((r) => r.mapped_gl_account).length;
  const unmappedCount = rows.length - mappedCount;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div className="relative ml-auto h-full w-full max-w-2xl overflow-y-auto bg-bm-bg border-l border-bm-border shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-bm-border bg-bm-bg px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Upload Trial Balance</h2>
            <p className="text-xs text-bm-muted2 mt-0.5">
              {step === "upload" && "Select a CSV file to upload"}
              {step === "preview" && "Review parsed data and account mappings"}
              {step === "map" && "Map accounts to chart of accounts"}
              {step === "validate" && "Validation results"}
              {step === "commit" && "Committing to accounting pipeline..."}
              {step === "done" && "Upload complete"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1.5 text-bm-muted2 hover:bg-bm-surface/50 hover:text-bm-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* ---- STEP: Upload ---- */}
          {step === "upload" && (
            <>
              {/* Period selector */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-bm-muted2 mb-1.5">
                  Reporting Period
                </label>
                <input
                  type="month"
                  value={periodMonth.slice(0, 7)}
                  onChange={(e) => setPeriodMonth(e.target.value + "-01")}
                  className="w-full rounded-lg border border-bm-border bg-bm-surface/30 px-3 py-2 text-sm"
                />
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
                  p-12 transition-colors cursor-pointer
                  ${dragOver ? "border-blue-500 bg-blue-500/10" : "border-bm-border/50 hover:border-bm-border"}
                `}
                onClick={() => fileRef.current?.click()}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-bm-muted2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <p className="text-sm text-bm-muted2">
                  Drop a CSV file here or <span className="text-blue-400 underline">browse</span>
                </p>
                <p className="text-xs text-bm-muted2/70">
                  Supports .csv files with Account Code, Debit, Credit, Balance columns
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {loading && (
                <p className="text-sm text-bm-muted2 text-center">Parsing file...</p>
              )}
            </>
          )}

          {/* ---- STEP: Preview + Map ---- */}
          {(step === "preview" || step === "map") && uploadResult && (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3 text-center">
                  <p className="text-xs text-bm-muted2">Rows</p>
                  <p className="text-lg font-semibold">{rows.length}</p>
                </div>
                <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3 text-center">
                  <p className="text-xs text-bm-muted2">Mapped</p>
                  <p className="text-lg font-semibold text-green-400">{mappedCount}</p>
                </div>
                <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3 text-center">
                  <p className="text-xs text-bm-muted2">Unmapped</p>
                  <p className={`text-lg font-semibold ${unmappedCount > 0 ? "text-amber-400" : "text-green-400"}`}>
                    {unmappedCount}
                  </p>
                </div>
                <div className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3 text-center">
                  <p className="text-xs text-bm-muted2">Balanced</p>
                  <p className={`text-lg font-semibold ${uploadResult.balanced ? "text-green-400" : "text-red-400"}`}>
                    {uploadResult.balanced ? "Yes" : "No"}
                  </p>
                </div>
              </div>

              {/* Rows table */}
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 overflow-hidden">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-bm-surface/50 backdrop-blur-sm">
                      <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                        <th className="px-3 py-2 text-left font-medium w-8">#</th>
                        <th className="px-3 py-2 text-left font-medium">Account</th>
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-right font-medium">Debit</th>
                        <th className="px-3 py-2 text-right font-medium">Credit</th>
                        <th className="px-3 py-2 text-right font-medium">Balance</th>
                        <th className="px-3 py-2 text-left font-medium">Mapped To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bm-border/40">
                      {rows.map((row) => (
                        <tr
                          key={row.row_num}
                          className={`hover:bg-bm-surface/20 ${!row.mapped_gl_account ? "bg-amber-500/5" : ""}`}
                        >
                          <td className="px-3 py-1.5 text-bm-muted2 text-xs">{row.row_num}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{row.raw_account_code || "—"}</td>
                          <td className="px-3 py-1.5 text-xs">{row.raw_account_name || "—"}</td>
                          <td className="px-3 py-1.5 text-right text-xs">{row.raw_debit != null ? fmtMoney(row.raw_debit) : ""}</td>
                          <td className="px-3 py-1.5 text-right text-xs">{row.raw_credit != null ? fmtMoney(row.raw_credit) : ""}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-medium">{row.raw_balance != null ? fmtMoney(row.raw_balance) : ""}</td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={row.mapped_gl_account || ""}
                              onChange={(e) => updateMapping(row.row_num, e.target.value)}
                              placeholder="GL code"
                              className="w-20 rounded border border-bm-border/50 bg-transparent px-1.5 py-0.5 text-xs"
                            />
                            {row.mapping_confidence > 0 && row.mapping_confidence < 1 && (
                              <span className="ml-1 text-[10px] text-amber-400">
                                {Math.round(row.mapping_confidence * 100)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-bm-border px-4 py-2 text-sm text-bm-muted2 hover:bg-bm-surface/30"
                >
                  Start Over
                </button>
                <button
                  type="button"
                  onClick={handleSaveMappings}
                  disabled={loading || mappedCount === 0}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {loading ? "Saving..." : "Save Mappings & Validate"}
                </button>
              </div>
            </>
          )}

          {/* ---- STEP: Validate ---- */}
          {step === "validate" && validation && (
            <>
              <div className={`rounded-xl border p-4 ${
                validation.valid
                  ? "border-green-500/30 bg-green-500/10"
                  : "border-red-500/30 bg-red-500/10"
              }`}>
                <h3 className={`text-sm font-semibold ${validation.valid ? "text-green-400" : "text-red-400"}`}>
                  {validation.valid ? "Validation Passed" : "Validation Failed"}
                </h3>

                {validation.errors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {validation.errors.map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-red-400">
                        <span className="mt-0.5 text-red-500">&#x2717;</span>
                        {e}
                      </li>
                    ))}
                  </ul>
                )}

                {validation.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {validation.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-400">
                        <span className="mt-0.5 text-amber-500">&#x26A0;</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep("preview")}
                  className="rounded-lg border border-bm-border px-4 py-2 text-sm text-bm-muted2 hover:bg-bm-surface/30"
                >
                  Back to Mapping
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={loading || !validation.valid}
                  className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                >
                  {loading ? "Committing..." : "Commit to Accounting"}
                </button>
              </div>
            </>
          )}

          {/* ---- STEP: Done ---- */}
          {step === "done" && commitResult && (
            <div className="text-center py-8 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 text-green-400">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">Trial Balance Committed</h3>
              <div className="text-sm text-bm-muted2 space-y-1">
                <p>{commitResult.rows_committed} rows committed</p>
                <p>{commitResult.rows_loaded} GL entries loaded</p>
                <p>{commitResult.rows_normalized} normalized line items</p>
                <p className="text-xs">Quarter refreshed: {commitResult.quarter_refreshed}</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="mt-4 rounded-lg bg-bm-surface/50 px-6 py-2 text-sm font-medium hover:bg-bm-surface/70"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

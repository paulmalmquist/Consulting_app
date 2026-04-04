"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { RepeSidebarCompactRail, RepeSidebarNav } from "@/components/repe/workspace/RepeSidebarNav";
import {
  completeUpload,
  computeSha256,
  createReV2Investment,
  initUpload,
  listReV1Funds,
  type RepeFund,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { WinstonShell } from "@/components/repe/workspace/WinstonShell";
import type { MobileNavItem } from "@/components/repe/workspace/MobileBottomNav";
import {
  buildRepeMobileNavItems,
  buildRepeNavGroups,
  getActiveRepeGroupKey,
  isRepePathActive,
} from "@/components/repe/workspace/repeNavigation";
import ThemeToggle from "@/components/ThemeToggle";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";

const STAGE_OPTIONS = [
  { value: "sourcing", label: "Sourced" },
  { value: "underwriting", label: "Underwriting" },
  { value: "ic", label: "IC" },
  { value: "closing", label: "Closing" },
  { value: "operating", label: "Operating" },
  { value: "exited", label: "Exited" },
] as const;

type IntakeMode = "manual" | "documents";

function InvestmentIntakeDialog({
  open,
  onOpenChange,
  envId,
  businessId,
  base,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envId: string;
  businessId: string | null;
  base: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<IntakeMode>("manual");
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [loadingFunds, setLoadingFunds] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manual, setManual] = useState({
    fundId: "",
    name: "",
    dealType: "equity",
    stage: "sourcing",
    sponsor: "",
  });
  const [docs, setDocs] = useState<{
    fundId: string;
    name: string;
    dealType: "equity" | "debt";
    stage: string;
    sponsor: string;
    notes: string;
    file: File | null;
  }>({
    fundId: "",
    name: "",
    dealType: "equity",
    stage: "sourcing",
    sponsor: "",
    notes: "",
    file: null,
  });

  useEffect(() => {
    if (!open || !businessId) return;
    let cancelled = false;
    setLoadingFunds(true);
    listReV1Funds({ env_id: envId, business_id: businessId })
      .then((rows) => {
        if (cancelled) return;
        setFunds(rows);
        const defaultFundId = rows[0]?.fund_id || "";
        setManual((current) => ({
          ...current,
          fundId: current.fundId || defaultFundId,
        }));
        setDocs((current) => ({
          ...current,
          fundId: current.fundId || defaultFundId,
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load funds");
      })
      .finally(() => {
        if (!cancelled) setLoadingFunds(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, envId, businessId]);

  useEffect(() => {
    if (!open) {
      setMode("manual");
      setError(null);
      setStatus(null);
      setDragOver(false);
      setSubmitting(false);
      setManual((current) => ({ ...current, name: "", sponsor: "" }));
      setDocs((current) => ({ ...current, file: null, notes: "", name: "", sponsor: "" }));
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  const closeDialog = () => onOpenChange(false);

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manual.fundId) {
      setError("Select a fund before creating an investment.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const created = await createReV2Investment(manual.fundId, {
        name: manual.name,
        deal_type: manual.dealType,
        stage: manual.stage,
        sponsor: manual.sponsor || undefined,
      });
      setStatus(`Created ${created.name}.`);
      closeDialog();
      router.push(`${base}/investments/${created.investment_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create investment");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadSupportingDocument(file: File) {
    if (!businessId) throw new Error("Business context is missing.");
    let investmentId: string | undefined;

    if (docs.fundId && docs.name.trim()) {
      const created = await createReV2Investment(docs.fundId, {
        name: docs.name.trim(),
        deal_type: docs.dealType,
        stage: docs.stage,
        sponsor: docs.sponsor || undefined,
      });
      investmentId = created.investment_id;
    }

    const safeName = file.name.replaceAll("/", "_");
    const docTitle = docs.name.trim() ? `${docs.name.trim()} Intake` : file.name;
    const virtualPath = investmentId
      ? `re/env/${envId}/deal/${investmentId}/${safeName}`
      : `re/env/${envId}/investment-intake/${safeName}`;

    const initRes = await initUpload({
      business_id: businessId,
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      title: docTitle,
      virtual_path: virtualPath,
      entity_type: investmentId ? "investment" : undefined,
      entity_id: investmentId,
      env_id: envId,
    });

    const uploadRes = await fetch(initRes.signed_upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!uploadRes.ok) {
      throw new Error(`Upload failed (${uploadRes.status})`);
    }

    const sha256 = await computeSha256(file);
    await completeUpload({
      document_id: initRes.document_id,
      version_id: initRes.version_id,
      sha256,
      byte_size: file.size,
      entity_type: investmentId ? "investment" : undefined,
      entity_id: investmentId,
      env_id: envId,
    });

    void fetch("/api/ai/gateway/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: initRes.document_id,
        version_id: initRes.version_id,
        business_id: businessId,
        env_id: envId,
        entity_type: investmentId ? "investment" : undefined,
        entity_id: investmentId,
      }),
    }).catch(() => {});

    setStatus(
      investmentId
        ? `Created the investment shell and uploaded ${file.name}.`
        : `Uploaded ${file.name} to investment intake.`
    );

    if (investmentId) {
      closeDialog();
      router.push(`${base}/investments/${investmentId}`);
      router.refresh();
      return;
    }

    setDocs((current) => ({
      ...current,
      file: null,
      notes: "",
      name: "",
      sponsor: "",
    }));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDocumentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!docs.file) {
      setError("Select a file to upload.");
      return;
    }
    if (!docs.fundId) {
      setError("Select a fund before uploading intake documentation.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      await uploadSupportingDocument(docs.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload intake documentation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Investment Intake"
      description="Create the investment directly or drop in source documentation and let Winston start the intake trail."
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={mode === "manual" ? "manual-investment-form" : "document-investment-form"}
            disabled={submitting || loadingFunds || (!businessId && mode === "documents")}
          >
            {submitting
              ? mode === "manual"
                ? "Creating..."
                : "Uploading..."
              : mode === "manual"
                ? "Create Investment"
                : "Submit Intake"}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-full border border-bm-border/40 bg-bm-surface/25 p-1">
          {[
            { key: "manual", label: "Type It In" },
            { key: "documents", label: "Upload Documentation" },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setMode(option.key as IntakeMode);
                setError(null);
                setStatus(null);
              }}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                mode === option.key
                  ? "bg-bm-accent text-white"
                  : "text-bm-muted hover:text-bm-text",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === "manual" ? (
          <form id="manual-investment-form" onSubmit={handleManualSubmit} className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Fund
              <select
                className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                value={manual.fundId}
                onChange={(event) => setManual((current) => ({ ...current, fundId: event.target.value }))}
                disabled={loadingFunds || submitting}
                required
              >
                {funds.map((fund) => (
                  <option key={fund.fund_id} value={fund.fund_id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Investment Name
              <input
                className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                value={manual.name}
                onChange={(event) => setManual((current) => ({ ...current, name: event.target.value }))}
                placeholder="Cascade Multifamily"
                disabled={submitting}
                required
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Type
                <select
                  className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                  value={manual.dealType}
                  onChange={(event) => setManual((current) => ({ ...current, dealType: event.target.value }))}
                  disabled={submitting}
                >
                  <option value="equity">Equity</option>
                  <option value="debt">Debt</option>
                </select>
              </label>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Stage
                <select
                  className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                  value={manual.stage}
                  onChange={(event) => setManual((current) => ({ ...current, stage: event.target.value }))}
                  disabled={submitting}
                >
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Sponsor / Counterparty
              <input
                className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                value={manual.sponsor}
                onChange={(event) => setManual((current) => ({ ...current, sponsor: event.target.value }))}
                placeholder="North Peak Capital"
                disabled={submitting}
              />
            </label>
          </form>
        ) : (
          <form id="document-investment-form" onSubmit={handleDocumentSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Fund
                <select
                  className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                  value={docs.fundId}
                  onChange={(event) => setDocs((current) => ({ ...current, fundId: event.target.value }))}
                  disabled={loadingFunds || submitting}
                  required
                >
                  {funds.map((fund) => (
                    <option key={fund.fund_id} value={fund.fund_id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Draft Investment Name
                <input
                  className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                  value={docs.name}
                  onChange={(event) => setDocs((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Optional, but creates a draft record"
                  disabled={submitting}
                />
              </label>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer.files?.[0];
                if (file) setDocs((current) => ({ ...current, file }));
              }}
              className={[
                "rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors",
                dragOver
                  ? "border-bm-accent bg-bm-accent/10"
                  : "border-bm-border/50 bg-bm-surface/15 hover:border-bm-accent/50 hover:bg-bm-surface/30",
              ].join(" ")}
            >
              <Upload className="mx-auto h-5 w-5 text-bm-muted2" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-bm-text">
                {docs.file ? docs.file.name : "Drop a memo, deck, lease abstract, or model package"}
              </p>
              <p className="mt-1 text-xs text-bm-muted2">
                Upload source material for Winston to reference during investment setup.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              onChange={(event) => setDocs((current) => ({ ...current, file: event.target.files?.[0] || null }))}
              disabled={submitting}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Type
                <select
                  className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                  value={docs.dealType}
                  onChange={(event) => setDocs((current) => ({ ...current, dealType: event.target.value as "equity" | "debt" }))}
                  disabled={submitting}
                >
                  <option value="equity">Equity</option>
                  <option value="debt">Debt</option>
                </select>
              </label>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Stage
                <select
                  className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                  value={docs.stage}
                  onChange={(event) => setDocs((current) => ({ ...current, stage: event.target.value }))}
                  disabled={submitting}
                >
                  {STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Sponsor / Counterparty
              <input
                className="mt-1 w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                value={docs.sponsor}
                onChange={(event) => setDocs((current) => ({ ...current, sponsor: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </label>

            <label className="block text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Intake Notes
              <textarea
                className="mt-1 min-h-[88px] w-full rounded-xl border border-bm-border/50 bg-bm-surface/35 px-3 py-2.5 text-sm text-bm-text outline-none transition-colors focus:border-bm-accent"
                value={docs.notes}
                onChange={(event) => setDocs((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional notes for the investment packet."
                disabled={submitting}
              />
            </label>
          </form>
        )}

        {loadingFunds ? <p className="text-xs text-bm-muted2">Loading fund list…</p> : null}
        {!businessId ? <p className="text-xs text-red-400">Business context is unavailable in this workspace.</p> : null}
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        {status ? <p className="text-xs text-bm-success">{status}</p> : null}
      </div>
    </Dialog>
  );
}

function TopUtilityNav({
  pathname,
  base,
  homeHref,
  className,
  showAll = true,
  testId,
}: {
  pathname: string;
  base: string;
  homeHref: string;
  className?: string;
  showAll?: boolean;
  testId?: string;
}) {
  const links = [
    { href: homeHref, label: "Home", isActive: pathname === homeHref, testId: "global-home-button" },
    { href: base, label: "Funds", isActive: isRepePathActive(pathname, base, true) },
    { href: `${base}/deals`, label: "Investments", isActive: isRepePathActive(pathname, `${base}/deals`, false) },
    { href: `${base}/assets`, label: "Assets", isActive: isRepePathActive(pathname, `${base}/assets`, false) },
  ];

  const visibleLinks = showAll ? links : links.slice(0, 1);

  return (
    <nav className={className} aria-label="Workspace shortcuts" data-testid={testId}>
      {visibleLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-testid={link.testId}
          className={[
            "text-[11px] uppercase tracking-[0.12em] transition-colors duration-fast",
            link.isActive
              ? "text-bm-text underline underline-offset-[6px] decoration-bm-border-strong/80"
              : "text-bm-muted2 hover:text-bm-text",
          ].join(" ")}
        >
          {link.label}
        </Link>
      ))}
      {showAll && <ThemeToggle />}
    </nav>
  );
}

export default function RepeWorkspaceShell({
  children,
  envId,
  /** Optional context rail content — passed through to the right column */
  rail,
}: {
  children: React.ReactNode;
  envId?: string;
  rail?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, errorCode, requestId, retry } = useReEnv();
  const [investmentDialogOpen, setInvestmentDialogOpen] = useState(false);

  const base     = envId ? `/lab/env/${envId}/re` : "/app/repe";
  const homeHref = envId ? `/lab/env/${envId}`    : "/app";

  const showIntelligence  = process.env.NEXT_PUBLIC_SHOW_INTELLIGENCE_MODULE  === "true";
  const showSustainability = process.env.NEXT_PUBLIC_SHOW_SUSTAINABILITY_MODULE === "true";

  const navGroups = useMemo(
    () => buildRepeNavGroups({ base, showIntelligence, showSustainability }),
    [base, showIntelligence, showSustainability],
  );

  const activeGroupKey = useMemo(
    () => getActiveRepeGroupKey(pathname, navGroups),
    [navGroups, pathname],
  );

  // Sidebar collapse state persisted to sessionStorage
  const COLLAPSED_KEY = "repe-sidebar-collapsed-groups";
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const stored = typeof window !== "undefined"
        ? sessionStorage.getItem(COLLAPSED_KEY) ?? localStorage.getItem(COLLAPSED_KEY)
        : null;
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
        localStorage.removeItem(COLLAPSED_KEY);
      } catch {
        /* noop */
      }
      return next;
    });
  };

  // Auto-expand the group containing the active page
  useEffect(() => {
    if (activeGroupKey && collapsedGroups.has(activeGroupKey)) {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        next.delete(activeGroupKey);
        try {
          sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
          localStorage.removeItem(COLLAPSED_KEY);
        } catch {
          /* noop */
        }
        return next;
      });
    }
  }, [activeGroupKey, collapsedGroups]);

  const mobileNavItems: MobileNavItem[] = useMemo(() => buildRepeMobileNavItems(base), [base]);

  const envLabel = environment?.client_name || envId || "Real Estate";

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return <div className="px-6 py-10"><WorkspaceContextLoader label="Loading workspace" /></div>;
  }

  if (error) {
    return (
      <div
        className="m-6 border border-bm-border/30 bg-bm-surface/20 p-6 space-y-4"
        data-testid="re-context-error"
      >
        <h2 className="text-lg font-semibold">Unable to load Real Estate workspace</h2>
        <p className="text-sm text-bm-danger">{error}</p>
        {errorCode  && <p className="text-xs text-bm-muted2 font-mono">Error: {errorCode}</p>}
        {requestId  && <p className="text-xs text-bm-muted2">Request ID: {requestId}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void retry()}
            className="border border-bm-border/30 px-4 py-2 text-sm font-medium
                       hover:bg-bm-surface/40 transition-colors"
          >
            Retry
          </button>
          <a
            href={homeHref}
            className="text-sm text-bm-muted hover:text-bm-text transition-colors"
          >
            ← Back to Environment
          </a>
        </div>
      </div>
    );
  }

  // ── Sidebar nav ───────────────────────────────────────────────────────────

  const sidebarNav = (
    <RepeSidebarNav
      base={base}
      envLabel={envLabel}
      navGroups={navGroups}
      pathname={pathname}
      collapsedGroups={collapsedGroups}
      onToggleGroup={toggleGroup}
      onOpenInvestmentDialog={() => setInvestmentDialogOpen(true)}
    />
  );

  const tabletSidebar = (
    <RepeSidebarCompactRail
      envLabel={envLabel}
      navGroups={navGroups}
      pathname={pathname}
    />
  );

  const headerAction = (
    <TopUtilityNav
      pathname={pathname}
      base={base}
      homeHref={homeHref}
      className="flex items-center gap-3 sm:gap-4"
      showAll={false}
      testId="repe-utility-nav-mobile"
    />
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <WinstonShell
      sidebar={sidebarNav}
      tabletSidebar={tabletSidebar}
      rail={rail}
      headerLabel={envLabel}
      headerAction={headerAction}
      mobileNavItems={mobileNavItems}
    >
      <InvestmentIntakeDialog
        open={investmentDialogOpen}
        onOpenChange={setInvestmentDialogOpen}
        envId={envId || environment?.env_id || ""}
        businessId={businessId}
        base={base}
      />
      <div className="space-y-2 xl:space-y-3">
        <TopUtilityNav
          pathname={pathname}
          base={base}
          homeHref={homeHref}
          className="hidden items-center justify-end gap-4 xl:flex"
          testId="repe-utility-nav"
        />
        {children}
      </div>
    </WinstonShell>
  );
}

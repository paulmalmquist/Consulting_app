"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useEnv } from "@/components/EnvProvider";
import { cn } from "@/lib/cn";
import {
  ensureWinstonDemoEnvironment,
  listWinstonAudit,
  MERIDIAN_DEMO_NAME,
  type InstitutionalDemoContext,
  type SystemAuditEntry,
} from "@/lib/winston-demo";

type NavKey = "demo" | "documents" | "definitions";

type Props = {
  envId: string;
  active: NavKey;
  children: React.ReactNode;
};

const NAV_ITEMS: Array<{ key: NavKey; label: string; href: (envId: string) => string }> = [
  { key: "demo", label: "Demo", href: (envId) => `/lab/env/${envId}/demo` },
  { key: "documents", label: "Documents", href: (envId) => `/lab/env/${envId}/documents` },
  { key: "definitions", label: "Definitions", href: (envId) => `/lab/env/${envId}/definitions` },
];

export default function WinstonInstitutionalShell({ envId, active, children }: Props) {
  const pathname = usePathname();
  const { selectedEnv, selectEnv } = useEnv();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [context, setContext] = useState<InstitutionalDemoContext | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<SystemAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (selectedEnv?.env_id !== envId) {
      selectEnv(envId);
    }
  }, [envId, selectEnv, selectedEnv?.env_id]);

  useEffect(() => {
    let ignore = false;
    setBootstrapping(true);
    setBootstrapError(null);
    ensureWinstonDemoEnvironment(
      envId,
      selectedEnv?.env_id === envId ? selectedEnv : { env_id: envId, client_name: MERIDIAN_DEMO_NAME }
    )
      .then((nextContext) => {
        if (!ignore) {
          setContext(nextContext);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setBootstrapError(error instanceof Error ? error.message : "Failed to sync environment");
        }
      })
      .finally(() => {
        if (!ignore) {
          setBootstrapping(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [envId, selectedEnv]);

  useEffect(() => {
    const openAudit = () => setAuditOpen(true);
    window.addEventListener("winston-open-audit", openAudit);
    return () => window.removeEventListener("winston-open-audit", openAudit);
  }, []);

  useEffect(() => {
    if (!auditOpen) return;
    let ignore = false;
    setAuditLoading(true);
    listWinstonAudit(envId, 50)
      .then((entries) => {
        if (!ignore) {
          setAuditEntries(entries);
        }
      })
      .catch(() => {
        if (!ignore) {
          setAuditEntries([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setAuditLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [auditOpen, envId, pathname]);

  const envLabel =
    context?.client_name ||
    (selectedEnv?.env_id === envId ? selectedEnv.client_name : null) ||
    MERIDIAN_DEMO_NAME;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-bm-border/70 bg-bm-surface/35 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-bm-accent/30 bg-bm-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-bm-text">
                Winston Institutional
              </span>
              <span className="rounded-full border border-bm-border/70 px-3 py-1 text-xs text-bm-muted">
                {envLabel}
              </span>
              <span className="rounded-full border border-bm-border/70 px-3 py-1 text-xs text-bm-muted">
                {bootstrapping ? "Syncing Environment" : "Environment Synced"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {NAV_ITEMS.map((item) => {
                const isActive = item.key === active;
                return (
                  <Link
                    key={item.key}
                    href={item.href(envId)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-bm-accent/40 bg-bm-accent/10 text-bm-text"
                        : "border-bm-border/70 text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-bm-border/70 bg-bm-surface/40 px-3 py-2 text-sm text-bm-text transition-colors hover:bg-bm-surface/60"
              onClick={() => setAuditOpen((current) => !current)}
            >
              {auditOpen ? "Hide Audit Trail" : "Open Audit Trail"}
            </button>
          </div>
        </div>
        {bootstrapError ? (
          <p className="mt-3 text-sm text-rose-300">{bootstrapError}</p>
        ) : null}
      </div>

      <div className={cn("grid gap-4", auditOpen ? "xl:grid-cols-[minmax(0,1fr),360px]" : "grid-cols-1")}>
        <div className="min-w-0">{children}</div>
        {auditOpen ? (
          <aside
            id="audit-trail"
            className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4 xl:sticky xl:top-4 xl:h-fit"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-bm-text">Audit Trail</p>
                <p className="text-xs text-bm-muted">Governed actions and trace IDs for this environment.</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-bm-border/70 px-2 py-1 text-xs text-bm-muted"
                onClick={() => setAuditOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {auditLoading ? <p className="text-sm text-bm-muted">Loading audit entries…</p> : null}
              {!auditLoading && auditEntries.length === 0 ? (
                <p className="text-sm text-bm-muted">No audit entries yet.</p>
              ) : null}
              {auditEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-bm-border/60 bg-bm-surface/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-bm-border/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-bm-muted">
                      {entry.action_type}
                    </span>
                    <span className="text-xs text-bm-muted">Trace {entry.id.slice(0, 8)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-bm-text">
                    {entry.object_type}
                    {entry.object_id ? ` · ${entry.object_id}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-bm-muted">
                    {entry.actor} · {new Date(entry.timestamp).toLocaleString()}
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-bm-muted">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

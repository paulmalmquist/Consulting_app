"use client";

import { useState } from "react";

import type {
  IdentityHealthResult,
  IdentityProviderAdmin,
} from "@/lib/server/identityProviders";

function healthPillClass(status: string | null): string {
  if (status === "ok") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "warn") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }
  if (status === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  return "border-white/12 bg-white/[0.04] text-white/60";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function IdentityProviderCard({ provider }: { provider: IdentityProviderAdmin }) {
  const [health, setHealth] = useState<IdentityHealthResult | null>(
    provider.last_health_status
      ? {
          provider_id: provider.identity_provider_id,
          status: provider.last_health_status as IdentityHealthResult["status"],
          detail: provider.last_health_detail || "",
        }
      : null,
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(
    provider.last_health_check_at,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/oidc/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider_id: provider.identity_provider_id }),
      });
      const payload = (await response.json()) as IdentityHealthResult & { error?: string };
      if (!response.ok) {
        setError(payload.error || "test failed");
        return;
      }
      setHealth(payload);
      setLastCheckedAt(new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "test failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="space-y-4 rounded-xl border border-white/10 bg-bm-surface/68 p-5 text-sm">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-command text-lg uppercase tracking-[0.06em] text-bm-text">
              {provider.provider_name}
            </h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                provider.enabled
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-white/12 bg-white/[0.04] text-white/60"
              }`}
            >
              {provider.enabled ? "enabled" : "disabled"}
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bm-text-secondary">
              {provider.kind}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-bm-text-secondary">{provider.issuer}</p>
        </div>
        <span
          data-testid={`health-pill-${provider.identity_provider_id}`}
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${healthPillClass(
            health?.status || provider.last_health_status,
          )}`}
        >
          {(health?.status || provider.last_health_status) ?? "unknown"}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-bm-text-secondary/70">Client ID</dt>
          <dd className="font-mono text-bm-text">{provider.client_id_masked || "—"}</dd>
        </div>
        <div>
          <dt className="text-bm-text-secondary/70">Audience</dt>
          <dd className="font-mono text-bm-text">{provider.audience || "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-bm-text-secondary/70">Discovery URL</dt>
          <dd className="break-all font-mono text-[11px] text-bm-text">
            {provider.discovery_url || provider.jwks_uri || "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-bm-text-secondary/70">Last check</dt>
          <dd className="text-bm-text">
            {formatTimestamp(lastCheckedAt)}
            {health?.detail ? (
              <span className="ml-2 text-bm-text-secondary">— {health.detail}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <details className="rounded-lg border border-white/8 bg-black/20 p-3">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-bm-text-secondary">
            Claim mapping
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-bm-text-secondary">
            {JSON.stringify(provider.claim_mapping, null, 2)}
          </pre>
        </details>
        <details className="rounded-lg border border-white/8 bg-black/20 p-3">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-bm-text-secondary">
            Group → role
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-bm-text-secondary">
            {JSON.stringify(provider.group_role_mapping, null, 2)}
          </pre>
        </details>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-bm-text-secondary">
          Default role: <span className="text-bm-text">{provider.default_role || "—"}</span>
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={runTest}
          className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.06] px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-bm-text hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Testing…" : "Test provider config"}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}
    </article>
  );
}

import { headers } from "next/headers";

import {
  listIdentityAuditEvents,
  listIdentityProvidersAdmin,
  type AuditEvent,
  type IdentityProviderAdmin,
} from "@/lib/server/identityProviders";

import { IdentityProviderCard } from "./IdentityProviderCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadAdminData(): Promise<{
  providers: IdentityProviderAdmin[];
  events: AuditEvent[];
  loadError: string | null;
}> {
  const cookie = headers().get("cookie");
  try {
    const [providers, events] = await Promise.all([
      listIdentityProvidersAdmin(cookie),
      listIdentityAuditEvents(cookie, 25),
    ]);
    return { providers, events, loadError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load identity data";
    return { providers: [], events: [], loadError: message };
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default async function IdentitySettingsPage() {
  const { providers, events, loadError } = await loadAdminData();

  return (
    <div className="space-y-8 p-6">
      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.22em] text-bm-text-secondary/70">
          Settings · Identity
        </p>
        <h1 className="font-command text-3xl text-bm-text">Enterprise identity</h1>
        <p className="max-w-2xl text-sm text-bm-text-secondary">
          OIDC providers configured for this deployment. Test JWKS reachability,
          review the claim and group mappings, and audit recent enterprise login
          activity. Client secrets stay in env vars and are never displayed here.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Identity data is unavailable: {loadError}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-[0.18em] text-bm-text-secondary">
          Providers
        </h2>
        {providers.length === 0 && !loadError ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-bm-text-secondary">
            No identity providers configured yet. Run{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">
              python backend/scripts/seed_identity_providers.py
            </code>{" "}
            after setting the OKTA_* or ENTRA_* environment variables.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {providers.map((provider) => (
              <IdentityProviderCard key={provider.identity_provider_id} provider={provider} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-[0.18em] text-bm-text-secondary">
          Recent auth events
        </h2>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-bm-text-secondary/80">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Outcome</th>
                <th className="px-4 py-3 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-bm-text-secondary">
                    No recent OIDC audit events.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.audit_event_id} className="border-t border-white/[0.06]">
                    <td className="px-4 py-2 text-bm-text-secondary">
                      {formatTimestamp(event.created_at)}
                    </td>
                    <td className="px-4 py-2 text-bm-text">{event.action}</td>
                    <td className="px-4 py-2 text-bm-text-secondary">{event.actor}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          event.success
                            ? "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-200"
                            : "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-200"
                        }
                      >
                        {event.success ? "allowed" : "denied"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-bm-text-secondary">
                      {event.error_message ||
                        (event.input_redacted ? JSON.stringify(event.input_redacted).slice(0, 100) : "—")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

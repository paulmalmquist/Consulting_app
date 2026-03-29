"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type EnvironmentOption = {
  env_id: string;
  slug: string;
  client_name: string;
  auth_mode: string;
};

type MembershipRow = {
  membership_id: string;
  email: string;
  display_name?: string | null;
  user_status: string;
  env_id: string;
  env_slug: string;
  client_name: string;
  role: string;
  status: string;
  is_default: boolean;
  last_used_at?: string | null;
};

function formatLastUsed(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

export default function AccessPage() {
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [environmentSlug, setEnvironmentSlug] = useState("novendor");
  const [role, setRole] = useState("member");
  const [status, setStatus] = useState("active");
  const [isDefault, setIsDefault] = useState(false);

  const groupedMemberships = useMemo(() => {
    return memberships.reduce<Record<string, MembershipRow[]>>((accumulator, membership) => {
      const key = membership.env_slug;
      accumulator[key] = accumulator[key] || [];
      accumulator[key].push(membership);
      return accumulator;
    }, {});
  }, [memberships]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/access", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load access data");
      }
      setEnvironments(payload.environments || []);
      setMemberships(payload.memberships || []);
      if ((payload.environments || [])[0]?.slug) {
        setEnvironmentSlug((current) => current || payload.environments[0].slug);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load access data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          environmentSlug,
          role,
          status,
          isDefault,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update access");
      }
      setEmail("");
      setRole("member");
      setStatus("active");
      setIsDefault(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update access");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="bm-section-label">Membership Control</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Environment access</h1>
        <p className="max-w-3xl text-sm leading-6 text-bm-muted">
          Access is modeled explicitly by environment membership. Grant or update access by email, then let the shared identity session enforce the correct boundary.
        </p>
      </section>

      <Card>
        <CardContent className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Grant or update membership</h2>
            <p className="mt-1 text-sm text-bm-muted">
              Upserting the same email and environment updates the existing membership instead of duplicating it.
            </p>
          </div>

          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm text-bm-muted xl:col-span-2">
              <span>Email</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
                required
              />
            </label>

            <label className="space-y-2 text-sm text-bm-muted">
              <span>Environment</span>
              <select
                value={environmentSlug}
                onChange={(event) => setEnvironmentSlug(event.target.value)}
                className="h-10 w-full rounded-md border border-bm-border/70 bg-bm-surface/85 px-3 text-sm text-bm-text"
              >
                {environments.map((environment) => (
                  <option key={environment.env_id} value={environment.slug}>
                    {environment.client_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-bm-muted">
              <span>Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-10 w-full rounded-md border border-bm-border/70 bg-bm-surface/85 px-3 text-sm text-bm-text"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-bm-muted">
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-10 w-full rounded-md border border-bm-border/70 bg-bm-surface/85 px-3 text-sm text-bm-text"
              >
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="suspended">Suspended</option>
                <option value="revoked">Revoked</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-bm-muted md:col-span-2 xl:col-span-4">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
              Mark as this user&apos;s default environment
            </label>

            <div className="xl:col-span-1">
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save access"}
              </Button>
            </div>
          </form>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {environments.map((environment) => (
          <Card key={environment.env_id}>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="bm-section-label">{environment.slug}</p>
                  <h2 className="text-xl font-semibold">{environment.client_name}</h2>
                </div>
                <span className="rounded-full border border-bm-border/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-bm-muted">
                  {environment.auth_mode}
                </span>
              </div>

              {loading ? (
                <p className="text-sm text-bm-muted">Loading memberships...</p>
              ) : (groupedMemberships[environment.slug] || []).length === 0 ? (
                <p className="text-sm text-bm-muted">No memberships assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  {(groupedMemberships[environment.slug] || []).map((membership) => (
                    <div
                      key={membership.membership_id}
                      className="rounded-xl border border-bm-border/60 bg-bm-surface/45 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-bm-text">{membership.email}</p>
                          <p className="text-xs text-bm-muted">
                            {membership.role} · {membership.status}
                            {membership.is_default ? " · default" : ""}
                          </p>
                        </div>
                        <span className="text-[11px] text-bm-muted">Last used: {formatLastUsed(membership.last_used_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

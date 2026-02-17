"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { getDefaultDepartmentForIndustry } from "@/lib/lab/DepartmentRegistry";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";

type EnvironmentDetail = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type?: string;
  schema_name: string;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
};

const industryOptions = ["website", "healthcare", "legal", "construction", "general"];

function formatDate(value?: string) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function LabEnvironmentHomePage({
  params,
}: {
  params: { envId: string };
}) {
  const { environments, selectEnv, refresh } = useEnv();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [detail, setDetail] = useState<EnvironmentDetail | null>(null);
  const [form, setForm] = useState({
    client_name: "",
    industry: "website",
    industry_type: "website",
    notes: "",
    is_active: true,
  });

  useEffect(() => {
    selectEnv(params.envId);
  }, [params.envId, selectEnv]);

  useEffect(() => {
    const raw = sessionStorage.getItem("bm_env_flash");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { envId?: string; message?: string };
      if (parsed.envId === params.envId && parsed.message) {
        setFlash(parsed.message);
        sessionStorage.removeItem("bm_env_flash");
      }
    } catch {
      sessionStorage.removeItem("bm_env_flash");
    }
  }, [params.envId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStatus(null);
      try {
        const payload = await apiFetch<EnvironmentDetail>(`/v1/environments/${params.envId}`);
        if (cancelled) return;
        setDetail(payload);
        setForm({
          client_name: payload.client_name,
          industry: payload.industry || "website",
          industry_type: payload.industry_type || payload.industry || "website",
          notes: payload.notes || "",
          is_active: payload.is_active,
        });
      } catch {
        if (cancelled) return;
        const fallback = environments.find((item) => item.env_id === params.envId);
        if (!fallback) return;
        const fallbackDetail: EnvironmentDetail = {
          ...fallback,
          notes: fallback.notes || "",
        };
        setDetail(fallbackDetail);
        setForm({
          client_name: fallback.client_name,
          industry: fallback.industry || "website",
          industry_type: fallback.industry_type || fallback.industry || "website",
          notes: fallback.notes || "",
          is_active: fallback.is_active,
        });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [params.envId, environments]);

  const defaultDept = useMemo(
    () => getDefaultDepartmentForIndustry(form.industry_type || form.industry),
    [form.industry, form.industry_type]
  );

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = await apiFetch<EnvironmentDetail>(`/v1/environments/${params.envId}`, {
        method: "PATCH",
        body: JSON.stringify({
          client_name: form.client_name,
          industry: form.industry,
          industry_type: form.industry_type,
          notes: form.notes || null,
          is_active: form.is_active,
        }),
      });
      setDetail(payload);
      await refresh();
      selectEnv(params.envId);
      setStatus("Environment details updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save environment details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.7fr,1fr]">
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Environment Home</CardTitle>
          <CardDescription>
            Start in pipeline, jump to the default department workspace, or update environment metadata.
          </CardDescription>
          {flash ? (
            <div className="mt-3 rounded-lg border border-bm-success/35 bg-bm-success/10 px-3 py-2 text-sm text-bm-text">
              {flash}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/lab/env/${params.envId}/pipeline`} className={buttonVariants()}>
              Open Pipeline
            </Link>
            <Link
              href={`/lab/env/${params.envId}/${defaultDept}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Open {defaultDept} Workspace
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Client Name</label>
              <Input
                className="mt-1"
                value={form.client_name}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, client_name: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Client Type</label>
              <Input
                className="mt-1"
                value={form.industry_type}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, industry_type: event.target.value }))
                }
                placeholder="website"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Industry</label>
              <Select
                className="mt-1"
                value={form.industry}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, industry: event.target.value }))
                }
              >
                {industryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Status</label>
              <Select
                className="mt-1"
                value={form.is_active ? "active" : "paused"}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, is_active: event.target.value === "active" }))
                }
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
              </Select>
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Notes</label>
            <Textarea
              className="mt-1"
              rows={4}
              value={form.notes}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, notes: event.target.value }))
              }
              placeholder="Business model, owner, timezone, handoff notes, billing profile, risk notes..."
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || !form.client_name.trim()}>
              {saving ? "Saving..." : "Save Environment"}
            </Button>
            {status ? <p className="text-sm text-bm-muted">{status}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle>Environment Context</CardTitle>
          <CardDescription>
            Key metadata for auditability and operator handoffs.
          </CardDescription>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Environment ID</dt>
              <dd className="font-mono text-xs text-bm-text break-all">{params.envId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Schema</dt>
              <dd>{detail?.schema_name || "n/a"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Created</dt>
              <dd>{formatDate(detail?.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Client / Type</dt>
              <dd>{form.client_name || "n/a"} · {form.industry_type || "n/a"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Defaults</dt>
              <dd>Landing department: {defaultDept}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Recommended fields</dt>
              <dd className="text-bm-muted">
                Owner, timezone, billing mode, SLA tier, data sensitivity, and escalation contact.
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

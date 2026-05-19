"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  getOutreachTarget,
  listCrmAccounts,
  listOutreachTargets,
  patchOutreachTarget,
  regenerateOutreachAsset,
  seedOutreachTarget,
  type CrmAccount,
  type OutreachInsight,
  type OutreachTarget,
  type TargetResponse,
} from "@/lib/outreach-personalizer-api";

const ARTEMIS = {
  firm_name: "Artemis Real Estate Partners",
  firm_slug: "artemis-real-estate-partners",
  profile_json: {
    sector: "Real estate investment management / real estate private equity",
  },
};

function fmtError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Outreach Personalizer API unreachable.";
  }
  return err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
}

function statusTone(status: string): string {
  if (status === "assets_ready" || status === "microsite_live") return "text-bm-success";
  if (status === "failed") return "text-bm-danger";
  return "text-bm-warning";
}

function assetPayload(detail: TargetResponse | null, type: string): Record<string, unknown> {
  const a = detail?.assets.find((x) => x.asset_type === type);
  return (a?.payload as Record<string, unknown>) || {};
}

export default function OutreachPersonalizerPage({
  params,
}: {
  params: { envId: string };
}) {
  const { envId, businessId, ready, error: envError } = useConsultingEnv();
  void params;

  const [targets, setTargets] = useState<OutreachTarget[]>([]);
  const [detail, setDetail] = useState<TargetResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Phase 2A: Loom URL + CRM linking + logo/accent edit state
  const [loomInput, setLoomInput] = useState("");
  const [logoInput, setLogoInput] = useState("");
  const [accentInput, setAccentInput] = useState("");
  const [accountInput, setAccountInput] = useState("");
  const [crmAccounts, setCrmAccounts] = useState<CrmAccount[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      const { targets: list } = await listOutreachTargets(envId);
      setTargets(list);
    } catch (e) {
      setErr(fmtError(e));
    }
  }, [envId, ready]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncEditState = useCallback((d: TargetResponse) => {
    setLoomInput(d.target.loom_url ?? "");
    setLogoInput(d.target.logo_url ?? "");
    setAccentInput(d.target.accent_hsl ?? "");
    setAccountInput(d.target.crm_account_id ?? "");
    setSaveMsg(null);
  }, []);

  const openTarget = useCallback(
    async (id: string) => {
      setErr(null);
      try {
        const d = await getOutreachTarget(id);
        setDetail(d);
        syncEditState(d);
      } catch (e) {
        setErr(fmtError(e));
      }
    },
    [syncEditState],
  );

  // CRM account picker — reuses the existing /api/crm/accounts route. Requires
  // a business_id; when the env has none, the operator can paste an id manually.
  useEffect(() => {
    if (!ready || !businessId) return;
    listCrmAccounts(businessId)
      .then(setCrmAccounts)
      .catch(() => setCrmAccounts([]));
  }, [ready, businessId]);

  const saveDetails = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const updated = await patchOutreachTarget(detail.target.id, {
        loom_url: loomInput.trim() === "" ? null : loomInput.trim(),
        crm_account_id: accountInput.trim() === "" ? null : accountInput.trim(),
        logo_url: logoInput.trim() === "" ? null : logoInput.trim(),
        accent_hsl: accentInput.trim() === "" ? null : accentInput.trim(),
      });
      setDetail(updated);
      syncEditState(updated);
      setSaveMsg("Saved.");
      await refresh();
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [detail, loomInput, accountInput, logoInput, accentInput, refresh, syncEditState]);

  const seedArtemis = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await seedOutreachTarget(envId, ARTEMIS, businessId || undefined);
      setDetail(res);
      syncEditState(res);
      await refresh();
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [envId, businessId, refresh, syncEditState]);

  const regenerate = useCallback(
    async (type: "insight" | "loom_script" | "cold_email") => {
      if (!detail) return;
      setBusy(true);
      setErr(null);
      try {
        await regenerateOutreachAsset(detail.target.id, type);
        setDetail(await getOutreachTarget(detail.target.id));
      } catch (e) {
        setErr(fmtError(e));
      } finally {
        setBusy(false);
      }
    },
    [detail],
  );

  const insights = (assetPayload(detail, "insight").insights as OutreachInsight[]) || [];
  const loom = assetPayload(detail, "loom_script");
  const email = assetPayload(detail, "cold_email");

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-bm-text">Outreach Personalizer</h1>
          <p className="text-xs text-bm-muted2">
            Seed a firm, generate a personalized case, publish a public microsite.
          </p>
        </div>
        <Button onClick={() => void seedArtemis()} disabled={busy || !ready}>
          {busy ? "Working…" : "Seed Artemis Real Estate Partners"}
        </Button>
      </div>

      {envError ? (
        <Card variant="danger">
          <CardContent className="py-3 text-sm text-bm-danger">{envError}</CardContent>
        </Card>
      ) : null}
      {err ? (
        <Card variant="danger">
          <CardContent className="py-3 text-sm text-bm-danger">{err}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
        <Card>
          <CardContent className="space-y-1 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Targets
            </p>
            {targets.length === 0 ? (
              <p className="py-2 text-xs text-bm-muted2">
                No targets yet. Seed Artemis to start.
              </p>
            ) : (
              targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void openTarget(t.id)}
                  className={`block w-full rounded border-l-2 px-3 py-2 text-left text-xs transition-colors ${
                    detail?.target.id === t.id
                      ? "border-l-bm-accent bg-bm-surface/15 text-bm-text"
                      : "border-l-transparent text-bm-muted hover:bg-bm-surface/10 hover:text-bm-text"
                  }`}
                >
                  <span className="block font-medium">{t.firm_name}</span>
                  <span className={`text-[10px] ${statusTone(t.status)}`}>{t.status}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {detail ? (
          <Card>
            <CardContent className="space-y-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{detail.target.firm_name}</CardTitle>
                  <p className={`text-xs ${statusTone(detail.target.status)}`}>
                    {detail.target.status}
                  </p>
                </div>
                <Link
                  href={detail.public_path}
                  target="_blank"
                  className="rounded border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-xs font-semibold text-bm-accent"
                >
                  Open microsite ↗
                </Link>
              </div>

              <p className="text-xs text-bm-muted2">
                Public URL:{" "}
                <span className="text-bm-text">{detail.microsite_url || "—"}</span>
                {detail.target.loom_url ? (
                  <span className="ml-3 text-bm-success">Loom linked</span>
                ) : (
                  <span className="ml-3 text-bm-warning">Personal video pending</span>
                )}
              </p>

              <section className="space-y-3 rounded border border-bm-border/60 bg-bm-bg/40 p-4">
                <h3 className="text-sm font-semibold text-bm-text">
                  Personalization &amp; linking
                </h3>

                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                    Loom URL (share or embed; blank to clear)
                  </span>
                  <input
                    type="url"
                    value={loomInput}
                    onChange={(e) => setLoomInput(e.target.value)}
                    placeholder="https://www.loom.com/share/<id>"
                    className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                    CRM account
                  </span>
                  {businessId && crmAccounts.length > 0 ? (
                    <select
                      value={accountInput}
                      onChange={(e) => setAccountInput(e.target.value)}
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    >
                      <option value="">— Not linked —</option>
                      {crmAccounts.map((a) => (
                        <option key={a.crm_account_id} value={a.crm_account_id}>
                          {a.name}
                          {a.website ? ` (${a.website})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={accountInput}
                      onChange={(e) => setAccountInput(e.target.value)}
                      placeholder="crm_account_id (UUID) — blank to unlink"
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    />
                  )}
                  {detail.crm_account ? (
                    <span className="text-[10px] text-bm-success">
                      Linked: {detail.crm_account.name}
                      {detail.crm_account.website
                        ? ` · ${detail.crm_account.website}`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] text-bm-muted2">No CRM account linked</span>
                  )}
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      Logo URL
                    </span>
                    <input
                      type="url"
                      value={logoInput}
                      onChange={(e) => setLogoInput(e.target.value)}
                      placeholder="https://…/logo.png"
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      Accent HSL
                    </span>
                    <input
                      type="text"
                      value={accentInput}
                      onChange={(e) => setAccentInput(e.target.value)}
                      placeholder="210 90% 60%"
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={() => void saveDetails()} disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </Button>
                  {saveMsg ? (
                    <span className="text-xs text-bm-success">{saveMsg}</span>
                  ) : null}
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-bm-text">Insights</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void regenerate("insight")}
                    disabled={busy}
                  >
                    Regenerate
                  </Button>
                </div>
                {insights.map((i, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-bm-border/60 bg-bm-bg/40 p-3"
                  >
                    <p className="text-xs font-semibold text-bm-text">{i.title}</p>
                    <p className="mt-1 text-xs text-bm-muted2">{i.observation}</p>
                    <p className="mt-1 text-xs text-bm-muted">{i.novendor_angle}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-bm-muted2">
                      confidence: {i.confidence}
                    </p>
                  </div>
                ))}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-bm-text">Loom script</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void regenerate("loom_script")}
                    disabled={busy}
                  >
                    Regenerate
                  </Button>
                </div>
                <p className="whitespace-pre-wrap rounded border border-bm-border/60 bg-bm-bg/40 p-3 text-xs text-bm-muted2">
                  {(loom.script as string) || "—"}
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-bm-text">Cold email</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void regenerate("cold_email")}
                    disabled={busy}
                  >
                    Regenerate
                  </Button>
                </div>
                <div className="rounded border border-bm-border/60 bg-bm-bg/40 p-3">
                  <p className="text-xs font-semibold text-bm-text">
                    {(email.subject as string) || "—"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-bm-muted2">
                    {(email.body as string) || "—"}
                  </p>
                </div>
              </section>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-bm-muted2">
              Select a target or seed Artemis Real Estate Partners.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

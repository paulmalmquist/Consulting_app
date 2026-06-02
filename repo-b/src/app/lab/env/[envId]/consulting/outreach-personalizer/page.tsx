"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  advancePipeline,
  getOutreachTarget,
  listCrmAccounts,
  listCrmOpportunities,
  listOutreachTargets,
  listEnvironmentTemplates,
  logCrmActivity,
  patchOutreachTarget,
  recreateScaffoldEnv,
  regenerateAllAssets,
  regenerateOutreachAsset,
  scaffoldEnv,
  seedOutreachTarget,
  type CrmAccount,
  type CrmOpportunityListRow,
  type EnvironmentTemplate,
  type MicrositeProfilePatch,
  type OutreachInsight,
  type OutreachTargetWithEngagement,
  type TargetResponse,
} from "@/lib/outreach-personalizer-api";

// Phase 3.5 — outreach-appropriate template allowlist. Excludes the
// `public_*` templates (prospect-facing, not demos) and `empty_lab`
// (no preloaded surface). `repe` stays the default.
const ALLOWED_OUTREACH_TEMPLATES = new Set([
  "repe",
  "internal_ops",
  "client_delivery",
  "trading_research",
  "legal_ops",
]);

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "never";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "never" : d.toLocaleString();
}

// firm_slug must match the backend constraint ^[a-z0-9][a-z0-9-]{0,39}$.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

// Phase 4 — Artemis is now just a one-click prefill example for the Create
// Microsite form, not a hard-coded seed path.
const ARTEMIS_EXAMPLE = {
  firm_name: "Artemis Real Estate Partners",
  firm_slug: "artemis-real-estate-partners",
  sector: "Real estate investment management / real estate private equity",
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

  const [targets, setTargets] = useState<OutreachTargetWithEngagement[]>([]);
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

  // Phase 2C: opportunity linkage + pipeline advance state
  const [opportunityInput, setOpportunityInput] = useState("");
  const [crmOpportunities, setCrmOpportunities] = useState<CrmOpportunityListRow[]>([]);

  // Phase 3.5: template picker state. Default `repe`; collapsed-by-default
  // disclosure (operators who don't expand always get the REPE default).
  const [templateKey, setTemplateKey] = useState<string>("repe");
  const [envTemplates, setEnvTemplates] = useState<EnvironmentTemplate[]>([]);

  // Phase 4: Create Microsite form state. The form is the operator's entry
  // point for any firm; "Use Artemis example" just prefills it. Slug
  // auto-derives from the firm name until the operator edits it directly.
  const [showForm, setShowForm] = useState(false);
  const [cfName, setCfName] = useState("");
  const [cfSlug, setCfSlug] = useState("");
  const [cfSlugTouched, setCfSlugTouched] = useState(false);
  const [cfSector, setCfSector] = useState("");
  const [cfWebsite, setCfWebsite] = useState("");
  const [cfLogo, setCfLogo] = useState("");
  const [cfAccent, setCfAccent] = useState("");
  const [cfCtaLabel, setCfCtaLabel] = useState("");
  const [cfCtaUrl, setCfCtaUrl] = useState("");
  const [cfNotes, setCfNotes] = useState("");

  // Phase 4: profile-field edit state for the detail panel (sector / CTA /
  // positioning notes / proof points). proofInput is one proof point per line.
  const [sectorInput, setSectorInput] = useState("");
  const [ctaLabelInput, setCtaLabelInput] = useState("");
  const [ctaUrlInput, setCtaUrlInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [proofInput, setProofInput] = useState("");

  const effectiveSlug = cfSlugTouched ? cfSlug : slugify(cfName);

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
    setOpportunityInput(d.target.crm_opportunity_id ?? "");  // Phase 2C
    // Phase 4: hydrate the profile-field editors from profile_json.
    const p = (d.target.profile_json ?? {}) as Record<string, unknown>;
    setSectorInput(typeof p.sector === "string" ? p.sector : "");
    setCtaLabelInput(typeof p.cta_label === "string" ? p.cta_label : "");
    setCtaUrlInput(typeof p.cta_url === "string" ? p.cta_url : "");
    setNotesInput(typeof p.positioning_notes === "string" ? p.positioning_notes : "");
    setProofInput(
      Array.isArray(p.proof_points)
        ? (p.proof_points as unknown[]).filter((x) => typeof x === "string").join("\n")
        : "",
    );
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

  // Phase 2C: CRM opportunity picker — reuses the existing /api/crm/opportunities
  // route. Same business_id precondition / manual-UUID fallback as the account picker.
  useEffect(() => {
    if (!ready || !businessId) return;
    listCrmOpportunities(businessId)
      .then(setCrmOpportunities)
      .catch(() => setCrmOpportunities([]));
  }, [ready, businessId]);

  // Phase 3.5: template picker — reuses the existing /v2/environments/templates
  // route. Filtered client-side to an outreach-appropriate allowlist. Public
  // and empty templates are excluded.
  useEffect(() => {
    if (!ready) return;
    listEnvironmentTemplates()
      .then((rows) =>
        setEnvTemplates(
          rows.filter((t) => ALLOWED_OUTREACH_TEMPLATES.has(t.template_key)),
        ),
      )
      .catch(() => setEnvTemplates([]));
  }, [ready]);

  const saveDetails = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const proofPoints = proofInput
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await patchOutreachTarget(detail.target.id, {
        loom_url: loomInput.trim() === "" ? null : loomInput.trim(),
        crm_account_id: accountInput.trim() === "" ? null : accountInput.trim(),
        crm_opportunity_id:
          opportunityInput.trim() === "" ? null : opportunityInput.trim(),
        logo_url: logoInput.trim() === "" ? null : logoInput.trim(),
        accent_hsl: accentInput.trim() === "" ? null : accentInput.trim(),
        // Phase 4: profile fields merged into profile_json (null clears).
        profile: {
          sector: sectorInput.trim() === "" ? null : sectorInput.trim(),
          cta_label: ctaLabelInput.trim() === "" ? null : ctaLabelInput.trim(),
          cta_url: ctaUrlInput.trim() === "" ? null : ctaUrlInput.trim(),
          positioning_notes: notesInput.trim() === "" ? null : notesInput.trim(),
          proof_points: proofPoints.length > 0 ? proofPoints : null,
        },
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
  }, [
    detail, loomInput, accountInput, opportunityInput, logoInput, accentInput,
    sectorInput, ctaLabelInput, ctaUrlInput, notesInput, proofInput,
    refresh, syncEditState,
  ]);

  const logActivity = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      await logCrmActivity(detail.target.id);
      setSaveMsg("Engagement logged to CRM activity.");
      setDetail(await getOutreachTarget(detail.target.id));
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [detail]);

  // Phase 2C: advance the linked opportunity's pipeline stage by one step.
  // Backend gate is the single authority; frontend just renders the result.
  const advance = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const res = await advancePipeline(detail.target.id);
      const nextLabel = res.opportunity.stage_label ?? "next stage";
      setSaveMsg(`Pipeline advanced to "${nextLabel}".`);
      setDetail(await getOutreachTarget(detail.target.id));
      await refresh();
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [detail, refresh]);

  // Phase 3: provision (or return existing) outreach environment for this
  // target. Backend gate is single authority; idempotent on
  // target.scaffolded_env_id.
  //
  // Phase 3.5: pass the operator's chosen template_key (or undefined to let
  // the backend default to "repe").
  const scaffold = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const res = await scaffoldEnv(detail.target.id, {
        templateKey: templateKey || undefined,
      });
      setSaveMsg(
        res.created ? "Environment created." : "Opened existing environment.",
      );
      setDetail(await getOutreachTarget(detail.target.id));
      await refresh();
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [detail, refresh, templateKey]);

  // Phase 3.5: replace a stale/retired scaffolded env. Only available when
  // backend.gate.can_recreate === true (orphaned or retired stored env).
  // Confirmation gesture before firing because this creates a new env row.
  const recreate = useCallback(async () => {
    if (!detail) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Create a new environment for this target? The previous link will be replaced.",
      );
      if (!ok) return;
    }
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const res = await recreateScaffoldEnv(detail.target.id, {
        templateKey: templateKey || undefined,
      });
      setSaveMsg(`Environment recreated (slug ${res.env?.slug ?? "?"}).`);
      setDetail(await getOutreachTarget(detail.target.id));
      await refresh();
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [detail, refresh, templateKey]);

  // Phase 4: create a microsite from the operator's form inputs. The backend
  // is idempotent on (env_id, firm_slug) — a repeat slug returns the existing
  // target rather than erroring.
  const createMicrosite = useCallback(async () => {
    const name = cfName.trim();
    const slug = (cfSlugTouched ? cfSlug : slugify(cfName)).trim();
    if (!name) {
      setErr("Firm name is required.");
      return;
    }
    if (!slug) {
      setErr("Firm slug is required (letters, numbers, and dashes).");
      return;
    }
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      const profile: MicrositeProfilePatch = {};
      if (cfSector.trim()) profile.sector = cfSector.trim();
      if (cfWebsite.trim()) profile.website = cfWebsite.trim();
      if (cfCtaLabel.trim()) profile.cta_label = cfCtaLabel.trim();
      if (cfCtaUrl.trim()) profile.cta_url = cfCtaUrl.trim();
      if (cfNotes.trim()) profile.positioning_notes = cfNotes.trim();
      const res = await seedOutreachTarget(
        envId,
        {
          firm_name: name,
          firm_slug: slug,
          logo_url: cfLogo.trim() || null,
          accent_hsl: cfAccent.trim() || null,
          profile,
        },
        businessId || undefined,
      );
      setDetail(res);
      syncEditState(res);
      setShowForm(false);
      setSaveMsg(res.created ? "Microsite created." : "Opened existing microsite.");
      await refresh();
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [
    cfName, cfSlug, cfSlugTouched, cfSector, cfWebsite, cfLogo, cfAccent,
    cfCtaLabel, cfCtaUrl, cfNotes, envId, businessId, refresh, syncEditState,
  ]);

  const resetForm = useCallback(() => {
    setCfName(""); setCfSlug(""); setCfSlugTouched(false);
    setCfSector(""); setCfWebsite(""); setCfLogo(""); setCfAccent("");
    setCfCtaLabel(""); setCfCtaUrl(""); setCfNotes("");
  }, []);

  const prefillArtemisExample = useCallback(() => {
    setCfName(ARTEMIS_EXAMPLE.firm_name);
    setCfSlug(ARTEMIS_EXAMPLE.firm_slug);
    setCfSlugTouched(true);
    setCfSector(ARTEMIS_EXAMPLE.sector);
    setCfWebsite(""); setCfLogo(""); setCfAccent("");
    setCfCtaLabel(""); setCfCtaUrl(""); setCfNotes("");
    setShowForm(true);
  }, []);

  // Phase 4: Duplicate — prefill the Create form from an existing target under
  // a fresh (blank) slug. Pure frontend; no duplicate endpoint.
  const duplicateTarget = useCallback(() => {
    if (!detail) return;
    const p = (detail.target.profile_json ?? {}) as Record<string, unknown>;
    setCfName(`${detail.target.firm_name} (copy)`);
    setCfSlug("");
    setCfSlugTouched(false);
    setCfSector(typeof p.sector === "string" ? p.sector : "");
    setCfWebsite(typeof p.website === "string" ? p.website : "");
    setCfLogo(detail.target.logo_url ?? "");
    setCfAccent(detail.target.accent_hsl ?? "");
    setCfCtaLabel(typeof p.cta_label === "string" ? p.cta_label : "");
    setCfCtaUrl(typeof p.cta_url === "string" ? p.cta_url : "");
    setCfNotes(typeof p.positioning_notes === "string" ? p.positioning_notes : "");
    setShowForm(true);
  }, [detail]);

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

  // Phase 4: regenerate the full copy pack in one call (AI required). Returns
  // the refreshed full asset list so the UI never shows a mixed old/new state.
  const regenerateAll = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setSaveMsg(null);
    try {
      await regenerateAllAssets(detail.target.id);
      setDetail(await getOutreachTarget(detail.target.id));
      setSaveMsg("All microsite copy regenerated.");
    } catch (e) {
      setErr(fmtError(e));
    } finally {
      setBusy(false);
    }
  }, [detail]);

  const insights = (assetPayload(detail, "insight").insights as OutreachInsight[]) || [];
  const loom = assetPayload(detail, "loom_script");
  const email = assetPayload(detail, "cold_email");

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-bm-text">Outreach Personalizer</h1>
          <p className="text-xs text-bm-muted2">
            Create a personalized microsite for a firm, edit it, share the
            public link, and track engagement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={prefillArtemisExample}
            disabled={busy || !ready}
          >
            Use Artemis example
          </Button>
          <Button
            onClick={() => setShowForm((v) => !v)}
            disabled={busy || !ready}
          >
            {showForm ? "Close form" : "Create microsite"}
          </Button>
        </div>
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

      {showForm ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <h2 className="text-sm font-semibold text-bm-text">Create microsite</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                  Firm name *
                </span>
                <input
                  type="text"
                  value={cfName}
                  onChange={(e) => setCfName(e.target.value)}
                  placeholder="Artemis Real Estate Partners"
                  className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                  Slug * (public path /for/&lt;slug&gt;)
                </span>
                <input
                  type="text"
                  value={effectiveSlug}
                  onChange={(e) => {
                    setCfSlug(e.target.value);
                    setCfSlugTouched(true);
                  }}
                  placeholder="artemis-real-estate-partners"
                  className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                  Sector
                </span>
                <input
                  type="text"
                  value={cfSector}
                  onChange={(e) => setCfSector(e.target.value)}
                  placeholder="Real estate investment management"
                  className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                  Website
                </span>
                <input
                  type="url"
                  value={cfWebsite}
                  onChange={(e) => setCfWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                  Logo URL
                </span>
                <input
                  type="url"
                  value={cfLogo}
                  onChange={(e) => setCfLogo(e.target.value)}
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
                  value={cfAccent}
                  onChange={(e) => setCfAccent(e.target.value)}
                  placeholder="210 90% 60%"
                  className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                  CTA label
                </span>
                <input
                  type="text"
                  value={cfCtaLabel}
                  onChange={(e) => setCfCtaLabel(e.target.value)}
                  placeholder="Talk to Novendor"
                  className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                  CTA URL (http(s) or mailto:)
                </span>
                <input
                  type="text"
                  value={cfCtaUrl}
                  onChange={(e) => setCfCtaUrl(e.target.value)}
                  placeholder="https://cal.com/… or mailto:you@firm.com"
                  className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                Positioning notes (operator framing — guides the generated copy)
              </span>
              <textarea
                value={cfNotes}
                onChange={(e) => setCfNotes(e.target.value)}
                rows={3}
                placeholder="What angle should the microsite take for this firm?"
                className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
              />
            </label>
            <div className="flex items-center gap-3">
              <Button onClick={() => void createMicrosite()} disabled={busy || !ready}>
                {busy ? "Creating…" : "Create microsite"}
              </Button>
              <Button variant="ghost" size="sm" onClick={resetForm} disabled={busy}>
                Clear
              </Button>
            </div>
          </CardContent>
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
                No targets yet. Create a microsite to start.
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
                  <span className="block font-medium">
                    {t.firm_name}
                    {t.engagement && t.engagement.total_ctas > 0 ? (
                      <span className="ml-2 rounded bg-bm-danger/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-bm-danger">
                        Hot
                      </span>
                    ) : null}
                    {t.scaffold?.linked ? (
                      <span className="ml-2 rounded bg-bm-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-bm-accent">
                        env
                      </span>
                    ) : null}
                  </span>
                  <span className={`text-[10px] ${statusTone(t.status)}`}>
                    {t.status}
                    {t.engagement
                      ? ` · ${t.engagement.total_views}v / ${t.engagement.total_ctas}c`
                      : ""}
                  </span>
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={duplicateTarget}
                    disabled={busy}
                    title="Prefill the Create form from this target under a new slug"
                  >
                    Duplicate
                  </Button>
                  <Link
                    href={detail.public_path}
                    target="_blank"
                    className="rounded border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-xs font-semibold text-bm-accent"
                  >
                    Open microsite ↗
                  </Link>
                </div>
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

                {/* Phase 2C: CRM opportunity picker. Mirrors the account picker
                    above (select when businessId + list non-empty; manual UUID
                    fallback otherwise). Linked state shows opp name + current
                    stage label. */}
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                    CRM opportunity
                  </span>
                  {businessId && crmOpportunities.length > 0 ? (
                    <select
                      value={opportunityInput}
                      onChange={(e) => setOpportunityInput(e.target.value)}
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    >
                      <option value="">— Not linked —</option>
                      {crmOpportunities.map((o) => (
                        <option key={o.crm_opportunity_id} value={o.crm_opportunity_id}>
                          {o.name}
                          {o.stage_label ? ` · ${o.stage_label}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={opportunityInput}
                      onChange={(e) => setOpportunityInput(e.target.value)}
                      placeholder="crm_opportunity_id (UUID) — blank to unlink"
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    />
                  )}
                  {detail.crm_opportunity ? (
                    <span className="text-[10px] text-bm-success">
                      Linked: {detail.crm_opportunity.name}
                      {detail.crm_opportunity.stage_label
                        ? ` · ${detail.crm_opportunity.stage_label}`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] text-bm-muted2">
                      No CRM opportunity linked
                    </span>
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

                {/* Phase 4: editable microsite profile fields (merged into
                    profile_json). Saved together with the Save button below. */}
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                    Sector
                  </span>
                  <input
                    type="text"
                    value={sectorInput}
                    onChange={(e) => setSectorInput(e.target.value)}
                    placeholder="Real estate investment management"
                    className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      CTA label
                    </span>
                    <input
                      type="text"
                      value={ctaLabelInput}
                      onChange={(e) => setCtaLabelInput(e.target.value)}
                      placeholder="Talk to Novendor"
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      CTA URL (http(s) or mailto:)
                    </span>
                    <input
                      type="text"
                      value={ctaUrlInput}
                      onChange={(e) => setCtaUrlInput(e.target.value)}
                      placeholder="https://cal.com/… or mailto:…"
                      className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                    Positioning notes (operator framing — guides generated copy)
                  </span>
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={3}
                    placeholder="What angle should this microsite take?"
                    className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-bm-muted2">
                    Proof points — one per line, operator-written, max 5
                  </span>
                  <textarea
                    value={proofInput}
                    onChange={(e) => setProofInput(e.target.value)}
                    rows={4}
                    placeholder={"Shipped X in 3 weeks\nReferenceable client in REPE\n…"}
                    className="w-full rounded border border-bm-border/70 bg-bm-bg px-3 py-1.5 text-xs text-bm-text"
                  />
                  <span className="text-[10px] text-bm-muted2">
                    These render verbatim on the public microsite — operator
                    facts only, never AI-generated.
                  </span>
                </label>

                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={() => void saveDetails()} disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </Button>
                  {saveMsg ? (
                    <span className="text-xs text-bm-success">{saveMsg}</span>
                  ) : null}
                </div>
              </section>

              <section className="space-y-3 rounded border border-bm-border/60 bg-bm-bg/40 p-4">
                <h3 className="text-sm font-semibold text-bm-text">
                  Microsite engagement
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-lg font-semibold text-bm-text">
                      {detail.engagement?.total_views ?? 0}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      Views
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-bm-text">
                      {detail.engagement?.total_ctas ?? 0}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      CTA clicks
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-bm-text">
                      {fmtTs(detail.engagement?.last_viewed_at)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      Last viewed
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-bm-text">
                      {fmtTs(detail.engagement?.last_cta_at)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      Last CTA
                    </p>
                  </div>
                </div>

                {detail.engagement && detail.engagement.recent_events.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-bm-muted2">
                      Recent events
                    </p>
                    {detail.engagement.recent_events.map((ev, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs text-bm-muted2"
                      >
                        <span
                          className={
                            ev.event_type === "microsite_cta"
                              ? "text-bm-danger"
                              : "text-bm-muted"
                          }
                        >
                          {ev.event_type === "microsite_cta" ? "CTA click" : "View"}
                        </span>
                        <span>{fmtTs(ev.occurred_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-bm-muted2">No engagement yet.</p>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-bm-border/40 pt-3">
                  {detail.target.crm_account_id && detail.target.business_id ? (
                    <Button
                      size="sm"
                      onClick={() => void logActivity()}
                      disabled={busy}
                    >
                      {busy ? "Logging…" : "Log CRM activity"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" disabled title="Link a CRM account (and the env must have a business) to log activity">
                      Log CRM activity
                    </Button>
                  )}
                  {!detail.target.crm_account_id ? (
                    <span className="text-[10px] text-bm-warning">
                      Link a CRM account above to enable activity logging.
                    </span>
                  ) : !detail.target.business_id ? (
                    <span className="text-[10px] text-bm-warning">
                      This env has no business_id; CRM activity logging is unavailable.
                    </span>
                  ) : null}
                  {/* Phase 2C: real "Advance pipeline" affordance. Backend
                      compute_pipeline_advance_state is the single authority —
                      we render available/disabled + exact blocking_reason. */}
                  {detail.pipeline?.available && detail.pipeline.next_stage ? (
                    <Button
                      size="sm"
                      onClick={() => void advance()}
                      disabled={busy}
                    >
                      {busy
                        ? "Advancing…"
                        : `Advance to "${detail.pipeline.next_stage.label}"`}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled
                      title={detail.pipeline?.blocking_reason ?? undefined}
                    >
                      Advance pipeline
                    </Button>
                  )}
                  {detail.pipeline && !detail.pipeline.available ? (
                    <span className="text-[10px] text-bm-warning">
                      {detail.pipeline.blocking_reason}
                    </span>
                  ) : null}
                  {/* Phase 3: "Create outreach environment" affordance. Three
                      render states:
                      (a) env_summary present → SUCCESS/LINK state (Open env link
                          + scaffolded label). NOT a warning — the backend's
                          "Environment already exists." is an idempotency signal,
                          not an error.
                      (b) available=true (no env yet) → enabled primary button.
                      (c) gate failure WITHOUT env_summary → disabled button +
                          exact blocking_reason in warning tone. */}
                  {detail.scaffold?.env_summary ? (
                    <>
                      <Link
                        href={detail.scaffold.env_summary.dashboard_url ?? "#"}
                        target="_blank"
                        className="rounded border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-xs font-semibold text-bm-accent"
                      >
                        Open environment ↗
                      </Link>
                      <span className="text-[10px] text-bm-success">
                        Scaffolded · {detail.scaffold.env_summary.lifecycle_state}
                      </span>
                      {/* Phase 3.5: template summary audit line. Operator-only
                          (the public microsite never renders this).  */}
                      <span className="text-[10px] text-bm-muted2">
                        Template:{" "}
                        {detail.scaffold.env_summary.template_display_name
                          ?? detail.scaffold.env_summary.template_key}
                        {detail.scaffold.env_summary.dashboard_url ? (
                          <>
                            {" · home: "}
                            <span className="text-bm-text">
                              {detail.scaffold.env_summary.dashboard_url}
                            </span>
                          </>
                        ) : null}
                        {detail.scaffold.env_summary.template_seed_pack ? (
                          <>
                            {" · seed: "}
                            <span className="text-bm-text">
                              {detail.scaffold.env_summary.template_seed_pack}
                            </span>
                          </>
                        ) : null}
                      </span>
                      {/* Phase 3.5: recreate affordance. Backend sets
                          can_recreate=True only for orphaned or retired stored
                          envs; healthy envs are NOT recreatable through this
                          endpoint (operator must retire in the v2 env UI first). */}
                      {detail.scaffold.can_recreate ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void recreate()}
                          disabled={busy}
                          title="The stored env is missing or retired. Create a new one."
                        >
                          {busy ? "Recreating…" : "Recreate environment"}
                        </Button>
                      ) : null}
                    </>
                  ) : detail.scaffold?.available ? (
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        onClick={() => void scaffold()}
                        disabled={busy}
                      >
                        {busy ? "Creating…" : "Create outreach environment"}
                      </Button>
                      {/* Phase 3.5: template picker (collapsed-by-default).
                          Operators who don't expand always get the REPE
                          default. Allowlisted templates only. */}
                      {envTemplates.length > 0 ? (
                        <details className="text-[10px] text-bm-muted2">
                          <summary className="cursor-pointer">
                            Template:{" "}
                            <span className="text-bm-text">
                              {envTemplates.find((t) => t.template_key === templateKey)
                                ?.display_name ?? templateKey}
                            </span>
                          </summary>
                          <select
                            value={templateKey}
                            onChange={(e) => setTemplateKey(e.target.value)}
                            className="mt-1 rounded border border-bm-border/70 bg-bm-bg px-2 py-1 text-xs text-bm-text"
                          >
                            {envTemplates.map((t) => (
                              <option key={t.template_key} value={t.template_key}>
                                {t.display_name} ({t.template_key})
                              </option>
                            ))}
                          </select>
                        </details>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled
                        title={detail.scaffold?.blocking_reason ?? undefined}
                      >
                        Create outreach environment
                      </Button>
                      {detail.scaffold ? (
                        <span className="text-[10px] text-bm-warning">
                          {detail.scaffold.blocking_reason}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              </section>

              <div className="flex items-center justify-between border-t border-bm-border/40 pt-3">
                <h3 className="text-sm font-semibold text-bm-text">Microsite copy</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void regenerateAll()}
                  disabled={busy}
                  title="Regenerate insights, Loom script, and cold email together (AI required)"
                >
                  {busy ? "Regenerating…" : "Regenerate all copy"}
                </Button>
              </div>

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
              Select a target or create a microsite.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

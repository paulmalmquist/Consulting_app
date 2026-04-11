"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SlideOver } from "@/components/ui/SlideOver";
import { Textarea } from "@/components/ui/Textarea";
import {
  convertAppPattern,
  convertAppRecord,
  createAppInboxItem,
  createAppPattern,
  discardAppInboxItem,
  draftAppOpportunity,
  extractAppRecord,
  fetchAppInbox,
  fetchAppOpportunities,
  fetchAppPatterns,
  fetchAppRecords,
  fetchAppScoreboard,
  fetchLatestAppWeeklyMemo,
  generateAppWeeklyMemo,
  linkAppPatternEvidence,
  updateAppOpportunity,
  updateAppRecord,
  type AppInboxItem,
  type AppOpportunity,
  type AppOpportunityDraft,
  type AppOpportunityKind,
  type AppOpportunityStatus,
  type AppPattern,
  type AppPatternCreateResponse,
  type AppRecord,
  type AppScoreboard,
  type AppWeeklyMemo,
  type SuggestedEvidence,
} from "@/lib/cro-api";

type TabKey = "inbox" | "apps" | "patterns" | "opportunities" | "memo";

type PatternFormState = {
  pattern_name: string;
  workflow_shape: string;
  industries_seen_in: string;
  recurring_pain: string;
  bad_implementation_pattern: string;
  winston_module_opportunity: string;
  consulting_offer_opportunity: string;
  demo_idea: string;
  priority: "low" | "med" | "high";
  confidence: string;
  status: "draft" | "active" | "archived";
  notes: string;
};

type ExtractFormState = {
  target_user: string;
  core_workflow_input: string;
  core_workflow_process: string;
  core_workflow_output: string;
  pain_signals: string;
  relevance_score: string;
  weakness_score: string;
  notes: string;
};

type ConverterState = {
  open: boolean;
  kind: AppOpportunityKind;
  title: string;
  payload: Record<string, unknown>;
  mustEditFields: string[];
  sourcePatternId?: string;
  sourceAppRecordId?: string;
  opportunityId?: string;
  status: AppOpportunityStatus;
};

const TAB_LABELS: Record<TabKey, string> = {
  inbox: "Inbox",
  apps: "Apps",
  patterns: "Patterns",
  opportunities: "Opportunities",
  memo: "Memo",
};

const KIND_LABELS: Record<AppOpportunityKind, string> = {
  outreach_angle: "Outreach Angle",
  demo_brief: "Demo Brief",
  consulting_offer: "Consulting Offer",
  winston_backlog: "Winston Backlog",
};

const KIND_FIELDS: Record<AppOpportunityKind, string[]> = {
  outreach_angle: [
    "target_persona",
    "trigger_signal",
    "pain_statement",
    "positioning_angle",
    "hook",
    "proof_reference",
    "next_action",
  ],
  demo_brief: [
    "target_persona",
    "pain_statement",
    "ui_flow",
    "narrative",
    "winston_modules_touched",
    "proof_reference",
    "next_action",
  ],
  consulting_offer: [
    "target_persona",
    "pain_statement",
    "scope",
    "out_of_scope",
    "pricing_angle",
    "proof_reference",
    "next_action",
  ],
  winston_backlog: [
    "pain_statement",
    "proposed_module",
    "revenue_linkage",
    "effort_estimate",
    "proof_reference",
    "next_action",
  ],
};

const FIELD_LABELS: Record<string, string> = {
  target_persona: "Target Persona",
  trigger_signal: "Trigger Signal",
  pain_statement: "Pain Statement",
  positioning_angle: "Positioning Angle",
  hook: "Hook",
  proof_reference: "Proof Reference",
  next_action: "Next Action",
  ui_flow: "UI Flow",
  narrative: "Narrative",
  winston_modules_touched: "Winston Modules Touched",
  scope: "Scope",
  out_of_scope: "Out of Scope",
  pricing_angle: "Pricing Angle",
  proposed_module: "Proposed Module",
  revenue_linkage: "Revenue Linkage",
  effort_estimate: "Effort Estimate",
};

function formatError(err: unknown): string {
  if (!(err instanceof Error)) return "Consulting API unreachable. Backend service is not available.";
  const message = err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  if (message.includes("Network error")) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  return message || "Consulting API unreachable. Backend service is not available.";
}

function scoreTone(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 55) return "bg-amber-400";
  return "bg-bm-border";
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractTextValue(value: unknown): string {
  if (Array.isArray(value)) return value.join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-bm-surface/80">
      <div
        className={`h-2 rounded-full ${scoreTone(value)}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-sm font-medium text-bm-text">{title}</p>
        <p className="mt-1 text-sm text-bm-muted2">{body}</p>
      </CardContent>
    </Card>
  );
}

function kindForSection(kind: AppOpportunityKind) {
  return KIND_LABELS[kind];
}

function initialPatternForm(record?: AppRecord | null): PatternFormState {
  return {
    pattern_name: record ? `${record.app_name} Pattern` : "",
    workflow_shape: record?.workflow_shape || "",
    industries_seen_in: "",
    recurring_pain: record?.top_pain_signal || "",
    bad_implementation_pattern: "",
    winston_module_opportunity: "",
    consulting_offer_opportunity: "",
    demo_idea: "",
    priority: "med",
    confidence: "0.5",
    status: "draft",
    notes: "",
  };
}

function initialExtractForm(item?: AppInboxItem | null): ExtractFormState {
  return {
    target_user: "",
    core_workflow_input: item?.search_term || "",
    core_workflow_process: "",
    core_workflow_output: "",
    pain_signals: "",
    relevance_score: "50",
    weakness_score: "50",
    notes: item?.raw_notes || "",
  };
}

function initialConverterState(kind: AppOpportunityKind): ConverterState {
  return {
    open: false,
    kind,
    title: "",
    payload: {},
    mustEditFields: [],
    status: "draft",
  };
}

export default function ResearchPage({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [tab, setTab] = useState<TabKey>("inbox");
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inbox, setInbox] = useState<AppInboxItem[]>([]);
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [patterns, setPatterns] = useState<AppPattern[]>([]);
  const [opportunities, setOpportunities] = useState<AppOpportunity[]>([]);
  const [scoreboard, setScoreboard] = useState<AppScoreboard | null>(null);
  const [latestMemo, setLatestMemo] = useState<AppWeeklyMemo | null>(null);
  const [captureForm, setCaptureForm] = useState({
    source: "manual",
    platform: "web",
    app_name: "",
    category: "",
    search_term: "",
    url: "",
    raw_notes: "",
    screenshot_urls: "",
    created_by: "",
  });
  const [selectedInboxItem, setSelectedInboxItem] = useState<AppInboxItem | null>(null);
  const [extractForm, setExtractForm] = useState<ExtractFormState>(initialExtractForm());
  const [selectedRecord, setSelectedRecord] = useState<AppRecord | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<AppPattern | null>(null);
  const [patternDialogOpen, setPatternDialogOpen] = useState(false);
  const [patternForm, setPatternForm] = useState<PatternFormState>(initialPatternForm());
  const [patternCreateResponse, setPatternCreateResponse] = useState<AppPatternCreateResponse | null>(null);
  const [suggestedEvidenceIds, setSuggestedEvidenceIds] = useState<string[]>([]);
  const [converter, setConverter] = useState<ConverterState>(initialConverterState("outreach_angle"));

  const loadAll = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    try {
      const [nextInbox, nextRecords, nextPatterns, nextOpportunities, nextScoreboard] = await Promise.all([
        fetchAppInbox(params.envId, businessId),
        fetchAppRecords(params.envId, businessId),
        fetchAppPatterns(params.envId, businessId),
        fetchAppOpportunities(params.envId, businessId),
        fetchAppScoreboard(params.envId, businessId),
      ]);
      setInbox(nextInbox);
      setRecords(nextRecords);
      setPatterns(nextPatterns);
      setOpportunities(nextOpportunities.rows);
      setScoreboard(nextScoreboard);
      try {
        const memo = await fetchLatestAppWeeklyMemo(params.envId, businessId);
        setLatestMemo(memo);
      } catch {
        setLatestMemo(null);
      }
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, params.envId]);

  useEffect(() => {
    if (!ready) return;
    void loadAll();
  }, [loadAll, ready]);

  const bannerMessage = contextError || dataError;
  const isLoading = contextLoading || (ready && loading);
  const primeRecords = useMemo(
    () => records.filter((record) => record.is_prime && record.linked_opportunity_count === 0),
    [records],
  );
  const unscoredCount = useMemo(
    () => records.filter((record) => record.relevance_score === 50 || record.weakness_score === 50).length,
    [records],
  );
  const unconvertedPatterns = useMemo(
    () => patterns.filter((pattern) => pattern.status !== "archived" && pattern.linked_opportunity_count === 0),
    [patterns],
  );
  const groupedOpportunities = useMemo(() => {
    return {
      outreach_angle: opportunities.filter((item) => item.kind === "outreach_angle"),
      demo_brief: opportunities.filter((item) => item.kind === "demo_brief"),
      consulting_offer: opportunities.filter((item) => item.kind === "consulting_offer"),
      winston_backlog: opportunities.filter((item) => item.kind === "winston_backlog"),
    };
  }, [opportunities]);

  const updateCaptureField = (key: string, value: string) => {
    setCaptureForm((current) => ({ ...current, [key]: value }));
  };

  const handleCapture = useCallback(async () => {
    if (!businessId) return;
    setBusy("capture");
    setDataError(null);
    try {
      await createAppInboxItem(params.envId, businessId, {
        ...captureForm,
        screenshot_urls: splitLines(captureForm.screenshot_urls),
      });
      setCaptureForm({
        source: "manual",
        platform: "web",
        app_name: "",
        category: "",
        search_term: "",
        url: "",
        raw_notes: "",
        screenshot_urls: "",
        created_by: "",
      });
      await loadAll();
      setTab("inbox");
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, captureForm, loadAll, params.envId]);

  const handleDiscard = useCallback(async (item: AppInboxItem) => {
    if (!businessId) return;
    const reason = window.prompt(`Why discard ${item.app_name}?`);
    if (!reason) return;
    setBusy(`discard-${item.id}`);
    setDataError(null);
    try {
      await discardAppInboxItem(params.envId, businessId, item.id, reason);
      await loadAll();
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, loadAll, params.envId]);

  const openExtractDialog = (item: AppInboxItem) => {
    setSelectedInboxItem(item);
    setExtractForm(initialExtractForm(item));
  };

  const handleExtract = useCallback(async () => {
    if (!businessId || !selectedInboxItem) return;
    setBusy(`extract-${selectedInboxItem.id}`);
    setDataError(null);
    try {
      await extractAppRecord(params.envId, businessId, selectedInboxItem.id, {
        target_user: extractForm.target_user || undefined,
        core_workflow_input: extractForm.core_workflow_input,
        core_workflow_process: extractForm.core_workflow_process,
        core_workflow_output: extractForm.core_workflow_output,
        pain_signals: splitLines(extractForm.pain_signals),
        relevance_score: Number(extractForm.relevance_score || 50),
        weakness_score: Number(extractForm.weakness_score || 50),
        notes: extractForm.notes || undefined,
      });
      setSelectedInboxItem(null);
      await loadAll();
      setTab("apps");
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, extractForm, loadAll, params.envId, selectedInboxItem]);

  const handleRecordSave = useCallback(async () => {
    if (!businessId || !selectedRecord) return;
    setBusy(`record-${selectedRecord.id}`);
    setDataError(null);
    try {
      await updateAppRecord(params.envId, businessId, selectedRecord.id, {
        target_user: selectedRecord.target_user || undefined,
        core_workflow_input: selectedRecord.core_workflow_input,
        core_workflow_process: selectedRecord.core_workflow_process,
        core_workflow_output: selectedRecord.core_workflow_output,
        pain_signals: selectedRecord.pain_signals,
        relevance_score: selectedRecord.relevance_score,
        weakness_score: selectedRecord.weakness_score,
        notes: selectedRecord.notes || undefined,
      });
      await loadAll();
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, loadAll, params.envId, selectedRecord]);

  const openPatternDialog = (record?: AppRecord | null) => {
    setPatternForm(initialPatternForm(record));
    setPatternCreateResponse(null);
    setSuggestedEvidenceIds([]);
    setPatternDialogOpen(true);
  };

  const handleCreatePattern = useCallback(async () => {
    if (!businessId) return;
    setBusy("pattern-create");
    setDataError(null);
    try {
      const response = await createAppPattern(params.envId, businessId, {
        pattern_name: patternForm.pattern_name,
        workflow_shape: patternForm.workflow_shape || undefined,
        industries_seen_in: splitLines(patternForm.industries_seen_in),
        recurring_pain: patternForm.recurring_pain || undefined,
        bad_implementation_pattern: patternForm.bad_implementation_pattern || undefined,
        winston_module_opportunity: patternForm.winston_module_opportunity || undefined,
        consulting_offer_opportunity: patternForm.consulting_offer_opportunity || undefined,
        demo_idea: patternForm.demo_idea || undefined,
        priority: patternForm.priority,
        confidence: Number(patternForm.confidence || 0.5),
        status: patternForm.status,
        notes: patternForm.notes || undefined,
      });
      setPatternCreateResponse(response);
      setSuggestedEvidenceIds(response.suggested_evidence.map((item) => item.app_record_id));
      await loadAll();
      setTab("patterns");
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, loadAll, params.envId, patternForm]);

  const handleConfirmSuggestedEvidence = useCallback(async () => {
    if (!businessId || !patternCreateResponse) return;
    setBusy("pattern-evidence");
    setDataError(null);
    try {
      for (const appRecordId of suggestedEvidenceIds) {
        await linkAppPatternEvidence(params.envId, businessId, patternCreateResponse.pattern.id, {
          app_record_id: appRecordId,
          auto_suggested: true,
        });
      }
      setPatternDialogOpen(false);
      setPatternCreateResponse(null);
      setSuggestedEvidenceIds([]);
      await loadAll();
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, loadAll, params.envId, patternCreateResponse, suggestedEvidenceIds]);

  const openConverterForRecord = (kind: AppOpportunityKind, record: AppRecord) => {
    setConverter({
      open: true,
      kind,
      title: `${record.app_name} ${KIND_LABELS[kind]}`,
      payload: {},
      mustEditFields: [],
      sourceAppRecordId: record.id,
      status: "draft",
    });
  };

  const openConverterForPattern = (kind: AppOpportunityKind, pattern: AppPattern) => {
    setConverter({
      open: true,
      kind,
      title: `${pattern.pattern_name} ${KIND_LABELS[kind]}`,
      payload: {},
      mustEditFields: [],
      sourcePatternId: pattern.id,
      status: "draft",
    });
  };

  const openOpportunityEditor = (opportunity: AppOpportunity) => {
    setConverter({
      open: true,
      kind: opportunity.kind,
      title: opportunity.title,
      payload: { ...opportunity.payload },
      mustEditFields: [],
      opportunityId: opportunity.id,
      sourcePatternId: opportunity.pattern_id || undefined,
      sourceAppRecordId: opportunity.app_record_id || undefined,
      status: opportunity.status,
    });
  };

  const handleAutoFill = useCallback(async () => {
    if (!businessId) return;
    setBusy("autofill");
    setDataError(null);
    try {
      const draft: AppOpportunityDraft = await draftAppOpportunity(params.envId, businessId, {
        kind: converter.kind,
        source_pattern_id: converter.sourcePatternId,
        source_app_record_id: converter.sourceAppRecordId,
      });
      setConverter((current) => ({
        ...current,
        title: draft.title,
        payload: draft.payload,
        mustEditFields: draft.must_edit_fields,
      }));
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, converter.kind, converter.sourceAppRecordId, converter.sourcePatternId, params.envId]);

  const updateConverterField = (field: string, rawValue: string) => {
    setConverter((current) => ({
      ...current,
      payload: {
        ...current.payload,
        [field]: field === "ui_flow" || field === "winston_modules_touched" ? splitLines(rawValue) : rawValue,
      },
    }));
  };

  const saveConverter = useCallback(async (status: AppOpportunityStatus) => {
    if (!businessId) return;
    setBusy(`converter-${status}`);
    setDataError(null);
    try {
      if (converter.opportunityId) {
        await updateAppOpportunity(params.envId, businessId, converter.opportunityId, {
          title: converter.title,
          payload: converter.payload,
          status,
        });
      } else if (converter.sourcePatternId) {
        await convertAppPattern(params.envId, businessId, converter.sourcePatternId, {
          kind: converter.kind,
          title: converter.title,
          payload: converter.payload,
          status,
        });
      } else if (converter.sourceAppRecordId) {
        await convertAppRecord(params.envId, businessId, converter.sourceAppRecordId, {
          kind: converter.kind,
          title: converter.title,
          payload: converter.payload,
          status,
        });
      }
      setConverter(initialConverterState(converter.kind));
      await loadAll();
      setTab("opportunities");
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, converter, loadAll, params.envId]);

  const handleOpportunityStatus = useCallback(async (opportunity: AppOpportunity, status: AppOpportunityStatus) => {
    if (!businessId) return;
    setBusy(`opportunity-${opportunity.id}-${status}`);
    setDataError(null);
    try {
      await updateAppOpportunity(params.envId, businessId, opportunity.id, { status });
      await loadAll();
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, loadAll, params.envId]);

  const handleGenerateMemo = useCallback(async () => {
    if (!businessId) return;
    setBusy("memo-generate");
    setDataError(null);
    try {
      const memo = await generateAppWeeklyMemo(params.envId, businessId, { generated_by: "pm@novendor.co" });
      setLatestMemo(memo);
      await loadAll();
      setTab("memo");
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusy(null);
    }
  }, [businessId, loadAll, params.envId]);

  const memoPayload = latestMemo?.memo_payload as {
    top_3_patterns_to_act_on?: Array<{ pattern_id: string; pattern_name: string; why_now: string; recommended_kind: string }>;
    outreach_angles_to_send?: Array<{ opportunity_id: string; target_persona: string; pain_statement: string; hook: string }>;
    demo_to_build_this_week?: { opportunity_id: string; title: string; narrative: string; build_steps: string[] };
    unconverted_patterns_count?: number;
    prime_opportunities_unsent_count?: number;
  } | undefined;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-28 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {bannerMessage ? (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Research · {TAB_LABELS[tab]}</CardTitle>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">
            App Intelligence is opportunity mining for Novendor. Every capture needs to collapse into a backlog item,
            consulting offer, outreach angle, or demo brief.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => openPatternDialog()}>
            Create Pattern
          </Button>
          <Button size="sm" onClick={() => void handleGenerateMemo()} disabled={!businessId || busy !== null}>
            {busy === "memo-generate" ? "Generating..." : "Generate Memo"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`font-semibold ${scoreboard && scoreboard.unconverted_patterns > 0 ? "text-amber-300" : "text-bm-muted2"}`}>
              {scoreboard?.unconverted_patterns ?? 0} unconverted patterns
            </span>
            <span className="text-bm-muted2">·</span>
            <span className={`font-semibold ${scoreboard && scoreboard.prime_unsent > 0 ? "text-amber-300" : "text-bm-muted2"}`}>
              {scoreboard?.prime_unsent ?? 0} prime unsent
            </span>
            <span className="text-bm-muted2">·</span>
            <span className="font-semibold text-emerald-300">
              {scoreboard?.sent_this_week ?? 0} sent this week
            </span>
          </div>
          <p className="text-xs text-bm-muted2">
            Time-to-action: {scoreboard?.avg_hours_inbox_to_opportunity ?? "—"}h inbox → opportunity · {scoreboard?.avg_hours_opportunity_to_sent ?? "—"}h opportunity → sent
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Prime Opportunities</h2>
              <p className="mt-1 text-sm text-bm-muted2">What should I do today? These are high-relevance, weak-market workflows without an opportunity attached yet.</p>
            </div>
            <Badge variant={primeRecords.length > 0 ? "warning" : "outline"}>{primeRecords.length} open</Badge>
          </div>
          {primeRecords.length === 0 ? (
            <p className="text-sm text-bm-muted2">No prime opportunities right now. Score a few more app records or convert the existing ones.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {primeRecords.map((record) => (
                <div key={record.id} className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-bm-text">{record.app_name}</p>
                      <p className="mt-1 text-xs text-bm-muted2">{record.workflow_shape}</p>
                    </div>
                    <Badge variant="accent">Prime</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {record.pain_signals.slice(0, 2).map((signal) => (
                      <span key={signal} className="rounded-full border border-bm-border/60 px-2 py-1 text-[11px] text-bm-muted2">
                        {signal}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => openConverterForRecord("outreach_angle", record)}>Create Outreach</Button>
                    <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("demo_brief", record)}>Create Demo</Button>
                    <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("consulting_offer", record)}>Create Offer</Button>
                    <Button size="sm" variant="ghost" onClick={() => openPatternDialog(record)}>Create Pattern</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex snap-x gap-2 overflow-x-auto pb-1">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "primary" : "secondary"}
            className="snap-start whitespace-nowrap"
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
          </Button>
        ))}
      </div>

      {tab === "inbox" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 py-4">
              <div>
                <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Quick Capture</h2>
                <p className="mt-1 text-sm text-bm-muted2">Paste URLs and image URLs for now. The inbox exists to move fast, not to catalog the app forever.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Select value={captureForm.source} onChange={(e) => updateCaptureField("source", e.target.value)}>
                  <option value="manual">Manual</option>
                  <option value="app_store">App Store</option>
                  <option value="g2">G2</option>
                  <option value="capterra">Capterra</option>
                  <option value="website">Website</option>
                </Select>
                <Select value={captureForm.platform} onChange={(e) => updateCaptureField("platform", e.target.value)}>
                  <option value="web">Web</option>
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                </Select>
                <Input value={captureForm.app_name} onChange={(e) => updateCaptureField("app_name", e.target.value)} placeholder="App name" />
                <Input value={captureForm.category} onChange={(e) => updateCaptureField("category", e.target.value)} placeholder="Category" />
                <Input value={captureForm.url} onChange={(e) => updateCaptureField("url", e.target.value)} placeholder="https://..." />
                <Input value={captureForm.search_term} onChange={(e) => updateCaptureField("search_term", e.target.value)} placeholder="Search term" />
                <Input value={captureForm.screenshot_urls} onChange={(e) => updateCaptureField("screenshot_urls", e.target.value)} placeholder="Screenshot URLs, comma separated" className="md:col-span-2" />
                <Input value={captureForm.created_by} onChange={(e) => updateCaptureField("created_by", e.target.value)} placeholder="Created by" className="md:col-span-2" />
                <Textarea value={captureForm.raw_notes} onChange={(e) => updateCaptureField("raw_notes", e.target.value)} placeholder="Raw notes" className="md:col-span-2 min-h-[110px]" />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => void handleCapture()} disabled={!captureForm.app_name || busy !== null}>
                  {busy === "capture" ? "Saving..." : "Add To Inbox"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {inbox.length === 0 ? (
            <EmptyState title="No inbox items yet" body="Capture a few apps from G2, Capterra, or the App Store to start the mining loop." />
          ) : (
            <div className="space-y-3">
              {inbox.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-bm-text">{item.app_name}</p>
                        <Badge variant={item.status === "discarded" ? "danger" : item.status === "extracted" ? "success" : "outline"}>{item.status}</Badge>
                      </div>
                      <p className="text-xs text-bm-muted2">{item.category || "Uncategorized"} · {item.search_term || "No search term"}</p>
                      {item.raw_notes ? <p className="text-sm text-bm-muted2 line-clamp-2">{item.raw_notes}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-bm-border/70 px-3 text-sm text-bm-text hover:bg-bm-surface/20">
                          Open URL
                        </a>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => openExtractDialog(item)} disabled={item.status !== "raw" || busy !== null}>
                        Extract
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleDiscard(item)} disabled={busy !== null || item.status === "discarded"}>
                        Discard
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "apps" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <p className="text-sm text-bm-muted2">{unscoredCount} records still have default scores. If the prime feed is thin, score a few more before cataloging anything else.</p>
              <Badge variant={unscoredCount > 0 ? "warning" : "outline"}>{unscoredCount} unset</Badge>
            </CardContent>
          </Card>
          {records.length === 0 ? (
            <EmptyState title="No app records yet" body="Extract an inbox item into a workflow record to start spotting reusable patterns." />
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <Card key={record.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-bm-text">{record.app_name}</p>
                          {record.is_prime ? <Badge variant="warning">Prime</Badge> : null}
                        </div>
                        <p className="text-xs text-bm-muted2">{record.target_user || "Target user not set"}</p>
                        <p className="text-sm text-bm-muted2">{record.workflow_shape}</p>
                        <p className="text-xs text-bm-muted2">Top pain: {record.top_pain_signal || "—"}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 lg:min-w-[220px]">
                        <div>
                          <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Relevance {record.relevance_score}</p>
                          <ScoreBar value={record.relevance_score} />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Weakness {record.weakness_score}</p>
                          <ScoreBar value={record.weakness_score} />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setSelectedRecord(record)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => openPatternDialog(record)}>Create Pattern</Button>
                      <Button size="sm" onClick={() => openConverterForRecord("outreach_angle", record)}>Create Outreach</Button>
                      <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("consulting_offer", record)}>Create Offer</Button>
                      <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("winston_backlog", record)}>Create Backlog</Button>
                      <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("demo_brief", record)}>Create Demo</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "patterns" ? (
        <div className="space-y-4">
          {unconvertedPatterns.length > 0 ? (
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-amber-300">{unconvertedPatterns.length} patterns still have no opportunity attached. That’s useful pressure, not a backlog trophy.</p>
              </CardContent>
            </Card>
          ) : null}
          {patterns.length === 0 ? (
            <EmptyState title="No patterns yet" body="Create a pattern when you’ve seen the same workflow breakdown twice, not when you just have a pile of notes." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {patterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className={`rounded-lg border p-4 ${pattern.linked_opportunity_count === 0 ? "border-amber-400/60" : "border-bm-border/60"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-bm-text">{pattern.pattern_name}</p>
                      <p className="mt-1 text-xs text-bm-muted2">{pattern.workflow_shape || "Workflow shape not set"}</p>
                    </div>
                    <Badge variant={pattern.priority === "high" ? "warning" : pattern.priority === "med" ? "outline" : "default"}>{pattern.priority}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(pattern.industries_seen_in || []).slice(0, 2).map((industry) => (
                      <span key={industry} className="rounded-full border border-bm-border/60 px-2 py-1 text-[11px] text-bm-muted2">{industry}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-bm-muted2">Evidence {pattern.evidence_count} · Confidence {pattern.confidence}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedPattern(pattern)}>Details</Button>
                    <Button size="sm" onClick={() => openConverterForPattern("outreach_angle", pattern)}>Create Outreach</Button>
                    <Button size="sm" variant="secondary" onClick={() => openConverterForPattern("consulting_offer", pattern)}>Create Offer</Button>
                    <Button size="sm" variant="secondary" onClick={() => openConverterForPattern("winston_backlog", pattern)}>Create Backlog</Button>
                    <Button size="sm" variant="secondary" onClick={() => openConverterForPattern("demo_brief", pattern)}>Create Demo</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "opportunities" ? (
        <div className="space-y-4">
          {(Object.keys(groupedOpportunities) as AppOpportunityKind[]).map((kind) => {
            const rows = groupedOpportunities[kind];
            return (
              <Card key={kind}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-bm-text">{kindForSection(kind)}</h2>
                      <p className="text-xs text-bm-muted2">{rows.filter((item) => item.status === "sent").length} sent</p>
                    </div>
                    <Badge variant="outline">{rows.length}</Badge>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-sm text-bm-muted2">No {kindForSection(kind).toLowerCase()}s yet.</p>
                  ) : (
                    rows.map((item) => (
                      <div key={item.id} className="rounded-lg border border-bm-border/60 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-bm-text">{item.title}</p>
                            <p className="mt-1 text-xs text-bm-muted2">{item.source_label || "Source missing"} · {item.exported_to || "Not exported"}</p>
                            <p className="mt-1 text-xs text-bm-muted2">Next action: {extractTextValue(item.payload.next_action)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={item.status === "sent" ? "success" : item.status === "ready" ? "accent" : "outline"}>{item.status}</Badge>
                            <Button size="sm" variant="secondary" onClick={() => openOpportunityEditor(item)}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => void handleOpportunityStatus(item, "ready")}>Mark Ready</Button>
                            <Button size="sm" variant="ghost" onClick={() => void handleOpportunityStatus(item, "sent")}>Mark Sent</Button>
                            <Button size="sm" variant="ghost" onClick={() => void handleOpportunityStatus(item, "discarded")}>Discard</Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === "memo" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-bm-text">Weekly Memo</h2>
                <p className="mt-1 text-sm text-bm-muted2">The memo refuses to summarize emptiness. If it fails, the system tells you what material is missing.</p>
              </div>
              <Button onClick={() => void handleGenerateMemo()} disabled={!businessId || busy !== null}>
                {busy === "memo-generate" ? "Generating..." : "Generate This Week's Memo"}
              </Button>
            </CardContent>
          </Card>

          {!latestMemo ? (
            <EmptyState title="No weekly memo yet" body="Generate a memo after you have enough patterns, outreach angles, and a demo candidate." />
          ) : (
            <Card>
              <CardContent className="space-y-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-bm-text">Week of {latestMemo.period_start}</p>
                  <p className="mt-1 text-xs text-bm-muted2">Generated {new Date(latestMemo.generated_at).toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Top 3 Patterns To Act On</h3>
                  <div className="mt-2 space-y-2">
                    {(memoPayload?.top_3_patterns_to_act_on || []).map((item) => (
                      <div key={item.pattern_id} className="rounded-lg border border-bm-border/60 p-3">
                        <p className="text-sm font-semibold text-bm-text">{item.pattern_name}</p>
                        <p className="mt-1 text-sm text-bm-muted2">{item.why_now}</p>
                        <p className="mt-1 text-xs text-bm-muted2">Recommended kind: {item.recommended_kind}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Outreach Angles To Send</h3>
                  <div className="mt-2 space-y-2">
                    {(memoPayload?.outreach_angles_to_send || []).map((item) => (
                      <div key={item.opportunity_id} className="rounded-lg border border-bm-border/60 p-3">
                        <p className="text-sm font-semibold text-bm-text">{item.target_persona}</p>
                        <p className="mt-1 text-sm text-bm-muted2">{item.hook}</p>
                        <p className="mt-1 text-xs text-bm-muted2">{item.pain_statement}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {memoPayload?.demo_to_build_this_week ? (
                  <div>
                    <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Demo To Build This Week</h3>
                    <div className="mt-2 rounded-lg border border-bm-border/60 p-3">
                      <p className="text-sm font-semibold text-bm-text">{memoPayload.demo_to_build_this_week.title}</p>
                      <p className="mt-1 text-sm text-bm-muted2">{memoPayload.demo_to_build_this_week.narrative}</p>
                      <ul className="mt-2 space-y-1 text-xs text-bm-muted2">
                        {(memoPayload.demo_to_build_this_week.build_steps || []).map((step) => (
                          <li key={step}>• {step}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <Dialog
        open={Boolean(selectedInboxItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedInboxItem(null);
        }}
        title={selectedInboxItem ? `Extract ${selectedInboxItem.app_name}` : "Extract App Record"}
        description="Only core workflow and pain signals are required. Everything else exists to accelerate conversion, not to describe the app."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedInboxItem(null)}>Cancel</Button>
            <Button onClick={() => void handleExtract()} disabled={busy !== null}>
              {busy?.startsWith("extract-") ? "Extracting..." : "Save App Record"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input value={extractForm.target_user} onChange={(e) => setExtractForm((current) => ({ ...current, target_user: e.target.value }))} placeholder="Target user" />
          <Input value={extractForm.core_workflow_input} onChange={(e) => setExtractForm((current) => ({ ...current, core_workflow_input: e.target.value }))} placeholder="Required: what the user brings in" className="border-amber-400/50" />
          <Input value={extractForm.core_workflow_process} onChange={(e) => setExtractForm((current) => ({ ...current, core_workflow_process: e.target.value }))} placeholder="Required: what the app does" className="border-amber-400/50" />
          <Input value={extractForm.core_workflow_output} onChange={(e) => setExtractForm((current) => ({ ...current, core_workflow_output: e.target.value }))} placeholder="Required: what the user gets out" className="border-amber-400/50" />
          <Textarea value={extractForm.pain_signals} onChange={(e) => setExtractForm((current) => ({ ...current, pain_signals: e.target.value }))} placeholder="Required: pain signals, one per line" className="min-h-[110px] border-amber-400/50" />
          <div className="grid gap-3 md:grid-cols-2">
            <Input type="number" min="0" max="100" value={extractForm.relevance_score} onChange={(e) => setExtractForm((current) => ({ ...current, relevance_score: e.target.value }))} placeholder="Relevance score" />
            <Input type="number" min="0" max="100" value={extractForm.weakness_score} onChange={(e) => setExtractForm((current) => ({ ...current, weakness_score: e.target.value }))} placeholder="Weakness score" />
          </div>
          <Textarea value={extractForm.notes} onChange={(e) => setExtractForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes" className="min-h-[90px]" />
        </div>
      </Dialog>

      <Dialog
        open={patternDialogOpen}
        onOpenChange={(open) => {
          setPatternDialogOpen(open);
          if (!open) {
            setPatternCreateResponse(null);
            setSuggestedEvidenceIds([]);
          }
        }}
        title="Create Pattern"
        description="Specific input → specific process → specific breakdown point. Avoid generic abstractions like 'workflow automation'."
        className="max-w-3xl"
        footer={
          patternCreateResponse ? (
            <>
              <Button variant="secondary" onClick={() => setPatternDialogOpen(false)}>Close</Button>
              <Button onClick={() => void handleConfirmSuggestedEvidence()} disabled={busy !== null}>
                {busy === "pattern-evidence" ? "Linking..." : "Confirm Suggested Evidence"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setPatternDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleCreatePattern()} disabled={!patternForm.pattern_name || busy !== null}>
                {busy === "pattern-create" ? "Saving..." : "Save Pattern"}
              </Button>
            </>
          )
        }
      >
        {!patternCreateResponse ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Input value={patternForm.pattern_name} onChange={(e) => setPatternForm((current) => ({ ...current, pattern_name: e.target.value }))} placeholder="Pattern name" className="md:col-span-2" />
            <Input value={patternForm.workflow_shape} onChange={(e) => setPatternForm((current) => ({ ...current, workflow_shape: e.target.value }))} placeholder="Specific input -> specific process -> specific breakdown point" className="md:col-span-2" />
            <Input value={patternForm.industries_seen_in} onChange={(e) => setPatternForm((current) => ({ ...current, industries_seen_in: e.target.value }))} placeholder="Industries, comma separated" />
            <Input value={patternForm.recurring_pain} onChange={(e) => setPatternForm((current) => ({ ...current, recurring_pain: e.target.value }))} placeholder="Recurring pain" />
            <Input value={patternForm.bad_implementation_pattern} onChange={(e) => setPatternForm((current) => ({ ...current, bad_implementation_pattern: e.target.value }))} placeholder="Bad implementation pattern" className="md:col-span-2" />
            <Input value={patternForm.winston_module_opportunity} onChange={(e) => setPatternForm((current) => ({ ...current, winston_module_opportunity: e.target.value }))} placeholder="Winston module opportunity" />
            <Input value={patternForm.consulting_offer_opportunity} onChange={(e) => setPatternForm((current) => ({ ...current, consulting_offer_opportunity: e.target.value }))} placeholder="Consulting offer opportunity" />
            <Input value={patternForm.demo_idea} onChange={(e) => setPatternForm((current) => ({ ...current, demo_idea: e.target.value }))} placeholder="Demo idea" className="md:col-span-2" />
            <Select value={patternForm.priority} onChange={(e) => setPatternForm((current) => ({ ...current, priority: e.target.value as PatternFormState["priority"] }))}>
              <option value="low">Low</option>
              <option value="med">Medium</option>
              <option value="high">High</option>
            </Select>
            <Input value={patternForm.confidence} onChange={(e) => setPatternForm((current) => ({ ...current, confidence: e.target.value }))} placeholder="Confidence 0-1" />
            <Select value={patternForm.status} onChange={(e) => setPatternForm((current) => ({ ...current, status: e.target.value as PatternFormState["status"] }))}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
            <Textarea value={patternForm.notes} onChange={(e) => setPatternForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes" className="min-h-[100px] md:col-span-2" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-3">
              <p className="text-sm font-semibold text-bm-text">{patternCreateResponse.pattern.pattern_name}</p>
              <p className="mt-1 text-sm text-bm-muted2">System suggests these apps also match the pattern. Accept the ones that make the pattern more reusable, not just broader.</p>
            </div>
            {(patternCreateResponse.suggested_evidence || []).length === 0 ? (
              <p className="text-sm text-bm-muted2">No strong cross-app suggestions yet.</p>
            ) : (
              <div className="space-y-2">
                {patternCreateResponse.suggested_evidence.map((item: SuggestedEvidence) => (
                  <label key={item.app_record_id} className="flex items-start gap-3 rounded-lg border border-bm-border/60 p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={suggestedEvidenceIds.includes(item.app_record_id)}
                      onChange={(e) => {
                        setSuggestedEvidenceIds((current) =>
                          e.target.checked
                            ? [...current, item.app_record_id]
                            : current.filter((value) => value !== item.app_record_id),
                        );
                      }}
                    />
                    <div>
                      <p className="text-sm font-semibold text-bm-text">{item.app_name}</p>
                      <p className="mt-1 text-xs text-bm-muted2">{item.workflow_shape}</p>
                      <p className="mt-1 text-xs text-bm-muted2">Pain: {item.pain_signals.join(", ")}</p>
                      <p className="mt-1 text-xs text-bm-muted2">Score {item.score.toFixed(2)}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={converter.open}
        onOpenChange={(open) => setConverter((current) => ({ ...current, open }))}
        title={`${KIND_LABELS[converter.kind]} Converter`}
        description="Auto-fill first, then edit the highlighted fields before saving anything as ready or sent."
        className="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConverter(initialConverterState(converter.kind))}>Cancel</Button>
            {!converter.opportunityId ? (
              <Button variant="secondary" onClick={() => void handleAutoFill()} disabled={busy !== null}>
                {busy === "autofill" ? "Filling..." : "Auto-fill draft"}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void saveConverter("draft")} disabled={busy !== null}>Save Draft</Button>
            <Button onClick={() => void saveConverter("ready")} disabled={busy !== null}>Save Ready</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input value={converter.title} onChange={(e) => setConverter((current) => ({ ...current, title: e.target.value }))} placeholder="Opportunity title" />
          <div className="grid gap-3 md:grid-cols-2">
            {KIND_FIELDS[converter.kind].map((field) => {
              const textareaField = field === "pain_statement" || field === "narrative" || field === "scope" || field === "out_of_scope" || field === "revenue_linkage" || field === "ui_flow" || field === "winston_modules_touched";
              const value = extractTextValue(converter.payload[field]);
              const highlight = converter.mustEditFields.includes(field);
              const className = highlight ? "border-amber-400/60" : "";
              return (
                <div key={field} className={field === "pain_statement" || field === "ui_flow" || field === "scope" || field === "revenue_linkage" ? "md:col-span-2" : ""}>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{FIELD_LABELS[field] || field}</p>
                  {textareaField ? (
                    <Textarea value={value} onChange={(e) => updateConverterField(field, e.target.value)} className={`min-h-[110px] ${className}`} />
                  ) : (
                    <Input value={value} onChange={(e) => updateConverterField(field, e.target.value)} className={className} />
                  )}
                  {highlight ? <p className="mt-1 text-xs text-amber-300">Edit before sending.</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>

      <SlideOver
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord?.app_name || "App Record"}
        subtitle={selectedRecord?.workflow_shape || ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedRecord(null)}>Close</Button>
            <Button onClick={() => void handleRecordSave()} disabled={busy !== null}>Save Record</Button>
          </>
        }
      >
        {selectedRecord ? (
          <div className="space-y-3">
            <Input value={selectedRecord.target_user || ""} onChange={(e) => setSelectedRecord((current) => current ? { ...current, target_user: e.target.value } : current)} placeholder="Target user" />
            <Input value={selectedRecord.core_workflow_input} onChange={(e) => setSelectedRecord((current) => current ? { ...current, core_workflow_input: e.target.value } : current)} placeholder="Workflow input" />
            <Input value={selectedRecord.core_workflow_process} onChange={(e) => setSelectedRecord((current) => current ? { ...current, core_workflow_process: e.target.value } : current)} placeholder="Workflow process" />
            <Input value={selectedRecord.core_workflow_output} onChange={(e) => setSelectedRecord((current) => current ? { ...current, core_workflow_output: e.target.value } : current)} placeholder="Workflow output" />
            <Textarea value={selectedRecord.pain_signals.join("\n")} onChange={(e) => setSelectedRecord((current) => current ? { ...current, pain_signals: splitLines(e.target.value) } : current)} placeholder="Pain signals" className="min-h-[110px]" />
            <div className="grid gap-3 md:grid-cols-2">
              <Input type="number" min="0" max="100" value={selectedRecord.relevance_score} onChange={(e) => setSelectedRecord((current) => current ? { ...current, relevance_score: Number(e.target.value || 0) } : current)} placeholder="Relevance" />
              <Input type="number" min="0" max="100" value={selectedRecord.weakness_score} onChange={(e) => setSelectedRecord((current) => current ? { ...current, weakness_score: Number(e.target.value || 0) } : current)} placeholder="Weakness" />
            </div>
            <Textarea value={selectedRecord.notes || ""} onChange={(e) => setSelectedRecord((current) => current ? { ...current, notes: e.target.value } : current)} placeholder="Notes" className="min-h-[100px]" />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="secondary" onClick={() => openPatternDialog(selectedRecord)}>Create Pattern</Button>
              <Button size="sm" onClick={() => openConverterForRecord("outreach_angle", selectedRecord)}>Create Outreach</Button>
              <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("consulting_offer", selectedRecord)}>Create Offer</Button>
              <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("winston_backlog", selectedRecord)}>Create Backlog</Button>
              <Button size="sm" variant="secondary" onClick={() => openConverterForRecord("demo_brief", selectedRecord)}>Create Demo</Button>
            </div>
          </div>
        ) : null}
      </SlideOver>

      <SlideOver
        open={Boolean(selectedPattern)}
        onClose={() => setSelectedPattern(null)}
        title={selectedPattern?.pattern_name || "Pattern"}
        subtitle={selectedPattern?.workflow_shape || ""}
      >
        {selectedPattern ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Recurring pain</p>
              <p className="mt-1 text-sm text-bm-text">{selectedPattern.recurring_pain || "—"}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Evidence</p>
              <div className="mt-3 space-y-2">
                {selectedPattern.evidence.length === 0 ? (
                  <p className="text-sm text-bm-muted2">No evidence linked yet.</p>
                ) : (
                  selectedPattern.evidence.map((item) => (
                    <div key={item.app_record_id} className="rounded-lg border border-bm-border/50 bg-bm-surface/15 p-3">
                      <p className="text-sm font-semibold text-bm-text">{item.app_name}</p>
                      <p className="mt-1 text-xs text-bm-muted2">{item.workflow_shape}</p>
                      <p className="mt-1 text-xs text-bm-muted2">Pain: {item.pain_signals.join(", ")}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openConverterForPattern("outreach_angle", selectedPattern)}>Create Outreach</Button>
              <Button size="sm" variant="secondary" onClick={() => openConverterForPattern("consulting_offer", selectedPattern)}>Create Offer</Button>
              <Button size="sm" variant="secondary" onClick={() => openConverterForPattern("winston_backlog", selectedPattern)}>Create Backlog</Button>
              <Button size="sm" variant="secondary" onClick={() => openConverterForPattern("demo_brief", selectedPattern)}>Create Demo</Button>
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}

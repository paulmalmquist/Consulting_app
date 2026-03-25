import React, { useEffect, useMemo, useState } from "react";
import { bmApiClient, getBaseApiUrl, setBaseApiUrl } from "../shared/apiClient";
import { clearCache } from "../shared/cache";
import { completeSession, getCurrentProfile, logout } from "../shared/auth";
import {
  bindEnvironment,
  ensureWorkbookId,
  getWorkbookSettings,
  markSyncTime,
  setWriteModeEnabled,
  updateWorkbookSettings,
} from "../shared/workbookSettings";
import { BMUserProfile, JsonObject, SchemaEntityDetail, SchemaEntitySummary, WorkbookSettings } from "../shared/types";
import { flushQueuedWrites, getQueuedWrites } from "../shared/writeQueue";
import { getSelectedTableInfo, writeMatrixToSheet, writeSyncStatusColumn } from "../shared/excelTable";

const INDUSTRY_OPTIONS = [
  { label: "Real Estate Private Equity", value: "real_estate_private_equity" },
  { label: "Construction / Project Management", value: "construction_project_management" },
  { label: "Media Planning & Buying", value: "media_planning_buying" },
  { label: "Professional Services (Consulting Firms)", value: "professional_services_consulting_firms" },
  { label: "Healthcare Operator", value: "healthcare_operator" },
  { label: "Manufacturing / Industrial", value: "manufacturing_industrial" },
  { label: "SaaS / Technology Company", value: "saas_technology_company" },
  { label: "Family Office", value: "family_office" },
  { label: "Hospitality / Senior Housing Operator", value: "hospitality_senior_housing_operator" },
  { label: "Custom", value: "custom" },
];

type EnvironmentRecord = {
  env_id: string;
  client_name: string;
  industry_type: string;
  industry: string;
};

type AuditItem = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: JsonObject;
};

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function App() {
  const [settings, setSettings] = useState<WorkbookSettings | null>(null);
  const [apiBaseUrl, setApiBaseUrlInput] = useState("http://localhost:8000");
  const [apiKey, setApiKey] = useState("");
  const [profile, setProfile] = useState<BMUserProfile | null>(null);
  const [health, setHealth] = useState("unknown");
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState("");
  const [selectedEnvStage, setSelectedEnvStage] = useState("");
  const [pipelineStages, setPipelineStages] = useState<Array<{ stage_id: string; stage_name: string }>>([]);
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvIndustry, setNewEnvIndustry] = useState(INDUSTRY_OPTIONS[0].value);
  const [schemaEntities, setSchemaEntities] = useState<SchemaEntitySummary[]>([]);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [entitySchema, setEntitySchema] = useState<SchemaEntityDetail | null>(null);
  const [selectedTableName, setSelectedTableName] = useState("");
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [filterJson, setFilterJson] = useState("{}");
  const [selectJson, setSelectJson] = useState("[]");
  const [queryLimit, setQueryLimit] = useState(200);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const boundEnv = useMemo(
    () => environments.find((env) => env.env_id === (settings?.boundEnvId || selectedEnvId)) ?? null,
    [environments, selectedEnvId, settings?.boundEnvId]
  );

  async function refreshQueueCount(): Promise<void> {
    const queued = await getQueuedWrites();
    setQueueCount(queued.length);
  }

  async function init(): Promise<void> {
    setBusy(true);
    try {
      await ensureWorkbookId();
      const nextSettings = await getWorkbookSettings();
      setSettings(nextSettings);
      const base = nextSettings.baseApiUrl || (await getBaseApiUrl());
      setApiBaseUrlInput(base);
      await setBaseApiUrl(base);

      await Promise.all([loadProfile(), loadEnvironments(nextSettings.boundEnvId), healthCheck()]);
      await refreshQueueCount();
    } finally {
      setBusy(false);
    }
  }

  async function healthCheck(): Promise<void> {
    try {
      await bmApiClient.get<{ status: string }>("/health", 0, true);
      setHealth("ok");
    } catch {
      setHealth("down");
    }
  }

  async function loadProfile(): Promise<void> {
    const me = await getCurrentProfile();
    setProfile(me);
  }

  async function loadEnvironments(preferredEnvId?: string): Promise<void> {
    try {
      const response = await bmApiClient.get<{ environments: EnvironmentRecord[] }>(
        "/v1/environments",
        0,
        true
      );
      setEnvironments(response.environments);
      const nextEnvId = preferredEnvId || response.environments[0]?.env_id || "";
      setSelectedEnvId(nextEnvId);

      if (nextEnvId) {
        await Promise.all([loadSchema(nextEnvId), loadPipeline(nextEnvId), loadAudit(nextEnvId)]);
      }
    } catch (err) {
      setDiagnostics((prev) => [
        `Environment load failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ...prev,
      ].slice(0, 50));
    }
  }

  async function loadSchema(envId: string): Promise<void> {
    const response = await bmApiClient.get<{ entities: SchemaEntitySummary[] }>(
      `/v1/excel/schema?env_id=${encodeURIComponent(envId)}`,
      0,
      true
    );
    setSchemaEntities(response.entities);
    if (!selectedEntity && response.entities.length) {
      const defaultEntity = response.entities[0].entity;
      setSelectedEntity(defaultEntity);
      await loadSchemaDetail(defaultEntity, envId);
    }
  }

  async function loadSchemaDetail(entity: string, envId?: string): Promise<void> {
    const response = await bmApiClient.get<SchemaEntityDetail>(
      `/v1/excel/schema/${encodeURIComponent(entity)}${envId ? `?env_id=${encodeURIComponent(envId)}` : ""}`,
      0,
      true
    );
    setEntitySchema(response);

    const nextMap: Record<string, string> = {};
    excelHeaders.forEach((header) => {
      const matched = response.fields.find((field) => field.name.toLowerCase() === header.toLowerCase());
      if (matched) {
        nextMap[header] = matched.name;
      }
    });
    setFieldMap((prev) => ({ ...prev, ...nextMap }));
  }

  async function loadPipeline(envId: string): Promise<void> {
    try {
      const [globalStage, fullPipeline] = await Promise.all([
        bmApiClient.get<{ current_stage_name: string }>(
          `/v1/pipeline/global?env_id=${encodeURIComponent(envId)}`,
          0,
          true
        ),
        bmApiClient.get<{ stages: Array<{ stage_id: string; stage_name: string }> }>(
          `/v1/environments/${encodeURIComponent(envId)}/pipeline`,
          0,
          true
        ),
      ]);
      setSelectedEnvStage(globalStage.current_stage_name);
      setPipelineStages(fullPipeline.stages);
    } catch {
      setSelectedEnvStage("");
      setPipelineStages([]);
    }
  }

  async function loadAudit(envId: string): Promise<void> {
    if (!settings?.workbookId) {
      return;
    }
    try {
      const response = await bmApiClient.get<{ items: AuditItem[] }>(
        `/v1/excel/audit?env_id=${encodeURIComponent(envId)}&workbook_id=${encodeURIComponent(
          settings.workbookId
        )}&limit=50`,
        0,
        true
      );
      setAuditItems(response.items);
    } catch {
      setAuditItems([]);
    }
  }

  async function onSaveBaseUrl(): Promise<void> {
    await setBaseApiUrl(apiBaseUrl);
    const updated = await updateWorkbookSettings({ baseApiUrl: apiBaseUrl });
    setSettings(updated);
    await healthCheck();
  }

  async function onLogin(): Promise<void> {
    setBusy(true);
    try {
      await completeSession(apiKey.trim());
      await loadProfile();
      setDiagnostics((prev) => ["Authenticated successfully.", ...prev].slice(0, 50));
    } catch (err) {
      setDiagnostics((prev) => [
        `Login failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ...prev,
      ].slice(0, 50));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout(): Promise<void> {
    await logout();
    setProfile(null);
  }

  async function onCreateEnvironment(): Promise<void> {
    if (!newEnvName.trim()) {
      return;
    }
    setBusy(true);
    try {
      await bmApiClient.post("/v1/environments", {
        client_name: newEnvName.trim(),
        industry: newEnvIndustry,
        industry_type: newEnvIndustry,
        notes: "Created via Business Machine Excel Add-in",
      });
      setNewEnvName("");
      await loadEnvironments();
    } finally {
      setBusy(false);
    }
  }

  async function onBindWorkbook(): Promise<void> {
    if (!selectedEnvId) {
      return;
    }
    const env = environments.find((candidate) => candidate.env_id === selectedEnvId);
    const updated = await bindEnvironment(selectedEnvId, env?.client_name || "");
    setSettings(updated);
    await Promise.all([loadSchema(selectedEnvId), loadPipeline(selectedEnvId), loadAudit(selectedEnvId)]);
  }

  async function onToggleWriteMode(): Promise<void> {
    const updated = await setWriteModeEnabled(!settings?.writeModeEnabled);
    setSettings(updated);
  }

  async function onUpdatePipelineStage(): Promise<void> {
    if (!selectedEnvId || !selectedEnvStage) {
      return;
    }
    await bmApiClient.patch(`/v1/environments/${encodeURIComponent(selectedEnvId)}/pipeline-stage`, {
      stage_name: selectedEnvStage,
      workbook_id: settings?.workbookId,
    });
    await loadPipeline(selectedEnvId);
    await loadAudit(selectedEnvId);
  }

  async function onDetectSelectedTable(): Promise<void> {
    const table = await getSelectedTableInfo();
    if (!table) {
      setDiagnostics((prev) => ["No Excel table selected.", ...prev].slice(0, 50));
      return;
    }

    setSelectedTableName(table.tableName);
    setExcelHeaders(table.headers);
    if (entitySchema) {
      const nextMap: Record<string, string> = {};
      table.headers.forEach((header) => {
        const field = entitySchema.fields.find((f) => f.name.toLowerCase() === header.toLowerCase());
        if (field) {
          nextMap[header] = field.name;
        }
      });
      setFieldMap(nextMap);
    }
  }

  async function onPullToSheet(): Promise<void> {
    const envId = settings?.boundEnvId || selectedEnvId;
    if (!envId || !selectedEntity) {
      return;
    }

    setBusy(true);
    try {
      const filters = parseJson<JsonObject>(filterJson, {});
      const select = parseJson<string[]>(selectJson, []);
      const response = await bmApiClient.post<{ rows: JsonObject[] }>("/v1/excel/query", {
        env_id: envId,
        entity: selectedEntity,
        filters,
        select,
        limit: queryLimit,
      });

      const rows = response.rows || [];
      const headers = select.length ? select : rows.length ? Object.keys(rows[0]) : [];
      if (!headers.length) {
        setDiagnostics((prev) => ["Query returned no columns.", ...prev].slice(0, 50));
        return;
      }
      const matrix: (string | number | boolean)[][] = [headers];
      rows.forEach((row) => {
        matrix.push(headers.map((header) => normalizeCellValue(row[header])));
      });
      await writeMatrixToSheet(matrix);
      setDiagnostics((prev) => [`Pulled ${rows.length} rows into sheet.`, ...prev].slice(0, 50));
    } catch (err) {
      setDiagnostics((prev) => [
        `Pull failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ...prev,
      ].slice(0, 50));
    } finally {
      setBusy(false);
    }
  }

  async function onPushSelection(): Promise<void> {
    const envId = settings?.boundEnvId || selectedEnvId;
    if (!envId || !selectedEntity) {
      return;
    }

    const table = await getSelectedTableInfo();
    if (!table) {
      setDiagnostics((prev) => ["Select an Excel table before push.", ...prev].slice(0, 50));
      return;
    }

    const mappedHeaders = table.headers.filter((header) => fieldMap[header]);
    if (!mappedHeaders.length) {
      setDiagnostics((prev) => ["Map at least one column to a field.", ...prev].slice(0, 50));
      return;
    }

    const rows = table.rows
      .map((row) => {
        const payload: JsonObject = {};
        mappedHeaders.forEach((header, index) => {
          const mappedField = fieldMap[header];
          const sourceIdx = table.headers.findIndex((candidate) => candidate === header);
          payload[mappedField] = sourceIdx >= 0 ? row[sourceIdx] : null;
        });
        return payload;
      })
      .filter((row) => Object.values(row).some((value) => value !== null && String(value).trim() !== ""));

    const keyFields = entitySchema?.primary_keys?.length
      ? entitySchema.primary_keys
      : mappedHeaders.length
        ? [fieldMap[mappedHeaders[0]]]
        : [];

    setBusy(true);
    try {
      const response = await bmApiClient.post<{
        inserted_count: number;
        updated_count: number;
        row_errors: Array<{ row_index: number; code: string; message: string }>;
      }>("/v1/excel/upsert", {
        env_id: envId,
        entity: selectedEntity,
        key_fields: keyFields,
        rows,
        workbook_id: settings?.workbookId,
      });

      const statusValues = Array.from({ length: rows.length }).map(() => "OK");
      response.row_errors.forEach((err) => {
        statusValues[err.row_index] = `${err.code}: ${err.message}`;
      });
      await writeSyncStatusColumn(table.tableName, statusValues);

      setDiagnostics((prev) => [
        `Push complete. Inserted ${response.inserted_count}, updated ${response.updated_count}, errors ${response.row_errors.length}.`,
        ...prev,
      ].slice(0, 50));
      await loadAudit(envId);
    } catch (err) {
      setDiagnostics((prev) => [
        `Push failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ...prev,
      ].slice(0, 50));
    } finally {
      setBusy(false);
    }
  }

  async function onSyncNow(): Promise<void> {
    setBusy(true);
    try {
      const summary = await flushQueuedWrites();
      await markSyncTime();
      await refreshQueueCount();
      if (selectedEnvId) {
        await loadAudit(selectedEnvId);
      }
      setDiagnostics((prev) => [
        `Sync flushed ${summary.flushed}: success ${summary.succeeded}, failed ${summary.failed}.`,
        ...summary.errors,
        ...prev,
      ].slice(0, 50));
    } finally {
      setBusy(false);
    }
  }

  async function onClearCache(): Promise<void> {
    clearCache();
    setDiagnostics((prev) => ["In-memory API cache cleared.", ...prev].slice(0, 50));
  }

  useEffect(() => {
    void init();
  }, []);

  return (
    <main className="app-root">
      <header className="hero">
        <div>
          <h1>Business Machine Add-in</h1>
          <p>Formula pull/push + environment-bound sync for Excel.</p>
        </div>
        <span className={`status-pill ${health === "ok" ? "ok" : "bad"}`}>API {health}</span>
      </header>

      {settings?.writeModeEnabled ? (
        <section className="warning-banner">
          Write mode is enabled. Formula pushes and sync operations can update Business Machine data.
        </section>
      ) : null}

      <section className="panel">
        <h2>Connection</h2>
        <label>
          Base API URL
          <input value={apiBaseUrl} onChange={(event) => setApiBaseUrlInput(event.target.value)} />
        </label>
        <div className="row">
          <button onClick={() => void onSaveBaseUrl()} disabled={busy}>Save URL</button>
          <button onClick={() => void healthCheck()} disabled={busy}>Health Check</button>
        </div>

        <label>
          API Key
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Enter Excel API key"
            type="password"
          />
        </label>
        <div className="row">
          <button onClick={() => void onLogin()} disabled={busy}>Login</button>
          <button onClick={() => void onLogout()} disabled={busy}>Logout</button>
        </div>
        <p className="muted">
          User: {profile ? `${profile.email} (${profile.org_name})` : "Not logged in"}
        </p>
      </section>

      <section className="panel">
        <h2>Environment</h2>
        <label>
          Select Environment
          <select value={selectedEnvId} onChange={(event) => setSelectedEnvId(event.target.value)}>
            <option value="">Select...</option>
            {environments.map((env) => (
              <option value={env.env_id} key={env.env_id}>
                {env.client_name} ({env.industry_type || env.industry})
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button onClick={() => void onBindWorkbook()} disabled={busy || !selectedEnvId}>Bind Workbook</button>
          <button
            onClick={() => void loadEnvironments(selectedEnvId || settings?.boundEnvId)}
            disabled={busy}
          >
            Refresh
          </button>
        </div>

        <label>
          New Environment Name
          <input value={newEnvName} onChange={(event) => setNewEnvName(event.target.value)} />
        </label>
        <label>
          Industry Template
          <select value={newEnvIndustry} onChange={(event) => setNewEnvIndustry(event.target.value)}>
            {INDUSTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void onCreateEnvironment()} disabled={busy || !newEnvName.trim()}>
          Create Environment
        </button>

        <div className="subpanel">
          <h3>Global Pipeline Stage</h3>
          <select value={selectedEnvStage} onChange={(event) => setSelectedEnvStage(event.target.value)}>
            <option value="">Select stage...</option>
            {pipelineStages.map((stage) => (
              <option key={stage.stage_id} value={stage.stage_name}>
                {stage.stage_name}
              </option>
            ))}
          </select>
          <button onClick={() => void onUpdatePipelineStage()} disabled={busy || !selectedEnvStage || !selectedEnvId}>
            Move Environment Stage
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Data Sync (Structured)</h2>
        <label>
          Entity
          <select
            value={selectedEntity}
            onChange={(event) => {
              const nextEntity = event.target.value;
              setSelectedEntity(nextEntity);
              void loadSchemaDetail(nextEntity, settings?.boundEnvId || selectedEnvId);
            }}
          >
            <option value="">Select entity...</option>
            {schemaEntities.map((entity) => (
              <option key={entity.entity} value={entity.entity}>
                {entity.entity}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <button onClick={() => void onDetectSelectedTable()} disabled={busy}>Detect Selected Table</button>
          <button onClick={() => void onPushSelection()} disabled={busy || !settings?.writeModeEnabled}>
            Push Table to Site
          </button>
        </div>
        <p className="muted">Selected table: {selectedTableName || "none"}</p>

        {excelHeaders.length ? (
          <div className="mapping-grid">
            {excelHeaders.map((header) => (
              <div key={header} className="mapping-row">
                <span>{header}</span>
                <select
                  value={fieldMap[header] || ""}
                  onChange={(event) =>
                    setFieldMap((prev) => ({
                      ...prev,
                      [header]: event.target.value,
                    }))
                  }
                >
                  <option value="">Ignore</option>
                  {(entitySchema?.fields || []).map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : null}

        <label>
          Query Filters JSON
          <textarea value={filterJson} onChange={(event) => setFilterJson(event.target.value)} rows={3} />
        </label>
        <label>
          Query Select JSON
          <textarea value={selectJson} onChange={(event) => setSelectJson(event.target.value)} rows={3} />
        </label>
        <label>
          Query Limit
          <input
            type="number"
            min={1}
            max={500}
            value={queryLimit}
            onChange={(event) => setQueryLimit(Number(event.target.value) || 200)}
          />
        </label>
        <button onClick={() => void onPullToSheet()} disabled={busy}>Pull Into Sheet</button>
      </section>

      <section className="panel">
        <h2>Pipeline Sync (Operational)</h2>
        <div className="row">
          <button
            onClick={() => {
              setSelectedEntity("pipeline_items");
              void onPullToSheet();
            }}
            disabled={busy}
          >
            Pull Pipeline Items
          </button>
          <button
            onClick={() => {
              setSelectedEntity("pipeline_items");
              void onPushSelection();
            }}
            disabled={busy || !settings?.writeModeEnabled}
          >
            Push Pipeline Items
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Audit + Diagnostics</h2>
        <div className="row">
          <button onClick={() => void onSyncNow()} disabled={busy}>Sync Now</button>
          <button onClick={() => void onClearCache()} disabled={busy}>Clear Cache</button>
          <button onClick={() => void onToggleWriteMode()} disabled={busy}>
            {settings?.writeModeEnabled ? "Disable Write Mode" : "Enable Write Mode"}
          </button>
        </div>
        <p className="muted">
          Workbook ID: {settings?.workbookId || "n/a"} | Bound env: {boundEnv?.client_name || "none"} |
          queued writes: {queueCount}
        </p>

        <div className="audit-list">
          {auditItems.slice(0, 10).map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.action}</strong> · {item.entity_type}
              </div>
              <div className="muted">{new Date(item.at).toLocaleString()}</div>
            </article>
          ))}
        </div>

        <div className="diagnostics-list">
          {diagnostics.slice(0, 12).map((line, idx) => (
            <div key={`${line}-${idx}`} className="mono">
              {line}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

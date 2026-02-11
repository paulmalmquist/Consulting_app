"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createIngestRecipe,
  getIngestSourceProfile,
  listIngestTargets,
  runIngestRecipe,
  validateIngestRecipe,
  IngestProfile,
  IngestTarget,
  IngestValidationResult,
  IngestRun,
} from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface MappingRow {
  source_column: string;
  target_column: string;
  required: boolean;
  mapping_order: number;
  transform_json: {
    trim?: boolean;
    date_parse?: boolean;
    currency_parse?: boolean;
    default?: string;
    regex_extract?: { pattern: string; group?: number };
  };
}

interface AiSuggestion {
  mappings: Array<{
    source_column: string;
    target_column: string;
    transform?: Record<string, unknown>;
  }>;
  key_fields?: string[];
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function parseMaybeJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export default function IngestSourceWizard({
  sourceId,
  businessId,
}: {
  sourceId: string;
  businessId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<IngestProfile | null>(null);
  const [targets, setTargets] = useState<IngestTarget[]>([]);

  const [step, setStep] = useState(2);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [selectedTargetKey, setSelectedTargetKey] = useState("vendor");
  const [customTableKey, setCustomTableKey] = useState("custom_table");
  const [customColumns, setCustomColumns] = useState("");
  const [mode, setMode] = useState<"append" | "upsert" | "replace">("upsert");

  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [primaryKeys, setPrimaryKeys] = useState<string[]>([]);
  const [recipeId, setRecipeId] = useState<string>("");

  const [validation, setValidation] = useState<IngestValidationResult | null>(null);
  const [runResult, setRunResult] = useState<IngestRun | null>(null);
  const [validating, setValidating] = useState(false);
  const [running, setRunning] = useState(false);

  const [aiHealthy, setAiHealthy] = useState(false);
  const [aiChecked, setAiChecked] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiSuggestion | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [profileRes, targetRows] = await Promise.all([
          getIngestSourceProfile(sourceId),
          listIngestTargets(),
        ]);

        if (!active) return;
        setProfile(profileRes);
        setTargets(targetRows);

        const defaultSheet = profileRes.sheets[0]?.sheet_name || "";
        setSelectedSheet(defaultSheet);

        const defaultTarget = targetRows.some((target) => target.key === "vendor")
          ? "vendor"
          : targetRows[0]?.key || "vendor";
        setSelectedTargetKey(defaultTarget);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load source profile");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [sourceId]);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/health", { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        setAiHealthy(res.ok);
        setAiChecked(true);
      })
      .catch(() => {
        if (!active) return;
        setAiHealthy(false);
        setAiChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const currentSheet = useMemo(
    () => profile?.sheets.find((sheet) => sheet.sheet_name === selectedSheet) || profile?.sheets[0] || null,
    [profile, selectedSheet]
  );

  const currentTarget = useMemo(
    () => targets.find((target) => target.key === selectedTargetKey) || null,
    [targets, selectedTargetKey]
  );

  const targetColumns = useMemo(() => {
    if (selectedTargetKey !== "custom") {
      return (currentTarget?.columns || []).map((column) => ({
        name: column.name,
        required: column.required,
      }));
    }
    return customColumns
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean)
      .map((name) => ({ name, required: false }));
  }, [selectedTargetKey, currentTarget, customColumns]);

  useEffect(() => {
    if (!currentSheet) return;

    const availableTargets = new Set(targetColumns.map((column) => column.name));
    const requiredTargets = new Set(targetColumns.filter((column) => column.required).map((column) => column.name));

    const autoRows: MappingRow[] = currentSheet.columns.map((column, index) => {
      const normalizedSource = normalize(column.name);
      const exactTarget = targetColumns.find((candidate) => normalize(candidate.name) === normalizedSource);
      const partialTarget = targetColumns.find(
        (candidate) =>
          normalize(candidate.name).includes(normalizedSource) ||
          normalizedSource.includes(normalize(candidate.name))
      );
      const mapped = exactTarget?.name || partialTarget?.name || "";

      return {
        source_column: column.name,
        target_column: mapped,
        required: mapped ? requiredTargets.has(mapped) : false,
        mapping_order: index,
        transform_json: { trim: true },
      };
    });

    setMappings(autoRows);

    const keys = autoRows
      .map((row) => row.target_column)
      .filter((name) => name && availableTargets.has(name))
      .slice(0, 1);
    setPrimaryKeys(keys);
  }, [currentSheet, targetColumns]);

  const mappedTargets = useMemo(
    () => [...new Set(mappings.map((row) => row.target_column).filter(Boolean))],
    [mappings]
  );

  function patchMapping(index: number, patch: Partial<MappingRow>) {
    setMappings((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...patch,
      };
      return next;
    });
  }

  function patchTransform(index: number, patch: Partial<MappingRow["transform_json"]>) {
    setMappings((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        transform_json: {
          ...next[index].transform_json,
          ...patch,
        },
      };
      return next;
    });
  }

  function togglePrimaryKey(column: string) {
    setPrimaryKeys((prev) => (prev.includes(column) ? prev.filter((key) => key !== column) : [...prev, column]));
  }

  function recipePayload() {
    const filteredMappings = mappings
      .filter((row) => row.target_column)
      .map((row, idx) => ({
        source_column: row.source_column,
        target_column: row.target_column,
        required: row.required,
        mapping_order: idx,
        transform_json: {
          ...row.transform_json,
          default:
            row.transform_json.default && row.transform_json.default.trim() !== ""
              ? row.transform_json.default
              : undefined,
          regex_extract:
            row.transform_json.regex_extract?.pattern && row.transform_json.regex_extract.pattern.trim() !== ""
              ? row.transform_json.regex_extract
              : undefined,
        },
      }));

    if (filteredMappings.length === 0) {
      throw new Error("Map at least one source column to continue.");
    }

    const targetTableKey =
      selectedTargetKey === "custom"
        ? customTableKey.trim() || `custom_${sourceId.slice(0, 8)}`
        : selectedTargetKey;

    return {
      target_table_key: targetTableKey,
      mode,
      primary_key_fields: primaryKeys,
      settings_json: {
        sheet_name: currentSheet?.sheet_name,
        header_row_index: currentSheet?.header_row_index,
      },
      mappings: filteredMappings,
      transform_steps: [],
    };
  }

  async function handleValidate() {
    setValidating(true);
    setError("");
    setValidation(null);
    setRunResult(null);

    try {
      const recipe = await createIngestRecipe(sourceId, recipePayload());
      setRecipeId(recipe.id);
      const result = await validateIngestRecipe(recipe.id, { preview_rows: 50 });
      setValidation(result);
      setStep(5);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setError("");

    try {
      let activeRecipeId = recipeId;
      if (!activeRecipeId) {
        const recipe = await createIngestRecipe(sourceId, recipePayload());
        activeRecipeId = recipe.id;
        setRecipeId(recipe.id);
      }

      const result = await runIngestRecipe(activeRecipeId);
      setRunResult(result);
      setStep(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleAiSuggest() {
    if (!aiHealthy || !currentSheet) return;

    setAiBusy(true);
    setError("");
    try {
      const targetCols = targetColumns.map((column) => column.name);
      const prompt = [
        "Suggest ingestion column mappings as strict JSON.",
        "Return this object only:",
        '{"mappings":[{"source_column":"...","target_column":"...","transform":{"trim":true,"date_parse":false,"currency_parse":false}}],"key_fields":["..."]}',
        `Source columns: ${JSON.stringify(currentSheet.columns.map((column) => column.name))}`,
        `Sample rows: ${JSON.stringify(currentSheet.sample_rows.slice(0, 5))}`,
        `Target columns: ${JSON.stringify(targetCols)}`,
      ].join("\n");

      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const payload = (await response.json().catch(() => ({}))) as { answer?: string };
      if (!response.ok || !payload.answer) {
        throw new Error("AI mapping suggestion unavailable");
      }

      const parsed = parseMaybeJson(payload.answer);
      if (!parsed) {
        throw new Error("AI response was not parseable JSON");
      }

      const draft: AiSuggestion = {
        mappings: Array.isArray(parsed.mappings)
          ? (parsed.mappings as AiSuggestion["mappings"])
          : [],
        key_fields: Array.isArray(parsed.key_fields)
          ? (parsed.key_fields as string[])
          : [],
      };

      setAiDraft(draft);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "AI mapping suggestion failed");
      setAiDraft(null);
    } finally {
      setAiBusy(false);
    }
  }

  function applyAiSuggestion() {
    if (!aiDraft) return;

    const next = mappings.map((row) => ({ ...row }));
    for (const suggestion of aiDraft.mappings) {
      const idx = next.findIndex(
        (row) => normalize(row.source_column) === normalize(suggestion.source_column)
      );
      if (idx === -1) continue;
      next[idx] = {
        ...next[idx],
        target_column: suggestion.target_column,
        transform_json: {
          ...next[idx].transform_json,
          ...(suggestion.transform || {}),
        },
      };
    }

    setMappings(next);

    if (aiDraft.key_fields?.length) {
      const allowed = new Set(targetColumns.map((column) => column.name));
      setPrimaryKeys(aiDraft.key_fields.filter((field) => allowed.has(field)));
    }

    setAiDraft(null);
  }

  if (loading) {
    return <div className="h-48 rounded-lg border border-bm-border/70 bg-bm-surface/40 animate-pulse" />;
  }

  if (!profile || !currentSheet) {
    return <p className="text-sm text-bm-danger">Unable to load source profile.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStep(n)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition ${
              step === n
                ? "bg-bm-accent/12 text-bm-text border-bm-accent/30"
                : "bg-bm-surface/40 text-bm-muted border-bm-border/70"
            }`}
          >
            Step {n}
          </button>
        ))}
      </div>

      {step === 2 && (
        <Card data-testid="ingest-profile">
          <CardContent className="space-y-4">
            <CardTitle className="text-base">Step 2: Profile</CardTitle>

            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Sheet</p>
              <Select value={selectedSheet} onChange={(event) => setSelectedSheet(event.target.value)}>
                {profile.sheets.map((sheet) => (
                  <option key={sheet.sheet_name} value={sheet.sheet_name}>
                    {sheet.sheet_name} ({sheet.total_rows.toLocaleString()} rows)
                  </option>
                ))}
              </Select>
            </div>

            <div className="rounded-lg border border-bm-border/70 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-bm-surface/60">
                  <tr>
                    <th className="text-left px-3 py-2">Column</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Distinct</th>
                    <th className="text-left px-3 py-2">Sample</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSheet.columns.map((column) => (
                    <tr key={column.name} className="border-t border-bm-border/60">
                      <td className="px-3 py-2">{column.name}</td>
                      <td className="px-3 py-2">{column.inferred_type}</td>
                      <td className="px-3 py-2">{column.distinct_count}</td>
                      <td className="px-3 py-2 text-bm-muted2">{column.sample_values.join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {currentSheet.key_candidates.length > 0 && (
              <p className="text-xs text-bm-muted2">
                Key candidates: {currentSheet.key_candidates.map((candidate) => candidate.column).join(", ")}
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setStep(3)}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card data-testid="ingest-target-select">
          <CardContent className="space-y-4">
            <CardTitle className="text-base">Step 3: Choose target</CardTitle>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {targets.map((target) => (
                <button
                  key={target.key}
                  type="button"
                  onClick={() => setSelectedTargetKey(target.key)}
                  className={`rounded-lg border px-3 py-3 text-left transition ${
                    selectedTargetKey === target.key
                      ? "border-bm-accent/40 bg-bm-accent/10"
                      : "border-bm-border/70 bg-bm-bg/20 hover:bg-bm-surface/30"
                  }`}
                >
                  <p className="text-sm font-medium">{target.label}</p>
                  <p className="text-xs text-bm-muted2 mt-1">{target.columns.length} columns</p>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSelectedTargetKey("custom")}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  selectedTargetKey === "custom"
                    ? "border-bm-accent/40 bg-bm-accent/10"
                    : "border-bm-border/70 bg-bm-bg/20 hover:bg-bm-surface/30"
                }`}
              >
                <p className="text-sm font-medium">Custom table</p>
                <p className="text-xs text-bm-muted2 mt-1">Define your own target columns</p>
              </button>
            </div>

            {selectedTargetKey === "custom" && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Custom table key</p>
                  <Input value={customTableKey} onChange={(event) => setCustomTableKey(event.target.value)} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Custom columns (comma-separated)</p>
                  <Input
                    value={customColumns}
                    onChange={(event) => setCustomColumns(event.target.value)}
                    placeholder="name, amount, date"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => setStep(4)}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card data-testid="ingest-mapping-table">
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Step 4: Mapping + transforms</CardTitle>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAiSuggest}
                disabled={!aiChecked || !aiHealthy || aiBusy}
                title={aiHealthy ? "Use local Codex to suggest mappings" : "Local Codex AI is unavailable"}
              >
                {aiBusy ? "Suggesting..." : "Suggest Mappings (Local Codex)"}
              </Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Mode</p>
                <Select value={mode} onChange={(event) => setMode(event.target.value as "append" | "upsert" | "replace")}>
                  <option value="append">Append</option>
                  <option value="upsert">Upsert</option>
                  <option value="replace">Replace</option>
                </Select>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Primary key fields</p>
                <div className="rounded-lg border border-bm-border/70 bg-bm-bg/15 p-2 max-h-28 overflow-auto">
                  {mappedTargets.length === 0 ? (
                    <p className="text-xs text-bm-muted2">Map columns first.</p>
                  ) : (
                    <div className="space-y-1">
                      {mappedTargets.map((column) => (
                        <label key={column} className="flex items-center gap-2 text-xs text-bm-text">
                          <input
                            type="checkbox"
                            checked={primaryKeys.includes(column)}
                            onChange={() => togglePrimaryKey(column)}
                          />
                          {column}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {aiDraft && (
              <div className="rounded-lg border border-bm-accent/30 bg-bm-accent/8 p-3">
                <p className="text-xs text-bm-muted2 mb-2">
                  AI proposed {aiDraft.mappings.length} mapping updates. Review and apply manually.
                </p>
                <Button size="sm" onClick={applyAiSuggestion}>
                  Apply Suggestions
                </Button>
              </div>
            )}

            <div className="overflow-auto rounded-lg border border-bm-border/70">
              <table className="w-full text-xs min-w-[920px]">
                <thead className="bg-bm-surface/60">
                  <tr>
                    <th className="text-left px-3 py-2">Source</th>
                    <th className="text-left px-3 py-2">Target</th>
                    <th className="text-left px-3 py-2">Required</th>
                    <th className="text-left px-3 py-2">Trim</th>
                    <th className="text-left px-3 py-2">Date parse</th>
                    <th className="text-left px-3 py-2">Currency parse</th>
                    <th className="text-left px-3 py-2">Default</th>
                    <th className="text-left px-3 py-2">Regex</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping, index) => (
                    <tr key={mapping.source_column} className="border-t border-bm-border/60">
                      <td className="px-3 py-2">{mapping.source_column}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={mapping.target_column}
                          onChange={(event) =>
                            patchMapping(index, {
                              target_column: event.target.value,
                              required: targetColumns.find((col) => col.name === event.target.value)?.required || false,
                            })
                          }
                        >
                          <option value="">(unmapped)</option>
                          {targetColumns.map((column) => (
                            <option key={column.name} value={column.name}>
                              {column.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={mapping.required}
                          onChange={(event) => patchMapping(index, { required: event.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(mapping.transform_json.trim)}
                          onChange={(event) => patchTransform(index, { trim: event.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(mapping.transform_json.date_parse)}
                          onChange={(event) => patchTransform(index, { date_parse: event.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(mapping.transform_json.currency_parse)}
                          onChange={(event) => patchTransform(index, { currency_parse: event.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={mapping.transform_json.default || ""}
                          onChange={(event) => patchTransform(index, { default: event.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={mapping.transform_json.regex_extract?.pattern || ""}
                          onChange={(event) =>
                            patchTransform(index, {
                              regex_extract: { pattern: event.target.value, group: 1 },
                            })
                          }
                          className="h-8"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button onClick={handleValidate} disabled={validating}>
                {validating ? "Validating..." : "Validate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card data-testid="ingest-validate">
          <CardContent className="space-y-4">
            <CardTitle className="text-base">Step 5: Validate</CardTitle>

            {!validation ? (
              <p className="text-sm text-bm-muted2">Run validation to preview transformed rows and errors.</p>
            ) : (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-3">
                    <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">Rows read</p>
                    <p className="text-lg font-semibold mt-1">{validation.rows_read.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-3">
                    <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">Rows valid</p>
                    <p className="text-lg font-semibold mt-1">{validation.rows_valid.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-3">
                    <p className="text-xs text-bm-muted2 uppercase tracking-[0.14em]">Rows rejected</p>
                    <p className="text-lg font-semibold mt-1">{validation.rows_rejected.toLocaleString()}</p>
                  </div>
                </div>

                {validation.errors.length > 0 ? (
                  <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 p-3 max-h-56 overflow-auto">
                    <p className="text-xs uppercase tracking-[0.14em] text-bm-danger mb-2">Validation Errors</p>
                    <div className="space-y-2">
                      {validation.errors.slice(0, 200).map((err, idx) => (
                        <p key={`${err.error_code}-${idx}`} className="text-xs text-bm-danger">
                          Row {err.row_number || "-"}
                          {err.column_name ? ` • ${err.column_name}` : ""}: {err.message}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-bm-success">No validation errors detected.</p>
                )}

                <div className="rounded-lg border border-bm-border/70 overflow-auto">
                  <table className="w-full text-xs min-w-[540px]">
                    <thead className="bg-bm-surface/60">
                      <tr>
                        {validation.preview_rows[0]
                          ? Object.keys(validation.preview_rows[0]).map((column) => (
                              <th key={column} className="text-left px-3 py-2">
                                {column}
                              </th>
                            ))
                          : <th className="text-left px-3 py-2">Preview</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {validation.preview_rows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-2 text-bm-muted2">No preview rows available.</td>
                        </tr>
                      ) : (
                        validation.preview_rows.map((row, idx) => (
                          <tr key={idx} className="border-t border-bm-border/60">
                            {Object.values(row).map((value, vIdx) => (
                              <td key={vIdx} className="px-3 py-2">
                                {value == null ? "" : String(value)}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(4)}>
                Back
              </Button>
              <Button data-testid="ingest-run" onClick={handleRun} disabled={running || !validation}>
                {running ? "Running..." : "Run Ingestion"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card data-testid="ingest-run-summary">
          <CardContent className="space-y-4">
            <CardTitle className="text-base">Step 6: Run Summary</CardTitle>

            {!runResult ? (
              <p className="text-sm text-bm-muted2">Run the ingestion pipeline to see summary.</p>
            ) : (
              <>
                <div className="grid sm:grid-cols-5 gap-2">
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
                    <p className="text-[10px] uppercase text-bm-muted2">Status</p>
                    <p className="text-sm mt-1">{runResult.status}</p>
                  </div>
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
                    <p className="text-[10px] uppercase text-bm-muted2">Read</p>
                    <p className="text-sm mt-1">{runResult.rows_read}</p>
                  </div>
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
                    <p className="text-[10px] uppercase text-bm-muted2">Valid</p>
                    <p className="text-sm mt-1">{runResult.rows_valid}</p>
                  </div>
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
                    <p className="text-[10px] uppercase text-bm-muted2">Inserted</p>
                    <p className="text-sm mt-1">{runResult.rows_inserted}</p>
                  </div>
                  <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
                    <p className="text-[10px] uppercase text-bm-muted2">Updated</p>
                    <p className="text-sm mt-1">{runResult.rows_updated}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/ingest/runs/${runResult.id}`} className="text-sm underline text-bm-accent">
                    Open run details
                  </Link>
                  <Link
                    href={`/ingest/tables/${selectedTargetKey === "custom" ? customTableKey : selectedTargetKey}`}
                    className="text-sm underline text-bm-accent"
                  >
                    Open table viewer
                  </Link>
                </div>
              </>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(5)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>Start Over</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-xs text-bm-danger">{error}</p>}
    </div>
  );
}

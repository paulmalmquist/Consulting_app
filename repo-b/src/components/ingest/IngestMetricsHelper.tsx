"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createMetricDataPoint,
  listIngestTables,
  listMetricDataPoints,
  suggestMetricsForTable,
  MetricSuggestion,
  MetricDataPointRegistryItem,
  IngestTable,
} from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

export default function IngestMetricsHelper({
  businessId,
  envId,
  fixedTableKey,
  title = "Create metrics from ingested table",
}: {
  businessId: string;
  envId?: string;
  fixedTableKey?: string;
  title?: string;
}) {
  const [tables, setTables] = useState<IngestTable[]>([]);
  const [selectedTableKey, setSelectedTableKey] = useState<string>(fixedTableKey || "");
  const [suggestions, setSuggestions] = useState<MetricSuggestion[]>([]);
  const [registry, setRegistry] = useState<MetricDataPointRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [savingKey, setSavingKey] = useState<string>("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [tableRows, registryRows] = await Promise.all([
          listIngestTables({ business_id: businessId, env_id: envId }),
          listMetricDataPoints({ business_id: businessId, env_id: envId }),
        ]);

        if (!active) return;

        setTables(tableRows);
        setRegistry(registryRows);

        if (!fixedTableKey) {
          if (tableRows.length > 0) {
            setSelectedTableKey((prev) => prev || tableRows[0].table_key);
          }
        } else {
          setSelectedTableKey(fixedTableKey);
        }
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load metrics helper");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [businessId, envId, fixedTableKey]);

  useEffect(() => {
    if (!selectedTableKey) {
      setSuggestions([]);
      return;
    }

    let active = true;
    suggestMetricsForTable(selectedTableKey, { business_id: businessId, env_id: envId })
      .then((payload) => {
        if (!active) return;
        setSuggestions(payload.suggestions);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to suggest metrics");
      });

    return () => {
      active = false;
    };
  }, [selectedTableKey, businessId, envId]);

  const existingKeys = useMemo(() => new Set(registry.map((item) => item.data_point_key)), [registry]);

  async function handleCreateSuggestion(suggestion: MetricSuggestion) {
    setSavingKey(suggestion.data_point_key);
    setError("");
    try {
      const created = await createMetricDataPoint({
        business_id: businessId,
        env_id: envId || null,
        data_point_key: suggestion.data_point_key,
        source_table_key: suggestion.source_table_key,
        aggregation: suggestion.aggregation,
        value_column: suggestion.value_column,
      });
      setRegistry((prev) => {
        const next = prev.filter((item) => item.data_point_key !== created.data_point_key);
        next.push(created);
        next.sort((a, b) => a.data_point_key.localeCompare(b.data_point_key));
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create data point");
    } finally {
      setSavingKey("");
    }
  }

  const selectedTable = tables.find((table) => table.table_key === selectedTableKey);

  return (
    <Card>
      <CardContent className="space-y-4">
        <CardTitle className="text-base">{title}</CardTitle>

        {fixedTableKey ? null : (
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Ingested table</p>
            <Select
              value={selectedTableKey}
              onChange={(event) => setSelectedTableKey(event.target.value)}
            >
              {tables.length === 0 && <option value="">No tables available</option>}
              {tables.map((table) => (
                <option key={table.table_key} value={table.table_key}>
                  {table.name} ({table.row_count.toLocaleString()} rows)
                </option>
              ))}
            </Select>
          </div>
        )}

        {loading ? (
          <div className="h-20 rounded-lg border border-bm-border/70 bg-bm-surface/40 animate-pulse" />
        ) : (
          <>
            {selectedTable ? (
              <p className="text-xs text-bm-muted2">
                Selected table: <span className="text-bm-text">{selectedTable.name}</span>
              </p>
            ) : (
              <p className="text-xs text-bm-muted2">Select a table to generate metric suggestions.</p>
            )}

            {suggestions.length === 0 ? (
              <p className="text-sm text-bm-muted2">No deterministic suggestions found yet.</p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((suggestion) => {
                  const exists = existingKeys.has(suggestion.data_point_key);
                  return (
                    <div
                      key={suggestion.data_point_key}
                      className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-3 flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{suggestion.data_point_key}</p>
                        <p className="text-xs text-bm-muted2">
                          {suggestion.aggregation}
                          {suggestion.value_column ? ` • ${suggestion.value_column}` : ""}
                        </p>
                        <p className="text-xs text-bm-muted mt-1">{suggestion.rationale}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={exists ? "ghost" : "primary"}
                        disabled={exists || savingKey === suggestion.data_point_key}
                        onClick={() => handleCreateSuggestion(suggestion)}
                      >
                        {exists ? "Added" : savingKey === suggestion.data_point_key ? "Saving..." : "Add"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs text-bm-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}

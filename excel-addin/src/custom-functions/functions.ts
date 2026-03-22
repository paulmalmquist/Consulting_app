import { bmApiClient } from "../shared/apiClient";
import { FormulaErrorCodes, normalizeFormulaError } from "../shared/errors";
import { enqueueWrite } from "../shared/writeQueue";
import { FormulaOptions, JsonObject } from "../shared/types";
import { getWorkbookSettingsCached } from "../shared/workbookSettings";

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) {
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
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

async function resolveContext(explicitEnvId?: string): Promise<{ envId: string; workbookId: string }> {
  const settings = await getWorkbookSettingsCached();
  const envId = (explicitEnvId || settings.boundEnvId || "").trim();
  if (!envId) {
    throw new Error(FormulaErrorCodes.env);
  }
  return {
    envId,
    workbookId: settings.workbookId || "",
  };
}

function parseOptions(optionsJson?: string): FormulaOptions {
  return parseJson<FormulaOptions>(optionsJson, {});
}

export async function BM_ENV(): Promise<string> {
  const settings = await getWorkbookSettingsCached();
  return settings.boundEnvId || FormulaErrorCodes.env;
}

export async function BM_ENV_NAME(): Promise<string> {
  const settings = await getWorkbookSettingsCached();
  return settings.boundEnvName || FormulaErrorCodes.env;
}

export async function BM_PULL(
  entity: string,
  field: string,
  keyField: string,
  keyValue: string,
  envId?: string,
  optionsJson?: string
): Promise<string | number | boolean> {
  try {
    const context = await resolveContext(envId);
    const options = parseOptions(optionsJson);
    const result = await bmApiClient.post<{ rows: JsonObject[] }>(
      "/v1/excel/query",
      {
        env_id: context.envId,
        entity,
        filters: {
          [keyField]: keyValue,
        },
        select: [field],
        limit: 1,
      },
      options.ttlSeconds,
      options.forceRefresh
    );

    if (!result.rows.length) {
      return FormulaErrorCodes.notFound;
    }

    return normalizeCellValue(result.rows[0][field]);
  } catch (err) {
    return normalizeFormulaError(err);
  }
}

export async function BM_LOOKUP(
  entity: string,
  returnField: string,
  whereField: string,
  whereValue: string,
  envId?: string
): Promise<string | number | boolean> {
  return BM_PULL(entity, returnField, whereField, whereValue, envId, "{}");
}

export async function BM_QUERY(
  entity: string,
  filterJson?: string,
  selectJson?: string,
  envId?: string,
  limit = 200
): Promise<(string | number | boolean)[][]> {
  try {
    const context = await resolveContext(envId);
    const filters = parseJson<JsonObject>(filterJson, {});
    const select = parseJson<string[]>(selectJson, []);

    const result = await bmApiClient.post<{ rows: JsonObject[] }>(
      "/v1/excel/query",
      {
        env_id: context.envId,
        entity,
        filters,
        select,
        limit,
      },
      30,
      false
    );

    const rows = result.rows ?? [];
    const headers = select.length
      ? select
      : rows.length
        ? Object.keys(rows[0])
        : [];

    if (!headers.length) {
      return [[""]];
    }

    const matrix: (string | number | boolean)[][] = [headers];
    rows.forEach((row) => {
      matrix.push(headers.map((header) => normalizeCellValue(row[header])));
    });

    return matrix;
  } catch (err) {
    return [[normalizeFormulaError(err)]];
  }
}

export async function BM_METRIC(
  metricName: string,
  paramsJson?: string,
  envId?: string
): Promise<string | number | boolean> {
  try {
    const context = await resolveContext(envId);
    const params = parseJson<JsonObject>(paramsJson, {});

    const metric = await bmApiClient.post<{ value: number; metadata: JsonObject }>(
      "/v1/excel/metric",
      {
        env_id: context.envId,
        metric_name: metricName,
        params,
      },
      30,
      false
    );

    return metric.value;
  } catch (err) {
    return normalizeFormulaError(err);
  }
}

export async function BM_PIPELINE_STAGE(envId?: string): Promise<string> {
  try {
    const context = await resolveContext(envId);
    const response = await bmApiClient.get<{ current_stage_name: string }>(
      `/v1/pipeline/global?env_id=${encodeURIComponent(context.envId)}`,
      20,
      false
    );
    return response.current_stage_name || FormulaErrorCodes.notFound;
  } catch (err) {
    return normalizeFormulaError(err);
  }
}

export async function BM_PUSH(
  entity: string,
  keyField: string,
  keyValue: string,
  field: string,
  value: string,
  envId?: string,
  mode?: string
): Promise<string> {
  try {
    const settings = await getWorkbookSettingsCached();
    if (!settings.writeModeEnabled) {
      return "WRITE_DISABLED";
    }

    const context = await resolveContext(envId);
    const row: JsonObject = {
      [keyField]: keyValue,
      [field]: value,
    };

    const normalizedMode = (mode || "queue").trim().toLowerCase();
    if (normalizedMode === "sync") {
      await bmApiClient.post("/v1/excel/upsert", {
        env_id: context.envId,
        entity,
        key_fields: [keyField],
        rows: [row],
        workbook_id: context.workbookId,
      });
      return "OK";
    }

    await enqueueWrite({
      envId: context.envId,
      entity,
      keyFields: [keyField],
      row,
      workbookId: context.workbookId,
    });
    return "QUEUED";
  } catch (err) {
    return normalizeFormulaError(err);
  }
}

export async function BM_UPSERT(
  entity: string,
  rowJson: string,
  keyFieldsJson?: string,
  envId?: string
): Promise<string> {
  try {
    const settings = await getWorkbookSettingsCached();
    if (!settings.writeModeEnabled) {
      return "WRITE_DISABLED";
    }

    const context = await resolveContext(envId);
    const row = parseJson<JsonObject>(rowJson, {});
    const keyFields = parseJson<string[]>(keyFieldsJson, []);

    await enqueueWrite({
      envId: context.envId,
      entity,
      keyFields,
      row,
      workbookId: context.workbookId,
    });

    return "QUEUED";
  } catch (err) {
    return normalizeFormulaError(err);
  }
}

CustomFunctions.associate("BM_ENV", BM_ENV);
CustomFunctions.associate("BM_ENV_NAME", BM_ENV_NAME);
CustomFunctions.associate("BM_PULL", BM_PULL);
CustomFunctions.associate("BM_LOOKUP", BM_LOOKUP);
CustomFunctions.associate("BM_QUERY", BM_QUERY);
CustomFunctions.associate("BM_METRIC", BM_METRIC);
CustomFunctions.associate("BM_PIPELINE_STAGE", BM_PIPELINE_STAGE);
CustomFunctions.associate("BM_PUSH", BM_PUSH);
CustomFunctions.associate("BM_UPSERT", BM_UPSERT);

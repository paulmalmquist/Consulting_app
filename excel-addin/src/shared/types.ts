export type JsonObject = Record<string, unknown>;

export type MetricResponse = {
  metric_name: string;
  value: number;
  metadata: JsonObject;
};

export type WorkbookSettings = {
  workbookId: string;
  boundEnvId: string;
  boundEnvName: string;
  writeModeEnabled: boolean;
  lastSyncAt: string;
  defaultEntityContext: string;
  baseApiUrl: string;
};

export type BMUserProfile = {
  user_id: string;
  email: string;
  org_name: string;
  permissions: string[];
};

export type QueryRequest = {
  env_id?: string;
  entity: string;
  filters?: JsonObject;
  select?: string[];
  limit?: number;
  order_by?: string[];
};

export type UpsertRequest = {
  env_id?: string;
  entity: string;
  rows: JsonObject[];
  key_fields?: string[];
  workbook_id?: string;
};

export type UpsertResponse = {
  inserted_count: number;
  updated_count: number;
  ids: string[];
  row_errors: {
    row_index: number;
    code: string;
    message: string;
  }[];
};

export type DeleteRequest = {
  env_id?: string;
  entity: string;
  key_fields: string[];
  keys: JsonObject[];
  workbook_id?: string;
};

export type QueuedWrite = {
  id: string;
  createdAt: string;
  envId: string;
  entity: string;
  keyFields: string[];
  row: JsonObject;
  workbookId: string;
};

export type SyncSummary = {
  flushed: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

export type SchemaEntitySummary = {
  entity: string;
  schema: string;
  table: string;
  display_field: string | null;
  primary_keys: string[];
  scope: "platform" | "environment";
};

export type SchemaField = {
  name: string;
  type: string;
  required: boolean;
  primary_key: boolean;
  enum_values: string[];
  display_name: string;
};

export type SchemaEntityDetail = {
  entity: string;
  schema: string;
  table: string;
  display_field: string | null;
  primary_keys: string[];
  fields: SchemaField[];
};

export type FormulaOptions = {
  ttlSeconds?: number;
  forceRefresh?: boolean;
};

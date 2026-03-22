export const STORAGE_KEYS = {
  apiBaseUrl: "bm.api.base_url",
  accessToken: "bm.auth.access_token",
  writeQueue: "bm.write.queue",
  workbookSettings: "bm.workbook.settings.cache",
  authMode: "bm.auth.mode",
} as const;

export const DEFAULT_SETTINGS = {
  workbookId: "",
  boundEnvId: "",
  boundEnvName: "",
  writeModeEnabled: false,
  lastSyncAt: "",
  defaultEntityContext: "",
  baseApiUrl: "http://localhost:8000",
};

export const DEFAULT_TTL_SECONDS = 30;
export const MAX_QUERY_LIMIT = 500;
export const MAX_BATCH_SIZE = 100;

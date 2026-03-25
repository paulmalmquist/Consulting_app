import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./constants";
import { WorkbookSettings } from "./types";
import { getStorageJson, setStorageJson } from "./storage";

const SETTING_KEYS = {
  workbookId: "bm.workbook_id",
  boundEnvId: "bm.bound_env_id",
  boundEnvName: "bm.bound_env_name",
  writeModeEnabled: "bm.write_mode_enabled",
  lastSyncAt: "bm.last_sync_at",
  defaultEntityContext: "bm.default_entity_context",
  baseApiUrl: "bm.base_api_url",
} as const;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBool(value: unknown): boolean {
  return value === true || value === "true";
}

export async function getWorkbookSettingsCached(): Promise<WorkbookSettings> {
  return getStorageJson<WorkbookSettings>(STORAGE_KEYS.workbookSettings, {
    ...DEFAULT_SETTINGS,
  });
}

async function cacheWorkbookSettings(settings: WorkbookSettings): Promise<void> {
  await setStorageJson(STORAGE_KEYS.workbookSettings, settings);
}

export async function ensureWorkbookId(): Promise<string> {
  const current = await getWorkbookSettings();
  if (current.workbookId) {
    return current.workbookId;
  }
  const workbookId = randomId();
  await updateWorkbookSettings({ workbookId });
  return workbookId;
}

export async function getWorkbookSettings(): Promise<WorkbookSettings> {
  if (typeof Excel === "undefined" || !Excel.run) {
    return getWorkbookSettingsCached();
  }

  try {
    return await Excel.run(async (context) => {
      const workbookSettings = context.workbook.settings;
      const entries = {
        workbookId: workbookSettings.getItemOrNullObject(SETTING_KEYS.workbookId),
        boundEnvId: workbookSettings.getItemOrNullObject(SETTING_KEYS.boundEnvId),
        boundEnvName: workbookSettings.getItemOrNullObject(SETTING_KEYS.boundEnvName),
        writeModeEnabled: workbookSettings.getItemOrNullObject(SETTING_KEYS.writeModeEnabled),
        lastSyncAt: workbookSettings.getItemOrNullObject(SETTING_KEYS.lastSyncAt),
        defaultEntityContext: workbookSettings.getItemOrNullObject(SETTING_KEYS.defaultEntityContext),
        baseApiUrl: workbookSettings.getItemOrNullObject(SETTING_KEYS.baseApiUrl),
      };

      Object.values(entries).forEach((setting) => setting.load("value,isNullObject"));
      await context.sync();

      const settings: WorkbookSettings = {
        workbookId: entries.workbookId.isNullObject ? "" : asString(entries.workbookId.value),
        boundEnvId: entries.boundEnvId.isNullObject ? "" : asString(entries.boundEnvId.value),
        boundEnvName: entries.boundEnvName.isNullObject ? "" : asString(entries.boundEnvName.value),
        writeModeEnabled: entries.writeModeEnabled.isNullObject
          ? false
          : asBool(entries.writeModeEnabled.value),
        lastSyncAt: entries.lastSyncAt.isNullObject ? "" : asString(entries.lastSyncAt.value),
        defaultEntityContext: entries.defaultEntityContext.isNullObject
          ? ""
          : asString(entries.defaultEntityContext.value),
        baseApiUrl: entries.baseApiUrl.isNullObject
          ? DEFAULT_SETTINGS.baseApiUrl
          : asString(entries.baseApiUrl.value),
      };

      await cacheWorkbookSettings(settings);
      return settings;
    });
  } catch {
    return getWorkbookSettingsCached();
  }
}

export async function updateWorkbookSettings(
  patch: Partial<WorkbookSettings>
): Promise<WorkbookSettings> {
  const merged = {
    ...(await getWorkbookSettings()),
    ...patch,
  } as WorkbookSettings;

  if (typeof Excel !== "undefined" && Excel.run) {
    await Excel.run(async (context) => {
      const settings = context.workbook.settings;
      settings.add(SETTING_KEYS.workbookId, merged.workbookId);
      settings.add(SETTING_KEYS.boundEnvId, merged.boundEnvId);
      settings.add(SETTING_KEYS.boundEnvName, merged.boundEnvName);
      settings.add(SETTING_KEYS.writeModeEnabled, merged.writeModeEnabled);
      settings.add(SETTING_KEYS.lastSyncAt, merged.lastSyncAt);
      settings.add(SETTING_KEYS.defaultEntityContext, merged.defaultEntityContext);
      settings.add(SETTING_KEYS.baseApiUrl, merged.baseApiUrl);
      await context.sync();
    });
  }

  await cacheWorkbookSettings(merged);
  return merged;
}

export async function bindEnvironment(envId: string, envName: string): Promise<WorkbookSettings> {
  return updateWorkbookSettings({ boundEnvId: envId, boundEnvName: envName });
}

export async function setWriteModeEnabled(enabled: boolean): Promise<WorkbookSettings> {
  return updateWorkbookSettings({ writeModeEnabled: enabled });
}

export async function markSyncTime(): Promise<WorkbookSettings> {
  return updateWorkbookSettings({ lastSyncAt: new Date().toISOString() });
}

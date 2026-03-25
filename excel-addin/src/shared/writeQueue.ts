import { MAX_BATCH_SIZE, STORAGE_KEYS } from "./constants";
import { bmApiClient } from "./apiClient";
import { QueuedWrite, SyncSummary, UpsertResponse } from "./types";
import { getStorageJson, setStorageJson } from "./storage";

function queueId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function getQueuedWrites(): Promise<QueuedWrite[]> {
  return getStorageJson<QueuedWrite[]>(STORAGE_KEYS.writeQueue, []);
}

export async function clearQueuedWrites(): Promise<void> {
  await setStorageJson(STORAGE_KEYS.writeQueue, []);
}

export async function enqueueWrite(write: Omit<QueuedWrite, "id" | "createdAt">): Promise<QueuedWrite> {
  const existing = await getQueuedWrites();
  const queued: QueuedWrite = {
    ...write,
    id: queueId(),
    createdAt: new Date().toISOString(),
  };
  existing.push(queued);
  await setStorageJson(STORAGE_KEYS.writeQueue, existing);
  return queued;
}

function chunk<T>(items: T[], size: number): T[][] {
  const grouped: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    grouped.push(items.slice(i, i + size));
  }
  return grouped;
}

function buildGroupKey(item: QueuedWrite): string {
  return JSON.stringify({
    envId: item.envId,
    entity: item.entity,
    keyFields: [...item.keyFields].sort(),
    workbookId: item.workbookId,
  });
}

export async function flushQueuedWrites(): Promise<SyncSummary> {
  const queued = await getQueuedWrites();
  if (!queued.length) {
    return {
      flushed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };
  }

  const groups = new Map<string, QueuedWrite[]>();
  queued.forEach((item) => {
    const key = buildGroupKey(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(item);
  });

  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;
  const remaining: QueuedWrite[] = [];

  for (const [groupKey, groupItems] of groups.entries()) {
    const parsed = JSON.parse(groupKey) as {
      envId: string;
      entity: string;
      keyFields: string[];
      workbookId: string;
    };

    for (const segment of chunk(groupItems, MAX_BATCH_SIZE)) {
      try {
        const response = await bmApiClient.post<UpsertResponse>("/v1/excel/upsert", {
          env_id: parsed.envId || undefined,
          entity: parsed.entity,
          key_fields: parsed.keyFields,
          workbook_id: parsed.workbookId,
          rows: segment.map((item) => item.row),
        });

        const segmentFailed = response.row_errors.length;
        const segmentSucceeded = segment.length - segmentFailed;
        succeeded += segmentSucceeded;
        failed += segmentFailed;

        if (segmentFailed > 0) {
          response.row_errors.forEach((err) => {
            errors.push(`${parsed.entity} row ${err.row_index}: ${err.message}`);
          });

          segment.forEach((item, idx) => {
            if (response.row_errors.find((err) => err.row_index === idx)) {
              remaining.push(item);
            }
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown flush error";
        errors.push(`${parsed.entity}: ${message}`);
        failed += segment.length;
        remaining.push(...segment);
      }
    }
  }

  await setStorageJson(STORAGE_KEYS.writeQueue, remaining);

  return {
    flushed: queued.length,
    succeeded,
    failed,
    errors,
  };
}

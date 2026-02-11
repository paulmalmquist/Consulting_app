export type CodexEvent = {
  type: "status" | "log" | "token" | "final" | "error";
  payload: Record<string, unknown>;
  at: number;
};

export type CodexRun = {
  runId: string;
  contextKey: string;
  prompt: string;
  status: "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  events: CodexEvent[];
  output: string;
  cancelled: boolean;
};

const MAX_RUNS = 50;

type StoreShape = {
  runs: Map<string, CodexRun>;
};

const globalKey = "__bmCodexRuns";

function getStore(): StoreShape {
  const root = globalThis as typeof globalThis & { [globalKey]?: StoreShape };
  if (!root[globalKey]) {
    root[globalKey] = { runs: new Map<string, CodexRun>() };
  }
  return root[globalKey]!;
}

function pruneOldRuns() {
  const store = getStore();
  if (store.runs.size <= MAX_RUNS) return;
  const entries = [...store.runs.values()].sort((a, b) => a.updatedAt - b.updatedAt);
  const removeCount = store.runs.size - MAX_RUNS;
  for (let i = 0; i < removeCount; i += 1) {
    store.runs.delete(entries[i].runId);
  }
}

export function createRun(contextKey: string, prompt: string): CodexRun {
  const runId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `run_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  const run: CodexRun = {
    runId,
    contextKey,
    prompt,
    status: "running",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
    output: "",
    cancelled: false,
  };

  const store = getStore();
  store.runs.set(runId, run);
  pruneOldRuns();
  return run;
}

export function getRun(runId: string): CodexRun | null {
  const store = getStore();
  return store.runs.get(runId) || null;
}

export function appendRunEvent(runId: string, event: CodexEvent): CodexRun | null {
  const run = getRun(runId);
  if (!run) return null;
  run.events.push(event);
  run.updatedAt = Date.now();
  if (event.type === "token") {
    const chunk = typeof event.payload.text === "string" ? event.payload.text : "";
    run.output += chunk;
  }
  return run;
}

export function setRunStatus(runId: string, status: CodexRun["status"]) {
  const run = getRun(runId);
  if (!run) return null;
  run.status = status;
  run.updatedAt = Date.now();
  return run;
}

export function cancelRun(runId: string) {
  const run = getRun(runId);
  if (!run) return null;
  run.cancelled = true;
  run.status = "cancelled";
  run.updatedAt = Date.now();
  return run;
}

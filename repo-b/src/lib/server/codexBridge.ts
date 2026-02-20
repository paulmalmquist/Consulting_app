import {
  appendRunEvent,
  cancelRun,
  createRun,
  getRun,
  setRunStatus,
} from "@/lib/server/codexRunStore";

type AskResponse = {
  answer?: string;
  output_text?: string;
  stdout?: string;
  stderr?: string;
  execution_id?: string;
  log_path?: string;
};

const SIDE_CAR_URL = process.env.AI_SIDECAR_URL || "http://127.0.0.1:7337";
const SIDE_CAR_TOKEN = (process.env.AI_SIDECAR_TOKEN || "").trim();

function sidecarHeaders(contentType?: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (SIDE_CAR_TOKEN) {
    headers.Authorization = `Bearer ${SIDE_CAR_TOKEN}`;
  }
  return headers;
}

export function aiMode(): string {
  return (process.env.AI_MODE || "off").trim().toLowerCase();
}

export function isLocalAiEnabled(): boolean {
  return aiMode() === "local";
}

function inferIntent(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/(schema|migration|ddl|drop table|drop column|drop schema)/.test(p)) return "schema_change";
  if (/(infra|deployment|pipeline|docker|k8s|ci)/.test(p)) return "infra_change";
  if (/(mcp|contract update|tool schema)/.test(p)) return "mcp_contract_update";
  if (/(test|pytest|failing test)/.test(p)) return "test_fix";
  if (/(ui|component|css|layout)/.test(p)) return "ui_refactor";
  if (/(analytics|query|metric)/.test(p)) return "analytics_query";
  if (/(docs|readme|documentation)/.test(p)) return "documentation";
  return "business_logic_update";
}

export async function checkSidecarHealth() {
  if (!isLocalAiEnabled()) {
    return {
      ok: false,
      mode: aiMode(),
      message: "Local-only mode disabled (AI_MODE != local).",
    };
  }

  try {
    const response = await fetch(`${SIDE_CAR_URL}/health`, {
      cache: "no-store",
      headers: sidecarHeaders(),
    });
    if (!response.ok) {
      return { ok: false, mode: aiMode(), message: `Sidecar returned ${response.status}.` };
    }
    const payload = (await response.json()) as { codex_available?: boolean; message?: string };
    return {
      ok: payload.codex_available === true,
      mode: aiMode(),
      message: payload.message || (payload.codex_available ? "Connected" : "Unavailable"),
    };
  } catch {
    return {
      ok: false,
      mode: aiMode(),
      message: "Sidecar not reachable. Run: npm run ai:sidecar",
    };
  }
}

async function runPrompt(runId: string, prompt: string) {
  appendRunEvent(runId, {
    type: "status",
    payload: { state: "running" },
    at: Date.now(),
  });

  if (!isLocalAiEnabled()) {
    setRunStatus(runId, "failed");
    appendRunEvent(runId, {
      type: "error",
      payload: { message: "AI_MODE is not local." },
      at: Date.now(),
    });
    return;
  }

  try {
    const sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}`;
    const response = await fetch(`${SIDE_CAR_URL}/ask`, {
      method: "POST",
      headers: sidecarHeaders("application/json"),
      body: JSON.stringify({
        prompt,
        timeout_ms: 45000,
        session_id: sessionId,
        intent: inferIntent(prompt),
        allowed_directories: ["repo-b/src", "backend", "scripts"],
        auto_approval: false,
        reasoning_effort: "low",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      setRunStatus(runId, "failed");
      appendRunEvent(runId, {
        type: "error",
        payload: {
          message: `Sidecar ask failed (${response.status}).`,
          detail: text.slice(0, 400),
        },
        at: Date.now(),
      });
      return;
    }

    const payload = (await response.json()) as AskResponse;
    const answer = payload.answer || payload.output_text || payload.stdout || "";

    const run = getRun(runId);
    if (!run || run.cancelled) {
      cancelRun(runId);
      appendRunEvent(runId, {
        type: "final",
        payload: { status: "cancelled" },
        at: Date.now(),
      });
      return;
    }

    const chunks = answer
      ? answer.match(/.{1,140}(\s|$)/g) || [answer]
      : ["No output received from local sidecar."];

    for (const chunk of chunks) {
      const current = getRun(runId);
      if (!current || current.cancelled) {
        cancelRun(runId);
        appendRunEvent(runId, {
          type: "final",
          payload: { status: "cancelled" },
          at: Date.now(),
        });
        return;
      }
      appendRunEvent(runId, {
        type: "token",
        payload: { text: chunk },
        at: Date.now(),
      });
    }

    setRunStatus(runId, "completed");
    appendRunEvent(runId, {
      type: "final",
      payload: { status: "completed" },
      at: Date.now(),
    });
  } catch (error) {
    setRunStatus(runId, "failed");
    appendRunEvent(runId, {
      type: "error",
      payload: {
        message: error instanceof Error ? error.message : "Run failed",
      },
      at: Date.now(),
    });
    appendRunEvent(runId, {
      type: "final",
      payload: { status: "failed" },
      at: Date.now(),
    });
  }
}

export function createRunAndStart(contextKey: string, prompt: string) {
  const run = createRun(contextKey, prompt);
  appendRunEvent(run.runId, {
    type: "log",
    payload: { message: "Run accepted." },
    at: Date.now(),
  });
  void runPrompt(run.runId, prompt);
  return run;
}

export async function runPromptDirect(prompt: string): Promise<{ ok: boolean; output: string; error?: string }> {
  if (!isLocalAiEnabled()) {
    return { ok: false, output: "", error: "AI_MODE is not local." };
  }

  try {
    const sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}`;
    const response = await fetch(`${SIDE_CAR_URL}/ask`, {
      method: "POST",
      headers: sidecarHeaders("application/json"),
      body: JSON.stringify({
        prompt,
        timeout_ms: 45000,
        session_id: sessionId,
        intent: inferIntent(prompt),
        allowed_directories: ["repo-b/src", "backend", "scripts"],
        auto_approval: false,
        reasoning_effort: "low",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        output: "",
        error: `Sidecar ask failed (${response.status}): ${text.slice(0, 400)}`,
      };
    }

    const payload = (await response.json()) as AskResponse;
    const answer = payload.answer || payload.output_text || payload.stdout || "";
    return { ok: true, output: answer || "No output received from local sidecar." };
  } catch (error) {
    return {
      ok: false,
      output: "",
      error: error instanceof Error ? error.message : "Run failed",
    };
  }
}

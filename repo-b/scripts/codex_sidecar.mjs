#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const HOST = process.env.AI_SIDECAR_HOST || "127.0.0.1";
const PORT = Number(process.env.AI_SIDECAR_PORT || 7337);
const WORKDIR = process.env.AI_WORKDIR || process.cwd();
const AUTH_TOKEN = (process.env.AI_SIDECAR_TOKEN || "").trim();
const ORCH = process.env.ORCH_RUNNER || path.resolve(WORKDIR, "scripts/codex_orchestrator.py");

function isAuthorized(req) {
  if (!AUTH_TOKEN) return true;
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${AUTH_TOKEN}`;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += String(chunk);
      if (raw.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: WORKDIR, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000);
      settled = true;
      resolve({ ok: false, exitCode: null, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (c) => (stdout += String(c)));
    child.stderr.on("data", (c) => (stderr += String(c)));
    child.on("close", (exitCode) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({ ok: exitCode === 0, exitCode, stdout, stderr });
    });
    child.on("error", (err) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({ ok: false, exitCode: null, stdout, stderr: `${stderr}\n${err.message}` });
    });
  });
}

async function runOrchestrated(payload) {
  const sessionId = (payload.session_id || randomUUID()).trim();
  const intent = (payload.intent || "documentation").trim();
  const allowedDirectories = Array.isArray(payload.allowed_directories) && payload.allowed_directories.length
    ? payload.allowed_directories
    : ["repo-b/src", "backend", "scripts"];
  const autoApproval = Boolean(payload.auto_approval);
  const reasoning = (payload.reasoning_effort || "low").trim();

  const createArgs = [
    ORCH,
    "session",
    "create",
    "--session-id",
    sessionId,
    "--intent",
    intent,
    "--model",
    ["schema_change", "business_logic_update", "mcp_contract_update", "infra_change"].includes(intent) ? "deep" : "fast",
    "--reasoning-effort",
    reasoning,
    "--allowed-directories",
    allowedDirectories.join(","),
    "--allowed-tools",
    "read,edit,shell",
    "--max-files-per-execution",
    String(Number(payload.max_files_per_execution || 25)),
  ];
  if (autoApproval) createArgs.push("--auto-approval");
  const create = await runProcess("python3", createArgs, 30_000);
  if (!create.ok) {
    const validate = await runProcess("python3", [ORCH, "session", "validate", "--session-id", sessionId], 10_000);
    if (!validate.ok) {
      return { ok: false, stderr: create.stderr || create.stdout || "session create failed" };
    }
  }

  const runArgs = [ORCH, "run", "--session-id", sessionId, "--prompt", String(payload.prompt || ""), "--intent", intent, "--simulate"];
  if (payload.plan_preview_id) runArgs.push("--plan-preview-id", String(payload.plan_preview_id));
  if (payload.approval_text) runArgs.push("--approval-text", String(payload.approval_text));
  else if (autoApproval) runArgs.push("--approval-text", "CONFIRM");

  const run = await runProcess("python3", runArgs, Number(payload.timeout_ms || 45_000));
  return run;
}

const server = createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 404, { message: "Not found" });
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    if (!isAuthorized(req)) return sendJson(res, 401, { message: "Unauthorized" });
    const probe = await runProcess("python3", [ORCH, "--help"], 5000);
    return sendJson(res, 200, {
      codex_available: probe.ok,
      message: probe.ok ? "Orchestrator connected" : (probe.stderr || "orchestrator unavailable"),
    });
  }

  if (req.method === "POST" && req.url === "/ask") {
    if (!isAuthorized(req)) return sendJson(res, 401, { message: "Unauthorized" });
    try {
      const payload = await readJson(req);
      if (!String(payload.prompt || "").trim()) return sendJson(res, 400, { message: "prompt is required" });
      const result = await runOrchestrated(payload);
      if (!result.ok) {
        return sendJson(res, 502, { message: "orchestrated run failed", stderr: String(result.stderr || "").slice(-4000) });
      }
      let parsed = {};
      try { parsed = JSON.parse(result.stdout || "{}"); } catch { parsed = { raw: result.stdout || "" }; }
      return sendJson(res, 200, { answer: JSON.stringify(parsed), execution_id: parsed.execution_id, log_path: parsed.log_path });
    } catch (err) {
      return sendJson(res, 500, { message: err instanceof Error ? err.message : "Unexpected error" });
    }
  }

  return sendJson(res, 404, { message: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[codex-sidecar] listening on http://${HOST}:${PORT} (workdir: ${WORKDIR})`);
});

#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

const HOST = process.env.AI_SIDECAR_HOST || "127.0.0.1";
const PORT = Number(process.env.AI_SIDECAR_PORT || 7337);
const WORKDIR = process.env.AI_WORKDIR || process.cwd();

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
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
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
    const child = spawn(command, args, {
      cwd: WORKDIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500);
      settled = true;
      resolve({
        ok: false,
        timedOut: true,
        exitCode: null,
        stdout,
        stderr: `${stderr}\nTimed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({
        ok: false,
        timedOut: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${error.message}`,
      });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

async function runCodexPrompt(prompt, timeoutMs) {
  const outputFile = path.join(os.tmpdir(), `codex_sidecar_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`);
  const args = [
    "exec",
    "--skip-git-repo-check",
    "-C",
    WORKDIR,
    "-o",
    outputFile,
    prompt,
  ];

  const result = await runProcess("codex", args, timeoutMs);
  let answer = "";
  try {
    answer = await fs.readFile(outputFile, "utf8");
  } catch {
    answer = "";
  } finally {
    await fs.unlink(outputFile).catch(() => undefined);
  }

  return {
    ...result,
    answer: answer.trim(),
  };
}

const server = createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 404, { message: "Not found" });

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    const probe = await runProcess("codex", ["--version"], 5000);
    if (probe.ok) {
      return sendJson(res, 200, {
        codex_available: true,
        message: "Connected",
      });
    }
    return sendJson(res, 200, {
      codex_available: false,
      message: probe.stderr.trim() || "codex command unavailable",
    });
  }

  if (req.method === "POST" && req.url === "/ask") {
    try {
      const payload = await readJson(req);
      const prompt = String(payload?.prompt || "").trim();
      const timeoutMs = Number(payload?.timeout_ms || 45000);
      if (!prompt) return sendJson(res, 400, { message: "prompt is required" });

      const result = await runCodexPrompt(prompt, Number.isFinite(timeoutMs) ? timeoutMs : 45000);
      if (!result.ok) {
        return sendJson(res, 502, {
          message: result.timedOut ? "codex prompt timed out" : "codex prompt failed",
          stderr: result.stderr.slice(-4000),
          exit_code: result.exitCode,
        });
      }
      return sendJson(res, 200, {
        answer: result.answer || result.stdout.trim() || "No response",
      });
    } catch (error) {
      return sendJson(res, 500, {
        message: error instanceof Error ? error.message : "Unexpected error",
      });
    }
  }

  return sendJson(res, 404, { message: "Not found" });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[codex-sidecar] listening on http://${HOST}:${PORT} (workdir: ${WORKDIR})`);
});

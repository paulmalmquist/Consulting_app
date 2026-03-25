#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";
import { execFileSync } from "node:child_process";

const CONFIG_PATH = "/Users/paulmalmquist/.openclaw/openclaw.json";
const OPERATOR_ID = "8672815280";
const TOPICS = [
  { name: "Research", agentId: "architect-winston", requireMention: false },
  { name: "Builds", agentId: "builder-winston", requireMention: false },
  { name: "Client Ops", agentId: "operations", requireMention: false },
  { name: "Sales", agentId: "outreach", requireMention: false },
  { name: "Status", agentId: "commander-winston", requireMention: true },
];

function usage() {
  console.error("usage: openclaw_setup_forum.mjs --chat-id <telegram-supergroup-id> [--dry-run]");
  process.exit(64);
}

function parseArgs(argv) {
  const args = { dryRun: false, chatId: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--chat-id") {
      args.chatId = argv[i + 1] || "";
      i += 1;
      continue;
    }
  }
  return args;
}

function telegramCall(token, method, params) {
  const body = JSON.stringify(params);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data || "{}");
            if (!parsed.ok) {
              reject(new Error(parsed.description || `${method} failed`));
              return;
            }
            resolve(parsed.result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function ensureArrayEntry(list, value) {
  if (!Array.isArray(list)) {
    return [value];
  }
  return list.includes(value) ? list : [...list, value];
}

function upsertMorningBrief(chatId, statusTopicId) {
  const list = JSON.parse(execFileSync("openclaw", ["cron", "list", "--json"], { encoding: "utf8" }));
  for (const job of list.jobs || []) {
    if (job.name === "Novendor Morning Brief") {
      execFileSync("openclaw", ["cron", "rm", job.id], { stdio: "inherit" });
    }
  }

  execFileSync(
    "openclaw",
    [
      "cron",
      "add",
      "--name",
      "Novendor Morning Brief",
      "--agent",
      "operations",
      "--cron",
      "0 7 * * *",
      "--tz",
      "America/New_York",
      "--session",
      "isolated",
      "--message",
      "Run the Lobster morning brief workflow and summarize it for operators.",
      "--announce",
      "--channel",
      "telegram",
      "--to",
      `${chatId}:topic:${statusTopicId}`,
      "--light-context",
      "--thinking",
      "low",
    ],
    { stdio: "inherit" },
  );
}

async function main() {
  const { chatId, dryRun } = parseArgs(process.argv.slice(2));
  if (!chatId) usage();

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const token = config?.channels?.telegram?.botToken;
  if (!token) {
    throw new Error("Telegram bot token is missing from OpenClaw config");
  }

  const createdTopics = [];
  if (!dryRun) {
    for (const topic of TOPICS) {
      const result = await telegramCall(token, "createForumTopic", {
        chat_id: chatId,
        name: topic.name,
      });
      createdTopics.push({ ...topic, topicId: String(result.message_thread_id) });
    }
  }

  const topicMap = {
    "1": {
      agentId: "commander-winston",
      requireMention: true,
    },
  };
  for (const topic of createdTopics) {
    topicMap[topic.topicId] = {
      agentId: topic.agentId,
      requireMention: topic.requireMention,
    };
  }

  config.channels.telegram.groupAllowFrom = ensureArrayEntry(config.channels.telegram.groupAllowFrom, OPERATOR_ID);
  config.channels.telegram.groups = config.channels.telegram.groups || {};
  config.channels.telegram.groups[chatId] = {
    ...(config.channels.telegram.groups[chatId] || {}),
    groupPolicy: "allowlist",
    allowFrom: [OPERATOR_ID],
    requireMention: true,
    topics: {
      ...(config.channels.telegram.groups[chatId]?.topics || {}),
      ...topicMap,
    },
  };
  config.channels.telegram.capabilities = {
    ...(config.channels.telegram.capabilities || {}),
    inlineButtons: "all",
  };

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  if (dryRun) {
    process.stdout.write(serialized);
    return;
  }

  fs.writeFileSync(CONFIG_PATH, serialized);
  execFileSync("openclaw", ["config", "validate"], { stdio: "inherit" });

  const statusTopic = createdTopics.find((topic) => topic.name === "Status");
  if (statusTopic) {
    upsertMorningBrief(chatId, statusTopic.topicId);
  }

  process.stdout.write(
    JSON.stringify({
      chatId,
      topics: createdTopics,
      configPath: CONFIG_PATH,
    }, null, 2),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

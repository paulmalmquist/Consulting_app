import { NextResponse } from "next/server";
import type {
  PublicAssistantRequest,
  PublicAssistantResponse,
} from "@/lib/public-assistant/types";
import {
  PUBLIC_ASSISTANT_PROMPT_VERSION,
  PUBLIC_ASSISTANT_SYSTEM_PROMPT,
} from "@/lib/public-assistant/prompt";
import { appendPublicAssistantAudit } from "@/lib/server/publicBoundaryStore";

export const runtime = "nodejs";

const MUTATION_INTENT_RE = /\b(create|delete|remove|update|edit|modify|run|execute|deploy|apply|commit|write)\b/i;

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function redactSensitiveText(input: string) {
  let out = input;
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[internal-id]");
  out = out.replace(/https?:\/\/[^\s)]+/gi, "[internal-url]");
  out = out.replace(/\b(?:api|token|secret|key)\b[:=]\s*[^\s,]+/gi, "[redacted]");
  return out;
}

function structuredAnswer(question: string, audience: string) {
  const scope = redactSensitiveText(question.trim());
  return [
    `Audience: ${audience}`,
    "",
    "Department",
    "Focus the request on one primary operating department first (e.g., Operations, Finance, Legal) and define ownership boundaries before automating cross-functional flow.",
    "",
    "Capability",
    "Model this as a modular capability with explicit inputs, outputs, and control points so the same pattern can be reused across tenants.",
    "",
    "Workflow",
    `Break "${scope}" into deterministic workflow stages with human approval checkpoints where risk is high.`,
    "",
    "Data Layer",
    "Use a canonical operational model plus ingestion adapters for source systems; separate tenant data from shared reference metadata.",
    "",
    "Evidence and Audit Requirements",
    "Capture immutable event logs for each state transition, include actor attribution, before/after deltas, and decision rationale.",
    "",
    "User Experience Surface",
    "Expose a plan-first execution surface with explicit confirmation, progress timelines, and verification outputs rather than black-box actions.",
    "",
    "Integration Impact Across Business OS",
    "Assess downstream impact on department dependencies, templates, and environment configuration before rollout.",
    "",
    "Architecture Recommendations",
    "Start with a read-only discovery path, then introduce guarded mutations behind confirmation tokens and idempotency keys.",
    "",
    "Data Model Implications",
    "Define first-class records for environments, departments, capabilities, and execution events, with append-only audit relations.",
    "",
    "API Implications",
    "Separate public advisory endpoints from private execution endpoints; enforce auth server-side on mutation routes.",
    "",
    "Frontend Implications",
    "Keep public views advisory and route execution affordances to authenticated workspace surfaces.",
    "",
    "Governance Considerations",
    "Formalize risk tiers (low/medium/high), confirmation policy, and incident rollback procedures.",
    "",
    "Risks and Mitigations",
    "Primary risks are ambiguous intent, unauthorized mutation, and weak traceability; mitigate with clarification prompts, strict auth gates, and durable audit logging.",
    "",
    "Why This Design Works",
    "It keeps public value high while preserving operational integrity and tenant safety in private execution layers.",
    "",
    "Trade-offs and Failure Modes",
    "This approach favors controlled rollout over speed; failure occurs when identity, context, or audit persistence are bypassed.",
    "",
    "Industry Scale Notes",
    "The same architecture scales to real estate PE, legal, healthcare, finance, construction, and project services by swapping department templates while preserving execution controls.",
  ].join("\n");
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Partial<PublicAssistantRequest>;
  const question = String(payload.question || "").trim();
  const audience = String(payload.audience || "COO/CTO/Head of Operations").trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const response_id = randomId("pub_resp");
  const generated_at = new Date().toISOString();

  const blocked = MUTATION_INTENT_RE.test(question);
  const answer = blocked
    ? [
        "This public assistant is advisory only.",
        "",
        "To create, delete, update, run, or execute operational changes, sign in to your private Business Machine workspace where plan/confirm/execute controls are enforced.",
        "",
        "Public mode can still help you design the architecture, governance model, and transition plan before execution.",
      ].join("\n")
    : structuredAnswer(question, audience);

  const redactedAnswer = redactSensitiveText(answer);

  const response: PublicAssistantResponse = {
    response_id,
    prompt_version: PUBLIC_ASSISTANT_PROMPT_VERSION,
    policy: blocked
      ? {
          action: "blocked",
          reason: "Mutation intent detected in public advisory mode.",
          redactions_applied: redactedAnswer !== answer,
        }
      : {
          action: "allow",
          reason: "Read-only advisory request.",
          redactions_applied: redactedAnswer !== answer,
        },
    answer: redactedAnswer,
    generated_at,
  };

  appendPublicAssistantAudit({
    response_id,
    prompt_version: PUBLIC_ASSISTANT_PROMPT_VERSION,
    policy_action: response.policy.action,
    policy_reason: response.policy.reason,
    question_preview: redactSensitiveText(question).slice(0, 240),
    prompt_checksum: PUBLIC_ASSISTANT_SYSTEM_PROMPT.length,
  });

  return NextResponse.json(response);
}

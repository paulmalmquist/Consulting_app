import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import AdvancedDrawer from "@/components/commandbar/AdvancedDrawer";
import type { AskAiDebug, WinstonTrace } from "@/lib/commandbar/assistantApi";

const baseTrace: WinstonTrace = {
  execution_path: "chat",
  lane: "C",
  model: "gpt-5-mini",
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  tool_call_count: 1,
  tool_timeline: [],
  data_sources: [],
  citations: [],
  rag_chunks_used: 0,
  warnings: ["retrieval_empty"],
  elapsed_ms: 1200,
  resolved_scope: {
    resolved_scope_type: "fund",
    environment_id: "env_123",
    business_id: "biz_123",
    schema_name: null,
    industry: null,
    entity_type: "fund",
    entity_id: "fund_1",
    entity_name: "Fund One",
    confidence: 0.93,
    source: "selected_ui_entity",
  },
  repe: null,
  visible_context_shortcut: false,
  runtime: {
    backend_gateway_reached: true,
    canonical_runtime: true,
    degraded: true,
    tools_enabled: true,
    rag_enabled: true,
  },
  response_block_count: 1,
};

const baseDebug: AskAiDebug = {
  toolCalls: [],
  toolResults: [],
  citations: [],
  trace: baseTrace,
  turnReceipt: {
    request_id: "req_123",
    lane: "C_ANALYSIS",
    context: {
      environment_id: "env_123",
      entity_type: "fund",
      entity_id: "fund_1",
      resolution_status: "resolved",
      notes: [],
    },
    skill: {
      skill_id: "run_analysis",
      confidence: 0.8,
      triggers_matched: ["scenario"],
    },
    tools: [
      {
        tool_name: "eval.synthetic_failure",
        status: "failed",
        permission_mode: "analyze",
        input: { foo: "bar" },
        output: null,
        error: "tool exploded",
      },
    ],
    retrieval: {
      used: true,
      result_count: 0,
      status: "empty",
    },
    status: "degraded",
    degraded_reason: "retrieval_empty",
  },
  eventLog: [],
  resolvedScope: baseTrace.resolved_scope,
  contextEnvelope: null,
};

test("AdvancedDrawer renders canonical turn receipt fields", () => {
  render(
    <AdvancedDrawer
      open
      context={null}
      traces={[]}
      raw={{}}
      flags={{ useCodexServer: true, useMocks: false }}
      assistantDebug={baseDebug}
      diagnostics={[]}
      runningDiagnostics={false}
      onRunDiagnostics={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Overview/i }));
  expect(screen.getByText("Canonical Turn Receipt")).toBeInTheDocument();
  expect(screen.getByText("C_ANALYSIS")).toBeInTheDocument();
  expect(screen.getByText("run_analysis")).toBeInTheDocument();
  expect(screen.getAllByText("retrieval_empty").length).toBeGreaterThan(0);
  expect(screen.getByText(/Resolved Scope/i)).toBeInTheDocument();
});

test("AdvancedDrawer survives malformed tool receipt output", () => {
  const malformedDebug: AskAiDebug = {
    ...baseDebug,
    turnReceipt: {
      ...baseDebug.turnReceipt!,
      tools: [
        {
          tool_name: "eval.synthetic_failure",
          status: "failed",
          permission_mode: "analyze",
          input: { nested: { a: 1 } },
          output: { circular: "[redacted]" },
          error: "tool exploded",
        },
      ],
    },
  };

  render(
    <AdvancedDrawer
      open
      context={null}
      traces={[]}
      raw={{}}
      flags={{ useCodexServer: true, useMocks: false }}
      assistantDebug={malformedDebug}
      diagnostics={[]}
      runningDiagnostics={false}
      onRunDiagnostics={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Trace/i }));
  fireEvent.click(screen.getByRole("button", { name: /Tool Receipts/i }));
  expect(screen.getByText("eval.synthetic_failure")).toBeInTheDocument();
  expect(screen.getByText(/tool exploded/i)).toBeInTheDocument();
});

test("AdvancedDrawer fails visibly when receipt fields are missing", () => {
  const malformedDebug = {
    ...baseDebug,
    trace: null,
    turnReceipt: {
      ...baseDebug.turnReceipt!,
      lane: undefined,
      skill: undefined,
      retrieval: undefined,
    },
  } as unknown as AskAiDebug;

  render(
    <AdvancedDrawer
      open
      context={null}
      traces={[]}
      raw={{}}
      flags={{ useCodexServer: true, useMocks: false }}
      assistantDebug={malformedDebug}
      diagnostics={[]}
      runningDiagnostics={false}
      onRunDiagnostics={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Overview/i }));
  expect(screen.getAllByText(/Missing from receipt/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Missing lane/i)).toBeInTheDocument();
});

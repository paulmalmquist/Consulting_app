"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  AgentGraph,
  AgentGraphNode,
  AgentEvalRun,
  AgentNodeType,
  AgentReceipt,
  AgentRun,
  AgentRunStep,
  McpTool,
  PaletteNode,
  ValidationResult,
  WorkflowDetail,
  WorkflowSummary,
  createWorkflow,
  dryRunWorkflow,
  getMcpTools,
  getPalette,
  getRun,
  getRuns,
  getWorkflow,
  getWorkflowEvals,
  getWorkflows,
  promoteRunFailure,
  runWorkflowEvals,
  saveWorkflowDraft,
  stageWorkflow,
  validateWorkflow,
} from "@/lib/telemetry/agentBuilder-api";
import { C, EmptyState, ErrorState, Loading, MetricCard, Panel, PageHeading, StatGrid, Tag } from "./primitives";

export type ControlTowerTab =
  | "builder"
  | "registry"
  | "history"
  | "tools"
  | "evals";

const STATUS_COLOR: Record<string, string> = {
  running: C.cyan,
  completed: C.green,
  succeeded: C.green,
  blocked: C.amber,
  warning: C.amber,
  failed: C.red,
  not_available: C.amber,
  skipped: C.faint,
};

const inputStyle = {
  width: "100%",
  background: C.bg,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "7px 9px",
  fontFamily: C.mono,
  fontSize: 11,
};

const buttonStyle = (color: string, disabled = false) => ({
  background: `${color}18`,
  border: `1px solid ${color}55`,
  color,
  borderRadius: 6,
  padding: "7px 11px",
  fontFamily: C.mono,
  fontSize: 11,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.45 : 1,
});

type BuilderNodeData = {
  label: string;
  nodeType: AgentNodeType;
  displayLabel: string;
  config: Record<string, unknown>;
  state: string;
};

function AgentGraphNodeView({ data }: NodeProps<Node<BuilderNodeData>>) {
  const color = STATUS_COLOR[data.state] || "#6b7280";
  const source = (id: string, top: string) => (
    <Handle
      type="source"
      id={id}
      position={Position.Right}
      style={{ top, width: 9, height: 9, background: color, borderColor: C.bg }}
    />
  );
  return (
    <div style={{ minWidth: 150, position: "relative" }}>
      {data.nodeType !== "manual_trigger" && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 9, height: 9, background: color, borderColor: C.bg }}
        />
      )}
      <div style={{ fontFamily: C.mono, fontSize: 9, color, textTransform: "uppercase" }}>
        {data.state}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text, marginTop: 3 }}>
        {data.displayLabel}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, marginTop: 3 }}>
        {data.nodeType}
      </div>
      {data.nodeType === "policy_gate" ? (
        <>
          {source("pass", "38%")}
          {source("fail", "76%")}
          <span style={{ position: "absolute", right: 8, top: "28%", color: C.green, fontFamily: C.mono, fontSize: 8 }}>pass</span>
          <span style={{ position: "absolute", right: 8, top: "66%", color: C.red, fontFamily: C.mono, fontSize: 8 }}>fail</span>
        </>
      ) : data.nodeType === "cost_guardrail" ? (
        <>
          {source("under_budget", "38%")}
          {source("over_budget", "76%")}
          <span style={{ position: "absolute", right: 8, top: "28%", color: C.green, fontFamily: C.mono, fontSize: 8 }}>under</span>
          <span style={{ position: "absolute", right: 8, top: "66%", color: C.amber, fontFamily: C.mono, fontSize: 8 }}>over</span>
        </>
      ) : data.nodeType !== "output" ? source("next", "50%") : null}
    </div>
  );
}

const NODE_TYPES = { agent: AgentGraphNodeView };

function graphNodeToFlow(
  node: AgentGraphNode,
  steps: AgentRunStep[] = [],
): Node<BuilderNodeData> {
  const state = steps.find((step) => step.node_id === node.id)?.status || "idle";
  const color = STATUS_COLOR[state] || "#6b7280";
  return {
    id: node.id,
    type: "agent",
    position: node.position,
    data: {
      label: node.label || node.type,
      nodeType: node.type,
      displayLabel: node.label || node.type,
      config: node.config,
      state,
    },
    style: {
      color: C.text,
      background: C.panel,
      border: `1px solid ${color}`,
      borderRadius: 8,
      boxShadow: state === "running" ? `0 0 0 3px ${C.cyan}22` : "none",
    },
  };
}

function flowToGraph(
  nodes: Node<BuilderNodeData>[],
  edges: Edge[],
  current?: AgentGraph,
): AgentGraph {
  return {
    schema_version: "agent-graph/v1",
    limits: current?.limits || { max_runtime_seconds: 120, max_tool_calls: 10, max_cost_usd: 1 },
    model_route_policy: current?.model_route_policy || { sensitive_fallback: "fail_closed" },
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      label: node.data.displayLabel,
      position: node.position,
      config: node.data.config,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: edge.sourceHandle,
      target_handle: edge.targetHandle,
      data_type: "control",
    })),
  };
}

function RegistryView({
  workflows,
  onOpen,
}: {
  workflows: WorkflowSummary[];
  onOpen: (workflowId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      {workflows.map((workflow) => (
        <button
          type="button"
          key={workflow.id}
          onClick={() => onOpen(workflow.id)}
          style={{
            textAlign: "left",
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 14,
            color: C.text,
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontFamily: C.mono, fontSize: 13 }}>{workflow.name}</strong>
            <Tag color={workflow.validation_status === "pass" ? C.green : C.amber}>v{workflow.version_number}</Tag>
          </div>
          <p style={{ color: C.dim, fontFamily: C.sans, fontSize: 12, minHeight: 34 }}>
            {workflow.description || "No description"}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Tag color={C.cyan}>{workflow.status}</Tag>
            <Tag color={workflow.validation_status === "pass" ? C.green : C.red}>
              graph {workflow.validation_status}
            </Tag>
            <Tag color={STATUS_COLOR[workflow.last_run_status || "skipped"]}>
              last {workflow.last_run_status || "not run"}
            </Tag>
            <Tag color={workflow.eval_overall_status === "staged_ready" ? C.green : C.amber}>
              evals {workflow.eval_overall_status || "not run"}
            </Tag>
          </div>
        </button>
      ))}
    </div>
  );
}

function RunHistoryView({ runs, onInspect }: { runs: AgentRun[]; onInspect: (id: string) => void }) {
  if (!runs.length) return <EmptyState label="No Agent Builder runs" hint="Dry-run a saved workflow to create a trace." />;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {runs.map((run) => (
        <button
          type="button"
          key={run.id}
          onClick={() => onInspect(run.id)}
          className="agent-run-row"
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr .6fr .5fr 1fr",
            gap: 10,
            alignItems: "center",
            textAlign: "left",
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 11,
            color: C.text,
            cursor: "pointer",
            fontFamily: C.mono,
            fontSize: 11,
          }}
        >
          <span>{run.workflow_name}</span>
          <Tag color={STATUS_COLOR[run.status] || C.dim}>{run.status}</Tag>
          <span>v{run.version_number}</span>
          <span style={{ color: C.faint }}>{new Date(run.started_at).toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

function ToolRegistryView({ tools }: { tools: McpTool[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {tools.map((tool) => (
        <div key={tool.name} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <code style={{ color: C.text }}>{tool.name}</code>
            <Tag color={tool.enabled ? C.green : C.red}>{tool.enabled ? "read · enabled" : "write · blocked"}</Tag>
          </div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 6 }}>{tool.description}</div>
          <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, marginTop: 6 }}>
            schema {tool.schema_digest.slice(0, 16)}… · {tool.module}
          </div>
        </div>
      ))}
    </div>
  );
}

const EVAL_LABELS: Record<string, string> = {
  graph_lint: "Graph validation",
  tool_contract: "Tool contracts",
  permission: "Permission checks",
  fail_closed: "Fail-closed behavior",
  cost: "Cost guardrail",
  regression: "Regression cases",
  replay_determinism: "Replay determinism",
  rag_grounding: "RAG grounding",
  visual_smoke: "Visual smoke",
  production_smoke: "Production smoke",
};

function EvalsView({
  workflow,
  evalRun,
  busy,
  onRun,
  onInspectTrace,
}: {
  workflow: WorkflowDetail | null;
  evalRun: AgentEvalRun | null;
  busy: boolean;
  onRun: () => void;
  onInspectTrace: (runId: string) => void;
}) {
  const summary = evalRun?.summary_json;
  const failed = evalRun?.results.filter((result) => result.status === "fail") || [];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Panel
        title="Publish readiness"
        right={(
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <Tag color={evalRun?.overall_status === "staged_ready" ? C.green : C.red}>
              {evalRun?.overall_status === "staged_ready" ? "STAGED READY" : "BLOCKED"}
            </Tag>
            <button
              type="button"
              style={buttonStyle(C.cyan, busy || !workflow)}
              disabled={busy || !workflow}
              onClick={onRun}
            >
              {busy ? "Running…" : "Run Evals"}
            </button>
          </div>
        )}
      >
        <div style={{ display: "grid", gap: 8 }}>
          {Object.entries(EVAL_LABELS).map(([evalClass, label]) => {
            const value = summary?.by_class[evalClass] || "not_run";
            const display = value === "not_applicable" ? "N/A" : value.replace("_", " ").toUpperCase();
            return (
              <div key={evalClass} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 12 }}>
                <span style={{ color: C.dim }}>{label}</span>
                <span style={{ color: value === "pass" ? C.green : value === "fail" ? C.red : C.faint }}>{display}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, color: C.faint, fontFamily: C.mono, fontSize: 10 }}>
          Staging requires all deterministic classes to pass. Visual and production smoke remain N/A; production publication stays disabled.
        </div>
      </Panel>

      {failed.length > 0 && (
        <Panel title="Failed cases" right={<Tag color={C.red}>{failed.length} blocking</Tag>}>
          <div style={{ display: "grid", gap: 9 }}>
            {failed.map((result) => (
              <div key={result.id || result.eval_case_id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{result.title}</strong>
                  <Tag color={C.red}>FAIL</Tag>
                </div>
                <div style={{ color: C.red, fontFamily: C.mono, fontSize: 10, marginTop: 7 }}>
                  {result.failed_assertion || "Assertion failed"}
                </div>
                <details style={{ marginTop: 7 }}>
                  <summary style={{ color: C.dim, cursor: "pointer", fontFamily: C.mono, fontSize: 10 }}>
                    Input / expected / actual
                  </summary>
                  <pre style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify({
                      input: result.input_json,
                      expected: result.expected_json,
                      actual: result.actual_json,
                    }, null, 2)}
                  </pre>
                </details>
                {result.trace_run_id && (
                  <button type="button" style={buttonStyle(C.cyan)} onClick={() => onInspectTrace(result.trace_run_id!)}>
                    Open trace {result.trace_run_id}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function AgentBuilder({ tab, onOpenBuilder }: { tab: ControlTowerTab; onOpenBuilder: () => void }) {
  const [palette, setPalette] = useState<PaletteNode[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [evalRun, setEvalRun] = useState<AgentEvalRun | null>(null);
  const [promotedRunIds, setPromotedRunIds] = useState<string[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BuilderNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState("FD001-test-001");
  const [channel, setChannel] = useState("D-4");
  const [sample, setSample] = useState<"nominal" | "anomaly">("anomaly");

  const loadWorkflow = useCallback(async (workflowId: string) => {
    setBusy("load");
    try {
      const detail = await getWorkflow(workflowId);
      const evals = await getWorkflowEvals(workflowId);
      setWorkflow(detail);
      setEvalRun(evals);
      setValidation(detail.validation_results || null);
      setNodes(detail.graph.nodes.map((node) => graphNodeToFlow(node)));
      setEdges(detail.graph.edges.map((edge, index) => ({
        id: edge.id || `edge-${index}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.source_handle || undefined,
        targetHandle: edge.target_handle || undefined,
        animated: false,
        style: { stroke: C.faint },
      })));
      setSelectedId(null);
      setRun(null);
      return detail;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  }, [setEdges, setNodes]);

  const refresh = useCallback(async () => {
    setError(null);
    // Bootstrap each surface independently: a failure in one call (e.g. tenant context
    // unresolved, or schema not migrated) must not blank the whole builder. Whatever
    // resolves still renders; only the parts that genuinely failed surface a banner.
    const [paletteResult, toolResult, workflowResult, runResult] = await Promise.allSettled([
      getPalette(),
      getMcpTools(),
      getWorkflows(),
      getRuns(),
    ]);
    if (paletteResult.status === "fulfilled") setPalette(paletteResult.value.nodes);
    if (toolResult.status === "fulfilled") setTools(toolResult.value.tools);
    let firstWorkflowId: string | null = null;
    if (workflowResult.status === "fulfilled") {
      setWorkflows(workflowResult.value.workflows);
      firstWorkflowId = workflowResult.value.workflows[0]?.id ?? null;
    }
    if (runResult.status === "fulfilled") setRuns(runResult.value.runs);

    const failures = [paletteResult, toolResult, workflowResult, runResult].filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length) {
      const detail = failures[0].reason;
      const detailMessage = detail instanceof Error ? detail.message : String(detail);
      setError(
        "Context required — select an environment or reload from a valid telemetry environment. " +
          `Read-only demo templates and palette remain available where they loaded. (${detailMessage})`,
      );
    }
    try {
      if (!workflow && firstWorkflowId) {
        await loadWorkflow(firstWorkflowId);
      }
    } finally {
      setLoading(false);
    }
  }, [loadWorkflow, workflow]);

  useEffect(() => {
    void refresh();
    // Initial load only. Subsequent refreshes are explicit after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge({ ...connection, style: { stroke: C.faint } } as Edge, current),
      ),
    [setEdges],
  );

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) || null, [nodes, selectedId]);

  const addNode = (item: PaletteNode) => {
    const id = `${item.type}_${Date.now().toString(36)}`;
    const readTool = tools.find((tool) => tool.enabled);
    const config: Record<string, unknown> =
      item.type === "mcp_tool" && readTool
        ? { tool_name: readTool.name, tool_schema_digest: readTool.schema_digest, bindings: {} }
        : item.type === "prompt_llm"
          ? {
              prompt_template: "Return a bounded JSON summary for: {{input.question}}",
              prompt_version: "custom/v1",
              mode: "classification",
              privacy: "internal",
              output_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
            }
          : item.type === "policy_gate"
            ? { policy: "read_only_only" }
            : item.type === "cost_guardrail"
              ? { max_cost_usd: 1, estimated_next_cost_usd: 0 }
              : {};
    setNodes((current) => [
      ...current,
      graphNodeToFlow({
        id,
        type: item.type,
        label: item.label,
        position: { x: 180 + current.length * 28, y: 180 + current.length * 20 },
        config,
      }),
    ]);
    setSelectedId(id);
  };

  const updateSelected = (patch: { label?: string; config?: Record<string, unknown> }) => {
    if (!selectedId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedId
          ? {
              ...node,
              data: {
                ...node.data,
                displayLabel: patch.label ?? node.data.displayLabel ?? node.data.nodeType,
                label: patch.label ?? node.data.displayLabel ?? node.data.nodeType,
                config: patch.config ?? node.data.config,
              },
            }
          : node,
      ),
    );
  };

  const save = async () => {
    const graph = flowToGraph(nodes, edges, workflow?.graph);
    setBusy("save");
    setError(null);
    try {
      const saved = workflow
        ? await saveWorkflowDraft(workflow.id, {
            base_version_number: workflow.version_number,
            graph,
          })
        : await createWorkflow({ name: "Untitled Agent", graph, tags: ["read-only-mvp"] });
      setWorkflow(saved);
      setValidation(saved.validation_results || null);
      setEvalRun(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const validate = async () => {
    if (!workflow) {
      setError("Save the workflow before validation.");
      return;
    }
    setBusy("validate");
    try {
      setValidation(await validateWorkflow(workflow.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const dryRun = async () => {
    if (!workflow) {
      setError("Save the workflow before dry-run.");
      return;
    }
    const window = Array.from({ length: 60 }, (_, t) => ({
      t,
      value: Number((sample === "anomaly" && t >= 55 ? 1 + (t - 54) * 0.6 : 1 + ((t % 5) - 2) * 0.002).toFixed(4)),
    }));
    setBusy("run");
    try {
      const result = await dryRunWorkflow(workflow.id, {
        run_key: runKey,
        channel,
        sample_window: sample,
        window,
        question: "Assess this governed workflow.",
        request: "Classify this sensitive request.",
      });
      setRun(result);
      setNodes(workflow.graph.nodes.map((node) => graphNodeToFlow(node, result.steps || [])));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const inspectRun = async (runId: string) => {
    try {
      const detail = await getRun(runId);
      let activeWorkflow = workflow;
      if (detail.workflow_id !== workflow?.id) {
        activeWorkflow = await loadWorkflow(detail.workflow_id);
      }
      setRun(detail);
      if (activeWorkflow) {
        setNodes(activeWorkflow.graph.nodes.map((node) => graphNodeToFlow(node, detail.steps || [])));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runEvals = async () => {
    if (!workflow) {
      setError("Select a saved workflow before running evals.");
      return;
    }
    setBusy("evals");
    setError(null);
    try {
      const result = await runWorkflowEvals(workflow.id);
      setEvalRun(result);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const stage = async () => {
    if (!workflow || evalRun?.overall_status !== "staged_ready") {
      setError("Run passing publish-readiness evals before staging.");
      return;
    }
    setBusy("stage");
    setError(null);
    try {
      const staged = await stageWorkflow(workflow.id);
      setWorkflow(staged);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const promoteFailure = async () => {
    if (!run) return;
    setBusy("promote");
    setError(null);
    try {
      await promoteRunFailure(run.id);
      setPromotedRunIds((current) => current.includes(run.id) ? current : [...current, run.id]);
      if (workflow) {
        setEvalRun(await getWorkflowEvals(workflow.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ padding: 24 }}><Loading /></div>;

  const title = {
    builder: "Agent Builder",
    registry: "Agent Registry",
    history: "Run History",
    tools: "Tool Registry",
    evals: "Evals",
  }[tab];

  return (
    <div style={{ padding: 24, background: C.bg, minHeight: "100%", color: C.text }}>
      <PageHeading
        eyebrow="Agent Control Tower · governed workflows"
        title={title}
        blurb="Typed, permissioned, versioned, auditable agent workflows. MVP execution is synchronous, read-only, and dry-run only."
        right={<Tag color={C.amber}>read-only MVP</Tag>}
      />
      {error && <div style={{ marginBottom: 12 }}><ErrorState message={error} /></div>}

      {tab === "registry" && (
        <RegistryView workflows={workflows} onOpen={(id) => { void loadWorkflow(id); onOpenBuilder(); }} />
      )}
      {tab === "history" && (
        <div style={{ display: "grid", gap: 10 }}>
          <RunHistoryView runs={runs} onInspect={(id) => void inspectRun(id)} />
          {run && (
            <Panel title={`Run trace · ${run.workflow_name}`} right={<Tag color={STATUS_COLOR[run.status] || C.dim}>{run.status}</Tag>}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, marginBottom: 7 }}>STEPS</div>
                  {(run.steps || []).map((step) => (
                    <div key={step.id} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10, marginBottom: 5 }}>
                      <span>{step.node_id}</span>
                      <span style={{ color: STATUS_COLOR[step.status] || C.dim }}>{step.status}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, marginBottom: 7 }}>RECEIPTS</div>
                  {(run.receipts || []).map((receipt) => (
                    <div key={receipt.id} style={{ fontFamily: C.mono, fontSize: 10, marginBottom: 5 }}>
                      <span style={{ color: C.text }}>{receipt.node_id}</span>
                      <span style={{ color: C.faint }}> · {receipt.receipt_type} · {receipt.id}</span>
                    </div>
                  ))}
                  {["failed", "blocked", "not_available"].includes(run.status) && (
                    <button
                      type="button"
                      style={{ ...buttonStyle(C.amber, busy === "promote" || promotedRunIds.includes(run.id)), marginTop: 9 }}
                      disabled={busy === "promote" || promotedRunIds.includes(run.id)}
                      onClick={() => void promoteFailure()}
                    >
                      {promotedRunIds.includes(run.id) ? "Promoted to regression" : "Promote failure to regression"}
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}
      {tab === "tools" && <ToolRegistryView tools={tools} />}
      {tab === "evals" && (
        <EvalsView
          workflow={workflow}
          evalRun={evalRun}
          busy={busy === "evals"}
          onRun={() => void runEvals()}
          onInspectTrace={(runId) => void inspectRun(runId)}
        />
      )}

      {tab === "builder" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                aria-label="Saved workflow"
                style={{ ...inputStyle, width: 300 }}
                value={workflow?.id || ""}
                onChange={(event) => void loadWorkflow(event.target.value)}
              >
                {workflows.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version_number}</option>)}
              </select>
              {workflow && <Tag color={C.cyan}>owner {workflow.owner_user_id || "unknown"}</Tag>}
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <button type="button" style={buttonStyle(C.cyan, !!busy)} disabled={!!busy} onClick={() => void save()}>
                {busy === "save" ? "Saving…" : "Save Draft"}
              </button>
              <button type="button" style={buttonStyle(C.green, !!busy)} disabled={!!busy} onClick={() => void validate()}>
                Validate
              </button>
              <button type="button" style={buttonStyle(C.amber, !!busy)} disabled={!!busy} onClick={() => void dryRun()}>
                {busy === "run" ? "Running…" : "Dry Run"}
              </button>
              <button
                type="button"
                title={evalRun?.overall_status === "staged_ready" ? "Stage the current immutable version" : "Passing publish-readiness evals are required"}
                style={buttonStyle(C.green, !!busy || evalRun?.overall_status !== "staged_ready" || workflow?.status === "staged")}
                disabled={!!busy || evalRun?.overall_status !== "staged_ready" || workflow?.status === "staged"}
                onClick={() => void stage()}
              >
                {busy === "stage" ? "Staging…" : workflow?.status === "staged" ? "Staged" : "Stage"}
              </button>
              <button type="button" title="Deferred: production execution is out of scope" style={buttonStyle(C.faint, true)} disabled>Run</button>
              <button type="button" title="Deferred: cancellation semantics are not implemented" style={buttonStyle(C.faint, true)} disabled>Cancel</button>
            </div>
          </div>

          <div className="agent-builder-grid" style={{ display: "grid", gridTemplateColumns: "210px minmax(420px, 1fr) 290px", gap: 10, minHeight: 560 }}>
            <Panel title="Node palette">
              <div style={{ display: "grid", gap: 7 }}>
                {palette.map((item) => (
                  <button
                    type="button"
                    key={item.type}
                    onClick={() => addNode(item)}
                    style={{ ...buttonStyle(C.cyan), textAlign: "left", padding: 9 }}
                  >
                    <div>{item.label}</div>
                    <div style={{ color: C.faint, fontSize: 9, marginTop: 3 }}>{item.category}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden", background: "#080d14", minHeight: 520 }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                fitView
              >
                <Background color="#273244" gap={18} />
                <Controls />
                <MiniMap nodeColor={(node) => String(node.style?.borderColor || C.faint)} />
              </ReactFlow>
            </div>

            <Panel title="Configuration inspector">
              {!selectedNode ? (
                <EmptyState label="No node selected" hint="Select a node on the canvas to configure it." />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9 }}>NODE TYPE</div>
                    <Tag color={C.cyan}>{String(selectedNode.data.nodeType)}</Tag>
                  </div>
                  <label style={{ color: C.dim, fontFamily: C.mono, fontSize: 10 }}>
                    Label
                    <input
                      style={{ ...inputStyle, marginTop: 4 }}
                      value={String(selectedNode.data.displayLabel ?? selectedNode.data.nodeType)}
                      onChange={(event) => updateSelected({ label: event.target.value })}
                    />
                  </label>
                  {selectedNode.data.nodeType === "mcp_tool" && (
                    <label style={{ color: C.dim, fontFamily: C.mono, fontSize: 10 }}>
                      Read-only MCP tool
                      <select
                        style={{ ...inputStyle, marginTop: 4 }}
                        value={String((selectedNode.data.config as Record<string, unknown>)?.tool_name || "")}
                        onChange={(event) => {
                          const tool = tools.find((item) => item.name === event.target.value);
                          if (!tool) return;
                          updateSelected({ config: { tool_name: tool.name, tool_schema_digest: tool.schema_digest, bindings: {} } });
                        }}
                      >
                        {tools.map((tool) => (
                          <option key={tool.name} value={tool.name} disabled={!tool.enabled}>
                            {tool.name}{tool.enabled ? "" : " · blocked"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selectedNode.data.nodeType === "prompt_llm" && (
                    <>
                      <label style={{ color: C.dim, fontFamily: C.mono, fontSize: 10 }}>
                        Prompt template
                        <textarea
                          style={{ ...inputStyle, marginTop: 4, minHeight: 100 }}
                          value={String((selectedNode.data.config as Record<string, unknown>)?.prompt_template || "")}
                          onChange={(event) => updateSelected({
                            config: { ...(selectedNode.data.config as Record<string, unknown>), prompt_template: event.target.value },
                          })}
                        />
                      </label>
                      <label style={{ color: C.dim, fontFamily: C.mono, fontSize: 10 }}>
                        Prompt version
                        <input
                          style={{ ...inputStyle, marginTop: 4 }}
                          value={String((selectedNode.data.config as Record<string, unknown>)?.prompt_version || "")}
                          onChange={(event) => updateSelected({
                            config: { ...(selectedNode.data.config as Record<string, unknown>), prompt_version: event.target.value },
                          })}
                        />
                      </label>
                    </>
                  )}
                  <label style={{ color: C.dim, fontFamily: C.mono, fontSize: 10 }}>
                    Config JSON
                    <textarea
                      style={{ ...inputStyle, marginTop: 4, minHeight: 160 }}
                      value={JSON.stringify(selectedNode.data.config || {}, null, 2)}
                      onChange={(event) => {
                        try {
                          updateSelected({ config: JSON.parse(event.target.value) });
                          setError(null);
                        } catch {
                          setError("Configuration must be valid JSON.");
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </Panel>
          </div>

          <div className="agent-builder-drawers" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <Panel title="Validation / run trace" right={validation && <Tag color={validation.status === "pass" ? C.green : C.red}>{validation.status}</Tag>}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} value={runKey} onChange={(event) => setRunKey(event.target.value)} aria-label="run_key" />
                <input style={inputStyle} value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="channel" />
                <select style={inputStyle} value={sample} onChange={(event) => setSample(event.target.value as "nominal" | "anomaly")}>
                  <option value="anomaly">anomaly window</option>
                  <option value="nominal">nominal window</option>
                </select>
              </div>
              {validation?.issues.length ? (
                validation.issues.map((issue) => (
                  <div key={`${issue.code}-${issue.node_id || ""}`} style={{ color: issue.severity === "error" ? C.red : C.amber, fontFamily: C.mono, fontSize: 10, marginBottom: 5 }}>
                    {issue.code}{issue.node_id ? ` · ${issue.node_id}` : ""}: {issue.message}
                  </div>
                ))
              ) : (
                <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>
                  {run ? `Run ${run.status}${run.terminal_reason ? ` · ${run.terminal_reason}` : ""}` : "No validation issues or run trace selected."}
                </div>
              )}
              {run?.steps && (
                <div style={{ display: "grid", gap: 5, marginTop: 10 }}>
                  {run.steps.map((step) => (
                    <div key={step.id} style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10 }}>
                      <span>{step.node_id}</span>
                      <span style={{ color: STATUS_COLOR[step.status] || C.dim }}>{step.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Evidence drawer" right={run && <Tag color={STATUS_COLOR[run.status] || C.dim}>{run.status}</Tag>}>
              {!run?.receipts?.length ? (
                <EmptyState label="No receipts yet" hint="Every dry-run step writes a builder receipt; model calls also retain their dispatch receipt." />
              ) : (
                <div style={{ display: "grid", gap: 7, maxHeight: 280, overflow: "auto" }}>
                  {run.receipts.map((receipt: AgentReceipt) => (
                    <div key={receipt.id} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 10 }}>
                        <span>{receipt.node_id} · {receipt.receipt_type}</span>
                        <span style={{ color: STATUS_COLOR[receipt.terminal_status] || C.dim }}>{receipt.terminal_status}</span>
                      </div>
                      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, marginTop: 4 }}>
                        {receipt.id} {receipt.model_used ? `· ${receipt.model_used}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
      <style>{`
        @media (max-width: 900px) {
          .agent-builder-grid,
          .agent-builder-drawers {
            grid-template-columns: 1fr !important;
          }
          .agent-run-row {
            grid-template-columns: 1fr auto !important;
          }
        }
      `}</style>
    </div>
  );
}

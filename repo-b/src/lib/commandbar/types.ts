export type CommandDomain = "lab" | "bos" | "tasks" | "system" | "unknown";

export type CommandAction =
  | "list"
  | "create"
  | "update"
  | "delete"
  | "health"
  | "discover";

export type RiskLevel = "low" | "medium" | "high";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "needs_clarification"
  | "blocked";

export type AssistantEntityType =
  | "environment"
  | "business"
  | "fund"
  | "investment"
  | "deal"
  | "asset"
  | "model"
  | "pipeline_deal"
  | "pipeline_property"
  | "document"
  | "unknown";

export type AssistantScopeType =
  | "environment"
  | "business"
  | "fund"
  | "investment"
  | "deal"
  | "asset"
  | "model"
  | "global"
  | "unknown";

export type Lane = "A_FAST" | "B_LOOKUP" | "C_ANALYSIS" | "D_DEEP";

export type RetrievalPolicy = "none" | "light" | "full";

export type ConfirmationMode = "none" | "required" | "conditional";

export type PermissionMode =
  | "read"
  | "retrieve"
  | "analyze"
  | "write_confirmed"
  | "write_auto"
  | "privileged";

export type SideEffectClass = "read" | "write";

export type ContextResolutionStatus =
  | "resolved"
  | "missing_context"
  | "ambiguous_context";

export type ToolReceiptStatus = "success" | "failed" | "denied";

export type RetrievalStatus = "ok" | "empty";

export type StructuredPrecheckStatus =
  | "ok"
  | "empty"
  | "unavailable"
  | "error";

export type TurnStatus = "success" | "degraded" | "failed";

export type DegradedReason =
  | "missing_context"
  | "ambiguous_context"
  | "tool_denied"
  | "tool_failed"
  | "retrieval_empty"
  | "no_skill_match";

export type DispatchAmbiguity = "low" | "medium" | "high";

export type DispatchSource =
  | "model"
  | "legacy_fallback"
  | "deterministic_guardrail";

export type PendingActionStatus =
  | "awaiting_confirmation"
  | "confirmed"
  | "cancelled"
  | "superseded"
  | "expired";

export type SkillDefinition = {
  id: string;
  description: string;
  triggers: string[];
  capability_tags: string[];
  allowed_tool_tags: string[];
  retrieval_policy: RetrievalPolicy;
  confirmation_mode: ConfirmationMode;
  response_blocks: string[];
};

export type AssistantSelectedEntity = {
  entity_type: AssistantEntityType | string;
  entity_id: string;
  name?: string | null;
  source?: "page" | "selection" | "visible_data" | "thread" | "route";
  parent_entity_type?: AssistantEntityType | string | null;
  parent_entity_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type AssistantVisibleRecord = {
  entity_type: AssistantEntityType | string;
  entity_id: string;
  name: string;
  parent_entity_type?: AssistantEntityType | string | null;
  parent_entity_id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
};

export type AssistantVisibleData = {
  funds?: AssistantVisibleRecord[];
  investments?: AssistantVisibleRecord[];
  assets?: AssistantVisibleRecord[];
  models?: AssistantVisibleRecord[];
  pipeline_items?: AssistantVisibleRecord[];
  documents?: AssistantVisibleRecord[];
  metrics?: Record<string, string | number | null>;
  notes?: string[];
  [key: string]: unknown;
};

export type AssistantSessionContext = {
  user_id?: string | null;
  org_id?: string | null;
  actor?: string | null;
  roles: string[];
  session_env_id?: string | null;
};

export type AssistantUiContext = {
  route: string | null;
  surface: string | null;
  active_module?: string | null;
  active_environment_id?: string | null;
  active_environment_name?: string | null;
  active_business_id?: string | null;
  active_business_name?: string | null;
  schema_name?: string | null;
  industry?: string | null;
  page_entity_type?: AssistantEntityType | string | null;
  page_entity_id?: string | null;
  page_entity_name?: string | null;
  selected_entities: AssistantSelectedEntity[];
  active_filters?: Record<string, unknown>;
  visible_data?: AssistantVisibleData | null;
};

export type AssistantArtifactRef = {
  block_id: string;
  type: string;
  title?: string | null;
  summary?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type AssistantThreadContext = {
  thread_id?: string | null;
  assistant_mode: string;
  scope_type: AssistantScopeType | string;
  scope_id?: string | null;
  launch_source: string;
  active_artifact_id?: string | null;
  artifact_refs?: AssistantArtifactRef[];
  mode?: "ask" | "analyze" | "act" | string;
};

export type AssistantContextEnvelope = {
  session: AssistantSessionContext;
  ui: AssistantUiContext;
  thread: AssistantThreadContext;
};

export type ResolvedAssistantScope = {
  resolved_scope_type: AssistantScopeType | string;
  environment_id?: string | null;
  business_id?: string | null;
  schema_name?: string | null;
  industry?: string | null;
  entity_type?: AssistantEntityType | string | null;
  entity_id?: string | null;
  entity_name?: string | null;
  confidence: number;
  source: string;
};

export type AssistantCitationItem = {
  label: string;
  href?: string | null;
  snippet?: string | null;
  score?: number | null;
  doc_id?: string | null;
  chunk_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  section_heading?: string | null;
};

export type ContextReceipt = {
  environment_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  resolution_status: ContextResolutionStatus;
  notes?: string[];
  inherited_entity_id?: string | null;
  inherited_entity_source?: string | null;
};

export type SkillSelection = {
  skill_id?: string | null;
  confidence: number;
  triggers_matched: string[];
};

export type DispatchProposal = {
  skill?: string | null;
  lane?: Lane | null;
  needs_retrieval: boolean;
  write_intent: boolean;
  ambiguity_level: DispatchAmbiguity;
  confidence: number;
};

export type DispatchDecision = {
  source: DispatchSource;
  skill_id?: string | null;
  lane: Lane;
  needs_retrieval: boolean;
  write_intent: boolean;
  ambiguity_level: DispatchAmbiguity;
  confidence: number;
  fallback_used: boolean;
  fallback_reason?: string | null;
  notes: string[];
};

export type DispatchTrace = {
  raw?: DispatchProposal | null;
  normalized: DispatchDecision;
};

export type ToolReceipt = {
  tool_name: string;
  status: ToolReceiptStatus;
  permission_mode: PermissionMode;
  input?: unknown;
  output?: unknown;
  error?: string | null;
};

export type RetrievalReceipt = {
  used: boolean;
  result_count: number;
  status: RetrievalStatus;
  debug?: RetrievalDebugReceipt | null;
};

export type StructuredPrecheckReceipt = {
  name: string;
  source: string;
  status: StructuredPrecheckStatus;
  scoped: boolean;
  result_count: number;
  evidence: Record<string, unknown>;
  notes: string[];
  error?: string | null;
};

export type RetrievalDebugReceipt = {
  query_text: string;
  scope_filters: Record<string, unknown>;
  strategy: string;
  top_hits: Array<Record<string, unknown>>;
  structured_prechecks: StructuredPrecheckReceipt[];
  empty_reason?: string | null;
};

export type PendingActionReceipt = {
  pending_action_id: string;
  status: PendingActionStatus;
  action_type: string;
  scope_label?: string | null;
  confirmation_required: boolean;
};

export type TurnReceipt = {
  request_id: string;
  lane: Lane;
  dispatch?: DispatchTrace | null;
  fallback_reason?: string | null;
  context: ContextReceipt;
  skill: SkillSelection;
  tools: ToolReceipt[];
  retrieval: RetrievalReceipt;
  pending_action?: PendingActionReceipt | null;
  status: TurnStatus;
  degraded_reason?: DegradedReason | null;
  quality_gates?: Array<{ gate: string; passed: boolean; message?: string }> | null;
};

export type AssistantToolActivityItem = {
  tool_name: string;
  label?: string;
  status: "running" | "completed" | "failed" | string;
  summary: string;
  duration_ms?: number | null;
  is_write?: boolean;
};

export type AssistantResponseBlock =
  | {
      type: "markdown_text";
      block_id: string;
      markdown: string;
    }
  | {
      type: "chart";
      block_id: string;
      chart_type: "line" | "bar" | "grouped_bar" | "stacked_bar" | "waterfall" | string;
      title: string;
      description?: string | null;
      x_key: string;
      y_keys: string[];
      series_key?: string | null;
      data: Array<Record<string, unknown>>;
      format?: "dollar" | "percent" | "number" | string;
      stacked?: boolean;
      source_block_id?: string | null;
    }
  | {
      type: "table";
      block_id: string;
      title?: string | null;
      columns: string[];
      rows: Array<Record<string, unknown>>;
      ranked?: boolean;
      export_name?: string | null;
      source_block_id?: string | null;
    }
  | {
      type: "kpi_group";
      block_id: string;
      title?: string | null;
      items: Array<Record<string, unknown>>;
      source_block_id?: string | null;
    }
  | {
      type: "citations";
      block_id: string;
      items: AssistantCitationItem[];
    }
  | {
      type: "tool_activity";
      block_id: string;
      items: AssistantToolActivityItem[];
    }
  | {
      type: "workflow_result";
      block_id: string;
      title: string;
      status: string;
      summary: string;
      metrics?: Array<Record<string, unknown>>;
      actions?: Array<Record<string, unknown>>;
    }
  | {
      type: "confirmation";
      block_id: string;
      action: string;
      summary: string;
      provided_params?: Record<string, unknown>;
      missing_fields?: string[];
      confirm_label?: string | null;
    }
  | {
      type: "error";
      block_id: string;
      title?: string | null;
      message: string;
      recoverable: boolean;
    }
  | {
      type: "grounding_badge";
      block_id: string;
      score: number;
      label: string;
      label_text: string;
      tool_count: number;
      firm_data_tools: number;
      sources?: Array<{ tool_name: string; is_firm_data: boolean }>;
    };

export type CommandContext = {
  currentEnvId?: string | null;
  currentBusinessId?: string | null;
  route?: string | null;
  selection?: string | null;
  surface?: string | null;
  activeModule?: string | null;
  schemaName?: string | null;
  industry?: string | null;
  pageEntityType?: AssistantEntityType | string | null;
  pageEntityId?: string | null;
};

export type ContextSnapshot = {
  route: string | null;
  environments: Array<{
    env_id: string;
    client_name: string;
    industry?: string;
    industry_type?: string;
    schema_name?: string;
    business_id?: string | null;
  }>;
  selectedEnv: {
    env_id: string;
    client_name: string;
    industry?: string;
    industry_type?: string;
    schema_name?: string;
    business_id?: string | null;
  } | null;
  business: {
    business_id: string;
    name?: string;
    slug?: string;
  } | null;
  modulesAvailable: string[];
  recentRuns: Array<{
    runId: string;
    planId: string;
    status: RunStatus;
    createdAt: number;
  }>;
};

export type CommandIntent = {
  rawMessage: string;
  domain: CommandDomain;
  resource: string;
  action: CommandAction;
  parameters: Record<string, unknown>;
  confidence: number;
  readOnly: boolean;
};

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  mutation: boolean;
  preconditions?: string[];
  expectedResult?: string;
  rollback?: string | null;
  resource?: string;
};

export type ExecutionPlan = {
  planId: string;
  intentSummary: string;
  intent: CommandIntent;
  operationName?: string;
  operationParams?: Record<string, unknown>;
  steps: PlanStep[];
  impactedEntities: string[];
  mutations: string[];
  risk: RiskLevel;
  readOnly: boolean;
  requiresConfirmation: boolean;
  requiresDoubleConfirmation: boolean;
  doubleConfirmationPhrase?: string | null;
  target?: {
    envId?: string | null;
    envName?: string | null;
    businessId?: string | null;
  };
  clarification?: {
    needed: boolean;
    kind?: "needs_clarification" | "missing_capability";
    reason?: string | null;
    options?: Array<{ label: string; value: string }>;
  };
  context: CommandContext;
  createdAt: number;
};

export type VerificationLink = {
  label: string;
  href: string;
};

export type VerificationResult = {
  stepId: string;
  ok: boolean;
  summary: string;
  details?: Record<string, unknown>;
  links?: VerificationLink[];
};

export type StepResult = {
  stepId: string;
  status: StepStatus;
  startedAt?: number;
  endedAt?: number;
  details?: Record<string, unknown>;
  error?: string;
  verification?: VerificationResult;
};

export type CommandRun = {
  runId: string;
  planId: string;
  status: RunStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  cancelled: boolean;
  logs: string[];
  stepResults: StepResult[];
  verification: VerificationResult[];
};

export type CommandAuditKind =
  | "plan.created"
  | "plan.confirmed"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";

export type CommandAuditEvent = {
  id: string;
  at: number;
  planId: string;
  runId?: string;
  kind: CommandAuditKind;
  details?: Record<string, unknown>;
};

export type PlanResponse = {
  plan_id: string;
  plan: ExecutionPlan;
  risk: RiskLevel;
  mutations: string[];
  requires_confirmation: boolean;
  requires_double_confirmation: boolean;
  double_confirmation_phrase?: string | null;
};

export type CommandContextKey = `env:${string}` | `biz:${string}` | "global";

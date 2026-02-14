export type CommandDomain = "lab" | "bos" | "system" | "unknown";

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

export type CommandContext = {
  currentEnvId?: string | null;
  currentBusinessId?: string | null;
  route?: string | null;
  selection?: string | null;
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

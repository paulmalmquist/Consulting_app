import { z } from "zod";
import type {
  ResumeArchitecture,
  ResumeArchitectureEdge,
  ResumeArchitectureNode,
  ResumeBi,
  ResumeBiEntity,
  ResumeBiPoint,
  ResumeIdentity,
  ResumeModeling,
  ResumeScenarioInputs,
  ResumeScenarioPreset,
  ResumeStory,
  ResumeTimeline,
  ResumeTimelineInitiative,
  ResumeTimelineMilestone,
  ResumeTimelineRole,
  ResumeTimelineViewMode,
  ResumeWorkspaceMetric,
} from "@/lib/bos-api";

const UUID_SCHEMA = z.string().uuid();
const TIMELINE_VIEWS = ["career", "delivery", "capability", "impact"] as const;
const ARCHITECTURE_VIEWS = ["technical", "business"] as const;
const BI_LEVELS = ["portfolio", "fund", "investment", "asset"] as const;
const RESUME_MODULES = ["timeline", "architecture", "modeling", "bi"] as const;

const DEFAULT_DATE = "2020-01-01";
const DEFAULT_PERIOD = "2025-12";
const DEFAULT_ROOT_ENTITY_ID = "portfolio-root";

export type ResumeModelAssumptions = {
  entry_cap_rate: number;
  debt_rate: number;
  exit_cost_pct: number;
  lp_equity_share: number;
  gp_equity_share: number;
  pref_rate: number;
  catch_up_ratio: number;
  residual_lp_split: number;
  residual_gp_split: number;
};

export type ResumeWorkspaceViewModel = {
  identity: ResumeIdentity;
  timeline: ResumeTimeline;
  architecture: ResumeArchitecture;
  modeling: {
    defaults: ResumeScenarioInputs;
    assumptions: ResumeModelAssumptions;
    presets: ResumeScenarioPreset[];
  };
  bi: ResumeBi;
  stories: ResumeStory[];
};

export type ResumeWorkspaceStats = {
  roles: number;
  milestones: number;
  nodes: number;
  edges: number;
  presets: number;
  entities: number;
  stories: number;
};

export type ResumeNormalizationResult = {
  workspace: ResumeWorkspaceViewModel;
  issues: string[];
  stats: ResumeWorkspaceStats;
};

const DEFAULT_MODEL_INPUTS: ResumeScenarioInputs = {
  purchase_price: 128000000,
  exit_cap_rate: 0.055,
  hold_period: 5,
  noi_growth_pct: 0.035,
  debt_pct: 0.58,
};

const DEFAULT_MODEL_ASSUMPTIONS: ResumeModelAssumptions = {
  entry_cap_rate: 0.059,
  debt_rate: 0.062,
  exit_cost_pct: 0.018,
  lp_equity_share: 0.9,
  gp_equity_share: 0.1,
  pref_rate: 0.08,
  catch_up_ratio: 0.3,
  residual_lp_split: 0.7,
  residual_gp_split: 0.3,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized ? normalized : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  const items = asArray(value)
    .map((item) => asString(item))
    .filter(Boolean);
  return items.length ? uniqueStrings(items) : fallback;
}

function asMetric(value: unknown, index: number): ResumeWorkspaceMetric | null {
  const record = asRecord(value);
  const label = asString(record.label, `Metric ${index + 1}`);
  const rawValue = record.value;
  const normalizedValue =
    typeof rawValue === "number" && Number.isFinite(rawValue)
      ? rawValue.toLocaleString()
      : asString(rawValue);

  if (!label || !normalizedValue) return null;

  return {
    label,
    value: normalizedValue,
    detail: asNullableString(record.detail),
  };
}

function normalizeDate(value: unknown, fallback = DEFAULT_DATE): string {
  const candidate = asString(value, fallback);
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString().slice(0, 10);
}

function sortDateStrings(values: string[]) {
  return [...values].sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
}

function dateMin(values: string[], fallback = DEFAULT_DATE) {
  return sortDateStrings(values)[0] ?? fallback;
}

function dateMax(values: string[], fallback = DEFAULT_DATE) {
  const sorted = sortDateStrings(values);
  return sorted[sorted.length - 1] ?? fallback;
}

function normalizeIdentity(raw: unknown): ResumeIdentity {
  const record = asRecord(raw);
  return {
    name: asString(record.name, "Paul Malmquist"),
    title: asString(record.title, "Systems Builder and Product Operator"),
    tagline: asString(record.tagline, "Data, analytics, AI, and operating systems translated into working products."),
    location: asString(record.location, "New York, NY"),
    summary: asString(
      record.summary,
      "A visual resume of operating systems, analytics, and AI delivery work across product, data, and investment workflows.",
    ),
    badges: asStringArray(record.badges),
    metrics: asArray(record.metrics)
      .map((metric, index) => asMetric(metric, index))
      .filter((metric): metric is ResumeWorkspaceMetric => Boolean(metric)),
  };
}

function normalizeMilestone(raw: unknown, index: number, fallbackDate = DEFAULT_DATE): ResumeTimelineMilestone {
  const record = asRecord(raw);
  return {
    milestone_id: asString(record.milestone_id, `milestone-${index + 1}`),
    title: asString(record.title, `Milestone ${index + 1}`),
    date: normalizeDate(record.date, fallbackDate),
    summary: asString(record.summary, "Key delivery milestone."),
    linked_modules: asStringArray(record.linked_modules, ["timeline"]),
    linked_architecture_node_ids: asStringArray(record.linked_architecture_node_ids),
    linked_bi_entity_ids: asStringArray(record.linked_bi_entity_ids),
    linked_model_preset: asNullableString(record.linked_model_preset),
  };
}

function normalizeInitiative(
  raw: unknown,
  roleId: string,
  index: number,
  roleStartDate: string,
  roleEndDate: string,
): ResumeTimelineInitiative {
  const record = asRecord(raw);
  const startDate = normalizeDate(record.start_date, roleStartDate);
  const endDate = normalizeDate(record.end_date, roleEndDate);
  const safeEndDate =
    new Date(endDate).getTime() >= new Date(startDate).getTime() ? endDate : startDate;

  return {
    initiative_id: asString(record.initiative_id, `${roleId}-initiative-${index + 1}`),
    role_id: asString(record.role_id, roleId),
    title: asString(record.title, `Initiative ${index + 1}`),
    summary: asString(record.summary, "Delivery initiative."),
    team_context: asString(record.team_context, "Cross-functional team"),
    business_challenge: asString(record.business_challenge, "Fragmented manual workflow"),
    measurable_outcome: asString(record.measurable_outcome, "Improved reliability and delivery speed"),
    stakeholder_group: asString(record.stakeholder_group, "Leadership"),
    scale: asString(record.scale, "Enterprise scope"),
    architecture: asString(record.architecture, "Data, workflow, and AI operating surface"),
    start_date: startDate,
    end_date: safeEndDate,
    category: asString(record.category, "foundation"),
    capability: asString(record.capability, "Execution"),
    impact_area: asString(record.impact_area, "operations"),
    technologies: asStringArray(record.technologies),
    impact_tag: asString(record.impact_tag, "Execution"),
    linked_modules: asStringArray(record.linked_modules, ["timeline"]),
    linked_architecture_node_ids: asStringArray(record.linked_architecture_node_ids),
    linked_bi_entity_ids: asStringArray(record.linked_bi_entity_ids),
    linked_model_preset: asNullableString(record.linked_model_preset),
  };
}

function normalizeRole(raw: unknown, index: number): ResumeTimelineRole {
  const record = asRecord(raw);
  const startDate = normalizeDate(record.start_date, DEFAULT_DATE);
  const normalizedEnd = record.end_date == null ? null : normalizeDate(record.end_date, startDate);
  const roleEndDate =
    normalizedEnd && new Date(normalizedEnd).getTime() >= new Date(startDate).getTime()
      ? normalizedEnd
      : null;

  const roleId = asString(record.timeline_role_id, `role-${index + 1}`);
  const initiatives = asArray(record.initiatives).map((initiative, initiativeIndex) =>
    normalizeInitiative(initiative, roleId, initiativeIndex, startDate, roleEndDate ?? startDate),
  );

  return {
    timeline_role_id: roleId,
    company: asString(record.company, "Business Machine"),
    title: asString(record.title, `Role ${index + 1}`),
    lane: asString(record.lane, "Delivery"),
    start_date: startDate,
    end_date: roleEndDate,
    summary: asString(record.summary, "Delivered systems across analytics, operations, and AI."),
    scope: asString(record.scope, "Product, delivery, and data systems"),
    technologies: asStringArray(record.technologies),
    outcomes: asStringArray(record.outcomes),
    initiatives,
    milestones: asArray(record.milestones).map((milestone, milestoneIndex) =>
      normalizeMilestone(milestone, milestoneIndex, startDate),
    ),
  };
}

function normalizeTimeline(raw: unknown, issues: string[]): ResumeTimeline {
  const record = asRecord(raw);
  const roles = asArray(record.roles)
    .map((role, index) => normalizeRole(role, index))
    .sort((left, right) => new Date(left.start_date).getTime() - new Date(right.start_date).getTime());

  const fallbackMilestoneDate = roles[0]?.start_date ?? DEFAULT_DATE;
  const milestones = asArray(record.milestones).map((milestone, index) =>
    normalizeMilestone(milestone, index, fallbackMilestoneDate),
  );

  const timelineDates = [
    asString(record.start_date),
    asString(record.end_date),
    ...roles.flatMap((role) => [role.start_date, role.end_date ?? role.start_date]),
    ...roles.flatMap((role) => role.initiatives.flatMap((initiative) => [initiative.start_date, initiative.end_date])),
    ...milestones.map((milestone) => milestone.date),
  ].filter(Boolean);

  const startDate = dateMin(timelineDates, DEFAULT_DATE);
  const endDate = dateMax(timelineDates, startDate);
  const safeEndDate =
    new Date(endDate).getTime() >= new Date(startDate).getTime() ? endDate : startDate;

  const defaultViewCandidate = asString(record.default_view, "career") as ResumeTimelineViewMode;
  const defaultView = TIMELINE_VIEWS.includes(defaultViewCandidate) ? defaultViewCandidate : "career";
  const views = uniqueStrings(
    asStringArray(record.views, TIMELINE_VIEWS as unknown as string[]).filter((value): value is ResumeTimelineViewMode =>
      (TIMELINE_VIEWS as readonly string[]).includes(value),
    ),
  ) as ResumeTimelineViewMode[];

  if (roles.length === 0) {
    issues.push("timeline.roles missing or empty");
  }

  return {
    default_view: defaultView,
    views: views.length ? uniqueStrings([defaultView, ...views]) as ResumeTimelineViewMode[] : [defaultView],
    start_date: startDate,
    end_date: safeEndDate,
    roles,
    milestones,
  };
}

function normalizeNode(raw: unknown, index: number): ResumeArchitectureNode {
  const record = asRecord(raw);
  const position = asRecord(record.position);
  return {
    node_id: asString(record.node_id, `node-${index + 1}`),
    label: asString(record.label, `Node ${index + 1}`),
    layer: asString(record.layer, "processing"),
    group: asString(record.group, "System"),
    position: {
      x: asNumber(position.x, 120 + (index % 3) * 260),
      y: asNumber(position.y, 120 + Math.floor(index / 3) * 150),
    },
    description: asString(record.description, "Connected system component"),
    tools: asStringArray(record.tools),
    outcomes: asStringArray(record.outcomes),
    business_problem: asString(record.business_problem, "Manual or fragmented operating work"),
    real_example: asString(record.real_example, "Used in production delivery"),
    linked_timeline_ids: asStringArray(record.linked_timeline_ids),
    linked_bi_entity_ids: asStringArray(record.linked_bi_entity_ids),
    linked_model_preset: asNullableString(record.linked_model_preset),
  };
}

function normalizeArchitecture(raw: unknown, issues: string[]): ResumeArchitecture {
  const record = asRecord(raw);
  const nodes = asArray(record.nodes).map((node, index) => normalizeNode(node, index));
  const nodeIds = new Set(nodes.map((node) => node.node_id));
  const edges = asArray(record.edges)
    .map((edge, index) => {
      const item = asRecord(edge);
      const normalized: ResumeArchitectureEdge = {
        edge_id: asString(item.edge_id, `edge-${index + 1}`),
        source: asString(item.source),
        target: asString(item.target),
        technical_label: asString(item.technical_label, "Flow"),
        impact_label: asString(item.impact_label, "Impact"),
      };
      return normalized;
    })
    .filter((edge) => {
      const isValid = nodeIds.has(edge.source) && nodeIds.has(edge.target);
      if (!isValid) {
        issues.push(`architecture.edge filtered (${edge.edge_id})`);
      }
      return isValid;
    });

  const defaultViewCandidate = asString(record.default_view, "technical");
  const defaultView = ARCHITECTURE_VIEWS.includes(defaultViewCandidate as (typeof ARCHITECTURE_VIEWS)[number])
    ? (defaultViewCandidate as "technical" | "business")
    : "technical";

  if (nodes.length === 0) {
    issues.push("architecture.nodes missing or empty");
  }

  return {
    default_view: defaultView,
    nodes,
    edges,
  };
}

function normalizeModelInputs(raw: unknown, fallback: ResumeScenarioInputs): ResumeScenarioInputs {
  const record = asRecord(raw);
  return {
    purchase_price: Math.max(asNumber(record.purchase_price, fallback.purchase_price), 1000000),
    exit_cap_rate: clamp(asNumber(record.exit_cap_rate, fallback.exit_cap_rate), 0.02, 0.2),
    hold_period: Math.round(clamp(asNumber(record.hold_period, fallback.hold_period), 1, 10)),
    noi_growth_pct: clamp(asNumber(record.noi_growth_pct, fallback.noi_growth_pct), -0.05, 0.2),
    debt_pct: clamp(asNumber(record.debt_pct, fallback.debt_pct), 0, 0.95),
  };
}

function normalizeModeling(raw: unknown, issues: string[]): ResumeWorkspaceViewModel["modeling"] {
  const record = asRecord(raw);
  const defaults = normalizeModelInputs(record.defaults, DEFAULT_MODEL_INPUTS);
  const assumptionsRecord = asRecord(record.assumptions);
  const assumptions: ResumeModelAssumptions = {
    entry_cap_rate: clamp(asNumber(assumptionsRecord.entry_cap_rate, DEFAULT_MODEL_ASSUMPTIONS.entry_cap_rate), 0.02, 0.2),
    debt_rate: clamp(asNumber(assumptionsRecord.debt_rate, DEFAULT_MODEL_ASSUMPTIONS.debt_rate), 0, 0.2),
    exit_cost_pct: clamp(asNumber(assumptionsRecord.exit_cost_pct, DEFAULT_MODEL_ASSUMPTIONS.exit_cost_pct), 0, 0.2),
    lp_equity_share: clamp(asNumber(assumptionsRecord.lp_equity_share, DEFAULT_MODEL_ASSUMPTIONS.lp_equity_share), 0, 1),
    gp_equity_share: clamp(asNumber(assumptionsRecord.gp_equity_share, DEFAULT_MODEL_ASSUMPTIONS.gp_equity_share), 0, 1),
    pref_rate: clamp(asNumber(assumptionsRecord.pref_rate, DEFAULT_MODEL_ASSUMPTIONS.pref_rate), 0, 0.25),
    catch_up_ratio: clamp(asNumber(assumptionsRecord.catch_up_ratio, DEFAULT_MODEL_ASSUMPTIONS.catch_up_ratio), 0, 0.95),
    residual_lp_split: clamp(asNumber(assumptionsRecord.residual_lp_split, DEFAULT_MODEL_ASSUMPTIONS.residual_lp_split), 0, 1),
    residual_gp_split: clamp(asNumber(assumptionsRecord.residual_gp_split, DEFAULT_MODEL_ASSUMPTIONS.residual_gp_split), 0, 1),
  };

  const presets = asArray(record.presets)
    .map((preset, index) => {
      const item = asRecord(preset);
      return {
        preset_id: asString(item.preset_id, index === 0 ? "base_case" : `preset-${index + 1}`),
        label: asString(item.label, index === 0 ? "Base Case" : `Preset ${index + 1}`),
        description: asString(item.description, "Normalized resume modeling scenario"),
        inputs: normalizeModelInputs(item.inputs, defaults),
      };
    })
    .filter((preset) => Boolean(preset.preset_id));

  if (presets.length === 0) {
    issues.push("modeling.presets missing; synthesized base_case");
  }

  return {
    defaults,
    assumptions,
    presets: presets.length
      ? presets
      : [
          {
            preset_id: "base_case",
            label: "Base Case",
            description: "Synthesized fallback scenario",
            inputs: defaults,
          },
        ],
  };
}

function normalizeBiPoint(raw: unknown): ResumeBiPoint | null {
  const record = asRecord(raw);
  const period = asString(record.period);
  if (!period) return null;
  return {
    period,
    noi: asNumber(record.noi),
    occupancy: clamp(asNumber(record.occupancy), 0, 1),
    value: asNumber(record.value),
    irr: clamp(asNumber(record.irr), -1, 5),
  };
}

function normalizeBiEntity(raw: unknown, index: number): ResumeBiEntity {
  const record = asRecord(raw);
  const coordinates = asRecord(record.coordinates);
  const levelCandidate = asString(record.level, "asset");
  const level = BI_LEVELS.includes(levelCandidate as (typeof BI_LEVELS)[number])
    ? (levelCandidate as ResumeBiEntity["level"])
    : "asset";

  return {
    entity_id: asString(record.entity_id, `entity-${index + 1}`),
    parent_id: asNullableString(record.parent_id),
    level,
    name: asString(record.name, `Entity ${index + 1}`),
    market: asNullableString(record.market),
    property_type: asNullableString(record.property_type),
    sector: asNullableString(record.sector),
    coordinates:
      typeof coordinates.x === "number" || typeof coordinates.y === "number"
        ? {
            x: clamp(asNumber(coordinates.x, 0.5), 0.05, 0.95),
            y: clamp(asNumber(coordinates.y, 0.5), 0.05, 0.95),
          }
        : null,
    metrics: {
      portfolio_value: asNumber(asRecord(record.metrics).portfolio_value),
      noi: asNumber(asRecord(record.metrics).noi),
      occupancy: clamp(asNumber(asRecord(record.metrics).occupancy), 0, 1),
      irr: clamp(asNumber(asRecord(record.metrics).irr), -1, 5),
    },
    trend: asArray(record.trend)
      .map((point) => normalizeBiPoint(point))
      .filter((point): point is ResumeBiPoint => Boolean(point))
      .sort((left, right) => left.period.localeCompare(right.period)),
    story: asString(record.story, "Drillable portfolio context"),
    linked_architecture_node_ids: asStringArray(record.linked_architecture_node_ids),
    linked_timeline_ids: asStringArray(record.linked_timeline_ids),
  };
}

function buildSyntheticBiRoot(entities: ResumeBiEntity[], rootEntityId: string): ResumeBiEntity {
  const assetEntities = entities.filter((entity) => entity.level === "asset");
  const totals = assetEntities.reduce(
    (acc, asset) => {
      acc.portfolio_value += Number(asset.metrics.portfolio_value ?? 0);
      acc.noi += Number(asset.metrics.noi ?? 0);
      acc.occupancy += Number(asset.metrics.occupancy ?? 0);
      acc.irr += Number(asset.metrics.irr ?? 0);
      return acc;
    },
    { portfolio_value: 0, noi: 0, occupancy: 0, irr: 0 },
  );

  if (assetEntities.length > 0) {
    totals.occupancy /= assetEntities.length;
    totals.irr /= assetEntities.length;
  }

  const trendIndex = new Map<string, { noi: number; value: number; occupancy: number; irr: number; count: number }>();

  for (const asset of assetEntities) {
    for (const point of asset.trend) {
      const existing = trendIndex.get(point.period) ?? {
        noi: 0,
        value: 0,
        occupancy: 0,
        irr: 0,
        count: 0,
      };
      existing.noi += point.noi;
      existing.value += point.value;
      existing.occupancy += point.occupancy;
      existing.irr += point.irr;
      existing.count += 1;
      trendIndex.set(point.period, existing);
    }
  }

  return {
    entity_id: rootEntityId,
    parent_id: null,
    level: "portfolio",
    name: "Portfolio",
    market: null,
    property_type: null,
    sector: null,
    coordinates: null,
    metrics: {
      portfolio_value: totals.portfolio_value,
      noi: totals.noi,
      occupancy: totals.occupancy,
      irr: totals.irr,
    },
    trend: [...trendIndex.entries()]
      .map(([period, total]) => ({
        period,
        noi: total.noi,
        value: total.value,
        occupancy: total.count ? total.occupancy / total.count : 0,
        irr: total.count ? total.irr / total.count : 0,
      }))
      .sort((left, right) => left.period.localeCompare(right.period)),
    story: "Portfolio rollup synthesized from the available asset data.",
    linked_architecture_node_ids: [],
    linked_timeline_ids: [],
  };
}

function normalizeBi(raw: unknown, issues: string[]): ResumeBi {
  const record = asRecord(raw);
  const entities = asArray(record.entities).map((entity, index) => normalizeBiEntity(entity, index));
  const rootEntityCandidate = asString(record.root_entity_id, DEFAULT_ROOT_ENTITY_ID);

  let rootEntityId = rootEntityCandidate;
  let normalizedEntities = [...entities];
  const existingRoot = normalizedEntities.find((entity) => entity.entity_id === rootEntityId);

  if (!existingRoot) {
    const fallbackRoot = normalizedEntities.find((entity) => entity.level === "portfolio");
    if (fallbackRoot) {
      rootEntityId = fallbackRoot.entity_id;
    } else {
      issues.push("bi.root_entity missing; synthesized portfolio root");
      const syntheticRoot = buildSyntheticBiRoot(normalizedEntities, rootEntityId);
      normalizedEntities = [syntheticRoot, ...normalizedEntities.map((entity) => ({
        ...entity,
        parent_id: entity.parent_id ?? rootEntityId,
      }))];
    }
  }

  const entityIds = new Set(normalizedEntities.map((entity) => entity.entity_id));
  normalizedEntities = normalizedEntities.map((entity) => {
    if (entity.entity_id === rootEntityId) {
      return { ...entity, parent_id: null };
    }
    if (entity.parent_id && entityIds.has(entity.parent_id)) {
      return entity;
    }
    return { ...entity, parent_id: rootEntityId };
  });

  const markets = uniqueStrings([
    ...asStringArray(record.markets),
    ...normalizedEntities.map((entity) => entity.market || "").filter(Boolean),
  ]);
  const propertyTypes = uniqueStrings([
    ...asStringArray(record.property_types),
    ...normalizedEntities.map((entity) => entity.property_type || "").filter(Boolean),
  ]);
  const periods = uniqueStrings([
    ...asStringArray(record.periods),
    ...normalizedEntities.flatMap((entity) => entity.trend.map((point) => point.period)),
  ]).sort();

  return {
    root_entity_id: rootEntityId,
    levels: BI_LEVELS.filter((level) => normalizedEntities.some((entity) => entity.level === level)),
    markets,
    property_types: propertyTypes,
    periods: periods.length ? periods : [DEFAULT_PERIOD],
    entities: normalizedEntities,
  };
}

function defaultStory(module: (typeof RESUME_MODULES)[number], identity: ResumeIdentity): ResumeStory {
  const label =
    module === "timeline"
      ? "Career Arc"
      : module === "architecture"
        ? "Architecture Lens"
        : module === "modeling"
          ? "Modeling Lens"
          : "Analytics Lens";

  return {
    story_id: `story-${module}`,
    title: `${label}`,
    module,
    why_it_matters:
      module === "timeline"
        ? `${identity.name} turned delivery history into an explorable operating narrative.`
        : module === "architecture"
          ? "The systems view shows how delivery discipline turned into durable platform leverage."
          : module === "modeling"
            ? "The modeling view shows how financial logic became interactive software instead of a static spreadsheet."
            : "The BI view keeps drill paths, metrics, and narrative aligned as the slice changes.",
    before_state: "Manual workflows, fragmented context, and slower decision cycles.",
    after_state: "Connected systems, faster iteration, and clearer executive decision support.",
    audience: "Executives, operators, and delivery stakeholders",
  };
}

function normalizeStories(raw: unknown, identity: ResumeIdentity, issues: string[]): ResumeStory[] {
  const normalized = asArray(raw)
    .map((story, index) => {
      const record = asRecord(story);
      const moduleCandidate = asString(record.module, "timeline");
      const moduleKey = RESUME_MODULES.includes(moduleCandidate as (typeof RESUME_MODULES)[number])
        ? moduleCandidate
        : "timeline";

      return {
        story_id: asString(record.story_id, `story-${index + 1}`),
        title: asString(record.title, `Story ${index + 1}`),
        module: moduleKey,
        why_it_matters: asString(record.why_it_matters, "This work changed delivery quality and operating leverage."),
        before_state: asString(record.before_state, "Manual workflow"),
        after_state: asString(record.after_state, "Integrated operating system"),
        audience: asString(record.audience, "Leadership"),
      };
    })
    .filter((story) => Boolean(story.title));

  const seenModules = new Set(normalized.map((story) => story.module));

  for (const moduleKey of RESUME_MODULES) {
    if (!seenModules.has(moduleKey)) {
      normalized.push(defaultStory(moduleKey, identity));
      issues.push(`stories.${moduleKey} missing; synthesized fallback story`);
    }
  }

  return normalized;
}

function buildFallbackIdentityMetrics(
  identity: ResumeIdentity,
  timeline: ResumeTimeline,
  architecture: ResumeArchitecture,
  modeling: ResumeWorkspaceViewModel["modeling"],
  bi: ResumeBi,
): ResumeWorkspaceMetric[] {
  return [
    {
      label: "Roles",
      value: String(timeline.roles.length),
      detail: identity.location || null,
    },
    {
      label: "System Nodes",
      value: String(architecture.nodes.length),
      detail: "Connected delivery layers",
    },
    {
      label: "Model Presets",
      value: String(modeling.presets.length),
      detail: "Interactive scenario paths",
    },
    {
      label: "BI Entities",
      value: String(bi.entities.length),
      detail: "Portfolio drill context",
    },
  ];
}

function buildFallbackBadges(
  identity: ResumeIdentity,
  timeline: ResumeTimeline,
  architecture: ResumeArchitecture,
): string[] {
  if (identity.badges.length > 0) return identity.badges;
  return uniqueStrings([
    ...timeline.roles.flatMap((role) => role.technologies),
    ...architecture.nodes.flatMap((node) => node.tools),
  ]).slice(0, 6);
}

export function getResumeWorkspaceStats(workspace: ResumeWorkspaceViewModel): ResumeWorkspaceStats {
  return {
    roles: workspace.timeline.roles.length,
    milestones: workspace.timeline.milestones.length,
    nodes: workspace.architecture.nodes.length,
    edges: workspace.architecture.edges.length,
    presets: workspace.modeling.presets.length,
    entities: workspace.bi.entities.length,
    stories: workspace.stories.length,
  };
}

export function isValidEnvId(value: string | null | undefined): boolean {
  return UUID_SCHEMA.safeParse(value ?? "").success;
}

export function normalizeResumeWorkspace(raw: unknown): ResumeNormalizationResult {
  const issues: string[] = [];
  const root = asRecord(raw);

  if (Object.keys(root).length === 0) {
    issues.push("workspace payload missing or malformed");
  }

  const identityBase = normalizeIdentity(root.identity);
  const timeline = normalizeTimeline(root.timeline, issues);
  const architecture = normalizeArchitecture(root.architecture, issues);
  const modeling = normalizeModeling(root.modeling, issues);
  const bi = normalizeBi(root.bi, issues);

  const identity: ResumeIdentity = {
    ...identityBase,
    badges: buildFallbackBadges(identityBase, timeline, architecture),
    metrics:
      identityBase.metrics.length > 0
        ? identityBase.metrics
        : buildFallbackIdentityMetrics(identityBase, timeline, architecture, modeling, bi),
  };

  const stories = normalizeStories(root.stories, identity, issues);

  const workspace: ResumeWorkspaceViewModel = {
    identity,
    timeline,
    architecture,
    modeling,
    bi,
    stories,
  };

  return {
    workspace,
    issues: uniqueStrings(issues),
    stats: getResumeWorkspaceStats(workspace),
  };
}

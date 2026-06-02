export type DiscoveryCategory =
  | "manual_assembly"
  | "decision_latency"
  | "reporting_fragility"
  | "ai_spend_measurement"
  | "governance_readiness";

export type DiscoveryBand = "ready" | "focused" | "exposed" | "blocked";

export type DiscoveryOption = {
  id: string;
  label: string;
  points: number;
};

export type DiscoveryQuestion = {
  id: string;
  category: DiscoveryCategory;
  label: string;
  prompt: string;
  options: DiscoveryOption[];
};

export type DiscoveryCategoryScore = {
  category: DiscoveryCategory;
  label: string;
  score: number;
  maxScore: number;
  percent: number;
  band: DiscoveryBand;
};

export type DiscoveryScoreResult = {
  complete: boolean;
  missingQuestionIds: string[];
  missingQuestionLabels: string[];
  categories: DiscoveryCategoryScore[];
  overallScore: number | null;
  overallBand: DiscoveryBand | null;
};

export const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  manual_assembly: "Manual assembly time",
  decision_latency: "Decision latency",
  reporting_fragility: "Reporting fragility",
  ai_spend_measurement: "AI spend measurement",
  governance_readiness: "Governance readiness",
};

export const DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [
  {
    id: "manual_cycle",
    category: "manual_assembly",
    label: "Manual cycle work",
    prompt: "How much work goes into the recurring report or packet before anyone can review it?",
    options: [
      { id: "low", label: "Mostly automatic", points: 5 },
      { id: "some", label: "A few manual pulls", points: 4 },
      { id: "heavy", label: "Several spreadsheet steps", points: 2 },
      { id: "built_by_hand", label: "Built by hand each cycle", points: 0 },
    ],
  },
  {
    id: "manual_rework",
    category: "manual_assembly",
    label: "Manual rework",
    prompt: "When a source changes, how much rework does the team expect?",
    options: [
      { id: "rare", label: "Rarely a problem", points: 5 },
      { id: "contained", label: "Contained cleanup", points: 4 },
      { id: "late_cycle", label: "Late-cycle fixes", points: 2 },
      { id: "recurring", label: "Recurring rebuilds", points: 0 },
    ],
  },
  {
    id: "decision_wait",
    category: "decision_latency",
    label: "Decision wait",
    prompt: "How often does a decision wait for one person to assemble context?",
    options: [
      { id: "rare", label: "Rarely", points: 5 },
      { id: "monthly", label: "A few times a month", points: 4 },
      { id: "weekly", label: "Weekly", points: 2 },
      { id: "daily", label: "Daily", points: 0 },
    ],
  },
  {
    id: "approval_path",
    category: "decision_latency",
    label: "Approval path",
    prompt: "How clear is the handoff from analysis to approval?",
    options: [
      { id: "clear", label: "Clear owner and standard path", points: 5 },
      { id: "mostly_clear", label: "Mostly clear", points: 4 },
      { id: "person_dependent", label: "Depends on the person", points: 2 },
      { id: "unclear", label: "Unclear until someone asks", points: 0 },
    ],
  },
  {
    id: "report_breaks",
    category: "reporting_fragility",
    label: "Report breaks",
    prompt: "How often do field names, org changes, or source updates break reporting?",
    options: [
      { id: "rare", label: "Rarely", points: 5 },
      { id: "caught_fast", label: "Caught fast", points: 4 },
      { id: "monthly", label: "About monthly", points: 2 },
      { id: "surprise", label: "Found by surprise", points: 0 },
    ],
  },
  {
    id: "metric_conflict",
    category: "reporting_fragility",
    label: "Metric conflict",
    prompt: "How often do two teams show different numbers for the same metric?",
    options: [
      { id: "rare", label: "Rarely", points: 5 },
      { id: "explained", label: "Sometimes, with a known reason", points: 4 },
      { id: "common", label: "Common enough to slow review", points: 2 },
      { id: "normal", label: "Accepted as normal", points: 0 },
    ],
  },
  {
    id: "ai_scoreboard",
    category: "ai_spend_measurement",
    label: "AI scoreboard",
    prompt: "Can leadership name what AI returned last quarter?",
    options: [
      { id: "measured", label: "Yes, by workflow", points: 5 },
      { id: "partial", label: "Partially", points: 4 },
      { id: "usage_only", label: "Only usage or seat counts", points: 2 },
      { id: "no", label: "No", points: 0 },
    ],
  },
  {
    id: "ai_renewal",
    category: "ai_spend_measurement",
    label: "AI renewal evidence",
    prompt: "At renewal time, what evidence supports the AI budget?",
    options: [
      { id: "outcomes", label: "Measured outcomes", points: 5 },
      { id: "manager_feedback", label: "Manager feedback", points: 4 },
      { id: "usage", label: "Usage reports", points: 2 },
      { id: "none", label: "No clear evidence", points: 0 },
    ],
  },
  {
    id: "data_boundary",
    category: "governance_readiness",
    label: "Data boundary",
    prompt: "Are the boundaries clear for what AI may read, write, and cite?",
    options: [
      { id: "documented", label: "Documented and enforced", points: 5 },
      { id: "documented_manual", label: "Documented but manual", points: 4 },
      { id: "informal", label: "Informal rules", points: 2 },
      { id: "unclear", label: "Unclear", points: 0 },
    ],
  },
  {
    id: "audit_trail",
    category: "governance_readiness",
    label: "Audit trail",
    prompt: "Can the team see what an AI-assisted workflow used and produced?",
    options: [
      { id: "complete", label: "Yes, with review history", points: 5 },
      { id: "partial", label: "Partial logs", points: 4 },
      { id: "manual", label: "Only manual notes", points: 2 },
      { id: "none", label: "No", points: 0 },
    ],
  },
];

function bandForPercent(percent: number): DiscoveryBand {
  if (percent >= 80) return "ready";
  if (percent >= 60) return "focused";
  if (percent >= 40) return "exposed";
  return "blocked";
}

export function scoreDiscovery(answers: Record<string, string>): DiscoveryScoreResult {
  const missingQuestions = DISCOVERY_QUESTIONS.filter((question) => {
    const answer = answers[question.id];
    return !question.options.some((option) => option.id === answer);
  });

  if (missingQuestions.length > 0) {
    return {
      complete: false,
      missingQuestionIds: missingQuestions.map((question) => question.id),
      missingQuestionLabels: missingQuestions.map((question) => question.label),
      categories: [],
      overallScore: null,
      overallBand: null,
    };
  }

  const categoryScores = Object.keys(CATEGORY_LABELS).map((categoryKey) => {
    const category = categoryKey as DiscoveryCategory;
    const questions = DISCOVERY_QUESTIONS.filter((question) => question.category === category);
    const score = questions.reduce((sum, question) => {
      const option = question.options.find((item) => item.id === answers[question.id]);
      return sum + (option?.points ?? 0);
    }, 0);
    const maxScore = questions.length * 5;
    const percent = Math.round((score / maxScore) * 100);
    return {
      category,
      label: CATEGORY_LABELS[category],
      score,
      maxScore,
      percent,
      band: bandForPercent(percent),
    };
  });

  const totalScore = categoryScores.reduce((sum, category) => sum + category.score, 0);
  const totalMax = categoryScores.reduce((sum, category) => sum + category.maxScore, 0);
  const overallScore = Math.round((totalScore / totalMax) * 100);

  return {
    complete: true,
    missingQuestionIds: [],
    missingQuestionLabels: [],
    categories: categoryScores,
    overallScore,
    overallBand: bandForPercent(overallScore),
  };
}

export type RichardHeroMetric = {
  label: string;
  value: string;
  proof: string;
};

export type RichardSystemCard = {
  id: string;
  name: string;
  company: string;
  period: string;
  strapline: string;
  inputs: string[];
  logic: string[];
  outputs: string[];
  outcomes: string[];
  capabilities: string[];
};

export type RichardTimelineRole = {
  id: string;
  company: string;
  title: string;
  period: string;
  summary: string;
  inflection: string;
  layers: Array<{ label: string; value: number }>;
};

export type RichardCapabilityCluster = {
  name: string;
  nodes: Array<{
    id: string;
    label: string;
    outcome: string;
    systemIds: string[];
  }>;
};

export type RichardActivityItem = {
  title: string;
  detail: string;
  status: string;
  timestamp: string;
};

export const richardHeroMetrics: RichardHeroMetric[] = [
  {
    label: "Monthly Originations",
    value: "$1.7B+",
    proof: "Managed originations risk across 178 Southeast Toyota dealerships.",
  },
  {
    label: "Credit Quality",
    value: "+14%",
    proof: "Quarter-over-quarter improvement in originations credit quality.",
  },
  {
    label: "Expected Loss Rate",
    value: "-100 bps",
    proof: "Reduced expected lifetime loss from 4.2% to 3.2%.",
  },
  {
    label: "Decision Automation",
    value: "+15%",
    proof: "Optimized credit policy rules to increase automated decisioning year over year.",
  },
];

export const richardSystems: RichardSystemCard[] = [
  {
    id: "champion-challenger-policy-engine",
    name: "Champion / Challenger Credit Policy Engine",
    company: "Southeast Toyota Finance",
    period: "2017-2018",
    strapline: "Policy changes moved from static cutoffs to monitored decision experiments.",
    inputs: ["Origination applications", "Scorecard cutoff performance", "Portfolio risk signals", "Dealer channel mix"],
    logic: [
      "Used champion / challenger testing to compare policy variants before full rollout.",
      "Ran SAS-based simulations on scorecard cutoffs and expected-loss outcomes.",
      "Fed leadership recommendations into monthly portfolio performance reviews.",
    ],
    outputs: ["Production credit policy changes", "Decision-engine rule updates", "Portfolio risk recommendations"],
    outcomes: [
      "+15% automated decisioning",
      "+14% credit quality improvement QoQ",
      "-100 bps expected lifetime loss rate",
    ],
    capabilities: ["Credit risk strategy", "Underwriting systems", "Portfolio analytics"],
  },
  {
    id: "decision-logic-system",
    name: "Loan Origination Decision Logic System",
    company: "Wells Fargo Consumer Lending",
    period: "2015-2017",
    strapline: "A judgmental underwriting support layer that made credit logic operational.",
    inputs: ["Tax-return analysis", "Cash-flow procedures", "Credit-quality ratios", "Underwriter review patterns"],
    logic: [
      "Built a decision logic tool to guide underwriters toward consistent credit-quality analysis.",
      "Integrated the tool into enterprise lending software for production use.",
      "Paired the tool with quality-review templates and operating procedures.",
    ],
    outputs: ["Faster decisions", "Standardized underwriting review", "Embedded credit-quality checks"],
    outcomes: [
      "+152% year-over-year underwriter decision time improvement",
      ">110% of application turn-time goal",
      "-15% losses after enterprise integration",
      "-68% quality risk findings year over year",
    ],
    capabilities: ["Underwriting systems", "Lending systems", "Analytics & BI"],
  },
  {
    id: "loss-monitoring-tracker",
    name: "Portfolio Loss Monitoring + Roll Rate Tracker",
    company: "Experian / Client Advisory",
    period: "2018-Present",
    strapline: "Monitoring and reporting systems tied model decisions to portfolio outcomes.",
    inputs: ["Portfolio performance data", "Advanced analytics solutions", "Client operating metrics", "Lifecycle behavior"],
    logic: [
      "Designed reporting and monitoring processes to measure deployed strategy effectiveness.",
      "Connected model performance, risk, marketing, and operations into a single management rhythm.",
      "Used consulting diagnostics to identify acquisition, underwriting, and loss-mitigation opportunities.",
    ],
    outputs: ["Interactive dashboards", "Portfolio monitoring packs", "ROI and performance readouts"],
    outcomes: [
      "-8% client losses from enhanced risk models",
      "+15% average first-year ROI visibility on deployed solutions",
      "+25% loan origination process efficiency for a major automotive lender",
    ],
    capabilities: ["Portfolio analytics", "Analytics & BI", "Data infrastructure"],
  },
  {
    id: "pricing-cutoff-framework",
    name: "Risk-Based Pricing + Cutoff Optimization Framework",
    company: "Experian / Client Advisory",
    period: "2018-Present",
    strapline: "Decisioning infrastructure built to balance growth, automation, and losses.",
    inputs: ["Predictive data", "Quantitative models", "Channel strategies", "Regulatory constraints"],
    logic: [
      "Mapped risk-based solutions into client acquisition and underwriting workflows.",
      "Connected predictive analytics with deployment strategy and implementation planning.",
      "Balanced automation gains with portfolio growth and regulatory alignment.",
    ],
    outputs: ["Targeted acquisition strategies", "Risk-based pricing recommendations", "Deployment roadmaps"],
    outcomes: [
      "+12% new customer acquisition in six months for a retail bank client",
      "-5% initial customer risk through improved predictive modeling",
      "$1.5MM estimated new revenue tied to one targeted acquisition program",
    ],
    capabilities: ["Credit risk strategy", "Underwriting systems", "Lending systems"],
  },
  {
    id: "origination-dashboard-stack",
    name: "Origination Performance Dashboard Stack",
    company: "Southeast Toyota Finance",
    period: "2017-2018",
    strapline: "Executive and analyst dashboards turned originations into an operating system.",
    inputs: ["Origination metrics", "Policy-rule outcomes", "Analyst workflow data", "Portfolio performance trends"],
    logic: [
      "Built executive-level and analyst-level dashboards in Tableau and SAS.",
      "Automated recurring reporting for monthly portfolio and strategy meetings.",
      "Used the reporting stack to guide rule changes, vendor evaluation, and model rollout.",
    ],
    outputs: ["Executive dashboards", "Automated analyst dashboards", "Performance review cadence"],
    outcomes: [
      "$1.7B+ monthly originations monitored",
      "178 dealerships supported in one regional lending network",
      "Faster risk decision cycles and clearer deployment governance",
    ],
    capabilities: ["Portfolio analytics", "Analytics & BI", "Data infrastructure"],
  },
];

export const richardTimelineRoles: RichardTimelineRole[] = [
  {
    id: "wells-financial",
    company: "Wells Fargo Financial",
    title: "Branch Manager / Senior Credit Manager",
    period: "2008-2010",
    summary: "Started in frontline lending operations, underwriting, sales training, and compliance.",
    inflection: "Built the base operating judgment behind credit decisions and loan process control.",
    layers: [
      { label: "Credit Risk Strategy", value: 24 },
      { label: "Underwriting Systems", value: 18 },
      { label: "Portfolio Analytics", value: 8 },
      { label: "Data / BI Infrastructure", value: 5 },
    ],
  },
  {
    id: "wells-home-mortgage",
    company: "Wells Fargo Home Mortgage",
    title: "Lending Manager - AVP",
    period: "2012-2015",
    summary: "Ran mortgage modification underwriting and remediation across high-risk investor portfolios.",
    inflection: "Shifted from loan handling to regulated portfolio-risk control with tool testing and remediation.",
    layers: [
      { label: "Credit Risk Strategy", value: 46 },
      { label: "Underwriting Systems", value: 38 },
      { label: "Portfolio Analytics", value: 22 },
      { label: "Data / BI Infrastructure", value: 14 },
    ],
  },
  {
    id: "wells-consumer-lending",
    company: "Wells Fargo Consumer Lending",
    title: "Lending Manager - VP",
    period: "2015-2017",
    summary: "Led national tax-analysis and underwriting operations, then embedded decision logic into production lending software.",
    inflection: "This is where Richard becomes a systems operator rather than a reviewer.",
    layers: [
      { label: "Credit Risk Strategy", value: 68 },
      { label: "Underwriting Systems", value: 72 },
      { label: "Portfolio Analytics", value: 44 },
      { label: "Data / BI Infrastructure", value: 28 },
    ],
  },
  {
    id: "southeast-toyota",
    company: "Southeast Toyota Finance",
    title: "Risk Manager",
    period: "2017-2018",
    summary: "Controlled origination and portfolio risk across a $1.7B monthly lending machine.",
    inflection: "Clear proof of scale: policy rules, dashboards, scorecards, model launches, and loss reduction.",
    layers: [
      { label: "Credit Risk Strategy", value: 90 },
      { label: "Underwriting Systems", value: 88 },
      { label: "Portfolio Analytics", value: 74 },
      { label: "Data / BI Infrastructure", value: 48 },
    ],
  },
  {
    id: "experian",
    company: "Experian",
    title: "Senior Business Consultant, Solutions Engineering and Advisory Services",
    period: "2018-Present",
    summary: "Operates across lenders as a decisioning advisor, pushing predictive analytics into deployed lending systems.",
    inflection: "Expands from one lender’s risk stack to many, with growth, automation, and loss control tied together.",
    layers: [
      { label: "Credit Risk Strategy", value: 100 },
      { label: "Underwriting Systems", value: 96 },
      { label: "Portfolio Analytics", value: 92 },
      { label: "Data / BI Infrastructure", value: 70 },
    ],
  },
];

export const richardCapabilityClusters: RichardCapabilityCluster[] = [
  {
    name: "Credit Risk",
    nodes: [
      {
        id: "policy-design",
        label: "Policy design",
        outcome: "+15% automation without losing portfolio quality.",
        systemIds: ["champion-challenger-policy-engine", "pricing-cutoff-framework"],
      },
      {
        id: "scorecard-cutoffs",
        label: "Scorecard cutoffs",
        outcome: "-100 bps expected lifetime loss rate.",
        systemIds: ["champion-challenger-policy-engine"],
      },
      {
        id: "risk-based-pricing",
        label: "Risk-based pricing",
        outcome: "+12% acquisition with lower initial risk.",
        systemIds: ["pricing-cutoff-framework"],
      },
    ],
  },
  {
    name: "Analytics & BI",
    nodes: [
      {
        id: "exec-dashboards",
        label: "Executive dashboards",
        outcome: "$1.7B+ monthly originations monitored in operating rhythm.",
        systemIds: ["origination-dashboard-stack", "loss-monitoring-tracker"],
      },
      {
        id: "monitoring-frameworks",
        label: "Monitoring frameworks",
        outcome: "Losses reduced and ROI made visible after deployment.",
        systemIds: ["loss-monitoring-tracker"],
      },
      {
        id: "quality-review",
        label: "Quality review",
        outcome: "-68% quality risk findings year over year.",
        systemIds: ["decision-logic-system"],
      },
    ],
  },
  {
    name: "Data Infrastructure",
    nodes: [
      {
        id: "sas-modeling",
        label: "SAS scorecard tooling",
        outcome: "New in-house credit scoring model deployed.",
        systemIds: ["champion-challenger-policy-engine", "origination-dashboard-stack"],
      },
      {
        id: "reporting-stack",
        label: "Reporting stack",
        outcome: "Interactive portfolio feedback loops instead of ad hoc reviews.",
        systemIds: ["loss-monitoring-tracker", "origination-dashboard-stack"],
      },
    ],
  },
  {
    name: "Lending Systems",
    nodes: [
      {
        id: "decision-operations",
        label: "Decision operations",
        outcome: "Faster turns, lower losses, and cleaner credit decisions.",
        systemIds: ["decision-logic-system", "champion-challenger-policy-engine"],
      },
      {
        id: "servicing-origination-linkage",
        label: "Origination-to-servicing control",
        outcome: "Risk criteria tied to auditable, deployable lender workflows.",
        systemIds: ["pricing-cutoff-framework", "loss-monitoring-tracker"],
      },
    ],
  },
];

export const richardActivityFeed: RichardActivityItem[] = [
  {
    title: "Portfolio loss review",
    detail: "Roll-rate movement checked against current cutoff strategy and dealer mix.",
    status: "Simulated live activity",
    timestamp: "09:10 ET",
  },
  {
    title: "Champion / challenger reset",
    detail: "Alternative policy branch prepared for next automated-decision test cycle.",
    status: "Simulated live activity",
    timestamp: "10:25 ET",
  },
  {
    title: "Dashboard refresh",
    detail: "Originations and expected-loss views updated for leadership operating review.",
    status: "Simulated live activity",
    timestamp: "11:40 ET",
  },
  {
    title: "Model tuning check",
    detail: "Scorecard cutoff sensitivity reviewed against growth and loss targets.",
    status: "Simulated live activity",
    timestamp: "13:05 ET",
  },
];

export const richardChatStarters = [
  "What systems has Richard actually operated?",
  "How did Richard improve returns while controlling risk?",
  "Explain the $1.7B monthly originations scope.",
  "Why is Richard a strong fit for Head of Credit Risk & Analytics?",
];

export const richardOperatorProfile = {
  name: "Richard de Oliveira",
  title: "Credit Risk & Analytics Systems for Lending Platforms",
  subtext:
    "Building underwriting, portfolio analytics, and decisioning infrastructure that improves risk-adjusted returns.",
  thesis:
    "Richard is an operator of lending decision systems: he improves portfolio quality, automates decisions, lowers loss rates, and makes risk visible at production scale.",
  contact: {
    email: "richard.oliveira@live.com",
    location: "West Palm Beach, FL",
    phone: "(336) 327-9043",
  },
  heroMetrics: richardHeroMetrics,
  systems: richardSystems,
  timeline: richardTimelineRoles,
  capabilityClusters: richardCapabilityClusters,
  activityFeed: richardActivityFeed,
  chatStarters: richardChatStarters,
};


import { useState, useEffect, useRef } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: "#0A0C10",
  surface: "#0F1318",
  card: "#141921",
  border: "#1E2630",
  borderHover: "#2E3D50",
  gold: "#C9A84C",
  goldLight: "#E8C97A",
  goldDim: "#7A6030",
  cyan: "#3DD6C8",
  cyanDim: "#1A4A47",
  red: "#E05A5A",
  text: "#E8EDF2",
  textMid: "#8A9BAD",
  textDim: "#4A5A6A",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=JetBrains+Mono:wght@300;400;500&family=Syne:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: ${T.bg};
    color: ${T.text};
    font-family: 'Syne', sans-serif;
    min-height: 100vh;
  }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: ${T.goldDim}; border-radius: 2px; }

  .app-wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 52px;
  }
  .header-logo {
    width: 36px; height: 36px;
    border: 1.5px solid ${T.gold};
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    color: ${T.gold};
    letter-spacing: -1px;
  }
  .header-wordmark {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 600;
    color: ${T.text};
    letter-spacing: 0.5px;
  }
  .header-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: ${T.gold};
    border: 1px solid ${T.goldDim};
    border-radius: 3px;
    padding: 2px 7px;
    letter-spacing: 1px;
  }
  .header-rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, ${T.border} 0%, transparent 100%);
    margin-left: 8px;
  }

  /* ── Hero ── */
  .hero {
    margin-bottom: 44px;
  }
  .hero-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: ${T.gold};
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .hero-title {
    font-family: 'Playfair Display', serif;
    font-size: 40px;
    font-weight: 700;
    line-height: 1.15;
    color: ${T.text};
    margin-bottom: 16px;
  }
  .hero-title span { color: ${T.gold}; }
  .hero-sub {
    font-size: 15px;
    color: ${T.textMid};
    max-width: 580px;
    line-height: 1.7;
  }

  /* ── Progress steps ── */
  .steps {
    display: flex;
    gap: 0;
    margin-bottom: 40px;
    border: 1px solid ${T.border};
    border-radius: 10px;
    overflow: hidden;
  }
  .step {
    flex: 1;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: ${T.surface};
    border-right: 1px solid ${T.border};
    cursor: default;
    transition: background 0.2s;
    position: relative;
  }
  .step:last-child { border-right: none; }
  .step.active { background: ${T.card}; }
  .step.done { background: ${T.surface}; }
  .step-num {
    width: 24px; height: 24px;
    border-radius: 50%;
    border: 1.5px solid ${T.border};
    display: flex; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: ${T.textDim};
    flex-shrink: 0;
    transition: all 0.3s;
  }
  .step.active .step-num {
    border-color: ${T.gold};
    color: ${T.gold};
    background: rgba(201,168,76,0.08);
  }
  .step.done .step-num {
    border-color: ${T.cyan};
    background: rgba(61,214,200,0.08);
    color: ${T.cyan};
  }
  .step-label {
    font-size: 12px;
    color: ${T.textDim};
    font-weight: 500;
    letter-spacing: 0.2px;
  }
  .step.active .step-label { color: ${T.text}; }
  .step.done .step-label { color: ${T.textMid}; }

  /* ── Form cards ── */
  .form-card {
    background: ${T.card};
    border: 1px solid ${T.border};
    border-radius: 12px;
    padding: 32px;
    margin-bottom: 24px;
    animation: fadeUp 0.35s ease both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .form-card-title {
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    color: ${T.text};
    margin-bottom: 4px;
  }
  .form-card-sub {
    font-size: 12px;
    color: ${T.textMid};
    margin-bottom: 28px;
    line-height: 1.6;
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .field-row.full { grid-template-columns: 1fr; }
  @media (max-width: 600px) { .field-row { grid-template-columns: 1fr; } }

  .field-label {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: ${T.textMid};
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 8px;
    display: block;
  }

  input, select, textarea {
    width: 100%;
    background: ${T.bg};
    border: 1px solid ${T.border};
    border-radius: 7px;
    color: ${T.text};
    font-family: 'Syne', sans-serif;
    font-size: 14px;
    padding: 11px 14px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    -webkit-appearance: none;
  }
  input::placeholder, textarea::placeholder { color: ${T.textDim}; }
  input:focus, select:focus, textarea:focus {
    border-color: ${T.goldDim};
    box-shadow: 0 0 0 3px rgba(201,168,76,0.07);
  }
  select option { background: ${T.bg}; }
  textarea { resize: vertical; min-height: 90px; line-height: 1.6; }

  /* ── Tag chips ── */
  .tag-group { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag {
    padding: 6px 13px;
    border-radius: 20px;
    border: 1px solid ${T.border};
    font-size: 12px;
    color: ${T.textMid};
    cursor: pointer;
    transition: all 0.18s;
    background: ${T.bg};
    user-select: none;
  }
  .tag:hover { border-color: ${T.goldDim}; color: ${T.text}; }
  .tag.selected {
    border-color: ${T.gold};
    color: ${T.gold};
    background: rgba(201,168,76,0.08);
  }

  /* ── Buttons ── */
  .btn-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 32px;
    gap: 12px;
  }
  .btn {
    padding: 12px 28px;
    border-radius: 8px;
    font-family: 'Syne', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    letter-spacing: 0.3px;
  }
  .btn-primary {
    background: ${T.gold};
    color: #0A0C10;
  }
  .btn-primary:hover { background: ${T.goldLight}; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(201,168,76,0.25); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
  .btn-ghost {
    background: transparent;
    color: ${T.textMid};
    border: 1px solid ${T.border};
  }
  .btn-ghost:hover { border-color: ${T.borderHover}; color: ${T.text}; }

  /* ── Generate button ── */
  .btn-generate {
    background: linear-gradient(135deg, #C9A84C 0%, #E8C97A 50%, #C9A84C 100%);
    background-size: 200% 200%;
    color: #0A0C10;
    padding: 14px 36px;
    font-size: 15px;
    animation: shimmer 3s linear infinite;
    border-radius: 8px;
  }
  @keyframes shimmer {
    0%   { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .btn-generate:hover { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(201,168,76,0.3); }

  /* ── Loading ── */
  .loading-wrap {
    background: ${T.card};
    border: 1px solid ${T.border};
    border-radius: 12px;
    padding: 60px 32px;
    text-align: center;
    animation: fadeUp 0.3s ease both;
  }
  .loading-icon {
    width: 56px; height: 56px;
    margin: 0 auto 24px;
    border: 2px solid ${T.border};
    border-top-color: ${T.gold};
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-label {
    font-family: 'Playfair Display', serif;
    font-size: 20px;
    color: ${T.text};
    margin-bottom: 8px;
  }
  .loading-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: ${T.textMid};
    letter-spacing: 1px;
  }
  .loading-phases {
    margin-top: 32px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 360px;
    margin-left: auto;
    margin-right: auto;
  }
  .loading-phase {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: ${T.textDim};
    transition: color 0.5s;
  }
  .loading-phase.active { color: ${T.text}; }
  .loading-phase.done { color: ${T.textMid}; }
  .phase-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: ${T.textDim};
    flex-shrink: 0;
    transition: background 0.5s;
  }
  .loading-phase.active .phase-dot { background: ${T.gold}; box-shadow: 0 0 8px ${T.gold}; }
  .loading-phase.done .phase-dot { background: ${T.cyan}; }

  /* ── Strategy output ── */
  .strategy-wrap { animation: fadeUp 0.4s ease both; }
  .strategy-header {
    background: ${T.card};
    border: 1px solid ${T.border};
    border-radius: 12px 12px 0 0;
    border-bottom: none;
    padding: 28px 32px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .strategy-meta {
    flex: 1;
  }
  .strategy-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: ${T.cyan};
    letter-spacing: 2.5px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .strategy-company {
    font-family: 'Playfair Display', serif;
    font-size: 26px;
    font-weight: 700;
    color: ${T.text};
    margin-bottom: 6px;
  }
  .strategy-desc {
    font-size: 13px;
    color: ${T.textMid};
    line-height: 1.6;
  }
  .strategy-badges {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-end;
    flex-shrink: 0;
  }
  .strategy-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid;
    letter-spacing: 0.8px;
  }
  .strategy-badge.gold { color: ${T.gold}; border-color: ${T.goldDim}; background: rgba(201,168,76,0.06); }
  .strategy-badge.cyan { color: ${T.cyan}; border-color: ${T.cyanDim}; background: rgba(61,214,200,0.06); }

  .strategy-body {
    background: ${T.card};
    border: 1px solid ${T.border};
    border-radius: 0 0 12px 12px;
    overflow: hidden;
  }

  /* Markdown-like content within strategy */
  .strategy-section {
    padding: 28px 32px;
    border-bottom: 1px solid ${T.border};
  }
  .strategy-section:last-child { border-bottom: none; }
  .section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: ${T.gold};
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, ${T.goldDim}20, transparent);
  }
  .section-content {
    font-size: 14px;
    color: ${T.textMid};
    line-height: 1.8;
    white-space: pre-wrap;
  }
  .section-content strong { color: ${T.text}; font-weight: 600; }

  /* Initiative cards */
  .initiative-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-top: 4px;
  }
  @media (max-width: 640px) { .initiative-grid { grid-template-columns: 1fr; } }
  .initiative-card {
    background: ${T.bg};
    border: 1px solid ${T.border};
    border-radius: 9px;
    padding: 18px;
    transition: border-color 0.2s;
  }
  .initiative-card:hover { border-color: ${T.borderHover}; }
  .initiative-priority {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    letter-spacing: 1.5px;
    padding: 3px 8px;
    border-radius: 3px;
    margin-bottom: 10px;
    display: inline-block;
  }
  .p-high { color: ${T.gold}; background: rgba(201,168,76,0.08); border: 1px solid ${T.goldDim}; }
  .p-medium { color: ${T.cyan}; background: rgba(61,214,200,0.08); border: 1px solid ${T.cyanDim}; }
  .p-low { color: ${T.textMid}; background: rgba(255,255,255,0.03); border: 1px solid ${T.border}; }
  .initiative-name {
    font-size: 14px;
    font-weight: 600;
    color: ${T.text};
    margin-bottom: 6px;
  }
  .initiative-desc { font-size: 12px; color: ${T.textMid}; line-height: 1.6; }
  .initiative-meta {
    display: flex;
    gap: 12px;
    margin-top: 10px;
  }
  .imeta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: ${T.textDim};
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Roadmap timeline */
  .roadmap { display: flex; flex-direction: column; gap: 0; }
  .phase-block {
    display: flex;
    gap: 20px;
    padding: 0 0 24px 0;
    position: relative;
  }
  .phase-block:last-child { padding-bottom: 0; }
  .phase-line {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 32px;
  }
  .phase-dot-big {
    width: 32px; height: 32px;
    border-radius: 50%;
    border: 2px solid ${T.gold};
    background: rgba(201,168,76,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: ${T.gold};
    flex-shrink: 0;
  }
  .phase-connector {
    flex: 1;
    width: 1px;
    background: ${T.border};
    margin: 4px 0;
  }
  .phase-content { flex: 1; padding-top: 5px; }
  .phase-title {
    font-size: 14px;
    font-weight: 600;
    color: ${T.text};
    margin-bottom: 4px;
  }
  .phase-period {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: ${T.gold};
    margin-bottom: 8px;
    letter-spacing: 1px;
  }
  .phase-items { list-style: none; }
  .phase-items li {
    font-size: 12px;
    color: ${T.textMid};
    padding: 3px 0;
    padding-left: 14px;
    position: relative;
    line-height: 1.5;
  }
  .phase-items li::before {
    content: '›';
    position: absolute;
    left: 0;
    color: ${T.goldDim};
  }

  /* Quick wins / risks */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 600px) { .two-col { grid-template-columns: 1fr; } }
  .mini-card {
    background: ${T.bg};
    border: 1px solid ${T.border};
    border-radius: 8px;
    padding: 14px 16px;
  }
  .mini-card-title {
    font-size: 12px;
    font-weight: 600;
    color: ${T.text};
    margin-bottom: 4px;
  }
  .mini-card-body { font-size: 12px; color: ${T.textMid}; line-height: 1.5; }

  /* CTA bar */
  .cta-bar {
    background: ${T.surface};
    border: 1px solid ${T.border};
    border-top: none;
    border-radius: 0 0 12px 12px;
    padding: 20px 32px;
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: flex-end;
  }

  /* Slider */
  .slider-wrap { margin-top: 8px; }
  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    background: ${T.border};
    border-radius: 2px;
    border: none;
    padding: 0;
    cursor: pointer;
    outline: none;
    box-shadow: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: ${T.gold};
    cursor: pointer;
    border: 2px solid ${T.bg};
    box-shadow: 0 0 0 1px ${T.gold};
  }
  .slider-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: ${T.textDim};
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${T.card};
    border: 1px solid ${T.border};
    border-left: 3px solid ${T.cyan};
    border-radius: 8px;
    padding: 14px 18px;
    font-size: 13px;
    color: ${T.text};
    animation: slideIn 0.3s ease;
    z-index: 999;
    max-width: 300px;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;

// ─── Constants ────────────────────────────────────────────────────────────────
const INDUSTRIES = [
  "Real Estate Private Equity","Commercial Real Estate","Investment Management",
  "Construction","Legal Services","Healthcare","Logistics & Supply Chain",
  "Financial Services","Technology","Manufacturing","Retail","Professional Services",
];

const PAIN_POINTS = [
  "Manual data entry","Slow reporting cycles","Poor data visibility",
  "Disconnected systems","High operational costs","Compliance burden",
  "Slow deal execution","Talent retention","Client communication gaps",
  "Forecasting accuracy","Document management","Vendor management",
];

const AI_GOALS = [
  "Automate workflows","Accelerate underwriting","Improve forecasting",
  "Enhance client experience","Reduce headcount costs","Generate new revenue",
  "Competitive differentiation","Better risk management","Faster reporting",
  "Market intelligence","Streamline compliance","Knowledge management",
];

const TECH_STACKS = [
  "Microsoft 365","Google Workspace","Salesforce","HubSpot","SAP","Oracle",
  "Yardi","MRI Software","Databricks","Snowflake","Power BI","Tableau",
  "QuickBooks","NetSuite","Custom/Legacy","Minimal tech stack",
];

const AI_MATURITY_LEVELS = [
  { val: 1, label: "None — We don't use AI at all" },
  { val: 2, label: "Exploring — Some ChatGPT usage" },
  { val: 3, label: "Experimenting — Pilot projects underway" },
  { val: 4, label: "Adopting — AI embedded in some workflows" },
  { val: 5, label: "Advanced — AI-native operations" },
];

const LOADING_PHASES = [
  "Analyzing business profile...",
  "Assessing AI maturity baseline...",
  "Mapping pain points to AI capabilities...",
  "Generating initiative roadmap...",
  "Calculating ROI projections...",
  "Finalizing strategy document...",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function TagSelector({ options, selected, onToggle, max }) {
  return (
    <div className="tag-group">
      {options.map(opt => {
        const sel = selected.includes(opt);
        const disabled = !sel && max && selected.length >= max;
        return (
          <div
            key={opt}
            className={`tag${sel ? " selected" : ""}${disabled ? " disabled" : ""}`}
            onClick={() => !disabled && onToggle(opt)}
            style={disabled ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            {opt}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WinstonAIStrategy() {
  const [step, setStep] = useState(0); // 0=Business, 1=Tech, 2=Goals, 3=Generate
  const [loading, setLoading] = useState(false);
  const [loadPhase, setLoadPhase] = useState(0);
  const [strategy, setStrategy] = useState(null);
  const [toast, setToast] = useState(null);
  const strategyRef = useRef(null);

  const [form, setForm] = useState({
    company: "",
    industry: "",
    size: "",
    revenue: "",
    aiMaturity: 2,
    techStack: [],
    painPoints: [],
    goals: [],
    budget: "",
    timeline: "",
    context: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleArr = (key, val) =>
    setForm(f => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val],
    }));

  // Loading phase ticker
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadPhase(p => Math.min(p + 1, LOADING_PHASES.length - 1)), 2200);
    return () => clearInterval(t);
  }, [loading]);

  // Show toast
  const showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Build the AI prompt
  const buildPrompt = () => `
You are Winston, an AI strategy consultant for ${form.industry || "business"} firms.

Generate a comprehensive, bespoke AI adoption strategy for the following business. Return ONLY valid JSON, no markdown, no preamble.

Business Profile:
- Company: ${form.company || "Client Company"}
- Industry: ${form.industry}
- Team Size: ${form.size}
- Annual Revenue: ${form.revenue}
- AI Maturity (1-5): ${form.aiMaturity} — ${AI_MATURITY_LEVELS.find(x => x.val === form.aiMaturity)?.label}
- Current Tech Stack: ${form.techStack.join(", ") || "Unknown"}
- Key Pain Points: ${form.painPoints.join(", ") || "Not specified"}
- Strategic Goals: ${form.goals.join(", ") || "Not specified"}
- AI Budget: ${form.budget}
- Implementation Timeline: ${form.timeline}
- Additional Context: ${form.context || "None provided"}

Return this exact JSON structure:
{
  "executiveSummary": "2-3 sentence executive summary specific to their industry, maturity level, and goals",
  "currentStateAssessment": "2-3 sentences assessing their starting point based on AI maturity and tech stack",
  "initiatives": [
    {
      "name": "Initiative name",
      "priority": "HIGH|MEDIUM|LOW",
      "description": "1-2 sentence description",
      "timeToValue": "e.g. 4-6 weeks",
      "effort": "LOW|MEDIUM|HIGH",
      "roi": "Estimated impact"
    }
  ],
  "roadmap": [
    {
      "phase": "Phase name",
      "period": "e.g. Months 1-3",
      "items": ["Action item 1", "Action item 2", "Action item 3"]
    }
  ],
  "quickWins": [
    { "title": "Quick win title", "description": "Brief description" }
  ],
  "risks": [
    { "title": "Risk title", "description": "Brief description" }
  ],
  "recommendedBudgetAllocation": "2 sentences on how to allocate budget across people, tools, and implementation",
  "successMetrics": ["Metric 1", "Metric 2", "Metric 3", "Metric 4"]
}

Be SPECIFIC to their industry (${form.industry}), pain points, and maturity level. Include 4-6 initiatives, 3-4 roadmap phases, 3-4 quick wins, and 3-4 risks.
`;

  const generateStrategy = async () => {
    setLoading(true);
    setLoadPhase(0);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: buildPrompt() }],
        }),
      });
      const data = await res.json();
      const raw = data.content?.map(b => b.text || "").join("");
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setStrategy({ ...parsed, company: form.company || "Client Company", industry: form.industry, maturity: form.aiMaturity });
      setTimeout(() => strategyRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      showToast("Generation failed — check your inputs and retry.");
    } finally {
      setLoading(false);
    }
  };

  const canAdvance = () => {
    if (step === 0) return form.company && form.industry && form.size;
    if (step === 1) return form.techStack.length > 0;
    if (step === 2) return form.painPoints.length > 0 && form.goals.length > 0;
    return true;
  };

  const STEPS = ["Business Profile", "Tech Landscape", "Goals & Pain Points", "Generate"];

  return (
    <>
      <style>{css}</style>
      <div className="app-wrap">
        {/* Header */}
        <div className="header">
          <div className="header-logo">W</div>
          <div className="header-wordmark">Winston</div>
          <div className="header-badge">AI STRATEGY</div>
          <div className="header-rule" />
        </div>

        {/* Hero */}
        {!strategy && (
          <div className="hero">
            <div className="hero-eyebrow">AUTOMATED STRATEGY GENERATION</div>
            <h1 className="hero-title">
              Your AI Roadmap,<br /><span>Built in Minutes</span>
            </h1>
            <p className="hero-sub">
              Answer a few questions about your business and Winston will generate a tailored,
              board-ready AI adoption strategy — with initiatives, phased roadmap, ROI projections,
              and quick wins specific to your industry and maturity level.
            </p>
          </div>
        )}

        {/* Steps */}
        {!strategy && !loading && (
          <div className="steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`step${i === step ? " active" : i < step ? " done" : ""}`}>
                <div className="step-num">
                  {i < step ? "✓" : i + 1}
                </div>
                <div className="step-label">{s}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 0: Business Profile ── */}
        {!loading && !strategy && step === 0 && (
          <div className="form-card">
            <div className="form-card-title">Tell us about your business</div>
            <div className="form-card-sub">
              This gives Winston the foundation to tailor your strategy to your specific context.
            </div>

            <div className="field-row">
              <div>
                <label className="field-label">Company Name</label>
                <input value={form.company} onChange={e => set("company", e.target.value)} placeholder="Acme Capital Partners" />
              </div>
              <div>
                <label className="field-label">Industry / Vertical</label>
                <select value={form.industry} onChange={e => set("industry", e.target.value)}>
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div className="field-row">
              <div>
                <label className="field-label">Team Size</label>
                <select value={form.size} onChange={e => set("size", e.target.value)}>
                  <option value="">Select size...</option>
                  {["1–10 employees","11–50 employees","51–200 employees","201–500 employees","500+ employees"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Annual Revenue (approx.)</label>
                <select value={form.revenue} onChange={e => set("revenue", e.target.value)}>
                  <option value="">Select range...</option>
                  {["Under $1M","$1M–$5M","$5M–$25M","$25M–$100M","$100M–$500M","$500M+"].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="field-row full">
              <div>
                <label className="field-label">Current AI Maturity — Level {form.aiMaturity}</label>
                <div className="slider-wrap">
                  <input type="range" min={1} max={5} value={form.aiMaturity}
                    onChange={e => set("aiMaturity", +e.target.value)} />
                  <div className="slider-labels">
                    <span>No AI</span>
                    <span style={{ color: T.textMid }}>
                      {AI_MATURITY_LEVELS.find(x => x.val === form.aiMaturity)?.label}
                    </span>
                    <span>Advanced</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="btn-row">
              <span style={{ fontSize: 12, color: T.textDim }}>Fields marked with * required to advance</span>
              <button className="btn btn-primary" disabled={!canAdvance()} onClick={() => setStep(1)}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Tech Landscape ── */}
        {!loading && !strategy && step === 1 && (
          <div className="form-card">
            <div className="form-card-title">Current technology landscape</div>
            <div className="form-card-sub">
              Select all platforms your team actively uses. Winston will identify integration opportunities and avoid redundant recommendations.
            </div>

            <label className="field-label">Tech Stack (select all that apply)</label>
            <TagSelector options={TECH_STACKS} selected={form.techStack} onToggle={v => toggleArr("techStack", v)} />

            <div style={{ marginTop: 24 }}>
              <label className="field-label">AI Budget Range</label>
              <select value={form.budget} onChange={e => set("budget", e.target.value)}>
                <option value="">Select budget...</option>
                {["Under $25K/yr","$25K–$100K/yr","$100K–$250K/yr","$250K–$1M/yr","$1M+ / enterprise"].map(b => <option key={b}>{b}</option>)}
              </select>
            </div>

            <div style={{ marginTop: 16 }}>
              <label className="field-label">Implementation Timeline</label>
              <select value={form.timeline} onChange={e => set("timeline", e.target.value)}>
                <option value="">Select timeline...</option>
                {["ASAP (under 3 months)","3–6 months","6–12 months","12–24 months","Long-term (2+ years)"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-primary" disabled={!canAdvance()} onClick={() => setStep(2)}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Goals & Pain Points ── */}
        {!loading && !strategy && step === 2 && (
          <div className="form-card">
            <div className="form-card-title">Pain points & strategic goals</div>
            <div className="form-card-sub">
              Be honest about where your business struggles — this directly shapes which AI initiatives Winston prioritizes.
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="field-label">Primary Pain Points (pick up to 5)</label>
              <TagSelector options={PAIN_POINTS} selected={form.painPoints} onToggle={v => toggleArr("painPoints", v)} max={5} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="field-label">Strategic AI Goals (pick up to 4)</label>
              <TagSelector options={AI_GOALS} selected={form.goals} onToggle={v => toggleArr("goals", v)} max={4} />
            </div>

            <div>
              <label className="field-label">Additional Context (optional)</label>
              <textarea
                value={form.context}
                onChange={e => set("context", e.target.value)}
                placeholder="Anything else Winston should know — unique constraints, competitive landscape, recent initiatives, upcoming events..."
              />
            </div>

            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary btn-generate" disabled={!canAdvance()} onClick={() => { setStep(3); generateStrategy(); }}>
                Generate AI Strategy
              </button>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="loading-wrap">
            <div className="loading-icon" />
            <div className="loading-label">Generating your strategy</div>
            <div className="loading-sub">WINSTON · AI STRATEGY ENGINE · PROCESSING</div>
            <div className="loading-phases">
              {LOADING_PHASES.map((p, i) => (
                <div key={p} className={`loading-phase${i === loadPhase ? " active" : i < loadPhase ? " done" : ""}`}>
                  <div className="phase-dot" />
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Strategy Output ── */}
        {strategy && !loading && (
          <div className="strategy-wrap" ref={strategyRef}>
            {/* Header */}
            <div className="strategy-header">
              <div className="strategy-meta">
                <div className="strategy-eyebrow">AI STRATEGY REPORT · WINSTON</div>
                <div className="strategy-company">{strategy.company}</div>
                <div className="strategy-desc">{strategy.industry} · {form.size} · {form.revenue}</div>
              </div>
              <div className="strategy-badges">
                <div className="strategy-badge gold">MATURITY L{strategy.maturity}/5</div>
                <div className="strategy-badge cyan">CONFIDENTIAL</div>
                <div className="strategy-badge" style={{ color: T.textDim, borderColor: T.border }}>
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
                </div>
              </div>
            </div>

            <div className="strategy-body">
              {/* Executive Summary */}
              <div className="strategy-section">
                <div className="section-label">Executive Summary</div>
                <div className="section-content">{strategy.executiveSummary}</div>
              </div>

              {/* Current State */}
              <div className="strategy-section">
                <div className="section-label">Current State Assessment</div>
                <div className="section-content">{strategy.currentStateAssessment}</div>
              </div>

              {/* Initiatives */}
              <div className="strategy-section">
                <div className="section-label">Recommended AI Initiatives</div>
                <div className="initiative-grid">
                  {(strategy.initiatives || []).map((init, i) => (
                    <div key={i} className="initiative-card">
                      <div className={`initiative-priority p-${init.priority?.toLowerCase()}`}>
                        {init.priority} PRIORITY
                      </div>
                      <div className="initiative-name">{init.name}</div>
                      <div className="initiative-desc">{init.description}</div>
                      <div className="initiative-meta">
                        <div className="imeta">⏱ {init.timeToValue}</div>
                        <div className="imeta">⚡ {init.effort} effort</div>
                      </div>
                      {init.roi && (
                        <div style={{ marginTop: 8, fontSize: 11, color: T.cyan, fontFamily: "JetBrains Mono", letterSpacing: "0.5px" }}>
                          ROI: {init.roi}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Roadmap */}
              <div className="strategy-section">
                <div className="section-label">Implementation Roadmap</div>
                <div className="roadmap">
                  {(strategy.roadmap || []).map((ph, i) => (
                    <div key={i} className="phase-block">
                      <div className="phase-line">
                        <div className="phase-dot-big">{i + 1}</div>
                        {i < (strategy.roadmap.length - 1) && <div className="phase-connector" />}
                      </div>
                      <div className="phase-content">
                        <div className="phase-title">{ph.phase}</div>
                        <div className="phase-period">{ph.period}</div>
                        <ul className="phase-items">
                          {(ph.items || []).map((item, j) => <li key={j}>{item}</li>)}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Wins & Risks */}
              <div className="strategy-section">
                <div className="section-label">Quick Wins & Risk Considerations</div>
                <div className="two-col">
                  <div>
                    <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: T.cyan, letterSpacing: 1.5, marginBottom: 10 }}>QUICK WINS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(strategy.quickWins || []).map((w, i) => (
                        <div key={i} className="mini-card">
                          <div className="mini-card-title">✦ {w.title}</div>
                          <div className="mini-card-body">{w.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: T.red, letterSpacing: 1.5, marginBottom: 10 }}>RISK FLAGS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(strategy.risks || []).map((r, i) => (
                        <div key={i} className="mini-card" style={{ borderColor: "rgba(224,90,90,0.15)" }}>
                          <div className="mini-card-title" style={{ color: "#E8897A" }}>⚠ {r.title}</div>
                          <div className="mini-card-body">{r.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Budget + Metrics */}
              <div className="strategy-section">
                <div className="section-label">Budget Guidance</div>
                <div className="section-content">{strategy.recommendedBudgetAllocation}</div>
              </div>

              <div className="strategy-section">
                <div className="section-label">Success Metrics</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {(strategy.successMetrics || []).map((m, i) => (
                    <div key={i} style={{
                      background: T.bg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "8px 14px",
                      fontSize: 12,
                      color: T.textMid,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}>
                      <span style={{ color: T.gold }}>◆</span> {m}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CTA bar */}
            <div className="cta-bar">
              <button className="btn btn-ghost" onClick={() => { setStrategy(null); setStep(0); }}>
                ← New Strategy
              </button>
              <button className="btn btn-ghost" onClick={() => showToast("Export to PDF coming soon in Winston v2")}>
                Export PDF
              </button>
              <button className="btn btn-primary" onClick={() => showToast("Strategy saved to Winston workspace")}>
                Save to Workspace
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

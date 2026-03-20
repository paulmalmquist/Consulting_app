---
id: meta-prompt-visual-resume
kind: prompt
status: active
source_of_truth: true
topic: visual-resume-environment
owners:
  - repo-b
  - backend
  - repo-c
intent_tags:
  - build
  - demo
  - resume
  - lab-environment
triggers:
  - visual resume
  - resume environment
  - career dashboard
entrypoint: true
handoff_to:
  - lab-environment
  - ai-copilot
  - feature-dev
when_to_use: "Build the Visual Resume lab environment — an interactive career dashboard with AI assistant that answers questions about Paul's experience, skills, and career timeline."
when_not_to_use: "Not for building the REPE environment or general Winston features."
surface_paths:
  - repo-b/src/app/lab/env/[envId]/resume/
  - repo-c/app/environments/resume/
  - backend/app/services/resume_rag.py
notes:
  - Created 2026-03-19
  - This environment IS the demo — it proves Winston can power any domain, not just REPE
---

# Meta Prompt — Visual Resume Environment
## For a coding agent. Read this in full before touching any file.

> **Purpose:** Build a Demo Lab environment that presents Paul Malmquist's career as an interactive visual dashboard with an AI assistant that can answer any question about his experience, skills, timeline, and capabilities.
>
> **Why this matters:** This is a triple-purpose asset:
> 1. **Personal brand** — a living, interactive resume that stands out from PDF/LinkedIn
> 2. **Winston demo** — proves the platform can power any structured domain, not just REPE
> 3. **Sales conversation starter** — prospects see Winston in action on a relatable dataset (a career) before seeing it on their fund data
>
> The AI assistant must be able to answer questions like:
> - "How long did Paul work at [company]?"
> - "What can Paul do?"
> - "What industries has he worked in?"
> - "Show me his career timeline"
> - "What's his experience with AI?"
> - "Compare his consulting experience vs. product experience"

---

## Repository Rules

| Rule | Detail |
|---|---|
| 3 runtimes | `repo-b/` (Next.js 14 App Router), `backend/` (FastAPI + psycopg), `repo-c/` (Demo Lab) |
| Pattern A | `bosFetch()` → `/bos/[...path]` proxy → FastAPI `backend/` |
| Pattern B | Direct fetch `/api/re/v2/*` → Next route handler → Postgres (NO FastAPI) |
| Pattern C | `apiFetch()` → `/v1/[...path]` proxy → FastAPI `repo-c/` |
| Tests after every change | `make test-frontend` and `make test-backend` |
| Never `git add -A` | Stage specific files only |
| `%%` not `%` in psycopg3 | All raw SQL strings |
| All Pydantic models | `extra = "ignore"`, never `extra = "forbid"` |

---

## CAREER DATA — Paul Malmquist

> **IMPORTANT:** Paul needs to fill in or confirm the details below. The coding agent should seed this data into the database and the RAG corpus. If details are missing, use the placeholder values marked [FILL] and flag them for Paul to update.
>
> Paul — fill this out or paste your LinkedIn profile text here and the agent will parse it:

### Profile

| Field | Value |
|---|---|
| Name | Paul Malmquist |
| Location | Minneapolis, MN |
| Title | Founder & CEO |
| Company | Novendor |
| Email | paul@novendor.com |
| Website | paulmalmquist.com |
| LinkedIn | [FILL — linkedin.com/in/paulmalmquist] |

### Career Timeline

> Fill each role. The more detail, the better the AI assistant answers. Minimum: company, title, start/end, 2-3 bullet points.

```
ROLE 1:
  company: Novendor
  title: Founder & CEO
  start: [FILL — e.g., 2023]
  end: Present
  location: Minneapolis, MN
  industry: Enterprise Software / AI / Real Estate Private Equity
  summary: |
    Founded Novendor to build AI execution environments for investment management firms.
    Built Winston — a vertical AI platform for REPE firms with 83 MCP tools,
    fund reporting, LP communications, waterfall modeling, deal pipeline, and document processing.
    Architecture: FastAPI + Next.js 14 + Postgres, self-hosted, on-prem option.
  key_achievements:
    - Built Winston from scratch: 83 MCP tools, SSE streaming, full REPE domain coverage
    - Architected multi-runtime monorepo (Next.js 14 + FastAPI + Demo Lab)
    - Developed AI execution environment positioning vs. SaaS dependency model
    - [FILL — add 2-3 more]
  skills_used:
    - Python (FastAPI, psycopg3)
    - TypeScript (Next.js 14, React)
    - PostgreSQL
    - AI/ML (Claude, OpenAI, RAG, MCP tools, SSE streaming)
    - Real Estate Private Equity domain (waterfall, LP reporting, DSCR, TVPI, IRR)
    - Product architecture
    - Enterprise sales

ROLE 2:
  company: [FILL]
  title: [FILL]
  start: [FILL]
  end: [FILL]
  location: [FILL]
  industry: [FILL]
  summary: [FILL]
  key_achievements: [FILL]
  skills_used: [FILL]

ROLE 3:
  company: [FILL]
  title: [FILL]
  start: [FILL]
  end: [FILL]
  location: [FILL]
  industry: [FILL]
  summary: [FILL]
  key_achievements: [FILL]
  skills_used: [FILL]

(Add as many roles as needed)
```

### Education

```
DEGREE 1:
  institution: [FILL]
  degree: [FILL]
  field: [FILL]
  year: [FILL]
  notes: [FILL — honors, relevant coursework, activities]

(Add more if applicable)
```

### Skills Inventory

> Group into categories. Rate each 1-5 for the radar chart.

```yaml
Technical:
  Python: 5
  TypeScript/React: 5
  PostgreSQL: 5
  FastAPI: 5
  Next.js: 5
  AI/ML Engineering: 5
  MCP/Tool Use: 5
  SSE/Streaming: 4
  DevOps (Railway/Vercel): 4
  Docker: [FILL]

Domain:
  Real Estate Private Equity: 5
  Waterfall Modeling: 5
  Fund Reporting: 5
  LP Communications: 5
  Deal Pipeline: 5
  Private Credit: [FILL]
  Financial Modeling: [FILL]
  Institutional Sales: [FILL]

Leadership:
  Product Architecture: 5
  Enterprise Sales: [FILL]
  Team Building: [FILL]
  Client Advisory: [FILL]
  Technical Writing: [FILL]
  Strategic Planning: [FILL]
```

### Key Projects / Case Studies

```
PROJECT 1: Winston AI Platform
  client: Novendor (internal product)
  duration: [FILL]
  outcome: |
    Full-stack AI platform for REPE firms. 83 MCP tools, streaming chat workspace,
    fund portfolio management, waterfall engine, deal radar, document ingestion.
    Live at paulmalmquist.com with demo environments.
  technologies: FastAPI, Next.js 14, PostgreSQL, Claude API, SSE, MCP
  metrics:
    - 83 MCP tools
    - 33 assets, 5 funds, $2B+ AUM in demo data
    - Full waterfall engine with LP/GP allocations

PROJECT 2: [FILL]
  client: [FILL]
  duration: [FILL]
  outcome: [FILL]
  technologies: [FILL]
  metrics: [FILL]

(Add more)
```

---

## ENVIRONMENT ARCHITECTURE

### Lab Environment Registration

Create a new Demo Lab environment type: `resume`

**Environment config in repo-c:**
```python
RESUME_ENVIRONMENT = {
    "name": "Paul Malmquist — Interactive Resume",
    "type": "resume",
    "description": "Visual career dashboard with AI assistant",
    "icon": "user",  # or "briefcase"
    "industry": "Professional Profile",
    "modules": [
        "career-timeline",
        "skills-radar",
        "experience-breakdown",
        "project-showcase",
        "ai-assistant",
    ],
}
```

Register this alongside the existing REPE environment in the Demo Lab environment list.

---

## VISUAL COMPONENTS TO BUILD

### 1. Career Timeline (Hero Chart)

**File:** `repo-b/src/app/lab/env/[envId]/resume/page.tsx`

A horizontal timeline chart showing career progression. This is the first thing visitors see.

```
| 2015    | 2017    | 2019    | 2021    | 2023    | 2025    | Present |
|---------|---------|---------|---------|---------|---------|---------|
| [Role1 @ Company1]    | [Role2 @ Company2]      | [Novendor - Founder]  |
```

**Implementation:**
- Use Recharts (already in package.json) or a custom SVG timeline
- Each role is a colored bar spanning its date range
- Hover/click a role → detail panel slides in (title, company, summary, key achievements)
- Color-code by industry or role type (engineering, consulting, leadership)
- Current role highlighted with a pulse animation

**Data shape:**
```typescript
interface CareerRole {
  id: string;
  company: string;
  title: string;
  startDate: string;       // "2023-01"
  endDate: string | null;  // null = present
  industry: string;
  summary: string;
  achievements: string[];
  skills: string[];
  location: string;
}
```

### 2. Skills Radar Chart

**File:** `repo-b/src/components/resume/SkillsRadar.tsx`

A radar/spider chart with 3 overlaid polygons (Technical, Domain, Leadership) showing proficiency levels.

**Implementation:**
- Use Recharts `RadarChart` (same library as existing fund performance charts)
- 3 toggleable skill categories with distinct colors
- Skills rated 1-5 on each axis
- Hover shows exact rating + context ("Python — 5/5 — FastAPI, psycopg3, AI/ML pipelines")
- Optional: animated reveal on scroll

**Data shape:**
```typescript
interface SkillRating {
  skill: string;
  category: "technical" | "domain" | "leadership";
  rating: number;          // 1-5
  context: string;         // "FastAPI, psycopg3, AI/ML pipelines"
}
```

### 3. Experience Breakdown (Pie/Donut Charts)

**File:** `repo-b/src/components/resume/ExperienceBreakdown.tsx`

Three donut charts side by side:
1. **By industry** — years in each industry (REPE, consulting, fintech, etc.)
2. **By role type** — years as engineer vs. architect vs. founder vs. consultant
3. **By technology** — proportional time using each major tech stack

**Implementation:**
- Use Recharts `PieChart` with custom labels
- Click a slice → filters the career timeline to only that segment
- Animated transitions between views
- Shows total years in center of each donut

### 4. Project Showcase Cards

**File:** `repo-b/src/components/resume/ProjectShowcase.tsx`

A grid of project cards showing major deliverables / case studies.

**Each card shows:**
- Project name
- Client (or "Internal")
- Duration
- 1-line outcome
- Technology tags
- Key metrics (numbers/stats)
- Optional: link to live demo (for Winston, link to the REPE environment)

**Card grid layout:** 2-3 columns, responsive. Most impressive projects first.

### 5. KPI Summary Strip

**File:** `repo-b/src/components/resume/ResumeKpiStrip.tsx`

Top-of-page KPI bar (same style as fund portfolio header):

```
| Years Experience | Industries | Technologies | Projects | Tools Built |
|       10+        |     4      |     12+      |    8+    |    83 MCP   |
```

All numbers computed from seed data — not hardcoded.

### 6. AI Assistant Panel

The Winston AI chat interface, scoped to Paul's resume data. Uses the same SSE streaming infrastructure as the REPE environment but with a resume-specific RAG corpus and tool set.

**What it must answer:**

| Question type | Example | Expected response |
|---|---|---|
| Duration | "How long did Paul work at [company]?" | "Paul was at [company] for 3 years and 4 months (Jan 2019 – May 2022)." |
| Skills | "What can Paul do?" | Structured skills summary with categories + key examples |
| Comparison | "Compare his consulting vs product experience" | Side-by-side with years, companies, key differences |
| Timeline | "Show me his career timeline" | Renders a chart block (ChartResponseBlock) with the timeline data |
| Fit check | "Does Paul have experience with [X]?" | Yes/no with evidence (which role, what he did) |
| Referral | "Who should I contact for a reference?" | Paul's email + LinkedIn (do not invent references) |
| Technical | "What AI tools has Paul built?" | Details on Winston, MCP tools, RAG, etc. |
| Fun/human | "What's something interesting about Paul?" | [FILL — Paul should provide 2-3 fun facts] |

---

## BACKEND: RESUME RAG CORPUS

### Seed the Knowledge Base

**File:** `backend/scripts/seed_resume_rag.py` (CREATE)

Seed the RAG vector store with Paul's resume data as structured documents:

```python
RESUME_DOCUMENTS = [
    {
        "doc_type": "career_overview",
        "title": "Paul Malmquist — Career Overview",
        "content": """
        Paul Malmquist is the founder and CEO of Novendor, based in Minneapolis, MN.
        He has 10+ years of experience in real estate private equity technology and operations.
        [... full narrative bio assembled from the Career Data section above ...]
        """,
    },
    {
        "doc_type": "role_detail",
        "title": "Role: Founder & CEO at Novendor",
        "content": """
        Company: Novendor
        Title: Founder & CEO
        Period: [start] – Present
        [... full role detail from Career Data ...]
        """,
    },
    # One doc per role
    {
        "doc_type": "skills_inventory",
        "title": "Paul Malmquist — Skills Inventory",
        "content": """
        Technical: Python (5/5), TypeScript (5/5), PostgreSQL (5/5) ...
        Domain: Real Estate Private Equity (5/5), Waterfall Modeling (5/5) ...
        Leadership: Product Architecture (5/5) ...
        """,
    },
    {
        "doc_type": "project_detail",
        "title": "Project: Winston AI Platform",
        "content": """
        Client: Novendor (internal product)
        Duration: [FILL]
        [... full project detail ...]
        """,
    },
    # One doc per project
]
```

### Resume MCP Tools

Add a small set of resume-specific MCP tools (register in `backend/app/mcp/server.py` under a `resume` module):

```python
# resume.get_career_timeline → returns all roles ordered by start date
# resume.get_skills → returns skills by category with ratings
# resume.get_role_detail → returns full detail for a specific role
# resume.get_projects → returns all projects with metrics
# resume.get_experience_by_industry → returns years per industry (for charts)
# resume.get_experience_by_role_type → returns years per role type
# resume.search_experience → keyword search across all roles and projects
```

These are read-only. They pull from a `resume_roles`, `resume_skills`, and `resume_projects` table (or from the RAG corpus if you prefer to keep it document-only).

---

## DATABASE SCHEMA (Option A — Structured Tables)

If using structured tables alongside RAG:

```sql
-- resume_roles
CREATE TABLE resume_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,              -- NULL = present
    location TEXT,
    industry TEXT,
    role_type TEXT,              -- "engineering" | "consulting" | "leadership" | "founder"
    summary TEXT,
    achievements JSONB DEFAULT '[]',
    skills_used JSONB DEFAULT '[]',
    sort_order INT DEFAULT 0
);

-- resume_skills
CREATE TABLE resume_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill TEXT NOT NULL,
    category TEXT NOT NULL,     -- "technical" | "domain" | "leadership"
    rating INT CHECK (rating BETWEEN 1 AND 5),
    context TEXT                -- "FastAPI, psycopg3, AI/ML pipelines"
);

-- resume_projects
CREATE TABLE resume_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    client TEXT,
    duration TEXT,
    outcome TEXT,
    technologies JSONB DEFAULT '[]',
    metrics JSONB DEFAULT '[]',
    sort_order INT DEFAULT 0
);
```

Place migration in `repo-b/db/schema/280_resume_environment.sql`.

---

## FRONTEND PAGE STRUCTURE

```
/lab/env/[envId]/resume/
├── page.tsx                    ← Main resume dashboard
│   ├── ResumeKpiStrip          ← Top KPI bar
│   ├── CareerTimeline          ← Hero timeline chart
│   ├── SkillsRadar             ← Radar chart
│   ├── ExperienceBreakdown     ← 3 donut charts
│   └── ProjectShowcase         ← Project cards grid
│
├── chat/                       ← Winston AI scoped to resume
│   └── page.tsx                ← Uses same WinstonChatWorkspace, scoped to resume tools
│
└── [roleId]/                   ← Role detail page (optional)
    └── page.tsx
```

### Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Paul Malmquist                                    [Chat ↗] │
│  Founder & CEO, Novendor · Minneapolis, MN                  │
├─────────────────────────────────────────────────────────────┤
│  10+ Years  │  4 Industries  │  12+ Technologies  │  83 MCP │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ═══ Career Timeline ═══════════════════════════════════    │
│  |▓▓▓▓ Role 1 ▓▓▓|▓▓▓▓ Role 2 ▓▓▓▓|▓▓▓▓ Novendor ▓▓▓▓→  │
│  2015         2018         2021         2024      Present   │
│                                                             │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│   ◇ Skills Radar         │    ◎ Industry    ◎ Role Type    │
│   ╱ Technical             │    ████ REPE     ████ Founder   │
│  ╱   Domain               │    ████ Fintech  ████ Engineer  │
│ ╱     Leadership           │    ████ Consult. ████ Consult.  │
│                          │                                  │
├──────────────────────────┴──────────────────────────────────┤
│                                                             │
│  ═══ Projects ══════════════════════════════════════════    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ Winston     │ │ Project 2   │ │ Project 3   │          │
│  │ 83 MCP tools│ │ [metrics]   │ │ [metrics]   │          │
│  │ [Live Demo] │ │             │ │             │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  💬 Ask me anything about Paul's experience...              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Try: "What's his experience with AI?"               │   │
│  │      "How long was he in consulting?"               │   │
│  │      "Show me his skills breakdown"                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Design Notes

- Use the existing app shell and navigation — this is a lab environment, not a separate app
- Color palette: use the existing `CHART_COLORS` from `chart-theme.ts` for consistency
- The career timeline is the hero element — it should take up the full width
- The AI chat input at the bottom is an embedded mini-prompt (not a sidebar) with 3 starter prompts
- Clicking "Chat ↗" in the header opens the full WinstonChatWorkspace scoped to resume

---

## AI ASSISTANT BEHAVIOR

### Scope Resolution

When the resume environment is active, the AI assistant's scope is:
- **Environment:** Visual Resume
- **Domain:** Career history, skills, projects
- **Available tools:** `resume.*` module only (not `repe.*` or `finance.*`)
- **RAG corpus:** Resume documents only

### Response Style

The assistant should respond as if it's Paul's professional representative:
- Third person ("Paul has 10+ years...")
- Confident but not boastful
- Specific (name companies, years, technologies — not vague)
- When asked "what can he do?" → structured skills breakdown, not a paragraph
- When asked about timeline → emit a `ChartResponseBlock` with the career timeline data
- When asked to compare → emit a `TableResponseBlock` with side-by-side comparison

### Starter Prompts

Display these below the chat input:

```
"What's Paul's background?"
"Show me his skills breakdown"
"What has he built?"
```

### Example Conversations

**User:** "How long did Paul work at [Company X]?"
**Assistant:** "Paul was at [Company X] for 3 years and 4 months, from January 2019 through May 2022. During that time he [summary of key work]. His primary technologies were [list]."

**User:** "What can Paul do?"
**Assistant:** [Emits a KpiGroupResponseBlock]
```
Technical (12+ skills)     Domain (8+ areas)        Leadership
Python 5/5                 REPE 5/5                 Product Architecture 5/5
TypeScript 5/5             Waterfall Modeling 5/5   Enterprise Sales [X]/5
PostgreSQL 5/5             Fund Reporting 5/5       ...
...                        ...
```

**User:** "Show me his career timeline"
**Assistant:** [Emits a ChartResponseBlock with type: "bar" showing horizontal bars per role]

**User:** "Does Paul have experience with machine learning?"
**Assistant:** "Yes. Paul has been building AI/ML systems since [year]. At Novendor, he architected Winston's AI gateway which includes [RAG, intent classification, 83 MCP tool orchestration, SSE streaming]. He built the model routing layer that dispatches between Claude and OpenAI based on task type. His ML-adjacent work includes [any prior roles with ML]."

---

## FILE SUMMARY

### New Files

| File | Purpose |
|---|---|
| `repo-b/src/app/lab/env/[envId]/resume/page.tsx` | Resume dashboard page |
| `repo-b/src/components/resume/CareerTimeline.tsx` | Horizontal career timeline chart |
| `repo-b/src/components/resume/SkillsRadar.tsx` | Radar chart with 3 skill categories |
| `repo-b/src/components/resume/ExperienceBreakdown.tsx` | 3 donut charts (industry, role type, tech) |
| `repo-b/src/components/resume/ProjectShowcase.tsx` | Project cards grid |
| `repo-b/src/components/resume/ResumeKpiStrip.tsx` | Top KPI bar |
| `repo-b/src/components/resume/RoleDetailPanel.tsx` | Slide-in detail panel for a role |
| `repo-b/src/lib/resume/types.ts` | CareerRole, SkillRating, Project types |
| `repo-b/db/schema/280_resume_environment.sql` | resume_roles, resume_skills, resume_projects tables |
| `backend/scripts/seed_resume_rag.py` | Seed RAG corpus with resume documents |
| `backend/scripts/seed_resume_data.py` | Seed structured resume tables |
| `backend/app/mcp/tools/resume.py` | Resume MCP tools (7 tools) |

### Modified Files

| File | Change |
|---|---|
| `backend/app/mcp/server.py` | Register `resume.*` tool module |
| `repo-c/` environment registry | Add "resume" environment type |
| `backend/app/services/assistant_scope.py` | Add resume scope resolution |
| `repo-b/src/app/lab/env/[envId]/layout.tsx` | Add resume nav tab if env type is "resume" |

### Reuse As-Is

| File | Why |
|---|---|
| `repo-b/src/components/charts/chart-theme.ts` | `CHART_COLORS`, `fmtCompact()` — use for all resume charts |
| `repo-b/src/components/commandbar/StructuredResultCard.tsx` | Renders AI responses |
| `repo-b/src/lib/commandbar/assistantApi.ts` | SSE streaming — unchanged |
| `backend/app/services/ai_gateway.py` | AI gateway — unchanged (scope resolution handles routing) |

---

## BUILD ORDER

1. **Schema + seed data** — Create `280_resume_environment.sql`, run migration, seed with Paul's career data
2. **MCP tools** — Add `resume.*` module (7 tools, read-only)
3. **RAG seed** — Seed resume documents into the vector store
4. **Dashboard page** — Build `/resume/page.tsx` with KPI strip + career timeline
5. **Charts** — SkillsRadar, ExperienceBreakdown, ProjectShowcase
6. **AI scoping** — Add resume scope resolution so the assistant answers resume questions
7. **Starter prompts + polish** — Wire starter prompts, animations, responsive layout

---

## ACCEPTANCE CRITERIA

1. Navigate to `/lab/env/[envId]/resume/` → dashboard renders with all 5 visual components
2. Career timeline shows all roles with correct date ranges — hover shows detail
3. Skills radar renders 3 categories with correct ratings
4. Donut charts show industry/role/tech breakdown — click a slice filters the timeline
5. Project cards render with metrics and technology tags
6. KPI strip shows correct computed totals (not hardcoded)
7. Chat input at bottom → type "What's Paul's background?" → streaming response with structured career summary
8. "Show me his career timeline" → emits a chart block (not just text)
9. "How long did Paul work at [company]?" → correct duration with dates
10. "What can Paul do?" → structured skills breakdown (not a wall of text)
11. Full WinstonChatWorkspace at `/resume/chat` → scoped to resume tools only (no REPE tools leaking)

---

## NEXT STEP

**Paul:** Fill in the `[FILL]` sections in the Career Data block above. The more detail you provide (exact dates, company names, achievements, skill ratings), the better the AI assistant will answer questions and the more accurate the charts will be. Paste your LinkedIn "Experience" section if that's faster — the coding agent can parse it.

Once career data is filled in, a coding agent can execute this prompt end to end.

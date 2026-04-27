"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Project = {
  id: string;
  client_name: string;
  client_slug: string;
  status: string;
  iteration_count: number;
  current_score: number | null;
  pass_threshold: number;
  fail_reason: string | null;
  notes: string | null;
};

type Source = {
  id: string;
  source_type: string;
  label: string;
  content: string;
  confidence: string;
};

type Claim = {
  id: string;
  claim_text: string;
  claim_category: string;
  is_available: boolean;
  unavailable_reason: string | null;
};

type UseCase = {
  id: string;
  workflow_name: string;
  current_pain: string;
  proposed_intervention: string;
  who_uses_it: string;
  change_tomorrow: string;
  estimated_impact: string;
  impact_confidence: string;
  dependencies: string | null;
  novendor_credibility: string;
  status: string;
  kill_reason: string | null;
};

type RedTeamReview = {
  id: string;
  score: number;
  score_breakdown: Record<string, number>;
  kill_list: { use_case: string; criterion: string; reason: string }[];
  weak_spots: { use_case: string; issue_type: string; description: string }[];
  missing_evidence: { use_case: string; what_is_missing: string; why_it_matters: string }[];
  fatal_issues: string[];
  fixable_issues: { issue: string; fix: string }[];
  acceptable_weaknesses: string[];
  missing_inputs: { input_needed: string; blocks: string }[];
  verdict: string;
  verdict_reason: string;
};

type SaratReview = {
  overall_verdict: "PASS" | "WEAK" | "REJECT";
  section_verdicts: Record<string, "PASS" | "WEAK" | "REJECT">;
  objection_scores: Record<string, number>;
  sarat_voice_summary: string;
  kill_list: { section: string; lens: string; reason: string }[];
  fatal_issues: string[];
  fixable_issues: string[];
  score: number;
  score_breakdown: Record<string, number>;
  iteration_num: number;
};

type Iteration = {
  id: string;
  iteration_num: number;
  status: string;
  score: number | null;
  score_breakdown: Record<string, number> | null;
  raw_proposal: string | null;
  rebuilt_proposal: string | null;
  use_cases: UseCase[];
  red_team_review: RedTeamReview | null;
};

type ProjectSummary = {
  project: Project;
  sources: Source[];
  claims: {
    all: Claim[];
    facts: Claim[];
    constraints: Claim[];
    inferences: Claim[];
    gaps: Claim[];
    risks: Claim[];
  };
  iterations: Iteration[];
  final_output: { content: string; score: number; format: string; use_case_count: number } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "passed") return <span className={`${base} bg-green-500/15 text-green-400`}>Passed</span>;
  if (status === "failed") return <span className={`${base} bg-red-500/15 text-red-400`}>Failed</span>;
  if (status === "red_team" || status === "red_teamed") return <span className={`${base} bg-amber-500/15 text-amber-400`}>Red Team</span>;
  if (status === "rebuilding") return <span className={`${base} bg-blue-500/15 text-blue-400`}>Rebuilding</span>;
  if (status === "drafting") return <span className={`${base} bg-purple-500/15 text-purple-400`}>Drafting</span>;
  if (status === "killed") return <span className={`${base} bg-red-500/15 text-red-400`}>Killed</span>;
  if (status === "weak") return <span className={`${base} bg-amber-500/15 text-amber-400`}>Weak</span>;
  if (status === "candidate") return <span className={`${base} bg-blue-500/15 text-blue-400`}>Candidate</span>;
  return <span className={`${base} bg-bm-surface/50 text-bm-muted2`}>{status}</span>;
}

function verdictBadge(verdict: string) {
  if (verdict === "pass") return <span className="text-green-400 font-medium">PASS</span>;
  if (verdict === "rebuild") return <span className="text-amber-400 font-medium">REBUILD</span>;
  if (verdict === "research_refill") return <span className="text-orange-400 font-medium">RESEARCH REFILL</span>;
  return <span className="text-red-400 font-medium">FAIL</span>;
}

function confidenceDot(level: string) {
  const colors: Record<string, string> = {
    high: "bg-green-500",
    medium: "bg-amber-500",
    low: "bg-red-500",
    speculative: "bg-red-300",
    unknown: "bg-bm-muted2",
  };
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colors[level] ?? "bg-bm-muted2"}`} />;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 65) return "text-amber-400";
  return "text-red-400";
}

function ScoreBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const dims = [
    { key: "specificity", label: "Specificity", max: 25 },
    { key: "economic_value", label: "Economic Value", max: 25 },
    { key: "client_fit", label: "Client Fit", max: 20 },
    { key: "evidence_quality", label: "Evidence Quality", max: 15 },
    { key: "demo_readiness", label: "Demo Readiness", max: 15 },
  ];
  return (
    <div className="space-y-1.5">
      {dims.map(({ key, label, max }) => {
        const val = breakdown[key] ?? 0;
        const pct = Math.round((val / max) * 100);
        return (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="w-32 text-bm-muted2 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-bm-border/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-12 text-right tabular-nums">{val}/{max}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ActiveTab = "research" | "pitch" | "redteam" | "output";

export default function PitchForgePage() {
  const { envId, businessId } = useDomainEnv();
  const qs = () => {
    const p = new URLSearchParams({ env_id: envId });
    if (businessId) p.set("business_id", businessId);
    return p.toString();
  };

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("research");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [saratMode, setSaratMode] = useState(false);
  const [saratResult, setSaratResult] = useState<SaratReview | null>(null);

  // Load projects list
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/pitch-forge/v1/projects?${qs()}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  // Load a full project summary
  const loadProject = useCallback(async (projectId: string) => {
    setActionLoading("loading");
    try {
      const res = await fetch(`${API_BASE}/api/pitch-forge/v1/projects/${projectId}/summary?${qs()}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSelectedProject(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setActionLoading(null);
    }
  }, [envId, businessId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  // AI actions
  async function runGenerate() {
    if (!selectedProject) return;
    setActionLoading("generate");
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/pitch-forge/v1/projects/${selectedProject.project.id}/generate?${qs()}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || `Generate failed: ${res.status}`);
        return;
      }
      setActionMsg(data.message || "Proposal generated.");
      await loadProject(selectedProject.project.id);
      setActiveTab("pitch");
    } finally {
      setActionLoading(null);
    }
  }

  async function runRedTeam(iterationId: string) {
    if (!selectedProject) return;
    setActionLoading("redteam");
    setActionMsg(null);
    setError(null);
    try {
      const mode = saratMode ? "sarat" : "standard";
      const res = await fetch(
        `${API_BASE}/api/pitch-forge/v1/projects/${selectedProject.project.id}/iterations/${iterationId}/red-team?${qs()}&critique_mode=${mode}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || `Red team failed: ${res.status}`);
        return;
      }
      if (mode === "sarat" && data.review) {
        setSaratResult({ ...data.review, iteration_num: selectedProject.project.iteration_count });
      }
      setActionMsg(data.message || "Red team complete.");
      await loadProject(selectedProject.project.id);
      setActiveTab("redteam");
    } finally {
      setActionLoading(null);
    }
  }

  async function runFinalOutput() {
    if (!selectedProject) return;
    setActionLoading("output");
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/pitch-forge/v1/projects/${selectedProject.project.id}/final-output?${qs()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "bullet_email" }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || `Output generation failed: ${res.status}`);
        return;
      }
      setActionMsg(data.message || "Final output ready.");
      await loadProject(selectedProject.project.id);
      setActiveTab("output");
    } finally {
      setActionLoading(null);
    }
  }

  const proj = selectedProject?.project;
  const latestIteration = selectedProject?.iterations.slice(-1)[0] ?? null;
  const latestReview = latestIteration?.red_team_review ?? null;
  const iterCount = proj?.iteration_count ?? 0;
  const atMaxIterations = iterCount >= 3;
  const canGenerate = !!selectedProject && proj?.status !== "passed" && proj?.status !== "failed" && !atMaxIterations;
  const canRedTeam = !!latestIteration && latestIteration.status === "draft";
  const canFinalOutput = proj?.status === "passed";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!selectedProject) {
    // Project selection screen
    return (
      <section className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold">Pitch Forge</h2>
          <p className="text-sm text-bm-muted2 mt-1">
            Turns client research into a sharp proposal through a bounded build → red team → rebuild loop. Max 3 passes.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Active Projects</h3>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-sm text-bm-muted2">Loading...</div>
          ) : !projects.length ? (
            <div className="px-4 py-8 text-sm text-bm-muted2">
              No pitch projects yet. Seed the Hallboys demo project or create one via the API.
            </div>
          ) : (
            <div className="divide-y divide-bm-border/40">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { void loadProject(p.id); }}
                  className="w-full text-left px-4 py-4 hover:bg-bm-surface/20 flex items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{p.client_name}</span>
                      {statusBadge(p.status)}
                      {p.current_score !== null && (
                        <span className={`text-xs tabular-nums ${scoreColor(p.current_score)}`}>
                          {p.current_score}/100
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-bm-muted2 mt-0.5">
                      {p.iteration_count}/3 iterations — {p.notes?.slice(0, 80) ?? ""}
                    </p>
                  </div>
                  <span className="text-bm-muted2 text-sm">&rarr;</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Project detail view — 4-tab layout
  // ---------------------------------------------------------------------------

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: "research", label: "Research Board" },
    { id: "pitch", label: "Pitch Builder" },
    { id: "redteam", label: "Red Team Panel" },
    { id: "output", label: "Final Output" },
  ];

  return (
    <section className="space-y-4" data-testid="pitch-forge-detail">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setSelectedProject(null)} className="text-xs text-bm-muted2 hover:underline">
              &larr; Projects
            </button>
            <span className="text-bm-muted2">/</span>
            <h2 className="text-lg font-semibold">{proj?.client_name}</h2>
            {proj && statusBadge(proj.status)}
            {proj?.current_score !== null && proj?.current_score !== undefined && (
              <span className={`text-sm tabular-nums font-medium ${scoreColor(proj.current_score)}`}>
                {proj.current_score}/100
              </span>
            )}
          </div>
          <p className="text-xs text-bm-muted2 mt-0.5">
            Iteration {iterCount}/3 — pass threshold: {proj?.pass_threshold ?? 80}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {canGenerate && (
            <button
              onClick={() => void runGenerate()}
              disabled={actionLoading !== null}
              className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40 disabled:opacity-50"
            >
              {actionLoading === "generate" ? "Generating..." : "Generate Proposal"}
            </button>
          )}
          {canRedTeam && latestIteration && (
            <div className="flex items-center gap-1.5">
              {/* Sarat Mode toggle */}
              <button
                onClick={() => setSaratMode((v) => !v)}
                title={saratMode ? "Sarat Mode active — critiques as CFO/CIO" : "Enable Sarat Mode"}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  saratMode
                    ? "border-purple-500/50 bg-purple-500/15 text-purple-300"
                    : "border-bm-border/50 text-bm-muted2 hover:border-bm-border hover:text-foreground"
                }`}
              >
                Sarat Mode {saratMode ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => void runRedTeam(latestIteration.id)}
                disabled={actionLoading !== null}
                className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {actionLoading === "redteam"
                  ? saratMode ? "Running Sarat..." : "Running Red Team..."
                  : saratMode ? "Run Sarat Filter" : "Run Red Team"}
              </button>
            </div>
          )}
          {canFinalOutput && (
            <button
              onClick={() => void runFinalOutput()}
              disabled={actionLoading !== null}
              className="rounded-lg border border-green-500/40 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10 disabled:opacity-50"
            >
              {actionLoading === "output" ? "Generating..." : "Export Final Output"}
            </button>
          )}
        </div>
      </div>

      {/* Status messages */}
      {actionMsg && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-2 text-xs text-green-400">
          {actionMsg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      {atMaxIterations && proj?.status !== "passed" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <strong>Maximum iterations reached.</strong> This project cannot continue without resolving the fatal issues
          identified in the last red team review.
          {proj?.fail_reason && <p className="mt-1 text-xs">{proj.fail_reason}</p>}
        </div>
      )}

      {/* Iteration progress */}
      <div className="flex items-center gap-1">
        {[1, 2, 3].map((n) => {
          const it = selectedProject.iterations.find((i) => i.iteration_num === n);
          const active = iterCount === n;
          return (
            <React.Fragment key={n}>
              <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                it
                  ? it.status === "red_teamed" && (it.score ?? 0) >= 80
                    ? "border-green-500/40 bg-green-500/5 text-green-400"
                    : active
                    ? "border-bm-border bg-bm-surface/30"
                    : "border-bm-border/50 text-bm-muted2"
                  : "border-bm-border/30 text-bm-muted2/50"
              }`}>
                {n}
                {it?.score !== null && it?.score !== undefined && (
                  <span className={`tabular-nums ${scoreColor(it.score)}`}>{it.score}</span>
                )}
              </div>
              {n < 3 && <div className="h-px w-4 bg-bm-border/40" />}
            </React.Fragment>
          );
        })}
        <span className="ml-3 text-xs text-bm-muted2">passes</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bm-border/50 pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm rounded-t-lg -mb-px transition-colors ${
              activeTab === t.id
                ? "border border-b-bm-bg border-bm-border/70 bg-bm-bg text-foreground"
                : "text-bm-muted2 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "research" && <ResearchBoard summary={selectedProject} />}
      {activeTab === "pitch" && <PitchBuilderPanel summary={selectedProject} />}
      {activeTab === "redteam" && <RedTeamPanel summary={selectedProject} saratResult={saratResult} />}
      {activeTab === "output" && <FinalOutputPanel summary={selectedProject} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab: Research Board
// ---------------------------------------------------------------------------

function ResearchBoard({ summary }: { summary: ProjectSummary }) {
  const { sources, claims } = summary;

  return (
    <div className="space-y-4">
      {/* Sources */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Sources ({sources.length})</h3>
          <p className="text-xs text-bm-muted2 mt-0.5">Every claim must trace to at least one source.</p>
        </div>
        <div className="divide-y divide-bm-border/40">
          {!sources.length && <div className="px-4 py-4 text-sm text-bm-muted2">No sources yet.</div>}
          {sources.map((s) => (
            <div key={s.id} className="px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">{s.label}</span>
                <span className="text-xs text-bm-muted2 rounded-full border border-bm-border/50 px-1.5 py-0.5">{s.source_type}</span>
                {confidenceDot(s.confidence)}
                <span className="text-xs text-bm-muted2">{s.confidence}</span>
              </div>
              <p className="text-xs text-bm-muted2 mt-1 line-clamp-2">{s.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Claims grid */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Constraints */}
        <ClaimGroup
          title="Hard Constraints"
          claims={claims.constraints}
          colorClass="border-red-500/20 bg-red-500/5"
          labelColor="text-red-400"
        />
        {/* Facts */}
        <ClaimGroup
          title="Verified Facts"
          claims={claims.facts}
          colorClass="border-green-500/20 bg-green-500/5"
          labelColor="text-green-400"
        />
        {/* Inferences */}
        <ClaimGroup
          title="Inferences"
          claims={claims.inferences}
          colorClass="border-amber-500/20 bg-amber-500/5"
          labelColor="text-amber-400"
          note="Marked as inferences — not confirmed facts."
        />
        {/* Gaps */}
        <ClaimGroup
          title="Data Gaps"
          claims={claims.gaps}
          colorClass="border-bm-border/50"
          labelColor="text-bm-muted2"
          showNotAvailable
        />
      </div>
    </div>
  );
}

function ClaimGroup({
  title, claims, colorClass, labelColor, note, showNotAvailable
}: {
  title: string;
  claims: Claim[];
  colorClass: string;
  labelColor: string;
  note?: string;
  showNotAvailable?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${labelColor}`}>
        {title} ({claims.length})
      </h4>
      {note && <p className="text-xs text-bm-muted2 mb-2">{note}</p>}
      {!claims.length && <p className="text-xs text-bm-muted2">None recorded.</p>}
      <ul className="space-y-2">
        {claims.map((c) => (
          <li key={c.id} className="text-xs">
            {showNotAvailable && !c.is_available ? (
              <span className="text-bm-muted2">
                <span className="text-red-400/70 font-medium">Not available: </span>
                {c.unavailable_reason} — <span className="italic">{c.claim_text}</span>
              </span>
            ) : (
              <span>{c.claim_text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Pitch Builder
// ---------------------------------------------------------------------------

function PitchBuilderPanel({ summary }: { summary: ProjectSummary }) {
  const { iterations } = summary;
  const [selectedItNum, setSelectedItNum] = useState<number>(
    iterations.length ? iterations[iterations.length - 1].iteration_num : 1
  );
  const iteration = iterations.find((i) => i.iteration_num === selectedItNum);

  if (!iterations.length) {
    return (
      <div className="rounded-xl border border-bm-border/70 px-4 py-8 text-sm text-bm-muted2 text-center">
        No proposals generated yet. Click &quot;Generate Proposal&quot; above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Iteration selector */}
      {iterations.length > 1 && (
        <div className="flex gap-2">
          {iterations.map((it) => (
            <button
              key={it.id}
              onClick={() => setSelectedItNum(it.iteration_num)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                selectedItNum === it.iteration_num
                  ? "border-bm-border bg-bm-surface/40"
                  : "border-bm-border/40 text-bm-muted2 hover:border-bm-border"
              }`}
            >
              Iteration {it.iteration_num}
              {it.score !== null && (
                <span className={`ml-1.5 ${scoreColor(it.score)}`}>{it.score}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Use cases */}
      {iteration && (
        <div className="space-y-3">
          {!iteration.use_cases.length && (
            <div className="rounded-xl border border-bm-border/70 px-4 py-6 text-sm text-bm-muted2">
              No use cases in this iteration.
            </div>
          )}
          {iteration.use_cases.map((uc, idx) => (
            <div
              key={uc.id}
              className={`rounded-xl border p-4 space-y-3 ${
                uc.status === "killed"
                  ? "border-red-500/20 bg-red-500/5 opacity-60"
                  : uc.status === "weak"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-bm-border/70"
              }`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-bm-muted2">{idx + 1}.</span>
                  <span className="font-medium text-sm">{uc.workflow_name}</span>
                  {statusBadge(uc.status)}
                </div>
                <div className="flex items-center gap-1">
                  {confidenceDot(uc.impact_confidence)}
                  <span className="text-xs text-bm-muted2">{uc.impact_confidence}</span>
                </div>
              </div>

              {uc.status === "killed" && uc.kill_reason && (
                <div className="text-xs text-red-400 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                  <strong>Killed:</strong> {uc.kill_reason}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-bm-muted2 font-medium mb-0.5">Current pain</p>
                  <p>{uc.current_pain}</p>
                </div>
                <div>
                  <p className="text-bm-muted2 font-medium mb-0.5">Proposed intervention</p>
                  <p>{uc.proposed_intervention}</p>
                </div>
                <div>
                  <p className="text-bm-muted2 font-medium mb-0.5">Who uses it</p>
                  <p>{uc.who_uses_it}</p>
                </div>
                <div>
                  <p className="text-bm-muted2 font-medium mb-0.5">Change tomorrow morning</p>
                  <p>{uc.change_tomorrow}</p>
                </div>
                <div>
                  <p className="text-bm-muted2 font-medium mb-0.5">Estimated impact</p>
                  <p className="font-medium">{uc.estimated_impact}</p>
                </div>
                <div>
                  <p className="text-bm-muted2 font-medium mb-0.5">Why Novendor</p>
                  <p>{uc.novendor_credibility}</p>
                </div>
                {uc.dependencies && (
                  <div className="sm:col-span-2">
                    <p className="text-bm-muted2 font-medium mb-0.5">Dependencies</p>
                    <p>{uc.dependencies}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Red Team Panel
// ---------------------------------------------------------------------------

function saratVerdictBadge(verdict: "PASS" | "WEAK" | "REJECT") {
  if (verdict === "PASS") return <span className="rounded-full bg-green-500/15 text-green-400 px-2 py-0.5 text-xs font-semibold">PASS</span>;
  if (verdict === "WEAK") return <span className="rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-xs font-semibold">WEAK</span>;
  return <span className="rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-xs font-semibold">REJECT</span>;
}

function SaratPanel({ review }: { review: SaratReview }) {
  const objections = Object.entries(review.objection_scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Sarat Filter</span>
        <span className="text-xs text-bm-muted2">Iteration {review.iteration_num}</span>
        {saratVerdictBadge(review.overall_verdict)}
        <span className={`text-xl font-bold tabular-nums ${scoreColor(review.score)}`}>{review.score}</span>
        <span className="text-bm-muted2 text-sm">/100</span>
      </div>

      {/* Voice summary */}
      <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-4 py-3 text-sm italic text-purple-200/90">
        &ldquo;{review.sarat_voice_summary}&rdquo;
      </div>

      {/* Section verdicts */}
      {Object.keys(review.section_verdicts).length > 0 && (
        <div className="rounded-xl border border-bm-border/50 overflow-hidden">
          <div className="border-b border-bm-border/50 bg-bm-surface/20 px-4 py-2">
            <h4 className="text-xs font-semibold text-bm-muted2 uppercase tracking-wider">Section Verdicts</h4>
          </div>
          <div className="divide-y divide-bm-border/30">
            {Object.entries(review.section_verdicts).map(([section, verdict]) => (
              <div key={section} className="flex items-center justify-between px-4 py-2 text-xs">
                <span className="text-foreground">{section}</span>
                {saratVerdictBadge(verdict)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Objection scores */}
      {objections.length > 0 && (
        <div className="rounded-xl border border-bm-border/50 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-bm-muted2 uppercase tracking-wider mb-3">
            Objection Scores (0 = none, 10 = fatal)
          </h4>
          {objections.map(([criterion, score]) => (
            <div key={criterion} className="flex items-center gap-2 text-xs">
              <span className="w-40 text-bm-muted2 shrink-0 truncate">{criterion}</span>
              <div className="flex-1 h-1.5 rounded-full bg-bm-border/40 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${score >= 7 ? "bg-red-500" : score >= 4 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${score * 10}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums text-bm-muted2">{score}/10</span>
            </div>
          ))}
        </div>
      )}

      {/* Kill list */}
      {review.kill_list.length > 0 && (
        <div className="rounded-xl border border-red-500/20 overflow-hidden">
          <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-2">
            <h4 className="text-xs font-semibold text-red-400">Sarat Kills ({review.kill_list.length})</h4>
          </div>
          <div className="divide-y divide-bm-border/40">
            {review.kill_list.map((k, i) => (
              <div key={i} className="px-4 py-3 text-xs">
                <span className="font-medium">{k.section}</span>
                <span className="text-red-400/80 mx-1.5">[{k.lens}]</span>
                <span className="text-bm-muted2">{k.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fatal issues */}
      {review.fatal_issues.length > 0 && (
        <div className="rounded-xl border border-red-500/20 p-4">
          <h4 className="text-xs font-semibold text-red-400 mb-2">Fatal Issues</h4>
          <ul className="space-y-1">
            {review.fatal_issues.map((f, i) => (
              <li key={i} className="text-xs text-bm-muted2">{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Fixable issues */}
      {review.fixable_issues.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 p-4">
          <h4 className="text-xs font-semibold text-amber-400 mb-2">Address Before Presenting</h4>
          <ul className="space-y-1">
            {review.fixable_issues.map((f, i) => (
              <li key={i} className="text-xs text-bm-muted2">{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RedTeamPanel({ summary, saratResult }: { summary: ProjectSummary; saratResult: SaratReview | null }) {
  const reviews = summary.iterations
    .filter((it) => it.red_team_review !== null)
    .map((it) => ({ iteration_num: it.iteration_num, review: it.red_team_review! }));

  const hasContent = reviews.length > 0 || saratResult !== null;

  if (!hasContent) {
    return (
      <div className="rounded-xl border border-bm-border/70 px-4 py-8 text-sm text-bm-muted2 text-center">
        No red team reviews yet. Generate a proposal first, then click &quot;Run Red Team&quot;.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sarat Mode result — shown above standard reviews when present */}
      {saratResult && <SaratPanel review={saratResult} />}

      {reviews.map(({ iteration_num, review }) => (
        <div key={review.id} className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold">Iteration {iteration_num} Review</h3>
            <span className={`text-2xl font-bold tabular-nums ${scoreColor(review.score)}`}>
              {review.score}
            </span>
            <span className="text-bm-muted2 text-sm">/100</span>
            {verdictBadge(review.verdict)}
          </div>

          <div className="rounded-xl border border-bm-border/70 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-bm-muted2 uppercase tracking-wider">Score Breakdown</h4>
            <ScoreBreakdown breakdown={review.score_breakdown} />
          </div>

          <div className="rounded-xl border border-bm-border/70 p-3 text-xs text-bm-muted2">
            <strong className="text-foreground">Verdict: </strong>{review.verdict_reason}
          </div>

          {/* Kill list */}
          {review.kill_list.length > 0 && (
            <div className="rounded-xl border border-red-500/20 overflow-hidden">
              <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-2">
                <h4 className="text-xs font-semibold text-red-400">Killed ({review.kill_list.length})</h4>
              </div>
              <div className="divide-y divide-bm-border/40">
                {review.kill_list.map((k, i) => (
                  <div key={i} className="px-4 py-3 text-xs">
                    <span className="font-medium">{k.use_case}</span>
                    <span className="text-bm-muted2 mx-1">—</span>
                    <span className="text-red-400/80">[{k.criterion}]</span>
                    <span className="text-bm-muted2 ml-1">{k.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fixable issues */}
          {review.fixable_issues.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 overflow-hidden">
              <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2">
                <h4 className="text-xs font-semibold text-amber-400">Fix Required ({review.fixable_issues.length})</h4>
              </div>
              <div className="divide-y divide-bm-border/40">
                {review.fixable_issues.map((f, i) => (
                  <div key={i} className="px-4 py-3 text-xs">
                    <p className="text-bm-muted2">{f.issue}</p>
                    <p className="mt-1"><span className="text-amber-400 font-medium">Fix: </span>{f.fix}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing inputs */}
          {review.missing_inputs.length > 0 && (
            <div className="rounded-xl border border-bm-border/50 overflow-hidden">
              <div className="border-b border-bm-border/50 bg-bm-surface/20 px-4 py-2">
                <h4 className="text-xs font-semibold text-bm-muted2">Missing Inputs ({review.missing_inputs.length})</h4>
              </div>
              <div className="divide-y divide-bm-border/40">
                {review.missing_inputs.map((m, i) => (
                  <div key={i} className="px-4 py-3 text-xs">
                    <span className="font-medium">Not available: </span>
                    <span className="text-bm-muted2">{m.input_needed}</span>
                    <p className="mt-0.5 text-bm-muted2/70">Blocks: {m.blocks}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acceptable weaknesses */}
          {review.acceptable_weaknesses.length > 0 && (
            <div className="rounded-xl border border-bm-border/50 p-4">
              <h4 className="text-xs font-semibold text-bm-muted2 uppercase tracking-wider mb-2">
                Acceptable Weaknesses ({review.acceptable_weaknesses.length})
              </h4>
              <ul className="space-y-1">
                {review.acceptable_weaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-bm-muted2">{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Final Output
// ---------------------------------------------------------------------------

function FinalOutputPanel({ summary }: { summary: ProjectSummary }) {
  const { final_output, project } = summary;
  const [copied, setCopied] = useState(false);

  if (project.status !== "passed" && !final_output) {
    return (
      <div className="rounded-xl border border-bm-border/70 px-4 py-8 text-sm text-bm-muted2 text-center">
        {project.status === "failed"
          ? "This project failed to reach the pass threshold after 3 iterations. Review the red team panel for required inputs."
          : "Not ready. Run
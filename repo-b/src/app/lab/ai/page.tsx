"use client";

import { useEffect, useMemo, useState } from "react";

type Health = {
  enabled: boolean;
  sidecar_ok: boolean;
  mode: string;
  message?: string | null;
};

type Citation = { path: string; start_line: number; end_line: number };

type AskResponse = {
  answer: string;
  citations: Citation[];
  diagnostics: { used_files: number; elapsed_ms: number };
};

export default function LocalAiPage() {
  const aiMode = process.env.NEXT_PUBLIC_AI_MODE || "off";
  const enabled = aiMode === "local";

  const [health, setHealth] = useState<Health | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/ai/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ enabled: false, sidecar_ok: false, mode: aiMode, message: "Failed to check AI health." }));
  }, [enabled, aiMode]);

  const canAsk = useMemo(() => enabled && health?.enabled && health?.sidecar_ok, [enabled, health]);

  const ask = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const r = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.detail || payload.message || "Request failed");
      }
      const data = (await r.json()) as AskResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold">Local AI</h1>
        <p className="mt-2 text-sm text-slate-400">
          AI is disabled. Set <span className="font-mono">NEXT_PUBLIC_AI_MODE=local</span> to enable the local sidecar.
        </p>
      </div>
    );
  }

  const statusText =
    !health ? "Checking sidecar..." : health.sidecar_ok ? "Sidecar ready." : `AI unavailable: ${health.message || "sidecar not running"}`;

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Local AI (Codex Sidecar)</h1>
        <p className="text-sm text-slate-400">
          Developer/operator-only helper. The UI talks to the backend, which talks to a localhost sidecar.
        </p>
        <p className={`text-sm ${health?.sidecar_ok ? "text-emerald-300" : "text-amber-300"}`}>{statusText}</p>
      </header>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <label className="text-sm text-slate-300">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder="Ask about the repo (e.g., 'Where is environment creation implemented?')"
          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={ask}
            disabled={!canAsk || loading || prompt.trim().length === 0}
            className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold disabled:opacity-50"
          >
            {loading ? "Asking..." : "Ask"}
          </button>
          <div className="text-xs text-slate-500 flex items-center">
            Runs lightweight repo retrieval and sends context to the local sidecar.
          </div>
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </section>

      {result ? (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Answer</h2>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{result.answer}</pre>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="px-2 py-1 rounded-full bg-slate-800">
              elapsed: {result.diagnostics.elapsed_ms}ms
            </span>
            <span className="px-2 py-1 rounded-full bg-slate-800">
              files: {result.diagnostics.used_files}
            </span>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-300">Citations</h2>
            {result.citations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No citations.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.citations.map((c, idx) => (
                  <li key={`${c.path}:${idx}`} className="text-sm">
                    <a
                      className="text-sky-400 hover:text-sky-300"
                      href={`https://github.com/paulmalmquist/Consulting_app/blob/main/${c.path}#L${c.start_line}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.path}:{c.start_line}-{c.end_line}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}


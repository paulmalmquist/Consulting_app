"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";

type Health = {
  status: string;
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
      .then(async (r) => {
        if (r.ok) return r.json();
        const err = await r.json().catch(() => ({}));
        return err.detail || { status: "error", mode: aiMode, message: "Failed to check AI health." };
      })
      .then(setHealth)
      .catch(() => setHealth({ status: "error", mode: aiMode, message: "Failed to check AI health." }));
  }, [enabled, aiMode]);

  const canAsk = useMemo(() => enabled && health?.status === "ok", [enabled, health]);

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
        <p className="mt-2 text-sm text-bm-muted">
          AI is disabled. Set <span className="font-mono">NEXT_PUBLIC_AI_MODE=local</span> to enable the local sidecar.
        </p>
      </div>
    );
  }

  const statusText =
    !health ? "Checking sidecar..." : health.status === "ok" ? "Sidecar ready." : `AI unavailable: ${health.message || "sidecar not running"}`;

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Local AI (Codex Sidecar)</h1>
        <p className="text-sm text-bm-muted">
          Developer/operator-only helper. The UI talks to the backend, which talks to a localhost sidecar.
        </p>
        <p className={`text-sm ${health?.status === "ok" ? "text-bm-success" : "text-bm-warning"}`}>{statusText}</p>
      </header>

      <Card>
        <CardContent className="space-y-3">
        <label className="text-sm text-bm-muted">Prompt</label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder="Ask about the repo (e.g., 'Where is environment creation implemented?')"
          className="rounded-xl"
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={ask}
            disabled={!canAsk || loading || prompt.trim().length === 0}
          >
            {loading ? "Asking..." : "Ask"}
          </Button>
          <div className="text-xs text-bm-muted2 flex items-center">
            Runs lightweight repo retrieval and sends context to the local sidecar.
          </div>
        </div>
        {error ? <p className="text-sm text-bm-danger">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardContent className="space-y-4">
          <div>
            <CardTitle>Answer</CardTitle>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-bm-text">{result.answer}</pre>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <Badge>
              elapsed: {result.diagnostics.elapsed_ms}ms
            </Badge>
            <Badge>
              files: {result.diagnostics.used_files}
            </Badge>
          </div>

          <div>
            <CardTitle>Citations</CardTitle>
            {result.citations.length === 0 ? (
              <p className="mt-2 text-sm text-bm-muted2">No citations.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.citations.map((c, idx) => (
                  <li key={`${c.path}:${idx}`} className="text-sm">
                    <a
                      className="text-bm-accent hover:text-bm-accent2"
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

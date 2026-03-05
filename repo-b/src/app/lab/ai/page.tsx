"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";

type GatewayHealth = {
  enabled: boolean;
  model: string;
  embedding_model: string;
  rag_available: boolean;
  message?: string | null;
};

export default function AiGatewayPage() {
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const [stats, setStats] = useState<{ elapsed_ms?: number; prompt_tokens?: number; completion_tokens?: number } | null>(null);

  useEffect(() => {
    fetch("/api/ai/gateway/health", { credentials: "include" })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({ enabled: false, model: "unknown", embedding_model: "unknown", rag_available: false, message: "Backend unreachable" })
      );
  }, []);

  const ask = async () => {
    setError(null);
    setResult(null);
    setToolCalls([]);
    setStats(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/gateway/ask", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gateway error ${res.status}: ${text.slice(0, 200)}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "token") {
                text += data.text;
                setResult(text);
              } else if (currentEvent === "tool_call") {
                setToolCalls((prev) => [...prev, `${data.tool_name}: ${data.result_preview?.slice(0, 80) ?? ""}`]);
              } else if (currentEvent === "done") {
                setStats({ elapsed_ms: data.elapsed_ms, prompt_tokens: data.prompt_tokens, completion_tokens: data.completion_tokens });
              } else if (currentEvent === "error") {
                throw new Error(data.message || "Gateway error");
              }
            } catch (e) {
              if (e instanceof Error && e.message.startsWith("Gateway")) throw e;
            }
            currentEvent = "";
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const statusText = !health
    ? "Checking gateway..."
    : health.enabled
      ? `Model: ${health.model} | RAG: ${health.rag_available ? "available" : "unavailable"}`
      : `Gateway disabled: ${health.message || "unknown"}`;

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">AI Gateway</h1>
        <p className="text-sm text-bm-muted">
          Production AI endpoint with OpenAI Chat Completions, RAG retrieval, and MCP tool calling.
        </p>
        <p className={`text-sm ${health?.enabled ? "text-bm-success" : "text-bm-warning"}`}>{statusText}</p>
      </header>

      <Card>
        <CardContent className="space-y-3">
          <label className="text-sm text-bm-muted">Prompt</label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Ask about funds, assets, documents, or portfolio metrics..."
            className="rounded-xl"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={ask}
              disabled={!health?.enabled || loading || prompt.trim().length === 0}
            >
              {loading ? "Thinking..." : "Ask"}
            </Button>
            <div className="text-xs text-bm-muted2 flex items-center">
              Streams via OpenAI Chat Completions with MCP tool dispatch.
            </div>
          </div>
          {error ? <p className="text-sm text-bm-danger">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardContent className="space-y-4">
            <div>
              <CardTitle>Response</CardTitle>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-bm-text">{result}</pre>
            </div>

            {toolCalls.length > 0 ? (
              <div>
                <CardTitle>Tool Calls</CardTitle>
                <ul className="mt-2 space-y-1">
                  {toolCalls.map((tc, i) => (
                    <li key={i} className="text-xs font-mono px-2 py-1 bg-bm-accent/10 rounded">
                      {tc}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {stats ? (
              <div className="flex flex-wrap gap-3 text-xs">
                {stats.elapsed_ms ? <Badge>elapsed: {stats.elapsed_ms}ms</Badge> : null}
                {stats.prompt_tokens ? <Badge>prompt: {stats.prompt_tokens} tokens</Badge> : null}
                {stats.completion_tokens ? <Badge>completion: {stats.completion_tokens} tokens</Badge> : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

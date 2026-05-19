"use client";

import React, { useState } from "react";
import {
  postResearchBrief,
  type IngestResult,
} from "@/lib/historyrhymes/client";

const WEEK_TYPES = ["Week 1", "Week 2", "Week 3", "Week 4"] as const;

const PILLARS = [
  "Novel Signals & Data Sources",
  "Methodology & Model Improvements",
  "Competitive & Structural Intelligence",
  "Adversarial & Regime-Change Research",
] as const;

interface Props {
  onIngested: (result: IngestResult) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ResearchBriefUpload({ onIngested }: Props) {
  const [markdown, setMarkdown] = useState("");
  const [briefDate, setBriefDate] = useState(todayIso());
  const [weekType, setWeekType] = useState<string>(WEEK_TYPES[0]);
  const [pillar, setPillar] = useState<string>(PILLARS[0]);
  const [sourceFilename, setSourceFilename] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<IngestResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFilename(file.name);
    setMarkdown(await file.text());
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await postResearchBrief({
        brief_date: briefDate,
        week_type: weekType,
        pillar_name: pillar,
        markdown_content: markdown,
        source_filename: sourceFilename || null,
      });
      setLast(result);
      onIngested(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
      data-testid="hr-brief-upload"
    >
      <h2 className="text-sm font-semibold text-neutral-100 mb-3">
        Ingest weekly research brief
      </h2>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="text-xs text-neutral-400">
          Brief date
          <input
            type="date"
            value={briefDate}
            onChange={(e) => setBriefDate(e.target.value)}
            className="mt-1 w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-neutral-200 text-xs"
          />
        </label>
        <label className="text-xs text-neutral-400">
          Week
          <select
            value={weekType}
            onChange={(e) => setWeekType(e.target.value)}
            className="mt-1 w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-neutral-200 text-xs"
          >
            {WEEK_TYPES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="text-xs text-neutral-400 block mb-2">
        Pillar
        <select
          value={pillar}
          onChange={(e) => setPillar(e.target.value)}
          className="mt-1 w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-neutral-200 text-xs"
        >
          {PILLARS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3 mb-2">
        <input
          type="file"
          accept=".md,text/markdown,text/plain"
          onChange={handleFile}
          className="text-xs text-neutral-400"
        />
        {sourceFilename && (
          <span className="text-[10px] text-neutral-500">{sourceFilename}</span>
        )}
      </div>

      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        placeholder="Paste the HR weekly brief markdown here…"
        rows={10}
        className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-neutral-200 text-xs font-mono"
        data-testid="hr-brief-textarea"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={submitting || !markdown.trim()}
          onClick={submit}
          className="text-xs px-4 py-1.5 rounded bg-neutral-200 text-neutral-950 font-semibold hover:bg-white disabled:opacity-40"
          data-testid="hr-brief-submit"
        >
          {submitting ? "Extracting…" : "Extract & plan"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {last && (
        <div
          className={`mt-3 text-xs rounded border p-2 ${
            last.degraded
              ? "border-amber-700 bg-amber-900/20 text-amber-300"
              : "border-emerald-800 bg-emerald-900/20 text-emerald-300"
          }`}
          data-testid="hr-ingest-result"
        >
          <div>
            {last.degraded ? "Degraded extraction" : "Extraction OK"} —
            confidence {last.confidence} — {last.candidates.length} candidate(s)
          </div>
          {last.warnings.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-neutral-400">
              {last.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

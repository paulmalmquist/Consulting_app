"use client";

import React, { FormEvent, useMemo, useState } from "react";
import {
  DISCOVERY_QUESTIONS,
  scoreDiscovery,
  type DiscoveryBand,
} from "@/lib/marketing/aiRoi/scoring";

const BAND_LABELS: Record<DiscoveryBand, string> = {
  ready: "Ready to measure",
  focused: "Good target for a scoped assessment",
  exposed: "Needs baseline work",
  blocked: "Start with controls and data ownership",
};

type SubmitState = "idle" | "posting" | "created" | "error";

export function DiscoveryQuestionnaire() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitReason, setSubmitReason] = useState("");
  const result = useMemo(() => scoreDiscovery(answers), [answers]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!result.complete) {
      setSubmitState("error");
      setSubmitReason(`Answer required: ${result.missingQuestionLabels.join(", ")}`);
      return;
    }

    setSubmitState("posting");
    setSubmitReason("");
    const response = await fetch("/api/public/ai-roi-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        company_name: companyName || undefined,
        source: "ai_roi_discovery",
        payload_json: { answers, result },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitState("error");
      setSubmitReason(String(payload.reason || payload.error || "Submission failed."));
      return;
    }
    setSubmitState("created");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-4">
        {DISCOVERY_QUESTIONS.map((question, index) => (
          <div key={question.id} className="nv-card nv-card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="nv-eyebrow">Question {index + 1}</p>
                <h3 className="nv-h3" style={{ marginTop: 8 }}>{question.prompt}</h3>
              </div>
              <span className="nv-pill nv-pill-muted">{question.label}</span>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => {
                const selected = answers[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                    className={[
                      "rounded-nv-md border px-3 py-3 text-left text-sm transition",
                      selected
                        ? "border-nv-teal/40 bg-nv-teal/10 text-nv-teal"
                        : "border-nv-text/10 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <aside className="nv-card nv-card-pad h-fit space-y-5 lg:sticky lg:top-24">
        <div>
          <p className="nv-eyebrow">Readout</p>
          <h2 className="nv-h3" style={{ marginTop: 8 }}>
            {result.complete && result.overallBand
              ? `${result.overallScore}/100 - ${BAND_LABELS[result.overallBand]}`
              : "Complete the required questions"}
          </h2>
        </div>

        {!result.complete ? (
          <div className="rounded-nv-md border border-nv-warning/25 bg-nv-warning/10 p-4">
            <p className="nv-small" style={{ margin: 0 }}>
              Remaining: {result.missingQuestionLabels.join(", ")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.categories.map((category) => (
              <div key={category.category}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-nv-muted">{category.label}</span>
                  <span className="text-nv-text">{category.percent}%</span>
                </div>
                <div className="mt-2 h-2 rounded-nv-sm bg-nv-bg">
                  <div
                    className="h-2 rounded-nv-sm bg-nv-teal"
                    style={{ width: `${category.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {!emailOpen ? (
          <button type="button" className="nv-btn nv-btn-primary" onClick={() => setEmailOpen(true)}>
            Send me the assessment scope
          </button>
        ) : (
          <form className="grid gap-3" onSubmit={handleSubmit}>
            <label>
              <span className="nv-small">Work email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
              />
            </label>
            <label>
              <span className="nv-small">Company</span>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="mt-2 w-full rounded-nv-md border border-nv-text/10 bg-nv-bg/60 px-3 py-2 text-sm text-nv-text"
              />
            </label>
            <button type="submit" className="nv-btn nv-btn-primary w-fit" disabled={submitState === "posting"}>
              {submitState === "posting" ? "Sending" : "Send scope"}
            </button>
            {submitState === "created" && <p className="nv-small text-nv-teal">Assessment captured.</p>}
            {submitState === "error" && <p className="nv-small text-nv-risk">{submitReason}</p>}
          </form>
        )}
      </aside>
    </div>
  );
}


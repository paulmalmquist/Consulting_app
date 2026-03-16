"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  endPsychragSession,
  getAssessmentHistory,
  getPsychragMe,
  listPsychragSessions,
  sharePsychragSession,
  streamPsychragChat,
  submitAssessment,
} from "@/lib/psychrag/api";
import type {
  PsychragAssessment,
  PsychragCitation,
  PsychragMeResponse,
  PsychragSafetyFlags,
  PsychragSession,
} from "@/lib/psychrag/types";

const PHQ9 = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself or that you have let yourself or your family down",
  "Trouble concentrating on things",
  "Moving or speaking slowly, or the opposite",
  "Thoughts that you would be better off dead or of hurting yourself",
];

const GAD7 = [
  "Feeling nervous, anxious, or on edge",
  "Not being able to stop or control worrying",
  "Worrying too much about different things",
  "Trouble relaxing",
  "Being so restless that it is hard to sit still",
  "Becoming easily annoyed or irritable",
  "Feeling afraid as if something awful might happen",
];

function CitationList({ citations }: { citations: PsychragCitation[] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-emerald-50/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Clinical grounding</p>
      {citations.map((citation) => (
        <div key={citation.chunk_id} className="rounded-xl bg-white/80 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{citation.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {[citation.chapter, citation.section].filter(Boolean).join(" • ")}
            {citation.page_start ? ` • p.${citation.page_start}${citation.page_end && citation.page_end !== citation.page_start ? `-${citation.page_end}` : ""}` : ""}
          </p>
          {citation.excerpt ? <p className="mt-2 text-sm text-slate-600">{citation.excerpt}</p> : null}
        </div>
      ))}
    </div>
  );
}

function SafetyBanner({ safety }: { safety: PsychragSafetyFlags | null }) {
  if (!safety || safety.risk_level === "none") return null;
  const tone = safety.risk_level === "crisis" || safety.risk_level === "high"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : safety.risk_level === "moderate"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-sky-200 bg-sky-50 text-sky-800";
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="font-semibold">Safety check: {safety.risk_level}</p>
      <p className="mt-2 text-sm">
        {safety.crisis_detected
          ? "PsychRAG detected language that may signal acute risk. Crisis resources are shown below and, when a therapist relationship exists, a clinician alert is created."
          : "PsychRAG detected elevated distress and is keeping the conversation more structured and supportive."}
      </p>
      {safety.resources.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {safety.resources.map((resource) => (
            <li key={resource}>{resource}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AssessmentCard({
  title,
  instrument,
  questions,
  onSubmit,
}: {
  title: string;
  instrument: "phq9" | "gad7";
  questions: string[];
  onSubmit: (instrument: "phq9" | "gad7", responses: Record<string, number>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(questions.map((_, index) => [`q${index + 1}`, 0]))
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(instrument, values);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border border-white/70 bg-white/80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {questions.map((question, index) => (
            <label key={question} className="block space-y-2 text-sm text-slate-700">
              <span>{index + 1}. {question}</span>
              <Select
                value={String(values[`q${index + 1}`] ?? 0)}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    [`q${index + 1}`]: Number(e.target.value),
                  }))
                }
              >
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </Select>
            </label>
          ))}
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Submitting..." : `Submit ${instrument.toUpperCase()}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PsychragChatWorkspace() {
  const [me, setMe] = useState<PsychragMeResponse | null>(null);
  const [sessions, setSessions] = useState<PsychragSession[]>([]);
  const [activeSession, setActiveSession] = useState<PsychragSession | null>(null);
  const [assessments, setAssessments] = useState<PsychragAssessment[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<PsychragCitation[]>([]);
  const [streamingSafety, setStreamingSafety] = useState<PsychragSafetyFlags | null>(null);
  const [shareType, setShareType] = useState<"full" | "summary_only" | "flagged_only">("summary_only");
  const [shareNote, setShareNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getPsychragMe(), listPsychragSessions(), getAssessmentHistory()])
      .then(([nextMe, nextSessions, nextAssessments]) => {
        if (!active) return;
        setMe(nextMe);
        setSessions(nextSessions);
        setActiveSession(nextSessions[0] ?? null);
        setAssessments(nextAssessments);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load PsychRAG");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;

    const message = input;
    setInput("");
    setSending(true);
    setError(null);
    setStreamingText("");
    setStreamingCitations([]);
    setStreamingSafety(null);

    startTransition(() => {
      if (activeSession) {
        setActiveSession({
          ...activeSession,
          messages: [
            ...activeSession.messages,
            {
              id: `temp-${Date.now()}`,
              role: "user",
              content: message,
              rag_sources: [],
              created_at: new Date().toISOString(),
            },
          ],
        });
      }
    });

    try {
      const result = await streamPsychragChat(
        {
          message,
          session_id: activeSession?.id,
          session_type: activeSession?.session_type ?? "therapy",
          mood_pre: activeSession?.mood_pre ?? 6,
        },
        {
          onToken: (text) => setStreamingText((current) => current + text),
          onCitation: (citation) => setStreamingCitations((current) => [...current, citation as PsychragCitation]),
          onSafety: (safety) => setStreamingSafety(safety as PsychragSafetyFlags),
        }
      );

      setActiveSession(result.session);
      setSessions((current) => {
        const without = current.filter((item) => item.id !== result.session.id);
        return [result.session, ...without];
      });
      setStreamingText("");
      setStreamingCitations([]);
      setStreamingSafety(result.assistant_message.safety_flags ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  async function handleShare() {
    if (!activeSession) return;
    try {
      await sharePsychragSession({
        session_id: activeSession.id,
        share_type: shareType,
        patient_note: shareNote || undefined,
      });
      setFlash("Session shared with your connected therapist.");
      setShareNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to share session");
    }
  }

  async function handleEndSession() {
    if (!activeSession) return;
    try {
      const ended = await endPsychragSession(activeSession.id, 6);
      setActiveSession(ended);
      setSessions((current) => current.map((item) => (item.id === ended.id ? ended : item)));
      setFlash("Session closed and summarized.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to end session");
    }
  }

  async function handleAssessmentSubmit(instrument: "phq9" | "gad7", responses: Record<string, number>) {
    const assessment = await submitAssessment({
      instrument,
      responses,
      administered_by: "self",
      session_id: activeSession?.id,
    });
    setAssessments((current) => [assessment, ...current]);
    setFlash(`${instrument.toUpperCase()} saved.`);
  }

  if (loading) {
    return <div className="rounded-[28px] border border-white/70 bg-white/80 p-8 text-slate-600">Loading PsychRAG workspace...</div>;
  }

  if (!me?.profile) {
    return (
      <Card className="border border-white/70 bg-white/80">
        <CardContent className="space-y-3">
          <p className="text-slate-700">You’re signed in, but PsychRAG onboarding is not finished yet.</p>
          <Link href="/psychrag/onboarding" className="text-sm font-medium text-emerald-700">
            Finish onboarding
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (me.profile.role !== "patient") {
    return (
      <Card className="border border-white/70 bg-white/80">
        <CardContent className="space-y-3">
          <p className="text-slate-700">This workspace is patient-facing. Your current role is `{me.profile.role}`.</p>
          <Link href={me.profile.role === "therapist" ? "/psychrag/therapist/dashboard" : "/psychrag/admin/library"} className="text-sm font-medium text-emerald-700">
            Go to the correct workspace
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Your therapy conversations and therapist sharing history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              setActiveSession(null);
              setStreamingText("");
              setStreamingCitations([]);
              setStreamingSafety(null);
            }}
          >
            New session
          </Button>
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveSession(session)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  activeSession?.id === session.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white/80 text-slate-800"
                }`}
              >
                <p className="font-medium">{session.title || "Untitled session"}</p>
                <p className={`mt-1 text-xs ${activeSession?.id === session.id ? "text-slate-300" : "text-slate-500"}`}>
                  {new Date(session.created_at).toLocaleString()} • {session.crisis_level}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{activeSession?.title || "Start a new therapy session"}</CardTitle>
              <CardDescription>
                Warm, evidence-based support grounded in approved clinical literature. This is not a replacement for a therapist.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {activeSession ? <Badge variant={activeSession.crisis_level === "none" ? "success" : "warning"}>{activeSession.crisis_level}</Badge> : null}
              {activeSession ? (
                <Button variant="secondary" size="sm" onClick={handleEndSession}>
                  End session
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {flash ? <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash}</div> : null}
          {error ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          <SafetyBanner safety={streamingSafety} />
          <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-[24px] bg-slate-50/90 p-4">
            {(activeSession?.messages || []).map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl px-4 py-3 ${message.role === "user" ? "ml-auto max-w-[85%] bg-slate-900 text-white" : "mr-auto max-w-[90%] bg-white text-slate-800 shadow-sm"}`}
              >
                <p className="text-sm leading-6">{message.content}</p>
                {message.rag_sources?.length ? <CitationList citations={message.rag_sources} /> : null}
              </div>
            ))}
            {streamingText ? (
              <div className="mr-auto max-w-[90%] rounded-2xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
                <p className="leading-6">{streamingText}</p>
                <CitationList citations={streamingCitations} />
              </div>
            ) : null}
          </div>

          <form className="space-y-3" onSubmit={handleSend}>
            <Textarea
              className="min-h-[140px]"
              placeholder="What feels most present for you right now?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">If PsychRAG detects high-risk language, it shifts into crisis protocol and alerts your connected therapist when available.</p>
              <Button type="submit" disabled={sending}>
                {sending ? "Responding..." : "Send"}
              </Button>
            </div>
          </form>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">Share with therapist</p>
                <p className="text-sm text-slate-600">
                  {me.relationships.length
                    ? `Connected therapist: ${me.relationships[0]?.therapist_email} (${me.relationships[0]?.status})`
                    : "No therapist relationship found yet."}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleShare} disabled={!activeSession}>
                Share session
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <Select value={shareType} onChange={(e) => setShareType(e.target.value as typeof shareType)}>
                <option value="summary_only">Summary only</option>
                <option value="full">Full transcript</option>
                <option value="flagged_only">Flagged moments only</option>
              </Select>
              <Input value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="Optional note to your therapist" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <AssessmentCard title="PHQ-9" instrument="phq9" questions={PHQ9} onSubmit={handleAssessmentSubmit} />
        <AssessmentCard title="GAD-7" instrument="gad7" questions={GAD7} onSubmit={handleAssessmentSubmit} />
        <Card className="border border-white/70 bg-white/80">
          <CardHeader>
            <CardTitle>Recent assessments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assessments.slice(0, 6).map((assessment) => (
              <div key={assessment.id} className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900">{assessment.instrument.toUpperCase()}</p>
                  <Badge variant={assessment.total_score >= 10 ? "warning" : "success"}>{assessment.total_score}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{assessment.severity}</p>
                <p className="mt-2 text-xs text-slate-500">{new Date(assessment.created_at).toLocaleString()}</p>
              </div>
            ))}
            {!assessments.length ? <p className="text-sm text-slate-500">No assessments submitted yet.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

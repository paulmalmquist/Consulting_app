"use client";

import { getPsychragAccessToken } from "@/lib/psychrag/auth";
import type {
  PsychragAlert,
  PsychragAssessment,
  PsychragMeResponse,
  PsychragSession,
  PsychragSharedSession,
  PsychragStreamResult,
  PsychragTherapistOverview,
  PsychragTherapistPatient,
} from "@/lib/psychrag/types";

async function psychragFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getPsychragAccessToken();
  const response = await fetch(`/api/psychrag/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `PsychRAG request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function getPsychragMe(): Promise<PsychragMeResponse> {
  return psychragFetch<PsychragMeResponse>("me");
}

export async function submitPsychragOnboarding(payload: {
  role: "patient" | "therapist" | "admin";
  display_name: string;
  therapist_email?: string;
  license_number?: string;
  license_state?: string;
  specializations?: string[];
}) {
  return psychragFetch<PsychragMeResponse>("profile/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPsychragSessions() {
  return psychragFetch<PsychragSession[]>("chat/sessions");
}

export async function getPsychragSession(sessionId: string) {
  return psychragFetch<PsychragSession>(`chat/sessions/${sessionId}`);
}

export async function endPsychragSession(sessionId: string, mood_post?: number) {
  return psychragFetch<PsychragSession>(`chat/sessions/${sessionId}/end`, {
    method: "POST",
    body: JSON.stringify({ mood_post }),
  });
}

export async function sharePsychragSession(payload: {
  session_id: string;
  share_type: "full" | "summary_only" | "flagged_only";
  patient_note?: string;
}) {
  return psychragFetch<PsychragSharedSession>("share/session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPendingPsychragShares() {
  return psychragFetch<PsychragSharedSession[]>("share/pending");
}

export async function reviewPsychragShare(sharedSessionId: string, payload: {
  therapist_notes?: string;
  risk_assessment: "none" | "low" | "moderate" | "high" | "crisis";
  follow_up_needed: boolean;
  annotations: Array<{
    message_id?: string | null;
    annotation_type: "clinical_note" | "risk_flag" | "technique_suggestion" | "homework_assignment" | "diagnosis_observation";
    content: string;
  }>;
}) {
  return psychragFetch<PsychragSharedSession>(`share/${sharedSessionId}/review`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function listTherapistPatients() {
  return psychragFetch<PsychragTherapistPatient[]>("therapist/patients");
}

export async function getTherapistPatientOverview(patientId: string) {
  return psychragFetch<PsychragTherapistOverview>(`therapist/patients/${patientId}/overview`);
}

export async function submitAssessment(payload: {
  instrument: "phq9" | "gad7";
  responses: Record<string, number>;
  administered_by?: "self" | "ai_prompted" | "therapist";
  session_id?: string;
}) {
  return psychragFetch<PsychragAssessment>("assessments/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAssessmentHistory() {
  return psychragFetch<PsychragAssessment[]>("assessments/history");
}

export async function getPsychragAlerts() {
  return psychragFetch<PsychragAlert[]>("alerts");
}

export async function streamPsychragChat(payload: {
  message: string;
  session_id?: string;
  session_type?: "therapy" | "psychoeducation" | "crisis";
  mood_pre?: number;
}, handlers: {
  onSafety?: (data: Record<string, unknown>) => void;
  onCitation?: (data: Record<string, unknown>) => void;
  onToken?: (text: string) => void;
} = {}): Promise<PsychragStreamResult> {
  const token = await getPsychragAccessToken();
  const response = await fetch("/api/psychrag/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `PsychRAG stream failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let finalResult: PsychragStreamResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const payloadData = JSON.parse(line.slice(6));
        if (currentEvent === "token") handlers.onToken?.(String(payloadData.text || ""));
        if (currentEvent === "citation") handlers.onCitation?.(payloadData);
        if (currentEvent === "safety") handlers.onSafety?.(payloadData);
        if (currentEvent === "done") finalResult = payloadData as PsychragStreamResult;
      }
    }
  }

  if (!finalResult) {
    throw new Error("PsychRAG stream completed without a final result");
  }

  return finalResult;
}

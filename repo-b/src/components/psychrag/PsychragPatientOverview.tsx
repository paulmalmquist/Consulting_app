"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { getTherapistPatientOverview } from "@/lib/psychrag/api";
import type { PsychragTherapistOverview } from "@/lib/psychrag/types";

export function PsychragPatientOverview({ patientId }: { patientId: string }) {
  const [overview, setOverview] = useState<PsychragTherapistOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTherapistPatientOverview(patientId)
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load patient overview"));
  }, [patientId]);

  if (error) {
    return <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;
  }

  if (!overview) {
    return <div className="rounded-2xl border border-white/70 bg-white/80 p-6 text-slate-600">Loading patient overview...</div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>{overview.patient.display_name}</CardTitle>
          <CardDescription>{overview.patient.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Shared sessions</h3>
            {overview.shared_sessions.map((shared) => (
              <div key={shared.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{shared.share_type.replace("_", " ")}</p>
                  <Badge variant={shared.risk_assessment && ["high", "crisis"].includes(shared.risk_assessment) ? "danger" : "accent"}>
                    {shared.risk_assessment || "not reviewed"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">{shared.ai_clinical_summary || shared.patient_note || "No summary yet."}</p>
                {shared.therapist_notes ? <p className="mt-3 text-sm text-slate-700">Therapist note: {shared.therapist_notes}</p> : null}
              </div>
            ))}
            {!overview.shared_sessions.length ? <p className="text-sm text-slate-500">No shared sessions yet.</p> : null}
          </section>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border border-white/70 bg-white/80">
          <CardHeader>
            <CardTitle>Assessments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.recent_assessments.map((assessment) => (
              <div key={assessment.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{assessment.instrument.toUpperCase()}</p>
                  <Badge variant={assessment.total_score >= 10 ? "warning" : "success"}>{assessment.total_score}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{assessment.severity}</p>
              </div>
            ))}
            {!overview.recent_assessments.length ? <p className="text-sm text-slate-500">No assessments recorded.</p> : null}
          </CardContent>
        </Card>

        <Card className="border border-white/70 bg-white/80">
          <CardHeader>
            <CardTitle>Crisis events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.crisis_alerts.map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                <p className="font-medium text-rose-800">{alert.risk_level}</p>
                <p className="mt-1 text-sm text-rose-700">{new Date(alert.created_at).toLocaleString()}</p>
              </div>
            ))}
            {!overview.crisis_alerts.length ? <p className="text-sm text-slate-500">No crisis alerts recorded.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

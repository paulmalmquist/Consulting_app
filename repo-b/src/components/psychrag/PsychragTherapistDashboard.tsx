"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  getPsychragAlerts,
  getPsychragMe,
  listPendingPsychragShares,
  listTherapistPatients,
  reviewPsychragShare,
} from "@/lib/psychrag/api";
import type { PsychragAlert, PsychragMeResponse, PsychragSharedSession, PsychragTherapistPatient } from "@/lib/psychrag/types";

export function PsychragTherapistDashboard() {
  const [me, setMe] = useState<PsychragMeResponse | null>(null);
  const [patients, setPatients] = useState<PsychragTherapistPatient[]>([]);
  const [pending, setPending] = useState<PsychragSharedSession[]>([]);
  const [alerts, setAlerts] = useState<PsychragAlert[]>([]);
  const [selectedShare, setSelectedShare] = useState<PsychragSharedSession | null>(null);
  const [risk, setRisk] = useState<"none" | "low" | "moderate" | "high" | "crisis">("low");
  const [followUp, setFollowUp] = useState(false);
  const [therapistNotes, setTherapistNotes] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getPsychragMe(), listTherapistPatients(), listPendingPsychragShares(), getPsychragAlerts()])
      .then(([nextMe, nextPatients, nextPending, nextAlerts]) => {
        setMe(nextMe);
        setPatients(nextPatients);
        setPending(nextPending);
        setSelectedShare(nextPending[0] ?? null);
        setAlerts(nextAlerts);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load therapist dashboard"));
  }, []);

  async function submitReview() {
    if (!selectedShare) return;
    try {
      const updated = await reviewPsychragShare(selectedShare.id, {
        therapist_notes: therapistNotes || undefined,
        risk_assessment: risk,
        follow_up_needed: followUp,
        annotations: annotation
          ? [{ annotation_type: "clinical_note", content: annotation }]
          : [],
      });
      setPending((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setFlash("Review saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review session");
    }
  }

  if (me?.profile && !["therapist", "admin"].includes(me.profile.role)) {
    return (
      <Card className="border border-white/70 bg-white/80">
        <CardContent>
          <p className="text-slate-700">This dashboard is therapist-facing. Your current role is `{me.profile.role}`.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>Patients</CardTitle>
          <CardDescription>Connected patients and the sharing/review load that needs attention.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {patients.map((patient) => (
            <Link
              key={patient.patient_id}
              href={`/psychrag/therapist/patients/${patient.patient_id}`}
              className="block rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{patient.display_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{patient.email}</p>
                </div>
                <Badge variant={patient.crisis_alerts > 0 ? "danger" : "accent"}>
                  {patient.crisis_alerts > 0 ? `${patient.crisis_alerts} alerts` : `${patient.pending_reviews} pending`}
                </Badge>
              </div>
            </Link>
          ))}
          {!patients.length ? <p className="text-sm text-slate-500">No connected patients yet.</p> : null}
        </CardContent>
      </Card>

      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>Pending reviews</CardTitle>
          <CardDescription>Review shared AI sessions, capture a risk read, and leave chartable notes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {flash ? <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash}</div> : null}
          {error ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {pending.map((share) => (
              <button
                key={share.id}
                type="button"
                onClick={() => setSelectedShare(share)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selectedShare?.id === share.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white/80 text-slate-900"
                }`}
              >
                <p className="font-medium">{share.patient_name || "Patient"}</p>
                <p className={`mt-1 text-xs ${selectedShare?.id === share.id ? "text-slate-300" : "text-slate-500"}`}>
                  {share.session_title || "Shared session"} • {share.share_type}
                </p>
                <p className={`mt-2 text-sm ${selectedShare?.id === share.id ? "text-slate-100" : "text-slate-600"}`}>
                  {share.patient_note || share.ai_clinical_summary || "No note provided."}
                </p>
              </button>
            ))}
          </div>
          {selectedShare ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{selectedShare.patient_name || "Patient session"}</p>
                  <p className="text-sm text-slate-600">{selectedShare.ai_clinical_summary || "Awaiting AI summary."}</p>
                </div>
                <Badge variant={selectedShare.reviewed ? "success" : "warning"}>{selectedShare.reviewed ? "Reviewed" : "Pending"}</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Risk assessment</span>
                  <Select value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)}>
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                    <option value="crisis">Crisis</option>
                  </Select>
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Follow-up needed</span>
                  <Select value={followUp ? "yes" : "no"} onChange={(e) => setFollowUp(e.target.value === "yes")}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </Select>
                </label>
              </div>
              <div className="mt-4 space-y-3">
                <Input value={annotation} onChange={(e) => setAnnotation(e.target.value)} placeholder="Clinical note or technique suggestion" />
                <Textarea
                  className="min-h-[140px]"
                  value={therapistNotes}
                  onChange={(e) => setTherapistNotes(e.target.value)}
                  placeholder="Therapist note for charting and follow-up"
                />
                <Button onClick={submitReview}>Save review</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-white/70 bg-white/80">
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>Shared sessions, crisis notifications, and summary-ready events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={alert.notification_type === "crisis_alert" ? "danger" : "accent"}>
                  {alert.notification_type.replace("_", " ")}
                </Badge>
                <span className="text-xs text-slate-500">{new Date(alert.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-3 text-sm text-slate-700">{JSON.stringify(alert.payload)}</p>
            </div>
          ))}
          {!alerts.length ? <p className="text-sm text-slate-500">No alerts yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getPsychragMe, submitPsychragOnboarding } from "@/lib/psychrag/api";
import { usePsychragSession } from "@/lib/psychrag/auth";

export default function PsychragOnboardingPage() {
  const router = useRouter();
  const { email } = usePsychragSession();
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"patient" | "therapist" | "admin">("patient");
  const [therapistEmail, setTherapistEmail] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [specializations, setSpecializations] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPsychragMe()
      .then((me) => {
        if (me.profile?.onboarding_complete) {
          router.push(me.profile.role === "patient" ? "/psychrag/patient/chat" : me.profile.role === "therapist" ? "/psychrag/therapist/dashboard" : "/psychrag/admin/library");
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await submitPsychragOnboarding({
        role,
        display_name: displayName,
        therapist_email: role === "patient" ? therapistEmail || undefined : undefined,
        license_number: role !== "patient" ? licenseNumber || undefined : undefined,
        license_state: role !== "patient" ? licenseState || undefined : undefined,
        specializations: role !== "patient"
          ? specializations.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
      });
      if (!response.profile) throw new Error("Onboarding did not return a profile");
      router.push(response.profile.role === "patient" ? "/psychrag/patient/chat" : response.profile.role === "therapist" ? "/psychrag/therapist/dashboard" : "/psychrag/admin/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to finish onboarding");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mx-auto max-w-3xl border border-white/70 bg-white/80">
      <CardHeader>
        <CardTitle>Finish your PsychRAG onboarding</CardTitle>
        <CardDescription>
          Signed in as {email || "your Supabase account"}. Choose your clinical role and connect the first therapist relationship if you are joining as a patient.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-2 text-sm text-slate-700">
            <span>Display name</span>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label className="space-y-2 text-sm text-slate-700">
            <span>Role</span>
            <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="patient">Patient</option>
              <option value="therapist">Therapist</option>
              <option value="admin">Admin</option>
            </Select>
          </label>
          {role === "patient" ? (
            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span>Therapist email</span>
              <Input value={therapistEmail} onChange={(e) => setTherapistEmail(e.target.value)} placeholder="Optional: connect to an existing therapist by email" />
            </label>
          ) : (
            <>
              <label className="space-y-2 text-sm text-slate-700">
                <span>License number</span>
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>License state</span>
                <Input value={licenseState} onChange={(e) => setLicenseState(e.target.value)} />
              </label>
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span>Specializations</span>
                <Input value={specializations} onChange={(e) => setSpecializations(e.target.value)} placeholder="Comma-separated, e.g. anxiety, trauma, CBT" />
              </label>
            </>
          )}
          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 md:col-span-2">{error}</p> : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Complete onboarding"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

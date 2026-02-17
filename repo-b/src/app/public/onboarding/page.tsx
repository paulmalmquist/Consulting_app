"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export default function PublicOnboardingPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [industry, setIndustry] = useState("healthcare");
  const [teamSize, setTeamSize] = useState("11-50");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/public/onboarding-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          email,
          industry,
          team_size: teamSize,
          source: "public_onboarding_page",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to capture onboarding request");
      }
      setResult(
        `Environment created: ${payload.client_name || companyName} (${payload.env_id || "unknown"}).`
      );
      setCompanyName("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-bm-bg px-6 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="rounded-full border border-bm-accent/30 bg-bm-accent/10 px-3 py-1 text-xs inline-flex text-bm-text">
          Public Preview
        </div>

        <div>
          <h1 className="text-3xl font-display font-semibold">Onboarding Intake</h1>
          <p className="mt-2 text-bm-muted">
            Submit your company profile for onboarding. Execution surfaces remain private until authenticated access is provisioned.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-bm-border/70 bg-bm-surface/35 p-5">
          <div>
            <label className="mb-1 block text-sm text-bm-muted">Company Name</label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </div>

          <div>
            <label className="mb-1 block text-sm text-bm-muted">Work Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-bm-muted">Industry</label>
              <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="healthcare">Healthcare</option>
                <option value="legal">Legal</option>
                <option value="finance">Finance</option>
                <option value="construction">Construction</option>
                <option value="real_estate_private_equity">Real Estate Private Equity</option>
                <option value="project_development_services">Project & Development Services</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-bm-muted">Team Size</label>
              <Select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-200">51-200</option>
                <option value="201-500">201-500</option>
                <option value="500+">500+</option>
              </Select>
            </div>
          </div>

          <Button type="submit" disabled={loading || !companyName.trim() || !email.trim()}>
            {loading ? "Submitting..." : "Submit Intake"}
          </Button>
        </form>

        {result ? (
          <div className="rounded-lg border border-bm-success/35 bg-bm-success/10 p-3 text-sm text-bm-text">{result}</div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 p-3 text-sm text-bm-text">{error}</div>
        ) : null}
      </div>
    </main>
  );
}

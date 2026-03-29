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
  const formReady = companyName.trim().length > 0 && email.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const subject = encodeURIComponent(`Onboarding Intake - ${companyName}`);
      const body = encodeURIComponent(
        [
          `Company Name: ${companyName}`,
          `Work Email: ${email}`,
          `Industry: ${industry}`,
          `Team Size: ${teamSize}`,
          `Source: public_onboarding_page`,
        ].join("\n"),
      );
      window.location.href = `mailto:info@novendor.ai?subject=${subject}&body=${body}`;
      setResult("Email draft opened to info@novendor.ai.");
      setCompanyName("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-bm-bg px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6 pb-24 sm:pb-10">
        <div className="inline-flex rounded-full border border-bm-accent/30 bg-bm-accent/10 px-3 py-1 text-xs text-bm-text">
          Public Preview
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
          <div>
            <h1 className="text-3xl font-display font-semibold">Onboarding Intake</h1>
            <p className="mt-2 text-sm leading-7 text-bm-muted sm:text-base">
              Share the company profile Winston should start from. Execution surfaces remain private until authenticated access is provisioned.
            </p>
          </div>
          <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4 text-sm text-bm-muted">
            1. Company context
            <br />
            2. Operating profile
            <br />
            3. Direct follow-up
          </div>
        </div>

        <form
          id="public-onboarding-form"
          onSubmit={submit}
          className="space-y-5 rounded-[1.6rem] border border-bm-border/70 bg-bm-surface/35 p-5 sm:p-6"
        >
          <section className="space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Step 1</p>
              <h2 className="mt-1 text-lg font-semibold text-bm-text">Organization</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-bm-muted">Company Name</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-bm-muted">Work Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-bm-border/60 pt-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Step 2</p>
              <h2 className="mt-1 text-lg font-semibold text-bm-text">Operating profile</h2>
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
          </section>

          <div className="hidden sm:block">
            <Button type="submit" disabled={loading || !formReady}>
              {loading ? "Submitting..." : "Submit Intake"}
            </Button>
          </div>
        </form>

        <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4 text-sm text-bm-muted">
          Submission opens a prefilled email to `info@novendor.ai`, preserving the intake details for direct follow-up.
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-bm-border/60 bg-bm-bg/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <Button type="submit" form="public-onboarding-form" disabled={loading || !formReady} className="w-full sm:hidden">
            {loading ? "Submitting..." : "Submit Intake"}
          </Button>
        </div>

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

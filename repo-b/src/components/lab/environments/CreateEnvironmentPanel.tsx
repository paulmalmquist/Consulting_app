"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Industry, humanIndustry, industries } from "./constants";

const steps = [
  "Creating schema",
  "Seeding data",
  "Indexing",
  "Complete",
];

export function CreateEnvironmentPanel({
  onProvision,
}: {
  onProvision: (payload: { clientName: string; industry: Industry; notes: string }) => Promise<void>;
}) {
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState<Industry>("healthcare");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  const nameValidation = useMemo(() => {
    if (!clientName.trim()) return "Client name is required.";
    if (clientName.trim().length < 3) return "Client name must be at least 3 characters.";
    return null;
  }, [clientName]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    if (nameValidation) {
      setError(nameValidation);
      return;
    }

    setIsProvisioning(true);
    setStepIndex(0);
    const ticker = window.setInterval(() => {
      setStepIndex((prev) => (prev < 2 ? prev + 1 : prev));
    }, 750);

    try {
      await onProvision({ clientName: clientName.trim(), industry, notes: notes.trim() });
      setStepIndex(3);
      setStatus("Environment provisioned successfully.");
      setClientName("");
      setNotes("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provision failed";
      setError(message);
      setStatus(null);
    } finally {
      window.clearInterval(ticker);
      setTimeout(() => {
        setIsProvisioning(false);
        setStepIndex(-1);
      }, 500);
    }
  }

  return (
    <Card className="h-fit">
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <CardTitle className="text-2xl">Provision Environment</CardTitle>
          <CardDescription>
            Create an isolated client schema with seeded operational data and baseline indexing.
          </CardDescription>
          <p className="text-xs text-bm-muted2">
            Provisioning creates a dedicated namespace for workflows, documents, metrics, and audit traces.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="env-provision-form">
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Client Name</label>
            <Input
              className="mt-2"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Acme Health"
              aria-invalid={Boolean(error || nameValidation)}
              required
            />
            {clientName.length > 0 && nameValidation ? (
              <p className="mt-2 text-xs text-red-300">{nameValidation}</p>
            ) : null}
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Industry</label>
            <Select className="mt-2" value={industry} onChange={(event) => setIndustry(event.target.value as Industry)}>
              {industries.map((option) => (
                <option key={option} value={option}>{humanIndustry(option)}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Notes</label>
            <Textarea
              className="mt-2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional provisioning notes"
              rows={4}
            />
          </div>

          {isProvisioning ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-3 space-y-2" data-testid="env-provision-steps">
              {steps.map((step, idx) => {
                const active = idx === stepIndex;
                const done = idx < stepIndex;
                return (
                  <div key={step} className="flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 rounded-full ${done ? "bg-emerald-400" : active ? "bg-bm-accent animate-pulse" : "bg-bm-border"}`} />
                    <span className={done ? "text-emerald-300" : active ? "text-bm-text" : "text-bm-muted2"}>{step}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={isProvisioning || Boolean(nameValidation)} data-testid="env-provision-submit">
            {isProvisioning ? "Provisioning..." : "Provision Environment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

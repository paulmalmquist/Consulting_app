'use client';

import { useState } from 'react';
import { CalendarCheck2, Loader2, Mail } from 'lucide-react';

type FormState = {
  attendeeName: string;
  attendeeEmail: string;
  attendeeCompany: string;
  industryTypes: string[];
  companySize: string;
  systemConcerns: string[];
  agenda: string;
  objectives: string[];
};

function buildMailto({ to, subject, body }: { to: string; subject: string; body: string }) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${to}?${params.toString()}`;
}

const INDUSTRY_OPTIONS = [
  'Real Estate Private Equity',
  'Consumer Credit',
  'Medical',
  'Legal',
  'Other'
] as const;

const COMPANY_SIZE_OPTIONS = [
  '1-10 employees',
  '11-50 employees',
  '51-200 employees',
  '201-500 employees',
  '501-1000 employees',
  '1000+ employees'
];

const SYSTEM_CONCERN_OPTIONS = [
  'CRM (Salesforce, HubSpot, etc.)',
  'ERP / Accounting',
  'Project Management',
  'Ticketing / Support',
  'HR / Payroll',
  'BI / Analytics',
  'Marketing Automation',
  'Document Management',
  'Other'
];

const OBJECTIVE_OPTIONS = [
  'Reduce SaaS spend',
  'Improve reporting',
  'Replace CRM',
  'Modernize accounting workflows',
  'Reduce vendor lock-in',
  'AI enablement',
  'Build internal tools',
  'Consolidate data sources',
  'Automate manual processes'
];

type ContactFormProps = {
  defaultIndustry?: string;
};

function getDefaultIndustryTypes(defaultIndustry?: string) {
  if (!defaultIndustry) {
    return [];
  }

  return INDUSTRY_OPTIONS.includes(defaultIndustry as (typeof INDUSTRY_OPTIONS)[number]) ? [defaultIndustry] : [];
}

export function ContactForm({ defaultIndustry }: ContactFormProps) {
  const [form, setForm] = useState<FormState>({
    attendeeName: '',
    attendeeEmail: '',
    attendeeCompany: '',
    industryTypes: getDefaultIndustryTypes(defaultIndustry),
    companySize: '',
    systemConcerns: [],
    agenda: '',
    objectives: []
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const directEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'info@novendor.ai';

  const toggleMultiSelect = (field: 'industryTypes' | 'systemConcerns' | 'objectives', value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value) ? prev[field].filter((v) => v !== value) : [...prev[field], value]
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setIsSubmitting(true);

    try {
      const body = [
        `Name: ${form.attendeeName}`,
        `Email: ${form.attendeeEmail}`,
        form.attendeeCompany ? `Company: ${form.attendeeCompany}` : null,
        form.companySize ? `Company Size: ${form.companySize}` : null,
        form.industryTypes.length > 0 ? `Industry: ${form.industryTypes.join(', ')}` : null,
        form.systemConcerns.length > 0 ? `System Concerns: ${form.systemConcerns.join(', ')}` : null,
        '',
        'What are you trying to solve?',
        form.agenda,
        '',
        form.objectives.length > 0 ? 'Objectives:' : null,
        form.objectives.length > 0 ? form.objectives.map((obj) => `• ${obj}`).join('\n') : null
      ]
        .filter(Boolean)
        .join('\n');

      // GitHub Pages is static-only. This drafts an email with the request.
      window.location.href = buildMailto({
        to: directEmail,
        subject: 'Book a meeting',
        body
      });

      setStatus('Request drafted. Send the email to confirm.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to prepare request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs text-nv-dim">
            Name
            <input
              required
              value={form.attendeeName}
              onChange={(event) => setForm((prev) => ({ ...prev, attendeeName: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-nv-text/10 bg-nv-bg/40 px-3 py-2 text-sm text-nv-text focus:border-nv-teal/18 focus:outline-none focus:ring-1 focus:ring-cyan-200/30"
            />
          </label>
          <label className="text-xs text-nv-dim">
            Work email
            <input
              type="email"
              required
              value={form.attendeeEmail}
              onChange={(event) => setForm((prev) => ({ ...prev, attendeeEmail: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-nv-text/10 bg-nv-bg/40 px-3 py-2 text-sm text-nv-text focus:border-nv-teal/18 focus:outline-none focus:ring-1 focus:ring-cyan-200/30"
            />
          </label>
        </div>

        <label className="text-xs text-nv-dim">
          What problem are you trying to solve?
          <textarea
            required
            rows={4}
            value={form.agenda}
            onChange={(event) => setForm((prev) => ({ ...prev, agenda: event.target.value }))}
            className="mt-2 w-full rounded-lg border border-nv-text/10 bg-nv-bg/40 px-3 py-2 text-sm text-nv-text focus:border-nv-teal/18 focus:outline-none focus:ring-1 focus:ring-cyan-200/30"
          />
        </label>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-[4px] border border-nv-teal/25 bg-nv-surface/70 px-5 py-2 text-sm font-semibold text-nv-teal transition hover:border-nv-teal/18 hover:bg-nv-teal/8 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CalendarCheck2 size={16} aria-hidden="true" />}
            {isSubmitting ? 'Preparing...' : 'Book a meeting'}
          </button>
        </div>

        <div className="border-t border-nv-text/8 pt-4">
          <p className="text-xs text-nv-faint">Optional details (helps us prepare)</p>
        </div>

        <div className="space-y-5 opacity-90">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs text-nv-dim">
              Company (optional)
              <input
                value={form.attendeeCompany}
                onChange={(event) => setForm((prev) => ({ ...prev, attendeeCompany: event.target.value }))}
                className="mt-2 w-full rounded-lg border border-nv-text/10 bg-nv-bg/40 px-3 py-2 text-sm text-nv-text focus:border-nv-teal/18 focus:outline-none focus:ring-1 focus:ring-cyan-200/30"
              />
            </label>
            <label className="text-xs text-nv-dim">
              Company Size
              <select
                value={form.companySize}
                onChange={(event) => setForm((prev) => ({ ...prev, companySize: event.target.value }))}
                className="mt-2 w-full rounded-lg border border-nv-text/10 bg-nv-bg/40 px-3 py-2 text-sm text-nv-text focus:border-nv-teal/18 focus:outline-none focus:ring-1 focus:ring-cyan-200/30"
              >
                <option value="">Select size</option>
                {COMPANY_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="text-xs text-nv-dim">Industry Type (select all that apply)</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INDUSTRY_OPTIONS.map((industry) => (
                <button
                  key={industry}
                  type="button"
                  onClick={() => toggleMultiSelect('industryTypes', industry)}
                  className={`rounded-lg border px-3 py-2 text-xs transition ${
                    form.industryTypes.includes(industry)
                      ? 'border-nv-teal/18 bg-nv-teal/10 text-nv-teal'
                      : 'border-nv-text/10 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20 hover:bg-nv-surface/60'
                  }`}
                >
                  {industry}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-nv-dim">Primary System Concerns (select all that apply)</label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SYSTEM_CONCERN_OPTIONS.map((concern) => (
                <button
                  key={concern}
                  type="button"
                  onClick={() => toggleMultiSelect('systemConcerns', concern)}
                  className={`rounded-lg border px-3 py-2 text-xs text-left transition ${
                    form.systemConcerns.includes(concern)
                      ? 'border-nv-teal/18 bg-nv-teal/10 text-nv-teal'
                      : 'border-nv-text/10 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20 hover:bg-nv-surface/60'
                  }`}
                >
                  {concern}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-nv-dim">What are your main objectives? (select all that apply)</label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OBJECTIVE_OPTIONS.map((objective) => (
                <button
                  key={objective}
                  type="button"
                  onClick={() => toggleMultiSelect('objectives', objective)}
                  className={`rounded-lg border px-3 py-2 text-xs text-left transition ${
                    form.objectives.includes(objective)
                      ? 'border-nv-teal/25 bg-nv-teal/8 text-nv-teal'
                      : 'border-nv-text/10 bg-nv-bg/40 text-nv-muted hover:border-nv-text/20 hover:bg-nv-surface/60'
                  }`}
                >
                  {objective}
                </button>
              ))}
            </div>
          </div>

          <a
            href={`mailto:${directEmail}`}
            className="inline-flex items-center gap-2 rounded-full border border-nv-text/12 px-5 py-2 text-sm text-nv-text hover:border-nv-text/20"
          >
            <Mail size={16} aria-hidden="true" />
            Email directly
          </a>
        </div>

        {status && (
          <div className="rounded-xl border border-nv-teal/25 bg-nv-teal/8 px-4 py-3 text-sm text-nv-teal">
            {status}
          </div>
        )}
        {error && <p className="text-sm text-nv-risk">{error}</p>}
      </form>
    </div>
  );
}

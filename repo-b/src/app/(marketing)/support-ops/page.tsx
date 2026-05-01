import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

export default function SupportOpsPage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Support Ops"
        headline="Intent-first internal support."
        lede="An AI front door for IT, HR, and Ops that captures intent once, routes to the right owner, and logs every decision for auditability."
      />

      <section className="nv-section">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: 'Intake → classify → route',
              description: 'Gather the request in plain language, detect intent, and route to the right queue.'
            },
            {
              title: 'Resolve → approve → execute',
              description: 'Auto-resolve low-risk requests and hold sensitive actions for human approval.'
            },
            {
              title: 'Log → learn → report',
              description: 'Capture every decision, surface exceptions, and report weekly performance trends.'
            }
          ].map((item) => (
            <NvCard key={item.title}>
              <h2 className="nv-h3">{item.title}</h2>
              <p className="nv-body" style={{ margin: 0 }}>{item.description}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="grid gap-4 md:grid-cols-2">
          <NvCard>
            <h2 className="nv-h3">Metrics we track</h2>
            <ul className="nv-body" style={{ marginTop: 12, paddingLeft: '1.25rem', listStyle: 'disc' }}>
              <li>Time-to-first-response</li>
              <li>Mean time to resolution (MTTR)</li>
              <li>Deflection rate</li>
              <li>Misroute rate</li>
            </ul>
          </NvCard>
          <NvCard>
            <h2 className="nv-h3">Governance &amp; data handling</h2>
            <ul className="nv-body" style={{ marginTop: 12, paddingLeft: '1.25rem', listStyle: 'disc' }}>
              <li>Audit logs for every route, response, and approval</li>
              <li>Human-in-the-loop gates for sensitive actions</li>
              <li>Synthetic or redacted data in demos by default</li>
              <li>Clear retention and access rules for regulated teams</li>
            </ul>
          </NvCard>
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />By vertical</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: 'Healthcare admin',
              items: [
                'Prior auth status questions with cited policy steps',
                'Billing exceptions routed with required context',
                'Access requests with logged approvals'
              ]
            },
            {
              title: 'Legal ops',
              items: [
                'Intake triage with escalation paths',
                'Policy and retention answers with citations',
                'Matter updates routed to the right owner'
              ]
            },
            {
              title: 'Construction / PDS',
              items: [
                'Change order intake with required documents',
                'Vendor onboarding checklist routing',
                'RFI triage with logged decisions'
              ]
            }
          ].map((section) => (
            <NvCard key={section.title}>
              <h2 className="nv-h3">{section.title}</h2>
              <ul className="nv-body" style={{ marginTop: 12, paddingLeft: '1.25rem', listStyle: 'disc' }}>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="flex flex-wrap gap-3">
          <NvButton variant="primary" href="/contact">Book a 20-minute Support Ops fit check</NvButton>
          <NvButton variant="secondary" href="/demo">Walk through an auditable AI workflow</NvButton>
        </div>
      </section>
    </div>
  );
}

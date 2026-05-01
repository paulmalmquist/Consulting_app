import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

const safeguards = ['Human approval required', 'Role-based access', 'Trace logging enabled', 'Policy-bound responses only'];

export default function AIConciergePage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="AI Concierge"
        headline="A governed AI assistant tied to your workflow states, rules, and audit evidence."
        lede="Decision support for recurring exceptions — the AI recommends, a human approves, and every step is logged. No black-box routing."
      />

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Example interaction</p>
        </div>
        <NvCard>
          <p className="nv-body"><strong>User:</strong> This capital call exception crossed threshold. Escalate?</p>
          <p className="nv-body" style={{ marginTop: 12 }}><strong>Concierge:</strong> Escalate to finance approver. Rule 3.2 triggered by variance &gt; 2.5%. Two similar events resolved with owner override in prior quarter. Source records attached.</p>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />How it works</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {['Input', 'AI Recommendation', 'Human Approval', 'Execution + Audit Log'].map((step, idx) => (
            <NvCard key={step}>
              <p className="nv-eyebrow" style={{ marginBottom: 8 }}>{String(idx + 1).padStart(2, '0')}</p>
              <p className="nv-h3">{step}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Safeguards</p>
        </div>
        <NvCard>
          <div className="flex flex-wrap gap-2">
            {safeguards.map((item) => (
              <span key={item} className="nv-pill nv-pill-teal">{item}</span>
            ))}
          </div>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What changes</p>
        </div>
        <NvCard>
          <ul className="nv-body" style={{ margin: 0, paddingLeft: '1.25rem', listStyle: 'disc' }}>
            <li>15–35% reduction in decision latency for recurring exceptions</li>
            <li>90%+ routing accuracy after rule tuning</li>
            <li>95%+ response provenance coverage in audit samples</li>
          </ul>
          <div className="flex flex-wrap gap-3" style={{ marginTop: 24 }}>
            <NvButton variant="primary" href="/contact">Fix your exception workflow</NvButton>
            <NvButton variant="secondary" href="/operational-assessment">Get an AI-readiness review</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}

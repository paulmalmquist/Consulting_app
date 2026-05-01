import { NvCard } from '@/components/marketing/ui/NvCard';
import { NvButton } from '@/components/marketing/ui/NvButton';

export default function AboutPage() {
  return (
    <div className="nv-page">
      <div style={{ maxWidth: 880 }}>
        <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />About Novendor</p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 20, maxWidth: '20ch' }}>
          We built Novendor after watching critical operations run on <em>disconnected</em> tools.
        </h1>
        <p className="nv-lede">
          We saw teams managing real risk across spreadsheets, SaaS apps, manual handoffs, and unclear ownership. Novendor helps replace that fragmentation with controlled execution systems companies can operate and trust.
        </p>
        <p className="nv-small" style={{ marginTop: 12 }}>Based in South Florida.</p>
        <div style={{ marginTop: 28 }}>
          <NvButton variant="primary" href="/contact">Talk with us</NvButton>
        </div>
      </div>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Founders</p>
        </div>
        <div style={{ marginBottom: 32, maxWidth: 760 }}>
          <h2 className="nv-h2" style={{ marginBottom: 16 }}>Founded by operators who have lived the problem.</h2>
          <p className="nv-body" style={{ margin: 0 }}>
            Novendor was started by Paul Malmquist and Richard de Oliveira to help companies bring AI into real operating work without losing control of the data, approvals, and decisions behind it.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <NvCard>
            <p className="nv-eyebrow" style={{ marginBottom: 8 }}>Co-founder</p>
            <h3 className="nv-h3" style={{ marginBottom: 12 }}>Paul Malmquist</h3>
            <p className="nv-body">
              Paul brings enterprise data, analytics, and operating-system experience across real estate private equity, professional services, reporting, automation, and AI-enabled execution. His work focuses on turning fragmented systems into governed workflows, trusted data layers, and decision surfaces operators can actually use.
            </p>
            <div style={{ marginTop: 24 }}>
              <NvButton variant="secondary" href="/paul">View Paul&apos;s resume</NvButton>
            </div>
          </NvCard>

          <NvCard>
            <p className="nv-eyebrow" style={{ marginBottom: 8 }}>Co-founder</p>
            <h3 className="nv-h3" style={{ marginBottom: 12 }}>Richard de Oliveira</h3>
            <p className="nv-body">
              Richard brings operating, client, and execution experience that helps translate business problems into practical rollout plans. His focus is making sure AI adoption stays grounded in real workflows, clear ownership, and measurable business value.
            </p>
            <div style={{ marginTop: 24 }}>
              <NvButton variant="secondary" href="/richard">View Richard&apos;s resume</NvButton>
            </div>
          </NvCard>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { NvCard } from '@/components/marketing/ui/NvCard';

export const metadata: Metadata = {
  title: 'Capabilities | Novendor',
  description: 'How Novendor engages — operational assessments, data strategy, and AI concierge.',
  alternates: { canonical: '/capabilities' },
};

const capabilities = [
  {
    title: 'Operational Assessment',
    href: '/operational-assessment',
    copy: 'Find the workflow that is costing you the most. Baseline cycle time, error rate, and owner gaps in 30 minutes.',
  },
  {
    title: 'AI Concierge',
    href: '/ai-concierge',
    copy: 'Add an AI layer that answers questions against your real data with the citations and guardrails leadership expects.',
  },
];

export default function CapabilitiesIndexPage() {
  return (
    <div className="nv-page">
      <header style={{ paddingBottom: 48, borderBottom: '1px solid var(--nv-hair-medium-rgba)' }}>
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Capabilities
        </p>
        <h1 className="nv-h1" style={{ marginTop: 18, marginBottom: 24, fontSize: 'clamp(44px, 6vw, 68px)' }}>
          What we build, and how.
        </h1>
        <p className="nv-lede">
          Three ways we engage. Each is scoped to one workflow or one system at a time, with explicit
          outcomes and a cutover plan you control.
        </p>
      </header>

      <section className="nv-section">
        <div className="grid gap-6 md:grid-cols-2">
          {capabilities.map((capability) => (
            <Link key={capability.href} href={capability.href} style={{ textDecoration: 'none' }}>
              <NvCard liftOnHover>
                <h2 className="nv-h3" style={{ marginBottom: 12 }}>{capability.title}</h2>
                <p className="nv-body" style={{ margin: 0 }}>{capability.copy}</p>
                <p className="nv-eyebrow" style={{ marginTop: 20, color: 'rgb(var(--nv-accent-teal))' }}>
                  Read more →
                </p>
              </NvCard>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

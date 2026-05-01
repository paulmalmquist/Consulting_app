import { NvButton } from '@/components/marketing/ui/NvButton';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';
import { CredibilitySection } from '@/components/marketing/marketing/CredibilitySection';
import { CategoryMessagingFramework } from '@/components/marketing/marketing/CategoryMessagingFramework';

const CFO_FOCUS = ['Cost discipline', 'ROI visibility', 'Operational efficiency', 'Scalable infrastructure'];

const CFO_PRIORITIES = [
  { title: 'Lower Fixed Costs', description: 'Consolidate tools.' },
  { title: 'Higher Productivity', description: 'Automate manual workflows.' },
  { title: 'Clear ROI', description: 'Tie AI deployment to financial outcomes.' },
  { title: 'Better Data Control', description: 'Reduce dependence on third-party platforms.' }
];

const RESULTS = ['Reduced SaaS budgets', 'Faster reporting cycles', 'Lower operational overhead', 'Improved team productivity'];

export default function CfoPage() {
  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="For CFOs"
        headline="Reduce software spend without slowing the business."
        lede="We help CFOs identify where internal AI systems can replace high-cost tools and improve operational efficiency."
      >
        <div style={{ marginTop: 24 }}>
          <NvButton variant="primary" href="/operational-assessment">Request a cost reduction assessment</NvButton>
        </div>
      </PageHeader>

      <section className="nv-section">
        <CredibilitySection />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Financial leadership priorities</p>
        </div>
        <NvCard>
          <p className="nv-body">You are responsible for measurable financial and operating outcomes.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ marginTop: 16 }}>
            {CFO_FOCUS.map((item) => (
              <div key={item} className="nv-pill nv-pill-teal">{item}</div>
            ))}
          </div>
        </NvCard>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />What CFOs care about</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CFO_PRIORITIES.map((item) => (
            <NvCard key={item.title}>
              <h3 className="nv-h3">{item.title}</h3>
              <p className="nv-body" style={{ margin: 0 }}>{item.description}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Common outcomes</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RESULTS.map((item) => (
            <NvCard key={item}>
              <p className="nv-body" style={{ margin: 0 }}>{item}</p>
            </NvCard>
          ))}
        </div>
      </section>

      <section className="nv-section">
        <CategoryMessagingFramework />
      </section>

      <section className="nv-section">
        <div className="nv-section-head">
          <p className="nv-eyebrow"><span className="nv-eyebrow-dot" />Find your largest cost-saving opportunities</p>
        </div>
        <NvCard>
          <div style={{ marginTop: 0 }}>
            <NvButton variant="primary" href="/operational-assessment">Schedule a CFO assessment</NvButton>
          </div>
        </NvCard>
      </section>
    </div>
  );
}

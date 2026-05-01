import Link from 'next/link';
import { getAllDocs } from '@/lib/marketing/content';
import { NvCard } from '@/components/marketing/ui/NvCard';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

export default function DocsPage() {
  const docs = getAllDocs();

  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Core Research"
        headline={<>Core <em>research</em>.</>}
        lede="Detailed guidance on method, engagement structure, and decision controls."
      />

      <section className="nv-section">
        <div className="grid gap-4 md:grid-cols-2">
          {docs.map((doc) => (
            <Link key={doc.slug} href={`/docs/${doc.slug}`} className="block">
              <NvCard liftOnHover>
                <h2 className="nv-h3">{doc.title}</h2>
                <p className="nv-body" style={{ margin: 0 }}>{doc.description}</p>
              </NvCard>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

import { getDocBySlug, getAllDocs } from '@/lib/marketing/content';
import { MarkdownRenderer } from '@/components/marketing/content/MarkdownRenderer';
import { PageHeader } from '@/components/marketing/ui/PageHeader';

export async function generateStaticParams() {
  return getAllDocs().map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const doc = getDocBySlug(params.slug);
  return {
    title: doc.title,
    description: doc.description
  };
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const doc = getDocBySlug(params.slug);

  return (
    <div className="nv-page">
      <PageHeader
        eyebrow="Core Research"
        headline={doc.title}
        lede={doc.description}
      />
      <div className="nv-section">
        <MarkdownRenderer content={doc.content} />
      </div>
    </div>
  );
}

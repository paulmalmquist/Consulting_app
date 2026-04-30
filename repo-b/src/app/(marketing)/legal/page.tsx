import { getPage } from '@/lib/marketing/content';
import { MarkdownRenderer } from '@/components/marketing/content/MarkdownRenderer';

export default function LegalPage() {
  const page = getPage('legal');

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-nv-text">{page.title}</h1>
        <p className="text-lg text-nv-muted">{page.description}</p>
      </section>
      <MarkdownRenderer content={page.content} />
    </div>
  );
}

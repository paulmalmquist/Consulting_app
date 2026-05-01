import { getPage } from '@/lib/marketing/content';
import { MarkdownRenderer } from '@/components/marketing/content/MarkdownRenderer';

export default function LegalPage() {
  const page = getPage('legal');

  return (
    <div className="nv-page">
      <div>
        <h1 className="nv-h1" style={{ marginBottom: 24 }}>{page.title}</h1>
        <p className="nv-lede">{page.description}</p>
      </div>
      <div className="nv-section">
        <MarkdownRenderer content={page.content} />
      </div>
    </div>
  );
}

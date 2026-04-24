import Link from 'next/link';
import { getAllDocs } from '@/lib/marketing/content';

export default function DocsPage() {
  const docs = getAllDocs();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-white">Core Research</h1>
        <p className="text-lg text-nv-muted">Detailed guidance on method, engagement structure, and decision controls.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/docs/${doc.slug}`}
            className="rounded-2xl border border-nv-text/10 bg-nv-surface/60 p-5 transition hover:border-nv-text/20"
          >
            <h2 className="text-lg font-semibold text-white">{doc.title}</h2>
            <p className="mt-2 text-sm text-nv-muted">{doc.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

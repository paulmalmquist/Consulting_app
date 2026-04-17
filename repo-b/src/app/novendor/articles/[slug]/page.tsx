import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ARTICLES, getArticleBySlug } from "@/lib/articles";

type PageProps = {
  params: { slug: string };
};

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const article = getArticleBySlug(params.slug);
  if (!article) return {};
  const url = `https://novendor.ai/novendor/articles/${article.slug}`;
  return {
    title: `${article.title} — Novendor`,
    description: article.dek,
    openGraph: {
      title: article.title,
      description: article.dek,
      type: "article",
      siteName: "Novendor",
      url,
      publishedTime: article.publishedOn,
      authors: [article.author],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.dek,
    },
    alternates: {
      canonical: url,
    },
  };
}

function formatPublishedOn(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Minimal markdown-ish renderer. Convention:
 *   - Blank line separates blocks.
 *   - Lines starting with "## " become h2.
 *   - Other non-empty blocks are paragraphs.
 */
function renderBody(body: string): React.ReactNode {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block, idx) => {
    if (block.startsWith("## ")) {
      return (
        <h2
          key={idx}
          className="mt-12 font-editorial text-2xl leading-tight tracking-tight text-slate-50 md:text-3xl"
        >
          {block.slice(3).trim()}
        </h2>
      );
    }
    return (
      <p
        key={idx}
        className="mt-6 text-[17px] leading-[1.75] text-slate-300 md:text-lg"
      >
        {block}
      </p>
    );
  });
}

export default function NovendorArticleDetailPage({ params }: PageProps) {
  const article = getArticleBySlug(params.slug);
  if (!article) notFound();

  return (
    <main
      data-testid={`novendor-article-${article.slug}`}
      className="min-h-screen bg-[#05080c] text-slate-100"
    >
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/novendor/articles"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
        >
          <span aria-hidden="true">←</span> All articles
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-900/60"
        >
          Sign in
        </Link>
      </header>

      <article className="mx-auto w-full max-w-3xl px-6 pb-24 pt-8 md:pt-14">
        {/* ── Metadata strip ─────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500">
          <span>{article.tag}</span>
          <span aria-hidden="true" className="text-slate-700">
            •
          </span>
          <time dateTime={article.publishedOn}>
            {formatPublishedOn(article.publishedOn)}
          </time>
          <span aria-hidden="true" className="text-slate-700">
            •
          </span>
          <span>{article.readingMinutes} min read</span>
        </div>

        {/* ── Title + dek ─────────────────────────────────── */}
        <h1 className="mt-4 font-editorial text-4xl leading-[1.05] tracking-tight text-slate-50 md:text-5xl">
          {article.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
          {article.dek}
        </p>
        <div className="mt-4 text-sm text-slate-500">By {article.author}</div>

        {/* ── Body ────────────────────────────────────────── */}
        <div className="mt-12">{renderBody(article.body)}</div>

        {/* ── Footer CTA ──────────────────────────────────── */}
        <section className="mt-20 rounded-2xl border border-slate-800/70 bg-[#0a0e12]/80 p-6 md:p-8">
          <h2 className="font-editorial text-xl tracking-tight text-slate-50 md:text-2xl">
            Running a 90-day assessment
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            We&rsquo;re working with a small number of REPE CFOs and Heads of
            Data on 90-day assessments of close cycle, reconciliation spend,
            and LP reporting. If this is on your list this year, we can
            probably help.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/novendor"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5"
            >
              Learn more about Novendor
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/novendor/articles"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:border-slate-500 hover:bg-slate-900/60"
            >
              ← More articles
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}

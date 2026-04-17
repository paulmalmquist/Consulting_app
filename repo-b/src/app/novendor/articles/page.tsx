import type { Metadata } from "next";
import Link from "next/link";

import { listArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Articles — Novendor",
  description:
    "Field notes on REPE operations, LP reporting, AI-native platforms, and what's actually changing in institutional real estate software.",
  openGraph: {
    title: "Articles — Novendor",
    description:
      "Field notes on REPE operations, LP reporting, AI-native platforms, and what's actually changing in institutional real estate software.",
    type: "website",
    siteName: "Novendor",
    url: "https://novendor.ai/articles",
  },
  twitter: {
    card: "summary_large_image",
    title: "Articles — Novendor",
    description:
      "Field notes on REPE operations, LP reporting, AI-native platforms, and what's actually changing in institutional real estate software.",
  },
};

function formatPublishedOn(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function NovendorArticlesIndexPage() {
  const articles = listArticles();

  return (
    <main
      data-testid="novendor-articles-index"
      className="min-h-screen bg-[#05080c] text-slate-100"
    >
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/novendor"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
        >
          <span aria-hidden="true">←</span> Novendor
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-900/60"
        >
          Sign in
        </Link>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-8 md:pt-14">
        {/* ── Section identity ────────────────────────────── */}
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500">
          Field notes
        </p>
        <h1 className="mt-3 font-editorial text-4xl leading-[1.05] tracking-tight text-slate-50 md:text-5xl">
          Articles
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
          Writing from the Novendor team on REPE operations, LP reporting, and
          what&rsquo;s actually changing in institutional real estate software.
          New pieces most weeks.
        </p>

        {/* ── Article list ────────────────────────────────── */}
        <ul className="mt-14 space-y-10">
          {articles.map((article) => (
            <li
              key={article.slug}
              className="group border-b border-slate-800/60 pb-10 last:border-none"
            >
              <Link
                href={`/novendor/articles/${article.slug}`}
                className="block"
                data-testid={`article-card-${article.slug}`}
              >
                <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500">
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
                <h2 className="mt-3 font-editorial text-2xl leading-[1.15] tracking-tight text-slate-50 transition-colors group-hover:text-white md:text-3xl">
                  {article.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
                  {article.dek}
                </p>
                <div className="mt-4 text-xs text-slate-500">
                  By {article.author}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

import type { Metadata } from "next";

/**
 * /novendor/articles — public marketing surface.
 *
 * The root layout declares `robots: { index: false, follow: false }` for the
 * entire app. This layout reverses that for the articles subtree so crawlers
 * can pick the content up. Any marketing route living under /novendor/articles
 * inherits this posture.
 */
export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
};

export default function NovendorArticlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

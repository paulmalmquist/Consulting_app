import type { Metadata } from "next";
import { MicrositeView } from "./MicrositeView";

type ForPageProps = {
  params: {
    slug: string;
  };
};

function humanize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function generateMetadata({ params }: ForPageProps): Metadata {
  const firm = humanize(params.slug);
  const title = `${firm} × Novendor`;
  const description = `Controlled internal systems, built and shown as working software for ${firm}.`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: `/for/${params.slug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default function ForPage({ params }: ForPageProps) {
  return <MicrositeView slug={params.slug} />;
}

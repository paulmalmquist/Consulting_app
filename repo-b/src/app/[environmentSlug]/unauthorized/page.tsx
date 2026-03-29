import { notFound } from "next/navigation";

import { environmentCatalog, isEnvironmentSlug } from "@/lib/environmentAuth";
import { EnvironmentUnauthorizedState } from "@/components/auth/EnvironmentAccess";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(environmentCatalog).map((environmentSlug) => ({ environmentSlug }));
}

export default async function EnvironmentUnauthorizedPage({
  params,
}: {
  params: Promise<{ environmentSlug: string }>;
}) {
  const { environmentSlug } = await params;
  if (!isEnvironmentSlug(environmentSlug)) notFound();
  return <EnvironmentUnauthorizedState slug={environmentSlug} />;
}

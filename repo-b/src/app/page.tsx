import { WinstonLoginPortal } from "@/components/auth/WinstonLoginPortal";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <WinstonLoginPortal returnTo={resolvedSearchParams?.returnTo || null} />;
}

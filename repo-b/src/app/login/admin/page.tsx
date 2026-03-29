import { GenericPlatformLoginForm } from "@/components/auth/EnvironmentAccess";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <GenericPlatformLoginForm returnTo={resolvedSearchParams?.returnTo || null} />;
}

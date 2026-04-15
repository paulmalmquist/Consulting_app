import WinstonPublicHome from "@/components/public/WinstonPublicHome";

/**
 * Public homepage (`/`).
 *
 * Middleware handling (repo-b/src/middleware.ts:124):
 *   - unauthenticated visitors → render this page
 *   - authenticated visitors   → redirect to /app
 *
 * So this file only ever renders for a first-time / signed-out visitor.
 * Goal: <30-second explanation of Winston + clear CTAs. See WinstonPublicHome
 * for the legibility contract.
 */
export default function HomePage() {
  return <WinstonPublicHome />;
}

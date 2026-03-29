"use client";

import Link from "next/link";
import { useEnv } from "@/components/EnvProvider";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function EnvGate({ children }: { children: React.ReactNode }) {
  const { selectedEnv, loading } = useEnv();

  if (loading) {
    return (
      <Card>
        <CardContent>
          <CardTitle>Loading…</CardTitle>
          <CardDescription>Checking environments.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (!selectedEnv) {
    return (
      <Card>
        <CardContent>
          <CardTitle>Select an environment</CardTitle>
          <CardDescription>
            This page is specific to a client environment. Create or select one to
            continue.
          </CardDescription>
          <div className="mt-4">
            <Link href="/app" className={buttonVariants()}>
              Choose environment
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

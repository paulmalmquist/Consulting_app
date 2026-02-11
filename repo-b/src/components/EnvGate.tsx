"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

export default function EnvGate({ children }: { children: React.ReactNode }) {
  const { selectedEnv, loading } = useEnv();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !selectedEnv && pathname !== "/lab/environments") {
      router.replace("/lab/environments");
    }
  }, [loading, selectedEnv, pathname, router]);

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
            Redirecting to environment selection.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

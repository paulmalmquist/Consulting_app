"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";

export default function LabPage() {
  const router = useRouter();
  const { selectedEnv, loading } = useEnv();

  useEffect(() => {
    if (loading) return;
    if (selectedEnv) {
      router.replace("/lab/metrics");
      return;
    }
    router.replace("/lab/environments");
  }, [loading, selectedEnv, router]);

  return (
    <Card>
      <CardContent>
        <CardTitle>Loading lab</CardTitle>
        <CardDescription>Routing to your environment.</CardDescription>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RepeIndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    const envId = localStorage.getItem("demo_lab_env_id");
    if (envId) {
      router.replace(`/lab/env/${envId}/re/portfolio`);
    } else {
      router.replace("/lab/environments");
    }
  }, [router]);
  return <p className="text-sm text-bm-muted2 p-4">Redirecting...</p>;
}

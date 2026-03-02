"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function ReScenariosRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    router.replace(pathname.replace("/scenarios", "/models"));
  }, [pathname, router]);

  return (
    <div className="p-6 text-sm text-bm-muted2">
      Redirecting to Models...
    </div>
  );
}

"use client";

import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { logoutPlatformSession } from "@/lib/platformSessionClient";

function HomeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { selectedEnv } = useEnv();
  const isImmersiveRoute = /^\/lab\/env\/[^/]+\/markets(\/|$)/.test(pathname);

  const logout = async () => {
    await logoutPlatformSession();
  };

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex flex-col">
      <header className="absolute top-0 right-0 z-50 flex items-center gap-2 p-3">
        <Link
          href="/app"
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "h-8 w-8 p-0 flex items-center justify-center rounded-full"
          )}
          data-testid="global-home-button"
          title="Home"
        >
          <HomeIcon size={16} />
        </Link>
        <ThemeToggle />
        <button
          onClick={logout}
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "text-xs"
          )}
        >
          Sign out
        </button>
      </header>
      <main className={cn("flex-1", isImmersiveRoute ? "overflow-y-auto" : "p-6 pt-14")}>
        {children}
      </main>
    </div>
  );
}

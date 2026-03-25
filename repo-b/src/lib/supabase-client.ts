"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes("placeholder") || anonKey === "placeholder") {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 2,
        },
      },
    });
  }

  return browserClient;
}

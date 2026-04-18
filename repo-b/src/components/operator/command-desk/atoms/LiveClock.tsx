"use client";
import { useEffect, useState } from "react";

export function useLiveClock(): Date {
  const [t, setT] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function LiveClock() {
  const t = useLiveClock();
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        fontSize: 11,
        color: "var(--fg-1)",
        letterSpacing: ".04em",
      }}
      suppressHydrationWarning
    >
      {t.getUTCFullYear()}-{pad(t.getUTCMonth() + 1)}-{pad(t.getUTCDate())} · {pad(t.getUTCHours())}:
      {pad(t.getUTCMinutes())}:{pad(t.getUTCSeconds())} UTC
    </span>
  );
}

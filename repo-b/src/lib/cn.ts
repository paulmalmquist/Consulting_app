type CnArg =
  | string
  | number
  | null
  | undefined
  | boolean
  | Record<string, boolean>
  | CnArg[];

export function cn(...args: CnArg[]): string {
  const out: string[] = [];

  const walk = (a: CnArg) => {
    if (!a) return;
    if (Array.isArray(a)) {
      a.forEach(walk);
      return;
    }
    if (typeof a === "string" || typeof a === "number") {
      out.push(String(a));
      return;
    }
    if (typeof a === "object") {
      Object.entries(a).forEach(([k, v]) => {
        if (v) out.push(k);
      });
    }
  };

  args.forEach(walk);
  return out.join(" ");
}


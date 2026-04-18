export function fmtUSD(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtUSDK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return fmtUSD(n, 0);
}

export function fmtUSDDelta(n: number, decimals = 2): string {
  const sign = n > 0 ? "+" : "";
  return sign + fmtUSD(n, decimals);
}

export function fmtPct(n: number, decimals = 1): string {
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(decimals) + "%";
}

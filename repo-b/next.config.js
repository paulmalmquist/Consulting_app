function normalizeOrigin(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function validateCanonicalBackendOrigins() {
  const bosCandidates = [
    process.env.BOS_API_ORIGIN,
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);
  const demoCandidates = [
    process.env.DEMO_API_ORIGIN,
    process.env.DEMO_API_BASE_URL,
    process.env.NEXT_PUBLIC_DEMO_API_BASE_URL,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  const bosOrigin = bosCandidates[0] || "";
  if (!bosOrigin) return;

  for (const demoOrigin of demoCandidates) {
    if (demoOrigin && demoOrigin !== bosOrigin) {
      throw new Error(
        `DEMO API origin aliases must match BOS_API_ORIGIN during repo-c sunset. Received BOS=${bosOrigin} DEMO=${demoOrigin}`
      );
    }
  }
}

validateCanonicalBackendOrigins();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;

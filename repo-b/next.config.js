/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/legacy-saas',           destination: '/saas-iceberg', permanent: true },
      { source: '/legacy-saas-migration', destination: '/saas-iceberg', permanent: true },
      { source: '/public',                destination: '/',             permanent: true },
      { source: '/public/onboarding',     destination: '/onboarding',   permanent: true },
    ];
  },
};

module.exports = nextConfig;

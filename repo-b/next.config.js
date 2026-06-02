/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/',                      destination: '/what-we-do',   permanent: true },
      { source: '/public',                destination: '/',             permanent: true },
      { source: '/public/onboarding',     destination: '/onboarding',   permanent: true },
      { source: '/capabilities/comprehensive-data-strategy', destination: '/what-we-do', permanent: true },
    ];
  },
};

module.exports = nextConfig;

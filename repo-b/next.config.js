/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/public',                destination: '/',             permanent: true },
      { source: '/public/onboarding',     destination: '/onboarding',   permanent: true },
    ];
  },
};

module.exports = nextConfig;

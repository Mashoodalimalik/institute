/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  customWorkerDir: 'worker',
  disable: process.env.NODE_ENV === 'development' ? false : false,
});

const nextConfig = {
  // Allow @react-pdf/renderer to work server-side
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('@react-pdf/renderer', 'web-push');
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer', 'web-push'],
  },
};

module.exports = withPWA(nextConfig);

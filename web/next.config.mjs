/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com'
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com'
      }
    ]
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid flaky filesystem cache artifacts in local dev on some macOS setups.
      config.cache = { type: 'memory' };
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: '/superamin',
        destination: '/superadmin',
        permanent: true
      }
    ];
  }
};

export default nextConfig;

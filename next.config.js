/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.externals.push({
      "whatsapp-web.js": "commonjs whatsapp-web.js",
      "puppeteer": "commonjs puppeteer",
    });
    return config;
  },
};

module.exports = nextConfig;

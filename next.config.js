/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["whatsapp-web.js", "puppeteer"],
  experimental: {
    // The proxy middleware (src/proxy.ts) runs on every request, including
    // the backup restore upload — Next caps how much of a request body it
    // will buffer for the proxy to 10MB by default, well under the size of
    // a real backup (database + WhatsApp session data). Its own error
    // message points at a stale "middlewareClientMaxBodySize" doc URL, but
    // the option Next actually reads for a proxy.ts file is this one.
    proxyClientMaxBodySize: "200mb",
  },
};

module.exports = nextConfig;

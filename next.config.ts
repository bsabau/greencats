import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
    // The proxy (src/proxy.ts) keeps a copy of each request body. A photo upload must fit whole.
    proxyClientMaxBodySize: "12mb",
  },
  // The Content Security Policy is set per request, with a nonce, in src/proxy.ts.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
};
export default config;

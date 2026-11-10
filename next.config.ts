import type { NextConfig } from "next";

// Scripts and styles only from this app. Next.js needs inline scripts to start a page, so those stay allowed.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "Content-Security-Policy", value: csp },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
};
export default config;

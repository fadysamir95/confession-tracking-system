import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Prisma's query engine and the native Argon2id binding are both loaded from
  // disk at runtime, so they must stay outside the bundler.
  serverExternalPackages: ["@prisma/client", "@node-rs/argon2", "nodemailer"],
  async headers() {
    const securityHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      ...(isDevelopment
        ? []
        : [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ]),
    ];

    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

/**
 * Wraps the config with @next/bundle-analyzer, but only when ANALYZE=true.
 *
 * The analyzer is a devDependency and is loaded lazily so that a production
 * install (`npm install` with NODE_ENV=production, which omits devDependencies)
 * can still build. A static import here fails the build with MODULE_NOT_FOUND.
 */
function withBundleAnalyzer(config: NextConfig): NextConfig {
  if (process.env.ANALYZE !== "true") return config;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bundleAnalyzer = require("@next/bundle-analyzer");
  return bundleAnalyzer({ enabled: true })(config);
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose", "bcryptjs", "pdfkit", "mongodb"],
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.CORS_ORIGIN || "https://www.linkedin.com" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "media.licdn.com",
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "framer-motion",
      "react-markdown",
      "@radix-ui/react-accordion",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "zod",
    ],
  },
};

export default withBundleAnalyzer(nextConfig);

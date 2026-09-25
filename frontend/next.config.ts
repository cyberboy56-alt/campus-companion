import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  ...(isStaticExport
    ? {
        output: "export" as const,
        basePath: process.env.NEXT_BASE_PATH || undefined,
        trailingSlash: true,
      }
    : {
        async rewrites() {
          const backendUrl = (
            process.env.FASTAPI_URL || "http://127.0.0.1:8000"
          ).replace(/\/$/, "");
          return [
            {
              source: "/api/:path*",
              destination: `${backendUrl}/api/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;

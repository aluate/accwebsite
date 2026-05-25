import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // data/catalogs/*.json are loaded via dynamic fs.readFileSync paths in lib/catalogs.ts.
  // Next.js file tracer cannot statically resolve dynamic paths, so we must explicitly
  // include them so Vercel bundles the JSON files into the Lambda output.
  outputFileTracingIncludes: {
    "/**": ["./data/catalogs/**"],
  },
};

export default nextConfig;

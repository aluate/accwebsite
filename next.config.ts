import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  // data/catalogs/*.json are loaded via dynamic fs.readFileSync paths in lib/catalogs.ts.
  // Next.js file tracer cannot statically resolve dynamic paths, so we must explicitly
  // include them so Vercel bundles the JSON files into the Lambda output.
  outputFileTracingIncludes: {
    "/**": ["./data/catalogs/**"],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;

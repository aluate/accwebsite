import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

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

export default withSentryConfig(nextConfig, {
  // Sentry org/project — set SENTRY_ORG and SENTRY_PROJECT env vars in Vercel
  // to enable source map uploads. Without them, Sentry still captures errors,
  // just without pretty stack traces.
  silent: true,          // suppress CLI output during build
  disableLogger: true,   // remove Sentry logger from bundle
  // Only upload source maps if SENTRY_AUTH_TOKEN is set
  authToken: process.env.SENTRY_AUTH_TOKEN,
});

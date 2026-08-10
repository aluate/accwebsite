import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  // data/catalogs/*.json are loaded via dynamic fs.readFileSync paths in lib/catalogs.ts.
  // Next.js file tracer cannot statically resolve dynamic paths, so we must explicitly
  // include them so Vercel bundles the JSON files into the Lambda output.
  outputFileTracingIncludes: {
    // The comment above applies just as much to the melamine swatches: the PDF
    // renderer opens public/melamines/<whatever colour this finish group is>.jpg,
    // which is a dynamic path the tracer cannot see. Without this line the images
    // render on a developer's machine and are silently absent in production —
    // which is the only place they matter. ~6MB of 400px jpgs.
    "/**": ["./data/catalogs/**", "./public/melamines/**", "./public/logo.png"],
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

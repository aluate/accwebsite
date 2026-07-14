// sentry.client.config.ts
// Initialises Sentry in the browser.
// DSN is set via NEXT_PUBLIC_SENTRY_DSN environment variable in Vercel.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Capture 10% of traces in production to stay on free tier
    tracesSampleRate: 0.1,
    // Only enable in production
    enabled: process.env.NODE_ENV === "production",
  });
}

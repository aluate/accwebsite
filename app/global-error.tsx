"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to Sentry once DSN is wired
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then(({ captureException }) => captureException(error));
    }
  }, [error]);

  return (
    <html>
      <body style={{ background: "#111", color: "#fff", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <p style={{ color: "#f08122", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>Something went wrong</p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            The server hit an unexpected error. This is usually a temporary connection issue — refresh to retry.
          </p>
          <button
            onClick={reset}
            style={{ background: "#f08122", color: "#fff", border: "none", borderRadius: 4, padding: "10px 24px", cursor: "pointer", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}

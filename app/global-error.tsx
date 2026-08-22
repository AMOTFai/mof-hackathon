"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root-level error boundary — the one place a React render error in the App
 * Router doesn't otherwise reach Sentry. No-ops (via Sentry's own internal
 * DSN check) when Sentry isn't configured, same as every other optional
 * integration.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">The error has been reported. Try refreshing the page.</p>
        </div>
      </body>
    </html>
  );
}

/**
 * Sentry init for server + edge runtimes. Same optional-integration contract
 * as every other external service in this app (ANTHROPIC_API_KEY, GITHUB_TOKEN):
 * no SENTRY_DSN, no-op. Nothing here should ever be load-bearing for the app
 * to run.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      // Judging/submission are the DoD-critical paths (Part 13) — keep enough
      // trace volume there to actually catch a regression, without paying
      // full sampling cost on every request.
      environment: process.env.NODE_ENV,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}

export async function onRequestError(
  ...args: Parameters<NonNullable<typeof import("@sentry/nextjs").captureRequestError>>
) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}

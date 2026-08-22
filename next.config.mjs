import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

// withSentryConfig only touches the build when SENTRY_ORG/SENTRY_PROJECT are
// set (source-map upload needs a Sentry auth token); without them it's a
// harmless passthrough, same optional-integration contract as everything else.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});

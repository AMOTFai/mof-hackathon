import { defineConfig } from "vitest/config";
import path from "node:path";
import { readFileSync } from "node:fs";

try {
  const envFile = readFileSync(path.resolve(__dirname, ".env.local"), "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i);
    const value = trimmed.slice(i + 1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // Live RLS tests skip when .env.local is absent.
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Must stay above withAuthRetry's ~62s backoff ceiling (tests/helpers/live.ts),
    // otherwise a rate-limit retry gets killed mid-wait.
    testTimeout: 120_000,
    // Every live suite hits ONE Supabase project, and its auth sign-in quota is
    // per-IP and shared across files. Running all files at once burst past that
    // and surfaced as "Request rate limit reached" — reads like flakiness, is
    // actually a hard ceiling. As the suite has grown (18 files by Session 9)
    // even 2 workers occasionally tips it; 1 worker serializes every file's
    // sign-ins and stays comfortably under the quota at the cost of a slower
    // run (still well under a minute).
    maxWorkers: 1,
    minWorkers: 1,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});

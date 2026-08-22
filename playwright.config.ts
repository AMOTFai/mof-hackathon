import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

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
  // E2E specs skip themselves when Supabase env vars are absent (see helpers.ts).
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // shares one Supabase auth-quota ceiling with vitest's live suites — see HANDOVER.md
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Assumes `pnpm dev` is already running (same assumption the proxy's live
  // HTTP-integration vitest suite makes) rather than managing a second server
  // lifecycle here — see tests/e2e/helpers.ts's reachability check.
});

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Locator, Page } from "@playwright/test";

// Node 20's realtime-js dependency needs a WebSocket ctor at SupabaseClient
// construction time even though these fixtures never open a socket — same
// polyfill the live vitest suites use.
class StubSocket {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
}
(globalThis as { WebSocket?: unknown }).WebSocket ??= StubSocket;

export const LIVE =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Signs a Playwright page in as `email` via the same magic-link technique the
 * live vitest suites use for backend auth — here it's a REAL browser
 * navigation through /auth/callback, so it also exercises the Supabase SSR
 * cookie-setting path, not just the API.
 */
export async function signInAs(page: Page, svc: SupabaseClient, email: string): Promise<void> {
  const link = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.properties?.hashed_token) throw link.error ?? new Error("no token_hash");
  await page.goto(`/auth/callback?token_hash=${link.data.properties.hashed_token}&type=magiclink`);
}

export async function appReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `locator.fill()` doesn't reliably drive a React-controlled `<input
 * type="range">`: plain assignment through `.value` bypasses React's change
 * detection entirely. Setting the value through the native HTMLInputElement
 * setter and dispatching a real `input` event is what React's synthetic
 * event system actually listens for.
 */
export async function setRangeValue(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

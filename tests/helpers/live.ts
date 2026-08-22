import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared plumbing for the live (real-project) suites.
 *
 * Supabase auth rate-limits sign-ins per IP, and that quota is shared by every
 * live test file. As the suite grew (Sessions 3→7) full runs started failing
 * with "Request rate limit reached" — a real ceiling, not flakiness. Two rules
 * keep us under it:
 *
 *   1. Sign in once per email and REUSE the client (`signIn` caches).
 *   2. Share fixture users across the cases in a file; create fresh
 *      events/teams per case instead, since those are cheap and unmetered.
 *
 * `withAuthRetry` covers the residual case where a burst still trips the limit.
 */
export const LIVE =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function serviceClient<DB = never>(): SupabaseClient<DB> {
  return createClient<DB>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit/i.test(message);
}

/**
 * Retry an auth call through a transient rate-limit with exponential backoff.
 *
 * Backoff runs 2s → 4s → 8s → 16s → 32s (≈62s total), which is deliberately
 * longer than it looks like it needs to be: the quota window outlasts a short
 * backoff, so a tight retry just fails five times quickly. Keep `testTimeout`
 * above this ceiling or the retry gets killed before it can succeed.
 */
export async function withAuthRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimit(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    }
  }
  throw lastError;
}

const clients = new Map<string, SupabaseClient<never>>();

/** Sign in (cached per email for the life of the process). */
export async function signIn<DB = never>(email: string, password: string): Promise<SupabaseClient<DB>> {
  const cached = clients.get(email);
  if (cached) return cached as unknown as SupabaseClient<DB>;

  const client = createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await withAuthRetry(async () => {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  });
  clients.set(email, client as unknown as SupabaseClient<never>);
  return client;
}

/** Create a confirmed user, retrying through rate limits. */
export async function createUser(
  svc: SupabaseClient<never>,
  email: string,
  password: string,
): Promise<{ email: string; id: string }> {
  return withAuthRetry(async () => {
    const created = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("no user created");
    return { email, id: created.data.user.id };
  });
}

export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Single source of truth for "is this URL safe to store and to put in an href".
 *
 * Anything user-supplied that ends up in an anchor must pass this: `javascript:`
 * and `data:` URIs in an href execute in the clicking user's session, so a
 * scheme allowlist is the check that matters, not URL well-formedness.
 * Enforced on write (Zod schemas) and again at render time, because rows can be
 * written by paths that skip the schemas (service role, organizer tooling).
 */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

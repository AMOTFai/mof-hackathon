import type { ProviderAdapter, TokenUsage } from "@/lib/proxy/providers";
import { forEachSseJson } from "@/lib/proxy/sse";

const isStream = (contentType: string | null) => Boolean(contentType && contentType.includes("text/event-stream"));

function merge(into: TokenUsage, from: TokenUsage): void {
  if (from.requestTokens !== null) into.requestTokens = from.requestTokens;
  if (from.responseTokens !== null) into.responseTokens = from.responseTokens;
}

/**
 * Best-effort token accounting for one proxied call. Never throws, never
 * blocks the response the caller receives: streaming responses are read via
 * `tee()`, so this only ever consumes the SECOND copy while the first is
 * returned to the caller untouched.
 */
export function trackUsage(
  adapter: ProviderAdapter,
  upstream: Response,
): { response: Response; usage: Promise<TokenUsage> } {
  const contentType = upstream.headers.get("content-type");

  if (isStream(contentType) && upstream.body) {
    const [toCaller, toLogger] = upstream.body.tee();
    const usage: TokenUsage = { requestTokens: null, responseTokens: null };
    const done = forEachSseJson(toLogger, (event) => merge(usage, adapter.extractUsageFromSseEvent(event))).then(
      () => usage,
    );
    return { response: new Response(toCaller, upstream), usage: done };
  }

  if (!upstream.body) {
    return { response: upstream, usage: Promise.resolve({ requestTokens: null, responseTokens: null }) };
  }

  // Non-streaming: tee too, rather than buffering-then-reconstructing, so the
  // caller's copy is a plain pass-through stream with none of our handling
  // able to alter it (no re-encoding, no premature buffering of large bodies).
  const [toCaller, toLogger] = upstream.body.tee();
  const usage = readJsonUsage(toLogger, adapter);
  return { response: new Response(toCaller, upstream), usage };
}

async function readJsonUsage(stream: ReadableStream<Uint8Array>, adapter: ProviderAdapter): Promise<TokenUsage> {
  try {
    const text = await new Response(stream).text();
    if (!text) return { requestTokens: null, responseTokens: null };
    return adapter.extractUsageFromJson(JSON.parse(text));
  } catch {
    return { requestTokens: null, responseTokens: null };
  }
}
